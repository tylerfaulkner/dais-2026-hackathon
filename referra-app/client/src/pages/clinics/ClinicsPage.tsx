import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ScrollArea, Skeleton } from '@databricks/appkit-ui/react';
import {
  Building2,
  Check,
  ChevronDown,
  Database,
  ExternalLink,
  Globe2,
  MapPin,
  Navigation,
  Phone,
  Printer,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { printReferralPacket, type ReferralLocation } from '../../lib/referrals';
import type { UsageLogEvent } from '../../lib/usage';

interface FacilityRow {
  id: string;
  name: string;
  facility_type: string | null;
  operator_type: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  specialties: string | null;
  procedures: string | null;
  equipment: string | null;
  capability: string | null;
  number_doctors: string | null;
  capacity: string | null;
  source: string | null;
  source_types: string | null;
  source_urls: string | null;
  last_updated: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface FilterOptionRow {
  filter_type: string | null;
  value: string | null;
  label: string | null;
  facilities: number | string | null;
}

interface FacilityGridResponse {
  facilities: FacilityRow[];
  matchingFacilities: number;
  mappedFacilities: number;
  filterOptions: FilterOptionRow[];
  dataSource?: 'lakebase' | 'warehouse';
  sourceTable?: string;
  fallbackReason?: string;
}

const numberFormatter = new Intl.NumberFormat('en-IN');
const gridColumns = [
  { id: 'facility', label: 'Facility' },
  { id: 'location', label: 'Location' },
  { id: 'type', label: 'Type' },
  { id: 'clinicalSignals', label: 'Clinical signals' },
  { id: 'contact', label: 'Contact' },
  { id: 'coordinates', label: 'Coordinates' },
] as const;

type GridColumnId = (typeof gridColumns)[number]['id'];

function createDefaultVisibleGridColumns() {
  return new Set<GridColumnId>(gridColumns.map((column) => column.id));
}

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((item) => cleanText(item)).filter(Boolean).join(', ');
  if (typeof value === 'object' || typeof value === 'function' || typeof value === 'symbol') return '';

  const rawValue =
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
      ? String(value)
      : '';

  const normalized = rawValue
    .trim()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/^"|"$/g, '')
    .replace(/\s*,\s*/g, ', ')
    .trim();

  if (!normalized || normalized === '[]' || normalized.toLowerCase() === 'null') return '';
  return normalized;
}

function displayText(value: unknown, fallback = 'Not listed') {
  return cleanText(value) || fallback;
}

function titleText(value: unknown, fallback = 'Unknown') {
  const text = cleanText(value).replace(/_/g, ' ');
  if (!text) return fallback;

  return text
    .split(' ')
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
    .join(' ');
}

function splitValues(value: unknown, limit = 5) {
  return cleanText(value)
    .split(',')
    .map((item) => titleText(item.trim(), ''))
    .filter(Boolean)
    .slice(0, limit);
}

function optionLabel(option: FilterOptionRow) {
  return `${titleText(option.label)} (${numberFormatter.format(toNumber(option.facilities))})`;
}

function optionsFor(options: FilterOptionRow[], filterType: string) {
  return options.filter((option) => option.filter_type === filterType && cleanText(option.value));
}

function createFallbackOption(filterType: string, value: string, facilities: number): FilterOptionRow {
  return {
    filter_type: filterType,
    value: value.toLowerCase(),
    label: titleText(value),
    facilities,
  };
}

function addOptionCount(counts: Map<string, number>, value: unknown) {
  const text = cleanText(value);
  if (!text) return;
  counts.set(text, (counts.get(text) ?? 0) + 1);
}

function addSplitOptionCounts(counts: Map<string, number>, value: unknown) {
  cleanText(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => counts.set(item, (counts.get(item) ?? 0) + 1));
}

function optionsFromCounts(filterType: string, counts: Map<string, number>, limit = 80) {
  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, limit)
    .map(([value, facilities]) => createFallbackOption(filterType, value, facilities));
}

