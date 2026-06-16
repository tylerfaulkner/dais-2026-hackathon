import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  GenieChatInput,
  GenieChatMessageList,
  ScrollArea,
  Separator,
  useGenieChat,
  type GenieMessageItem,
} from '@databricks/appkit-ui/react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Code2,
  Compass,
  Copy,
  ExternalLink,
  ListChecks,
  MapPin,
  MessageCircleQuestion,
  Phone,
  Printer,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UsersRound,
} from 'lucide-react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { cn } from '../../lib/utils';
import { printReferralPacket, type ReferralLocation } from '../../lib/referrals';
import type { UsageLogEvent } from '../../lib/usage';

const indiaCenter: [number, number] = [22.9734, 78.6569];

interface PresentedGenieResult {
  id: string;
  name: string;
  type: string | null;
  operatorType: string | null;
  description: string | null;
  address: string;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  specialties: string | null;
  procedures: string | null;
  equipment: string | null;
  capability: string | null;
  numberDoctors: string | null;
  capacity: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceUrls: string | null;
  rawFields: Array<{ label: string; value: string }>;
}

interface GeneratedSqlResultsResponse {
  status: 'ready' | 'preparing' | 'error';
  results?: PresentedGenieResult[];
  clinics?: PresentedGenieResult[];
  message?: string;
}

interface SessionLocation {
  latitude: number;
  longitude: number;
  insuranceStatus: 'insured' | 'uninsured' | 'unsure';
  incomeLevel: 'low' | 'middle' | 'high' | 'prefer-not-to-say';
  gender: 'female' | 'male' | 'nonbinary' | 'prefer-not-to-say';
  age: number;
  selectedAt: string;
}

const genieLocationContextHeading = '[Referra session context]';
const introMessageStorageKey = 'referra-genie-intro-index';
const introMessages = [
  'Tell me what kind of care you need, and I can look for nearby facilities, referral options, and practical next steps.',
  'Share a symptom, specialty, procedure, or facility type. I will use your selected location to make the search more relevant.',
  'I can help compare care options around your selected coordinates and call out what details to confirm before visiting.',
  'Ask for facilities by specialty, equipment, service, or referral need. I will keep the search grounded near your selected location.',
  'Start with a simple request like finding imaging, maternal care, urgent care, or a specialist near you.',
];

const starterPrompts = [
  'Find care options near my selected location',
  'Show facilities with emergency or urgent care nearby',
  'Find referral options with imaging or diagnostic services',
];

const insuranceLabels: Record<SessionLocation['insuranceStatus'], string> = {
  insured: 'Insured',
  uninsured: 'Not insured',
  unsure: 'Insurance status not sure',
};

const incomeLabels: Record<SessionLocation['incomeLevel'], string> = {
  low: 'Low income',
  middle: 'Middle income',
  high: 'High income',
  'prefer-not-to-say': 'Income not provided',
};

const genderLabels: Record<SessionLocation['gender'], string> = {
  female: 'Female',
  male: 'Male',
  nonbinary: 'Nonbinary',
  'prefer-not-to-say': 'Gender not provided',
};

function getInitialIntroMessage() {
  if (typeof window === 'undefined') return introMessages[0];

  const storedIndex = Number(window.sessionStorage.getItem(introMessageStorageKey));
  const currentIndex = Number.isInteger(storedIndex) ? (storedIndex + 1) % introMessages.length : 0;
  window.sessionStorage.setItem(introMessageStorageKey, String(currentIndex));

  return introMessages[currentIndex];
}

function formatCoordinate(value: number, positiveLabel: string, negativeLabel: string) {
  const direction = value >= 0 ? positiveLabel : negativeLabel;
  return `${Math.abs(value).toFixed(3)} ${direction}`;
}

function formatLocation(location: Pick<SessionLocation, 'latitude' | 'longitude'>) {
  return `${formatCoordinate(location.latitude, 'N', 'S')}, ${formatCoordinate(location.longitude, 'E', 'W')}`;
}

