import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Separator,
} from '@databricks/appkit-ui/react';
import { Activity, Building2, LocateFixed, MapPin, MapPinned, MessageSquareText, Moon, Pencil, Sun } from 'lucide-react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { cn } from './lib/utils';
import { ClinicsPage } from './pages/clinics/ClinicsPage';
import { GeniePage } from './pages/genie/GeniePage';
import { NfhsPage } from './pages/nfhs/NfhsPage';
import { UsagePage } from './pages/usage/UsagePage';
import { getUsageSessionId, logUsageAction, type UsageLogEvent } from './lib/usage';

type Page = 'genie' | 'clinics' | 'nfhs' | 'usage';
type Theme = 'light' | 'dark';
type InsuranceStatus = 'insured' | 'uninsured' | 'unsure';
type IncomeLevel = 'low' | 'middle' | 'high' | 'prefer-not-to-say';
type Gender = 'female' | 'male' | 'nonbinary' | 'prefer-not-to-say';

interface SessionProfile {
  latitude: number;
  longitude: number;
  insuranceStatus: InsuranceStatus;
  incomeLevel: IncomeLevel;
  gender: Gender;
  age: number;
  selectedAt: string;
}

interface SessionProfileDraft {
  latitude: number | null;
  longitude: number | null;
  insuranceStatus: InsuranceStatus | null;
  incomeLevel: IncomeLevel | null;
  gender: Gender | null;
  age: number | null;
}

interface CompleteSessionProfileDraft {
  latitude: number;
  longitude: number;
  insuranceStatus: InsuranceStatus;
  incomeLevel: IncomeLevel;
  gender: Gender;
  age: number;
}

const indiaCenter: [number, number] = [22.9734, 78.6569];
const sessionLocationStorageKey = 'referra-session-location';

const pages: Array<{
  id: Page;
  label: string;
  icon: typeof MessageSquareText;
}> = [
  { id: 'genie', label: 'Ask Referra', icon: MessageSquareText },
  { id: 'clinics', label: 'Find care', icon: Building2 },
  { id: 'nfhs', label: 'NFHS Data', icon: MapPinned },
  { id: 'usage', label: 'Usage', icon: Activity },
];

const insuranceOptions: Array<{ value: InsuranceStatus; label: string }> = [
  { value: 'insured', label: 'Insured' },
  { value: 'uninsured', label: 'Not insured' },
  { value: 'unsure', label: 'Not sure' },
];

const incomeOptions: Array<{ value: IncomeLevel; label: string }> = [
  { value: 'low', label: 'Low income' },
  { value: 'middle', label: 'Middle income' },
  { value: 'high', label: 'High income' },
  { value: 'prefer-not-to-say', label: 'Prefer not to say' },
];

const genderOptions: Array<{ value: Gender; label: string }> = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'nonbinary', label: 'Nonbinary' },
  { value: 'prefer-not-to-say', label: 'Prefer not to say' },
];

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';

  const storedTheme = window.localStorage.getItem('referra-theme');
  if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function isValidLatitude(value: number) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function isInsuranceStatus(value: unknown): value is InsuranceStatus {
  return value === 'insured' || value === 'uninsured' || value === 'unsure';
}

function isIncomeLevel(value: unknown): value is IncomeLevel {
  return value === 'low' || value === 'middle' || value === 'high' || value === 'prefer-not-to-say';
}

function isGender(value: unknown): value is Gender {
  return value === 'female' || value === 'male' || value === 'nonbinary' || value === 'prefer-not-to-say';
}

function isValidAge(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 120;
}