function buildFallbackFilterOptions(facilities: FacilityRow[]) {
  const stateCounts = new Map<string, number>();
  const facilityTypeCounts = new Map<string, number>();
  const specialtyCounts = new Map<string, number>();
  const procedureCounts = new Map<string, number>();

  facilities.forEach((facility) => {
    addOptionCount(stateCounts, facility.state);
    addOptionCount(facilityTypeCounts, facility.facility_type);
    addSplitOptionCounts(specialtyCounts, facility.specialties);
    addSplitOptionCounts(procedureCounts, facility.procedures);
  });

  return [
    ...optionsFromCounts('state', stateCounts),
    ...optionsFromCounts('facility_type', facilityTypeCounts),
    ...optionsFromCounts('specialty', specialtyCounts),
    ...optionsFromCounts('procedure', procedureCounts),
  ];
}

function useFacilityGridData(filters: {
  search: string;
  state: string;
  facilityType: string;
  specialty: string;
  procedure: string;
}) {
  const [data, setData] = useState<FacilityGridResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      search: filters.search,
      state: filters.state,
      facility_type: filters.facilityType,
      specialty: filters.specialty,
      procedure: filters.procedure,
      limit: '250',
    });

    async function loadFacilities() {
      setLoading(true);
      setError('');

      const response = await fetch(`/api/facilities-grid?${params.toString()}`, {
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as FacilityGridResponse | { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload && 'message' in payload && payload.message ? payload.message : 'Facility data is unavailable.');
      }

      setData(payload as FacilityGridResponse);
    }

    void loadFacilities()
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'Facility data is unavailable.');
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [filters.facilityType, filters.procedure, filters.search, filters.specialty, filters.state]);

  return { data, loading, error };
}