function formatPatientAttributes(location: Pick<SessionLocation, 'insuranceStatus' | 'incomeLevel' | 'gender' | 'age'>) {
  return [
    insuranceLabels[location.insuranceStatus],
    incomeLabels[location.incomeLevel],
    genderLabels[location.gender],
    `${location.age} years old`,
  ].join(' - ');
}

function getLocationContext(location: SessionLocation | null) {
  if (!location) return '';

  return [
    '',
    '',
    genieLocationContextHeading,
    `The user selected this session location: latitude ${location.latitude.toFixed(6)}, longitude ${location.longitude.toFixed(6)}.`,
    `Patient insurance status: ${insuranceLabels[location.insuranceStatus]}.`,
    `Patient income level: ${incomeLabels[location.incomeLevel]}.`,
    `Patient gender: ${genderLabels[location.gender]}.`,
    `Patient age: ${location.age}.`,
    'Use these coordinates automatically when interpreting distance, nearby, closest, referral catchment, or location-sensitive care questions.',
    'Use the insurance, income, gender, and age details to tailor affordability, access, clinical fit, and referral guidance where relevant.',
    'Do not ask the user for their location unless they explicitly want to change it or the selected coordinates are insufficient.',
  ].join('\n');
}

function addLocationContext(content: string, location: SessionLocation | null) {
  const trimmedContent = content.trim();
  const locationContext = getLocationContext(location);
  return locationContext ? `${trimmedContent}${locationContext}` : trimmedContent;
}

function stripLocationContext(content: string) {
  const contextStart = content.indexOf(`\n\n${genieLocationContextHeading}`);
  return contextStart === -1 ? content : content.slice(0, contextStart).trimEnd();
}

function getLatestGeneratedSql(messages: GenieMessageItem[]) {
  for (const message of [...messages].reverse()) {
    for (const attachment of [...message.attachments].reverse()) {
      const generatedSql = attachment.query?.query;
      if (generatedSql?.trim()) return generatedSql;
    }
  }

  return '';
}

function shouldHideQueryAttachment(
  attachment: GenieMessageItem['attachments'][number],
  audienceMode: 'patients' | 'clinicians'
) {
  if (!attachment.query?.query) return false;
  return audienceMode === 'patients';
}

function getChatMessagesForDisplay(messages: GenieMessageItem[], audienceMode: 'patients' | 'clinicians') {
  return messages.map((message) => {
    const visibleContent = stripLocationContext(message.content);
    const visibleAttachments = message.attachments.filter(
      (attachment) => !shouldHideQueryAttachment(attachment, audienceMode)
    );

    if (visibleAttachments.length === message.attachments.length && visibleContent === message.content) return message;

    const visibleAttachmentIds = new Set(
      visibleAttachments
        .map((attachment) => attachment.attachmentId)
        .filter((attachmentId): attachmentId is string => Boolean(attachmentId))
    );

    return {
      ...message,
      content: visibleContent,
      attachments: visibleAttachments,
      queryResults: new Map(
        [...message.queryResults].filter(([attachmentId]) => visibleAttachmentIds.has(attachmentId))
      ),
    };
  });
}

function clearConversationIdFromUrl() {
  const url = new URL(window.location.href);

  if (!url.searchParams.has('conversationId')) return;

  url.searchParams.delete('conversationId');
  window.history.replaceState({}, '', url.toString());
}