function getInitialSessionProfile(): SessionProfile | null {
  if (typeof window === 'undefined') return null;

  try {
    const storedProfile = window.sessionStorage.getItem(sessionLocationStorageKey);
    if (!storedProfile) return null;

    const parsedProfile = JSON.parse(storedProfile) as Partial<SessionProfile>;
    const latitude = Number(parsedProfile.latitude);
    const longitude = Number(parsedProfile.longitude);
    const age = Number(parsedProfile.age);

    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
    if (!isInsuranceStatus(parsedProfile.insuranceStatus) || !isIncomeLevel(parsedProfile.incomeLevel)) return null;
    if (!isGender(parsedProfile.gender) || !isValidAge(age)) return null;

    return {
      latitude,
      longitude,
      insuranceStatus: parsedProfile.insuranceStatus,
      incomeLevel: parsedProfile.incomeLevel,
      gender: parsedProfile.gender,
      age,
      selectedAt: typeof parsedProfile.selectedAt === 'string' ? parsedProfile.selectedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function formatCoordinate(value: number, positiveLabel: string, negativeLabel: string) {
  const direction = value >= 0 ? positiveLabel : negativeLabel;
  return `${Math.abs(value).toFixed(3)} ${direction}`;
}

function formatLocation(location: Pick<SessionProfile, 'latitude' | 'longitude'>) {
  return `${formatCoordinate(location.latitude, 'N', 'S')}, ${formatCoordinate(location.longitude, 'E', 'W')}`;
}

function formatOption<T extends string>(options: Array<{ value: T; label: string }>, value: T) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function formatPatientAttributes(profile: Pick<SessionProfile, 'insuranceStatus' | 'incomeLevel' | 'gender' | 'age'>) {
  return [
    formatOption(insuranceOptions, profile.insuranceStatus),
    formatOption(incomeOptions, profile.incomeLevel),
    formatOption(genderOptions, profile.gender),
    `${profile.age} years old`,
  ].join(' - ');
}

function createEmptyDraft(): SessionProfileDraft {
  return {
    latitude: null,
    longitude: null,
    insuranceStatus: null,
    incomeLevel: null,
    gender: null,
    age: null,
  };
}

function createDraftFromProfile(profile: SessionProfile | null): SessionProfileDraft {
  if (!profile) return createEmptyDraft();

  return {
    latitude: profile.latitude,
    longitude: profile.longitude,
    insuranceStatus: profile.insuranceStatus,
    incomeLevel: profile.incomeLevel,
    gender: profile.gender,
    age: profile.age,
  };
}

function isCompleteDraft(draft: SessionProfileDraft): draft is CompleteSessionProfileDraft {
  return (
    draft.latitude !== null &&
    draft.longitude !== null &&
    isValidLatitude(draft.latitude) &&
    isValidLongitude(draft.longitude) &&
    draft.insuranceStatus !== null &&
    draft.incomeLevel !== null &&
    draft.gender !== null &&
    draft.age !== null &&
    isValidAge(draft.age)
  );
}

function createSessionLocationIcon() {
  return L.divIcon({
    className: '',
    html: '<span class="session-location-marker"></span>',
    iconAnchor: [16, 16],
    iconSize: [32, 32],
  });
}

function ResizeLocationPickerMap({ open }: { open: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!open) return;

    const timeoutId = window.setTimeout(() => map.invalidateSize(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [map, open]);

  return null;
}

function LocationPickerEvents({
  onPick,
}: {
  onPick: (location: Pick<SessionProfile, 'latitude' | 'longitude'>) => void;
}) {
  useMapEvents({
    click(event) {
      onPick({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
  });

  return null;
}

function LocationSelectorDialog({
  open,
  selectedProfile,
  draftProfile,
  theme,
  onOpenChange,
  onDraftProfileChange,
  onSave,
}: {
  open: boolean;
  selectedProfile: SessionProfile | null;
  draftProfile: SessionProfileDraft;
  theme: Theme;
  onOpenChange: (open: boolean) => void;
  onDraftProfileChange: (profile: Partial<SessionProfileDraft>) => void;
  onSave: (profile: SessionProfile) => void;
}) {
  const markerIcon = createSessionLocationIcon();
  const draftPosition =
    draftProfile.latitude !== null && draftProfile.longitude !== null
      ? ([draftProfile.latitude, draftProfile.longitude] as [number, number])
      : null;
  const draftIsComplete = isCompleteDraft(draftProfile);

  const saveProfile = () => {
    if (!draftIsComplete) return;

    onSave({
      latitude: draftProfile.latitude,
      longitude: draftProfile.longitude,
      insuranceStatus: draftProfile.insuranceStatus,
      incomeLevel: draftProfile.incomeLevel,
      gender: draftProfile.gender,
      age: draftProfile.age,
      selectedAt: new Date().toISOString(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Set patient details</DialogTitle>
          <DialogDescription>
            Select a location and patient attributes for this session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div
            aria-label="Select your location on the map"
            className="location-picker-map h-[420px] overflow-hidden rounded-lg border bg-muted"
          >
            <MapContainer
              center={draftPosition ?? indiaCenter}
              className="h-full w-full"
              minZoom={3}
              scrollWheelZoom
              worldCopyJump
              zoom={draftPosition ? 8 : 5}
            >
              <TileLayer
                attribution={
                  theme === 'dark'
                    ? '&copy; OpenStreetMap contributors &copy; CARTO'
                    : '&copy; OpenStreetMap contributors'
                }
                url={
                  theme === 'dark'
                    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                }
              />
              <ResizeLocationPickerMap open={open} />
              <LocationPickerEvents onPick={onDraftProfileChange} />
              {draftPosition ? <Marker icon={markerIcon} position={draftPosition} /> : null}
            </MapContainer>
          </div>

          <div className="grid gap-3 rounded-md border bg-muted/35 px-3 py-3 text-sm lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 space-y-3">
              <div>
                <div className="text-xs text-muted-foreground">Selected coordinates</div>
                <div className="mt-1 font-medium tabular-nums">
                  {draftPosition
                    ? formatLocation({ latitude: draftPosition[0], longitude: draftPosition[1] })
                    : 'Choose a point on the map'}
                </div>
              </div>
              <fieldset>
                <legend className="text-xs text-muted-foreground">Insurance status</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {insuranceOptions.map((option) => (
                    <button
                      aria-pressed={draftProfile.insuranceStatus === option.value}
                      className={cn(
                        'inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-medium transition-colors',
                        draftProfile.insuranceStatus === option.value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'bg-background hover:bg-muted'
                      )}
                      key={option.value}
                      onClick={() => onDraftProfileChange({ insuranceStatus: option.value })}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-xs text-muted-foreground">Income level</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {incomeOptions.map((option) => (
                    <button
                      aria-pressed={draftProfile.incomeLevel === option.value}
                      className={cn(
                        'inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-medium transition-colors',
                        draftProfile.incomeLevel === option.value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'bg-background hover:bg-muted'
                      )}
                      key={option.value}
                      onClick={() => onDraftProfileChange({ incomeLevel: option.value })}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-xs text-muted-foreground">Gender</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {genderOptions.map((option) => (
                    <button
                      aria-pressed={draftProfile.gender === option.value}
                      className={cn(
                        'inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-medium transition-colors',
                        draftProfile.gender === option.value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'bg-background hover:bg-muted'
                      )}
                      key={option.value}
                      onClick={() => onDraftProfileChange({ gender: option.value })}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <span className="block text-xs text-muted-foreground">Age</span>
                <input
                  aria-label="Patient age"
                  className="mt-2 h-9 w-28 rounded-md border bg-background px-2 text-sm tabular-nums"
                  inputMode="numeric"
                  max={120}
                  min={0}
                  onChange={(event) => {
                    const nextAge = event.target.value ? Number(event.target.value) : null;
                    onDraftProfileChange({
                      age: nextAge !== null && Number.isFinite(nextAge) ? Math.trunc(nextAge) : null,
                    });
                  }}
                  placeholder="Age"
                  type="number"
                  value={draftProfile.age ?? ''}
                />
              </label>
            </div>
            <div className="flex shrink-0 items-end justify-end gap-2">
              {selectedProfile ? (
                <button
                  className="inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
                  onClick={() => onOpenChange(false)}
                  type="button"
                >
                  Cancel
                </button>
              ) : null}
              <button
                className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
                disabled={!draftIsComplete}
                onClick={saveProfile}
                type="button"
              >
                Use these details
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState<Page>('genie');
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [profileState, setProfileState] = useState(() => {
    const selectedProfile = getInitialSessionProfile();
    return {
      dialogOpen: !selectedProfile,
      draftProfile: createDraftFromProfile(selectedProfile),
      selectedProfile,
    };
  });

  const logAction = useCallback((event: UsageLogEvent) => {
    logUsageAction(event);
  }, []);
  const initialSessionLog = useRef({
    page: activePage,
    hasPatientDetails: Boolean(profileState.selectedProfile),
  });

  useEffect(() => {
    const { page, hasPatientDetails } = initialSessionLog.current;

    logAction({
      eventType: 'session_start',
      page,
      targetType: 'session',
      targetId: getUsageSessionId(),
      properties: {
        initialPage: page,
        hasPatientDetails,
      },
    });
  }, [logAction]);

  useEffect(() => {
    logAction({
      eventType: 'page_view',
      page: activePage,
      targetType: 'page',
      targetId: activePage,
    });
  }, [activePage, logAction]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('light', theme === 'light');
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    window.localStorage.setItem('referra-theme', theme);
  }, [theme]);

  const ThemeIcon = theme === 'dark' ? Sun : Moon;
  const { selectedProfile, draftProfile, dialogOpen: profileDialogOpen } = profileState;

  const chooseSessionProfile = (profile: SessionProfile) => {
    window.sessionStorage.setItem(sessionLocationStorageKey, JSON.stringify(profile));
    setProfileState({
      dialogOpen: false,
      draftProfile: createDraftFromProfile(profile),
      selectedProfile: profile,
    });
    logAction({
      eventType: 'patient_details_saved',
      page: activePage,
      targetType: 'patient_profile',
      properties: {
        latitude: profile.latitude,
        longitude: profile.longitude,
        insuranceStatus: profile.insuranceStatus,
        incomeLevel: profile.incomeLevel,
        gender: profile.gender,
        age: profile.age,
      },
    });
  };

  const changeProfileDialogOpen = (open: boolean) => {
    if (!open && !selectedProfile) return;
    setProfileState((currentState) => ({
      ...currentState,
      dialogOpen: open,
      draftProfile: open ? createDraftFromProfile(currentState.selectedProfile) : currentState.draftProfile,
    }));
    logAction({
      eventType: open ? 'patient_details_dialog_opened' : 'patient_details_dialog_closed',
      page: activePage,
      targetType: 'patient_profile',
    });
  };

  const openProfileDialog = () => {
    setProfileState((currentState) => ({
      ...currentState,
      dialogOpen: true,
      draftProfile: createDraftFromProfile(currentState.selectedProfile),
    }));
    logAction({
      eventType: 'patient_details_dialog_opened',
      page: activePage,
      targetType: 'patient_profile',
    });
  };

  const chooseDraftProfile = (profile: Partial<SessionProfileDraft>) => {
    setProfileState((currentState) => ({
      ...currentState,
      draftProfile: {
        ...currentState.draftProfile,
        ...profile,
      },
    }));
    logAction({
      eventType: 'patient_details_draft_changed',
      page: activePage,
      targetType: 'patient_profile',
      properties: profile,
    });
  };

  const changeActivePage = (page: Page) => {
    setActivePage(page);
    logAction({
      eventType: 'navigation_clicked',
      page,
      targetType: 'page',
      targetId: page,
    });
  };

  const toggleTheme = () => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      logAction({
        eventType: 'theme_toggled',
        page: activePage,
        targetType: 'theme',
        targetId: nextTheme,
        properties: { previousTheme: currentTheme, nextTheme },
      });
      return nextTheme;
    });
  };

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-[96rem] flex-col gap-4 px-4 py-4 md:px-6 lg:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <img
                alt="Referra logo"
                className="h-12 w-12 shrink-0 rounded-md border bg-muted object-cover"
                height={48}
                src="/referra-logo.png"
                width={48}
              />
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold">Referra</h1>
                <p className="truncate text-sm text-muted-foreground">
                  Find care or referral facilities across India
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                aria-label={
                  selectedProfile
                    ? `Selected patient details ${formatLocation(selectedProfile)}, ${formatPatientAttributes(selectedProfile)}. Change details`
                    : 'Set patient details'
                }
                className="inline-flex h-9 min-w-0 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
                onClick={openProfileDialog}
                title={selectedProfile ? 'Change patient details' : 'Set patient details'}
                type="button"
              >
                {selectedProfile ? (
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <LocateFixed className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span className="max-w-[11rem] truncate tabular-nums">
                  {selectedProfile ? formatLocation(selectedProfile) : 'Set details'}
                </span>
                <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
              <button
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-pressed={theme === 'dark'}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-foreground transition-colors hover:bg-muted"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                type="button"
              >
                <ThemeIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <nav aria-label="Primary navigation" className="flex flex-wrap gap-2">
            {pages.map((page) => {
              const Icon = page.icon;
              const isActive = activePage === page.id;

              return (
                <button
                  key={page.id}
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:bg-muted'
                  )}
                  onClick={() => changeActivePage(page.id)}
                  type="button"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {page.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[96rem] px-4 py-5 md:px-6 lg:px-8">
        {activePage === 'genie' ? <GeniePage audienceMode="patients" selectedLocation={selectedProfile} theme={theme} logAction={logAction} /> : null}
        {activePage === 'clinics' ? <ClinicsPage selectedLocation={selectedProfile} logAction={logAction} /> : null}
        {activePage === 'nfhs' ? <NfhsPage theme={theme} /> : null}
        {activePage === 'usage' ? <UsagePage /> : null}
      </main>
      <Separator />
      <LocationSelectorDialog
        draftProfile={draftProfile}
        open={profileDialogOpen}
        selectedProfile={selectedProfile}
        theme={theme}
        onDraftProfileChange={chooseDraftProfile}
        onOpenChange={changeProfileDialogOpen}
        onSave={chooseSessionProfile}
      />
    </div>
  );
}