function firstUrl(value: unknown) {
  const first = cleanText(value)
    .split(',')
    .map((item) => item.trim())
    .find((item) => /^https?:\/\//i.test(item));

  return first ?? '';
}

function toReferralLocation(facility: FacilityRow): ReferralLocation {
  return {
    name: displayText(facility.name, 'Unnamed facility'),
    organizationType: displayText(facility.operator_type, ''),
    phone: displayText(facility.phone, ''),
    email: displayText(facility.email, ''),
    url: firstUrl(facility.website) || firstUrl(facility.source_urls),
    address: displayText(facility.address, ''),
    city: displayText(facility.city, ''),
    state: displayText(facility.state, ''),
    postalCode: displayText(facility.postal_code, ''),
    doctors: displayText(facility.number_doctors, ''),
    capacity: displayText(facility.capacity, ''),
    specialties: displayText(facility.specialties, ''),
    procedures: displayText(facility.procedures, ''),
    equipment: displayText(facility.equipment, ''),
    capabilities: displayText(facility.capability, ''),
  };
}

function coordinatesLabel(facility: FacilityRow) {
  const latitude = Number(facility.latitude);
  const longitude = Number(facility.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'Missing';
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

function FacilityBadges({ facility }: { facility: FacilityRow }) {
  const specialties = splitValues(facility.specialties, 3);
  const fallbackSignals = splitValues(facility.capability, 3);
  const signals = specialties.length > 0 ? specialties : fallbackSignals;

  if (signals.length === 0) {
    return <span className="text-xs text-muted-foreground">No clinical signals listed</span>;
  }

  return (
    <div className="flex max-w-md flex-wrap gap-1.5">
      {signals.map((signal) => (
        <Badge key={signal} variant="secondary">
          {signal}
        </Badge>
      ))}
    </div>
  );
}

function DetailList({ title, values }: { title: string; values: string[] }) {
  if (values.length === 0) return null;

  return (
    <div>
      <div className="mb-2 text-sm font-medium">{title}</div>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <Badge key={value} variant="secondary">
            {value}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function SearchableFilterSelect({
  ariaLabel,
  allLabel,
  disabled,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  allLabel: string;
  disabled: boolean;
  options: FilterOptionRow[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedOption = options.find((option) => option.value === value);
  const displayValue = value === 'all' ? allLabel : selectedOption ? optionLabel(selectedOption) : allLabel;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(
    () =>
      options.filter((option) => {
        if (!normalizedQuery) return true;
        return optionLabel(option).toLowerCase().includes(normalizedQuery);
      }),
    [normalizedQuery, options]
  );
  const showAllOption = !normalizedQuery || allLabel.toLowerCase().includes(normalizedQuery);
  const selectableOptions = [
    ...(showAllOption ? [{ value: 'all', label: allLabel, selected: value === 'all' }] : []),
    ...filteredOptions.map((option) => ({
      value: option.value ?? '',
      label: optionLabel(option),
      selected: option.value === value,
    })),
  ].filter((option) => option.value);

  const chooseValue = (nextValue: string) => {
    onChange(nextValue);
    setQuery('');
    setOpen(false);
  };

  return (
    <div
      className="relative min-w-0"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setOpen(false);
        setQuery('');
      }}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          aria-expanded={open}
          aria-label={ariaLabel}
          className="h-10 w-full rounded-md border bg-background pl-8 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary disabled:pointer-events-none disabled:opacity-50"
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setQuery('');
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              setQuery('');
              event.currentTarget.blur();
            }
            if (event.key === 'Enter' && open && selectableOptions[0]) {
              chooseValue(selectableOptions[0].value);
            }
          }}
          placeholder={allLabel}
          role="combobox"
          value={open ? query : displayValue}
        />
        <button
          aria-label={`Open ${ariaLabel.toLowerCase()} options`}
          className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setQuery('');
            setOpen((currentValue) => !currentValue);
          }}
          type="button"
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', open ? 'rotate-180' : '')} aria-hidden="true" />
        </button>
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-md border bg-background p-1 shadow-lg" role="listbox">
          {selectableOptions.length > 0 ? (
            selectableOptions.map((option) => (
              <button
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors hover:bg-muted',
                  option.selected ? 'bg-muted font-medium' : ''
                )}
                key={option.value}
                onClick={() => chooseValue(option.value)}
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {option.selected ? <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : null}
              </button>
            ))
          ) : (
            <div className="px-2 py-3 text-sm text-muted-foreground">No options found</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ColumnVisibilityMenu({
  visibleColumns,
  onToggleColumn,
  onResetColumns,
}: {
  visibleColumns: Set<GridColumnId>;
  onToggleColumn: (columnId: GridColumnId, visible: boolean) => void;
  onResetColumns: () => void;
}) {
  const [open, setOpen] = useState(false);
  const visibleCount = visibleColumns.size;

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setOpen(false);
      }}
    >
      <button
        aria-expanded={open}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
        onClick={() => setOpen((currentValue) => !currentValue)}
        type="button"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Columns
        <span className="text-xs text-muted-foreground">{visibleCount}/{gridColumns.length}</span>
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-md border bg-background p-2 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <div className="text-sm font-medium">Visible columns</div>
            <button
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              onClick={onResetColumns}
              type="button"
            >
              Reset
            </button>
          </div>
          <div className="grid gap-1">
            {gridColumns.map((column) => {
              const checked = visibleColumns.has(column.id);

              return (
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm transition-colors hover:bg-muted"
                  key={column.id}
                >
                  <input
                    checked={checked}
                    className="h-4 w-4 rounded border-border"
                    onChange={(event) => onToggleColumn(column.id, event.target.checked)}
                    type="checkbox"
                  />
                  <span>{column.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FacilityDetails({ facility, logAction }: { facility: FacilityRow | null; logAction?: (event: UsageLogEvent) => void }) {
  if (!facility) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Select a facility to inspect its details.</CardContent>
      </Card>
    );
  }

  const website = firstUrl(facility.website) || firstUrl(facility.source_urls);

  return (
    <Card>
      <CardHeader className="px-4 pb-2 pt-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" aria-hidden="true" />
          <span className="min-w-0 truncate">{displayText(facility.name, 'Unnamed facility')}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge>{titleText(facility.facility_type)}</Badge>
          <Badge variant="outline">{titleText(facility.operator_type)}</Badge>
          <Badge variant={Number.isFinite(Number(facility.latitude)) ? 'secondary' : 'outline'}>
            {Number.isFinite(Number(facility.latitude)) ? 'Mapped' : 'No coordinates'}
          </Badge>
        </div>

        <p className="text-muted-foreground">{displayText(facility.description, displayText(facility.capability, 'No description available.'))}</p>

        <div className="space-y-3">
          <div className="flex gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <div className="font-medium">
                {[displayText(facility.city, ''), displayText(facility.state, '')].filter(Boolean).join(', ') || 'Location not listed'}
              </div>
              <div className="text-muted-foreground">{displayText(facility.address)}</div>
              <div className="text-muted-foreground">{coordinatesLabel(facility)}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <div className="font-medium">{displayText(facility.phone)}</div>
              <div className="text-muted-foreground">{displayText(facility.email)}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              {website ? (
                <a
                  className="inline-flex max-w-full items-center gap-1 truncate font-medium text-primary underline-offset-4 hover:underline"
                  href={website}
                  onClick={() =>
                    logAction?.({
                      eventType: 'clinic_url_opened',
                      page: 'clinics',
                      targetType: 'facility',
                      targetId: facility.id,
                      properties: { name: displayText(facility.name, 'Unnamed facility'), url: website, source: 'details_panel' },
                    })
                  }
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="truncate">{website}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </a>
              ) : (
                <div className="truncate font-medium">Website not listed</div>
              )}
              <div className="text-muted-foreground">Source: {displayText(facility.source, 'Unknown')}</div>
            </div>
          </div>
        </div>

        <DetailList title="Specialties" values={splitValues(facility.specialties, 10)} />
        <DetailList title="Procedures" values={splitValues(facility.procedures, 8)} />
        <DetailList title="Equipment" values={splitValues(facility.equipment, 8)} />

        <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 text-sm">
          <div>
            <div className="text-muted-foreground">Doctors</div>
            <div className="mt-1 font-medium">{displayText(facility.number_doctors)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Capacity</div>
            <div className="mt-1 font-medium">{displayText(facility.capacity)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Last updated</div>
            <div className="mt-1 font-medium">{displayText(facility.last_updated)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Source type</div>
            <div className="mt-1 font-medium">{displayText(facility.source_types)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ClinicsPage({ logAction }: { logAction?: (event: UsageLogEvent) => void }) {
  const [stateFilter, setStateFilter] = useState('all');
  const [facilityTypeFilter, setFacilityTypeFilter] = useState('all');
  const [specialtyFilter, setSpecialtyFilter] = useState('all');
  const [procedureFilter, setProcedureFilter] = useState('all');
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const [selectedReferralFacilityIds, setSelectedReferralFacilityIds] = useState<Set<string>>(() => new Set());
  const [visibleGridColumns, setVisibleGridColumns] = useState<Set<GridColumnId>>(createDefaultVisibleGridColumns);

  const hasActiveFilters =
    stateFilter !== 'all' || facilityTypeFilter !== 'all' || specialtyFilter !== 'all' || procedureFilter !== 'all';

  const queryParameters = useMemo(
    () => ({
      search: '',
      state: stateFilter,
      facilityType: facilityTypeFilter,
      specialty: specialtyFilter,
      procedure: procedureFilter,
    }),
    [facilityTypeFilter, procedureFilter, specialtyFilter, stateFilter]
  );

  const { data: facilityGridData, loading: facilitiesLoading, error: facilitiesError } = useFacilityGridData(queryParameters);

  const facilities = useMemo(() => facilityGridData?.facilities ?? [], [facilityGridData]);
  const filterOptions = useMemo(() => {
    const options = facilityGridData?.filterOptions ?? [];
    return options.length > 0 ? options : buildFallbackFilterOptions(facilities);
  }, [facilities, facilityGridData]);
  const selectedFacility = facilities.find((facility) => facility.id === selectedFacilityId) ?? facilities[0] ?? null;
  const selectedReferralFacilities = useMemo(
    () => facilities.filter((facility) => selectedReferralFacilityIds.has(facility.id)),
    [facilities, selectedReferralFacilityIds]
  );
  const selectedReferrals = useMemo(
    () => selectedReferralFacilities.map(toReferralLocation),
    [selectedReferralFacilities]
  );
  const matchingFacilities = facilityGridData?.matchingFacilities ?? facilities.length;
  const mappedFacilities = facilityGridData?.mappedFacilities ?? 0;
  const sourceLabel =
    facilityGridData?.dataSource === 'warehouse'
      ? `SQL warehouse fallback${facilityGridData.sourceTable ? `: ${facilityGridData.sourceTable}` : ''}`
      : 'Lakebase view of cleaned facilities synced from the silver table.';

  const clearFilters = () => {
    setStateFilter('all');
    setFacilityTypeFilter('all');
    setSpecialtyFilter('all');
    setProcedureFilter('all');
    logAction?.({
      eventType: 'clinic_filters_cleared',
      page: 'clinics',
      targetType: 'clinic_filters',
    });
  };

  useEffect(() => {
    const facilityIds = new Set(facilities.map((facility) => facility.id));
    setSelectedReferralFacilityIds((currentIds) => new Set([...currentIds].filter((id) => facilityIds.has(id))));
  }, [facilities]);

  useEffect(() => {
    logAction?.({
      eventType: 'clinic_filters_changed',
      page: 'clinics',
      targetType: 'clinic_filters',
      properties: queryParameters,
    });
  }, [queryParameters, logAction]);

  useEffect(() => {
    if (!facilityGridData) return;

    logAction?.({
      eventType: 'clinic_grid_loaded',
      page: 'clinics',
      targetType: 'clinic_grid',
      properties: {
        shown: facilities.length,
        matchingFacilities,
        mappedFacilities,
        dataSource: facilityGridData.dataSource,
      },
    });
  }, [facilities.length, facilityGridData, logAction, mappedFacilities, matchingFacilities]);

  const toggleReferralSelection = (id: string, checked: boolean) => {
    setSelectedReferralFacilityIds((currentIds) => {
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
      page: 'clinics',
      targetType: 'facility',
      targetId: id,
    });
  };

  const setAllReferralSelections = (checked: boolean) => {
    setSelectedReferralFacilityIds(checked ? new Set(facilities.map((facility) => facility.id)) : new Set());
    logAction?.({
      eventType: checked ? 'referrals_select_all' : 'referrals_clear',
      page: 'clinics',
      targetType: 'referral_selection',
      properties: {
        visibleFacilities: facilities.length,
      },
    });
  };
  const isGridColumnVisible = (columnId: GridColumnId) => visibleGridColumns.has(columnId);
  const toggleGridColumn = (columnId: GridColumnId, visible: boolean) => {
    setVisibleGridColumns((currentColumns) => {
      const nextColumns = new Set(currentColumns);
      if (visible) {
        nextColumns.add(columnId);
      } else {
        nextColumns.delete(columnId);
      }
      return nextColumns;
    });
    logAction?.({
      eventType: visible ? 'grid_column_shown' : 'grid_column_hidden',
      page: 'clinics',
      targetType: 'grid_column',
      targetId: columnId,
    });
  };
  const resetGridColumns = () => {
    setVisibleGridColumns(createDefaultVisibleGridColumns());
    logAction?.({
      eventType: 'grid_columns_reset',
      page: 'clinics',
      targetType: 'grid_column',
    });
  };

  return (
    <div className="grid h-[calc(100vh-170px)] min-h-0 gap-3 overflow-hidden xl:grid-cols-[minmax(0,1fr)_440px]">
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-background">
        <div className="shrink-0 border-b px-3 py-4 md:px-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Facility Grid</h2>
              <p className="text-sm text-muted-foreground">
                {sourceLabel}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-right text-sm">
              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <div className="text-xs text-muted-foreground">Matches</div>
                <div className="font-semibold tabular-nums">{numberFormatter.format(matchingFacilities)}</div>
              </div>
              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <div className="text-xs text-muted-foreground">Shown</div>
                <div className="font-semibold tabular-nums">{numberFormatter.format(facilities.length)}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 lg:grid-cols-[repeat(4,minmax(140px,1fr))_auto_auto]">
            <SearchableFilterSelect
              ariaLabel="Filter by state"
              allLabel="All states"
              disabled={facilitiesLoading}
              options={optionsFor(filterOptions, 'state')}
              value={stateFilter}
              onChange={setStateFilter}
            />
            <SearchableFilterSelect
              ariaLabel="Filter by facility type"
              allLabel="All types"
              disabled={facilitiesLoading}
              options={optionsFor(filterOptions, 'facility_type')}
              value={facilityTypeFilter}
              onChange={setFacilityTypeFilter}
            />
            <SearchableFilterSelect
              ariaLabel="Filter by specialty"
              allLabel="All specialties"
              disabled={facilitiesLoading}
              options={optionsFor(filterOptions, 'specialty')}
              value={specialtyFilter}
              onChange={setSpecialtyFilter}
            />
            <SearchableFilterSelect
              ariaLabel="Filter by procedure"
              allLabel="All procedures"
              disabled={facilitiesLoading}
              options={optionsFor(filterOptions, 'procedure')}
              value={procedureFilter}
              onChange={setProcedureFilter}
            />
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              disabled={!hasActiveFilters}
              onClick={clearFilters}
              type="button"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Reset
            </button>
            <ColumnVisibilityMenu
              visibleColumns={visibleGridColumns}
              onResetColumns={resetGridColumns}
              onToggleColumn={toggleGridColumn}
            />
          </div>

          <div className="mt-3 flex flex-col gap-2 rounded-md border bg-muted/20 p-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex items-center gap-2 text-muted-foreground">
              <input
                aria-label="Select all visible facilities for referral"
                checked={facilities.length > 0 && selectedReferralFacilityIds.size === facilities.length}
                className="h-4 w-4 rounded border-border"
                disabled={facilities.length === 0}
                onChange={(event) => setAllReferralSelections(event.target.checked)}
                type="checkbox"
              />
              <span>{selectedReferrals.length} selected for referral</span>
            </label>
            <div className="flex gap-2">
              <Button
                className="h-8 gap-1.5 px-2.5 text-xs"
                disabled={selectedReferrals.length === 0}
                onClick={() => {
                  logAction?.({
                    eventType: 'referrals_printed',
                    page: 'clinics',
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
              <Button
                className="h-8 px-2.5 text-xs"
                disabled={selectedReferrals.length === 0}
                onClick={() => setAllReferralSelections(false)}
                size="sm"
                type="button"
                variant="outline"
              >
                Clear
              </Button>
            </div>
          </div>
        </div>

        {facilitiesLoading ? (
          <div className="grid gap-3 p-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : null}

        {facilitiesError ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <div className="max-w-md rounded-lg border bg-muted/40 p-5 text-center">
              <Database className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <h3 className="mt-3 font-semibold">Facility data is unavailable</h3>
              <p className="mt-2 text-sm text-muted-foreground">{facilitiesError}</p>
            </div>
          </div>
        ) : null}

        {!facilitiesLoading && !facilitiesError ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className={cn('w-full text-left text-sm', visibleGridColumns.size >= 5 ? 'min-w-[1120px]' : 'min-w-[760px]')}>
              <thead className="sticky top-0 z-10 border-b bg-muted/80 text-xs uppercase text-muted-foreground backdrop-blur">
                <tr>
                  <th className="w-10 px-4 py-3 font-medium">Select</th>
                  {isGridColumnVisible('facility') ? <th className="px-4 py-3 font-medium">Facility</th> : null}
                  {isGridColumnVisible('location') ? <th className="px-4 py-3 font-medium">Location</th> : null}
                  {isGridColumnVisible('type') ? <th className="px-4 py-3 font-medium">Type</th> : null}
                  {isGridColumnVisible('clinicalSignals') ? <th className="px-4 py-3 font-medium">Clinical signals</th> : null}
                  {isGridColumnVisible('contact') ? <th className="px-4 py-3 font-medium">Contact</th> : null}
                  {isGridColumnVisible('coordinates') ? <th className="px-4 py-3 font-medium">Coordinates</th> : null}
                </tr>
              </thead>
              <tbody>
                {facilities.map((facility) => {
                  const isSelected = facility.id === selectedFacility?.id;
                  const clinicUrl = firstUrl(facility.website) || firstUrl(facility.source_urls);

                  return (
                    <tr
                      className={cn('border-b last:border-0', isSelected ? 'bg-primary/5' : 'hover:bg-muted/40')}
                      key={facility.id}
                    >
                      <td className="px-4 py-3 align-top">
                        <input
                          aria-label={`Select ${displayText(facility.name, 'Unnamed facility')} for referral`}
                          checked={selectedReferralFacilityIds.has(facility.id)}
                          className="h-4 w-4 rounded border-border"
                          onChange={(event) => toggleReferralSelection(facility.id, event.target.checked)}
                          type="checkbox"
                        />
                      </td>
                      {isGridColumnVisible('facility') ? (
                        <td className="px-4 py-3 align-top">
                          {clinicUrl ? (
                            <a
                              className="inline-flex max-w-sm items-center gap-1 text-left font-medium text-primary underline-offset-4 hover:underline"
                              href={clinicUrl}
                              onClick={() =>
                                logAction?.({
                                  eventType: 'clinic_url_opened',
                                  page: 'clinics',
                                  targetType: 'facility',
                                  targetId: facility.id,
                                  properties: { name: displayText(facility.name, 'Unnamed facility'), url: clinicUrl },
                                })
                              }
                              rel="noreferrer"
                              target="_blank"
                            >
                              <span className="truncate">{displayText(facility.name, 'Unnamed facility')}</span>
                              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            </a>
                          ) : (
                            <button
                              className="max-w-sm text-left font-medium text-foreground underline-offset-4 hover:underline"
                              onClick={() => {
                                setSelectedFacilityId(facility.id);
                                logAction?.({
                                  eventType: 'facility_details_selected',
                                  page: 'clinics',
                                  targetType: 'facility',
                                  targetId: facility.id,
                                  properties: { name: displayText(facility.name, 'Unnamed facility') },
                                });
                              }}
                              type="button"
                            >
                              {displayText(facility.name, 'Unnamed facility')}
                            </button>
                          )}
                          <div className="mt-1 max-w-sm line-clamp-2 text-xs text-muted-foreground">
                            {displayText(facility.description, displayText(facility.capability, 'No summary available'))}
                          </div>
                        </td>
                      ) : null}
                      {isGridColumnVisible('location') ? (
                        <td className="px-4 py-3 align-top">
                          <div>{[displayText(facility.city, ''), displayText(facility.state, '')].filter(Boolean).join(', ') || 'Unknown'}</div>
                          <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">{displayText(facility.address)}</div>
                        </td>
                      ) : null}
                      {isGridColumnVisible('type') ? (
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col items-start gap-1.5">
                            <Badge>{titleText(facility.facility_type)}</Badge>
                            <Badge variant="outline">{titleText(facility.operator_type)}</Badge>
                          </div>
                        </td>
                      ) : null}
                      {isGridColumnVisible('clinicalSignals') ? (
                        <td className="px-4 py-3 align-top">
                          <FacilityBadges facility={facility} />
                        </td>
                      ) : null}
                      {isGridColumnVisible('contact') ? (
                        <td className="px-4 py-3 align-top">
                          <div>{displayText(facility.phone)}</div>
                          <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">{displayText(facility.website)}</div>
                        </td>
                      ) : null}
                      {isGridColumnVisible('coordinates') ? (
                        <td className="px-4 py-3 align-top tabular-nums">
                          {coordinatesLabel(facility)}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {facilities.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No facilities match the current filters.
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
        <ScrollArea className="min-h-0 flex-1">
          <FacilityDetails facility={selectedFacility} logAction={logAction} />

          <Card className="mt-4">
            <CardHeader className="px-4 pb-2 pt-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Stethoscope className="h-4 w-4" aria-hidden="true" />
                Column Strategy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4 text-sm text-muted-foreground">
              <div className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Name, type, location, contact, specialties, and procedures are promoted into the grid workflow.</span>
              </div>
              <div className="flex gap-2">
                <Navigation className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Specialties and procedures are exposed as filters to narrow referral candidates by clinical need.</span>
              </div>
              <div className="flex gap-2">
                <Database className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Long text columns stay in the details panel to keep the grid scannable.</span>
              </div>
            </CardContent>
          </Card>
        </ScrollArea>
      </aside>
    </div>
  );
}