function IntroMessage({
  introMessage,
  selectedLocation,
  onPrompt,
}: {
  introMessage: string;
  selectedLocation: SessionLocation | null;
  onPrompt: (prompt: string) => void;
}) {
  return (
    <div className="border-b bg-muted/20 px-3 py-4 md:px-4">
      <div className="max-w-3xl rounded-lg border bg-background p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium">How can I help?</div>
            <p className="mt-1 text-sm text-muted-foreground">{introMessage}</p>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {selectedLocation ? formatLocation(selectedLocation) : 'No session location selected'}
            </div>
            {selectedLocation ? (
              <div className="mt-2 text-xs text-muted-foreground">{formatPatientAttributes(selectedLocation)}</div>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {starterPrompts.map((prompt) => (
            <button
              className="inline-flex h-8 items-center rounded-md border bg-background px-2.5 text-xs font-medium transition-colors hover:bg-muted"
              key={prompt}
              onClick={() => onPrompt(prompt)}
              type="button"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function createResultIcon(isSelected: boolean) {
  return L.divIcon({
    className: '',
    html: `<span class="${isSelected ? 'clinic-map-marker clinic-map-marker-selected' : 'clinic-map-marker'}"></span>`,
    iconAnchor: [14, 14],
    iconSize: [28, 28],
    popupAnchor: [0, -16],
  });
}

function createPatientLocationIcon() {
  return L.divIcon({
    className: '',
    html: '<span class="patient-location-marker"></span>',
    iconAnchor: [10, 10],
    iconSize: [20, 20],
  });
}

function getMapPosition(location: Pick<SessionLocation, 'latitude' | 'longitude'> | null): [number, number] | null {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  return [location.latitude, location.longitude];
}

function FitResultsMapBounds({ positions }: { positions: Array<[number, number]> }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length === 0) return;

    if (positions.length === 1) {
      map.setView(positions[0], 7);
      return;
    }

    map.fitBounds(L.latLngBounds(positions), {
      maxZoom: 9,
      padding: [28, 28],
    });
  }, [map, positions]);

  return null;
}

function getResultSummary(result: PresentedGenieResult) {
  return result.specialties ?? result.procedures ?? result.equipment ?? result.capability ?? result.description ?? 'Raw Genie result details available.';
}

function getOrganizationType(result: PresentedGenieResult) {
  return result.operatorType ?? result.type;
}

function getResultAddressLine(result: PresentedGenieResult) {
  return result.address || [result.city, result.state, result.postalCode].filter(Boolean).join(', ') || null;
}

function firstUrl(value: unknown) {
  if (!value) return '';

  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
        ? String(value)
        : '';

  const first = text
    .split(',')
    .map((item) => item.trim())
    .find((item) => /^https?:\/\//i.test(item));

  return first ?? '';
}

function getResultUrl(result: PresentedGenieResult) {
  return firstUrl(result.website) || firstUrl(result.sourceUrls);
}

function toReferralLocation(result: PresentedGenieResult): ReferralLocation {
  return {
    name: result.name,
    organizationType: getOrganizationType(result),
    phone: result.phone,
    email: result.email,
    url: getResultUrl(result),
    address: result.address,
    city: result.city,
    state: result.state,
    postalCode: result.postalCode,
    doctors: result.numberDoctors,
    capacity: result.capacity,
    specialties: result.specialties,
    procedures: result.procedures,
    equipment: result.equipment,
    capabilities: result.capability,
  };
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium tabular-nums">{value}</div>
    </div>
  );
}

function ResultField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-medium">{value || 'Not listed'}</div>
    </div>
  );
}

function ResultUrlField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      {value ? (
        <a
          className="mt-1 inline-flex max-w-full items-center gap-1 truncate font-medium text-primary underline-offset-4 hover:underline"
          href={value}
          rel="noreferrer"
          target="_blank"
        >
          <span className="truncate">{value}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </a>
      ) : (
        <div className="mt-1 font-medium">Not listed</div>
      )}
    </div>
  );
}

function ResultDetailsDialog({
  result,
  open,
  onOpenChange,
}: {
  result: PresentedGenieResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!result) return null;

  const organizationType = getOrganizationType(result);
  const addressLine = getResultAddressLine(result);
  const resultUrl = getResultUrl(result);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{result.name}</DialogTitle>
          <DialogDescription>{organizationType ?? ([result.city, result.state].filter(Boolean).join(', ') || 'Genie query result')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">{getResultSummary(result)}</p>

          <div className="grid gap-3 sm:grid-cols-3">
            <ResultMetric label="Organization type" value={organizationType ?? 'Unknown'} />
            <ResultMetric label="Doctors" value={result.numberDoctors ?? 'Unknown'} />
            <ResultMetric label="Capacity" value={result.capacity ?? 'Unknown'} />
          </div>

          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div>
                  <div className="font-medium">{addressLine ?? 'Address not listed'}</div>
                  <div className="text-muted-foreground">{[result.city, result.state, result.postalCode].filter(Boolean).join(', ')}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div>
                  <div className="font-medium">{result.phone ?? 'Phone not listed'}</div>
                  <div className="text-muted-foreground">{result.email ?? result.website ?? 'Contact details not listed'}</div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div>
                  <div className="font-medium">{organizationType ?? 'Organization type not listed'}</div>
                  <div className="text-muted-foreground">{result.website ?? 'Website not listed'}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div>
                  <div className="font-medium">{result.specialties ?? 'Specialties not listed'}</div>
                  <div className="text-muted-foreground">{result.procedures ?? 'Procedures not listed'}</div>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <div className="mb-2 font-medium">Clinic fields</div>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <ResultField label="Name" value={result.name} />
              <ResultField label="Organization type" value={organizationType} />
              <ResultField label="Official phone" value={result.phone} />
              <ResultField label="Email" value={result.email} />
              <ResultField label="Address" value={addressLine} />
              <ResultUrlField label="URL" value={resultUrl} />
              <ResultField label="Number of doctors" value={result.numberDoctors} />
              <ResultField label="Capacity" value={result.capacity} />
              <ResultField label="Specialties" value={result.specialties} />
              <ResultField label="Procedures" value={result.procedures} />
              <ResultField label="Equipment" value={result.equipment} />
              <ResultField label="Capabilities" value={result.capability} />
            </div>
          </div>

          <Separator />

          <div>
            <div className="mb-2 font-medium">Raw Genie row</div>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              {result.rawFields.map((field) => (
                <div className="rounded-md border bg-muted/20 px-3 py-2" key={field.label}>
                  <div className="text-xs capitalize text-muted-foreground">{field.label}</div>
                  <div className="mt-1 break-words font-medium">{field.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultsMap({
  results,
  selectedResultId,
  selectedLocation,
  onSelectResult,
  theme,
}: {
  results: PresentedGenieResult[];
  selectedResultId: string;
  selectedLocation: SessionLocation | null;
  onSelectResult: (result: PresentedGenieResult) => void;
  theme: 'light' | 'dark';
}) {
  const patientPosition = useMemo(() => getMapPosition(selectedLocation), [selectedLocation]);
  const patientIcon = useMemo(() => createPatientLocationIcon(), []);
  const mappedResults = useMemo(
    () =>
      results
        .filter((result) => result.latitude !== null && result.longitude !== null)
        .map((result) => ({
          result,
          icon: createResultIcon(result.id === selectedResultId),
        })),
    [results, selectedResultId]
  );
  const mapPositions = useMemo(
    () => [
      ...mappedResults.map(({ result }) => [result.latitude as number, result.longitude as number] as [number, number]),
      ...(patientPosition ? [patientPosition] : []),
    ],
    [mappedResults, patientPosition]
  );

  if (results.length === 0) return null;

  if (mappedResults.length === 0 && !patientPosition) {
    return (
      <div className="flex h-[220px] shrink-0 items-center justify-center rounded-lg border bg-muted/60 p-5 text-center text-sm text-muted-foreground">
        <div className="max-w-[260px]">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border bg-background/70">
            <MapPin className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="font-medium text-foreground">Map unavailable</div>
          <p className="mt-1">The Genie SQL returned rows, but no latitude or longitude fields were available to plot.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[240px] shrink-0 overflow-hidden rounded-lg border bg-muted">
      <MapContainer center={indiaCenter} className="h-full w-full" minZoom={4} scrollWheelZoom worldCopyJump zoom={4}>
        <FitResultsMapBounds positions={mapPositions} />
        <TileLayer
          attribution={theme === 'dark' ? '&copy; OpenStreetMap contributors &copy; CARTO' : '&copy; OpenStreetMap contributors'}
          url={
            theme === 'dark'
              ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
              : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          }
        />
        {mappedResults.map(({ result, icon }) => (
          <Marker
            alt={`Show ${result.name}`}
            eventHandlers={{ click: () => onSelectResult(result) }}
            icon={icon}
            key={result.id}
            position={[result.latitude as number, result.longitude as number]}
            title={result.name}
          />
        ))}
        {patientPosition ? (
          <Marker alt="Patient current location" icon={patientIcon} position={patientPosition} title="Patient current location" />
        ) : null}
      </MapContainer>
      {mappedResults.length === 0 ? (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm">
          Clinic coordinates unavailable
        </div>
      ) : (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm">
          Blue dot: patient location
        </div>
      )}
    </div>
  );
}

function EmptyResultsPanel({
  hasGeneratedSql,
  selectedLocation,
  onPrompt,
}: {
  hasGeneratedSql: boolean;
  selectedLocation: SessionLocation | null;
  onPrompt: (prompt: string) => void;
}) {
  const title = hasGeneratedSql ? 'No rerun results yet' : 'Results will appear here';
  const description = hasGeneratedSql
    ? 'Referra is rerunning Genie SQL and will show the returned rows here.'
    : 'Ask a data question and matching rows from the rerun Genie SQL will appear here.';

  return (
    <div className="min-h-0 flex-1 rounded-md border bg-muted/20 p-4" aria-label="No Genie query results">
      <div className="flex h-full flex-col">
        <div className="rounded-md border bg-background p-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <Compass className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <div className="font-medium">{title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-2 text-sm">
          <div className="rounded-md border bg-background p-3">
            <div className="flex items-center gap-2 font-medium">
              <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Session location
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {selectedLocation ? formatLocation(selectedLocation) : 'Set a location to prioritize nearby care.'}
            </div>
            {selectedLocation ? (
              <div className="mt-1 text-sm text-muted-foreground">{formatPatientAttributes(selectedLocation)}</div>
            ) : null}
          </div>

          <div className="rounded-md border bg-background p-3">
            <div className="flex items-center gap-2 font-medium">
              <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Useful details to include
            </div>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>Specialty, procedure, equipment, or facility type.</li>
              <li>Urgency, patient age group, and travel constraints.</li>
              <li>Whether public, private, or high-capacity sites are preferred.</li>
            </ul>
          </div>
        </div>

        <div className="mt-auto pt-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <MessageCircleQuestion className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Try asking
          </div>
          <div className="flex flex-col gap-2">
            {starterPrompts.map((prompt) => (
              <button
                className="rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                key={prompt}
                onClick={() => onPrompt(prompt)}
                type="button"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function GenieSqlDebugPanel({
  generatedSql,
  open,
  copied,
  onToggle,
  onCopy,
}: {
  generatedSql: string;
  open: boolean;
  copied: boolean;
  onToggle: () => void;
  onCopy: () => void;
}) {
  if (!generatedSql) return null;

  return (
    <div className="border-b bg-muted/20 px-3 py-2 md:px-4">
      <div className="flex items-center justify-between gap-3">
        <button
          aria-expanded={open}
          className="inline-flex h-8 items-center gap-2 rounded-md border bg-background px-2.5 text-xs font-medium transition-colors hover:bg-muted"
          onClick={onToggle}
          type="button"
        >
          <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
          Genie SQL
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open ? 'rotate-180' : '')} aria-hidden="true" />
        </button>
        {open ? (
          <Button className="h-8 gap-2 px-2.5 text-xs" onClick={onCopy} size="sm" type="button" variant="outline">
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        ) : null}
      </div>
      {open ? (
        <pre className="mt-2 max-h-56 overflow-auto rounded-md border bg-background p-3 text-xs leading-5 text-muted-foreground">
          <code>{generatedSql}</code>
        </pre>
      ) : null}
    </div>
  );
}

export function GeniePage({
  audienceMode,
  selectedLocation,
  theme,
  logAction,
}: {
  audienceMode: 'patients' | 'clinicians';
  selectedLocation: SessionLocation | null;
  theme: 'light' | 'dark';
  logAction?: (event: UsageLogEvent) => void;
}) {
  const { messages, status, error: genieError, sendMessage, hasPreviousPage, fetchPreviousPage } = useGenieChat({
    alias: 'default',
    persistInUrl: false,
  });
  const displayedMessages = useMemo(() => getChatMessagesForDisplay(messages, audienceMode), [messages, audienceMode]);
  const latestGeneratedSql = useMemo(() => getLatestGeneratedSql(messages), [messages]);
  const [rerunResults, setRerunResults] = useState<PresentedGenieResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<PresentedGenieResult | null>(null);
  const [selectedReferralIds, setSelectedReferralIds] = useState<Set<string>>(() => new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [introMessage] = useState(getInitialIntroMessage);
  const [sqlDebugOpen, setSqlDebugOpen] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const isChatBusy = status === 'loading-history' || status === 'streaming';
  const visibleRerunResults = useMemo(() => (latestGeneratedSql ? rerunResults : []), [latestGeneratedSql, rerunResults]);
  const chatErrorMessage = status === 'error' && genieError ? genieError : '';

  useEffect(() => {
    clearConversationIdFromUrl();
  }, []);

  useEffect(() => {
    if (!chatErrorMessage) return;

    logAction?.({
      eventType: 'genie_chat_failed',
      page: 'genie',
      targetType: 'chat_response',
      properties: {
        message: chatErrorMessage,
      },
    });
  }, [chatErrorMessage, logAction]);

  useEffect(() => {
    if (!latestGeneratedSql) {
      return;
    }

    const controller = new AbortController();

    fetch('/api/clinic-recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generatedSql: latestGeneratedSql }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as GeneratedSqlResultsResponse;
        if (!response.ok || payload.status === 'error') {
          throw new Error(payload.message ?? 'Unable to rerun Genie SQL.');
        }
        const results = payload.results ?? payload.clinics ?? [];
        setRerunResults(results);
        logAction?.({
          eventType: 'genie_results_loaded',
          page: 'genie',
          targetType: 'genie_results',
          properties: {
            resultCount: results.length,
            hasSql: Boolean(latestGeneratedSql),
          },
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setRerunResults([]);
        logAction?.({
          eventType: 'genie_results_load_failed',
          page: 'genie',
          targetType: 'genie_results',
          properties: { hasSql: Boolean(latestGeneratedSql) },
        });
      });

    return () => controller.abort();
  }, [latestGeneratedSql, logAction]);

  const selectedReferralResults = useMemo(
    () => visibleRerunResults.filter((result) => selectedReferralIds.has(result.id)),
    [visibleRerunResults, selectedReferralIds]
  );
  const selectedReferrals = useMemo(
    () => selectedReferralResults.map(toReferralLocation),
    [selectedReferralResults]
  );

  const sendMessageWithSessionLocation = (content: string) => {
    logAction?.({
      eventType: 'genie_prompt_sent',
      page: 'genie',
      targetType: 'chat_prompt',
      properties: {
        promptLength: content.length,
        hasPatientLocation: Boolean(selectedLocation),
        patientInsuranceStatus: selectedLocation?.insuranceStatus ?? null,
        patientIncomeLevel: selectedLocation?.incomeLevel ?? null,
        patientGender: selectedLocation?.gender ?? null,
        patientAge: selectedLocation?.age ?? null,
      },
    });
    sendMessage(addLocationContext(content, selectedLocation));
  };

  const openResult = (result: PresentedGenieResult, source = 'card') => {
    setSelectedResult(result);
    setDialogOpen(true);
    logAction?.({
      eventType: 'genie_result_opened',
      page: 'genie',
      targetType: 'clinic_result',
      targetId: result.id,
      properties: {
        name: result.name,
        source,
      },
    });
  };

  const toggleReferralSelection = (id: string, checked: boolean) => {
    setSelectedReferralIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (checked) {
        nextIds.add(id);
      } else {
        nextIds.delete(id);
      }
      return nextIds;
    });
    logAction?.({
      eventType: checked ? 'referral_selected' : 'referral_deselected',
      page: 'genie',
      targetType: 'clinic_result',
      targetId: id,
    });
  };

  const setAllReferralSelections = (checked: boolean) => {
    setSelectedReferralIds(checked ? new Set(visibleRerunResults.map((result) => result.id)) : new Set());
    logAction?.({
      eventType: checked ? 'referrals_select_all' : 'referrals_clear',
      page: 'genie',
      targetType: 'referral_selection',
      properties: {
        resultCount: visibleRerunResults.length,
      },
    });
  };

  const copyLatestSql = () => {
    if (!latestGeneratedSql) return;

    void navigator.clipboard.writeText(latestGeneratedSql).then(() => {
      setSqlCopied(true);
      window.setTimeout(() => setSqlCopied(false), 1600);
    });
    logAction?.({
      eventType: 'genie_sql_copied',
      page: 'genie',
      targetType: 'genie_sql',
      properties: { sqlLength: latestGeneratedSql.length },
    });
  };

  return (
    <div className="grid h-[calc(100vh-172px)] min-h-0 gap-3 overflow-hidden xl:grid-cols-[minmax(0,1fr)_480px] 2xl:grid-cols-[minmax(0,1fr)_520px]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
          <div className="shrink-0 border-b px-3 py-3 md:px-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">Ask Referra</h2>
                <p className="text-sm text-muted-foreground">Get help finding care or choosing a referral facility.</p>
              </div>
              <Badge variant="secondary" className="w-fit">
                Confirm details with the clinic
              </Badge>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {messages.length === 0 ? (
              <IntroMessage
                introMessage={introMessage}
                selectedLocation={selectedLocation}
                onPrompt={sendMessageWithSessionLocation}
              />
            ) : null}
            <GenieSqlDebugPanel
              generatedSql={latestGeneratedSql}
              open={sqlDebugOpen}
              copied={sqlCopied}
              onToggle={() => setSqlDebugOpen((currentValue) => !currentValue)}
              onCopy={copyLatestSql}
            />
            <GenieChatMessageList
              className="min-h-0 flex-1"
              messages={displayedMessages}
              status={status}
              hasPreviousPage={hasPreviousPage}
              onFetchPreviousPage={fetchPreviousPage}
            />
            {chatErrorMessage ? (
              <div className="shrink-0 border-t bg-destructive/10 px-3 py-3 text-sm text-destructive" role="alert">
                <div className="flex gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="font-medium">Genie did not respond.</div>
                    <div className="mt-1 text-destructive/90">
                      {chatErrorMessage} Try sending the question again or narrowing the request.
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            <GenieChatInput
              className="shrink-0 border-t p-3"
              disabled={isChatBusy}
              onSend={sendMessageWithSessionLocation}
              placeholder="Ask about care options or referrals"
            />
          </div>
        </section>

        <aside className="flex min-h-0 min-w-0 flex-col gap-3 rounded-lg border bg-background p-3">
          <div className="shrink-0 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">Genie Results</h3>
              <Badge variant="outline" className="shrink-0">
                {visibleRerunResults.length}
              </Badge>
            </div>
            {visibleRerunResults.length > 0 ? (
              <div className="rounded-md border bg-muted/20 p-2">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <label className="inline-flex min-w-0 items-center gap-2">
                    <input
                      aria-label="Select all Genie results for referral"
                      checked={selectedReferrals.length === visibleRerunResults.length && visibleRerunResults.length > 0}
                      className="h-4 w-4 rounded border-border"
                      onChange={(event) => setAllReferralSelections(event.target.checked)}
                      type="checkbox"
                    />
                    <span>{selectedReferrals.length} selected</span>
                  </label>
                  <button
                    className="font-medium text-foreground underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50"
                    disabled={selectedReferrals.length === 0}
                    onClick={() => setAllReferralSelections(false)}
                    type="button"
                  >
                    Clear
                  </button>
                </div>
                <div className="grid gap-2">
                  <Button
                    className="h-8 gap-1.5 px-2 text-xs"
                    disabled={selectedReferrals.length === 0}
                    onClick={() => {
                      logAction?.({
                        eventType: 'referrals_printed',
                        page: 'genie',
                        targetType: 'referral_packet',
                        properties: { selectedCount: selectedReferrals.length },
                      });
                      printReferralPacket(selectedReferrals);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                    Print
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {visibleRerunResults.length > 0 ? (
            <>
              <ScrollArea className="min-h-0 flex-1 rounded-md border">
                <div className="space-y-2 p-2">
                  {visibleRerunResults.map((result) => {
                    const isSelected = selectedResult?.id === result.id;
                    const organizationType = getOrganizationType(result);
                    const addressLine = getResultAddressLine(result);
                    const clinicalDetail = result.specialties ?? result.procedures ?? result.equipment ?? result.capability;
                    const resultUrl = getResultUrl(result);

                    return (
                      <div
                        className={cn(
                          'w-full rounded-md border bg-background p-3 transition-colors hover:bg-muted/60',
                          isSelected ? 'border-primary bg-primary/5' : 'border-border'
                        )}
                        key={result.id}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            aria-label={`Select ${result.name} for referral`}
                            checked={selectedReferralIds.has(result.id)}
                            className="mt-0.5 h-4 w-4 rounded border-border"
                            onChange={(event) => toggleReferralSelection(result.id, event.target.checked)}
                            type="checkbox"
                          />
                          <button className="block min-w-0 flex-1 text-left" onClick={() => openResult(result, 'card')} type="button">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-medium">{result.name}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span className="truncate">{addressLine ?? 'Address not listed'}</span>
                                  </span>
                                </div>
                              </div>
                              <Badge variant="secondary" className="max-w-[120px] shrink-0 truncate">
                                {organizationType ?? 'Clinic'}
                              </Badge>
                            </div>

                            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{getResultSummary(result)}</p>

                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                              <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                                <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{result.phone ?? 'Phone n/a'}</span>
                              </span>
                              <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                                <UsersRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{result.numberDoctors ?? 'Doctors n/a'}</span>
                              </span>
                              <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                                <ListChecks className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">Capacity: {result.capacity ?? 'n/a'}</span>
                              </span>
                              <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                                <Stethoscope className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{clinicalDetail ?? 'Clinical details n/a'}</span>
                              </span>
                            </div>
                          </button>
                        </div>

                        {resultUrl ? (
                          <a
                            className="ml-7 mt-2 inline-flex max-w-[calc(100%-1.75rem)] items-center gap-1 truncate text-xs font-medium text-primary underline-offset-4 hover:underline"
                            href={resultUrl}
                            onClick={() =>
                              logAction?.({
                                eventType: 'clinic_url_opened',
                                page: 'genie',
                                targetType: 'clinic_result',
                                targetId: result.id,
                                properties: { name: result.name, url: resultUrl },
                              })
                            }
                            rel="noreferrer"
                            target="_blank"
                          >
                            <span className="truncate">{resultUrl}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          </a>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <ResultsMap
                results={visibleRerunResults}
                selectedResultId={selectedResult?.id ?? ''}
                selectedLocation={selectedLocation}
                onSelectResult={(result) => openResult(result, 'map')}
                theme={theme}
              />
            </>
          ) : (
            <EmptyResultsPanel
              hasGeneratedSql={Boolean(latestGeneratedSql)}
              selectedLocation={selectedLocation}
              onPrompt={sendMessageWithSessionLocation}
            />
          )}
        </aside>

        <ResultDetailsDialog result={selectedResult} open={dialogOpen} onOpenChange={setDialogOpen} />
      </div>
  );
}
