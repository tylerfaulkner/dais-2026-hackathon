import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Skeleton, useAnalyticsQuery } from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { Activity, AlertCircle, ListFilter, MapPinned, Search } from 'lucide-react';
import L from 'leaflet';
import { GeoJSON as GeoJSONLayer, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import indiaAdm1BoundariesUrl from '../../data/india-adm1-boundaries.json?url';
import { cn } from '../../lib/utils';

type Theme = 'light' | 'dark';

interface NfhsMetricValues {
  improvedSanitationPct: number | null;
  cleanFuelPct: number | null;
  healthInsurancePct: number | null;
  womenLiteracyPct: number | null;
  institutionalBirthPct: number | null;
  skilledBirthAttendancePct: number | null;
  childStuntedPct: number | null;
  childUnderweightPct: number | null;
  womenAnaemiaPct: number | null;
  womenHighBpPct: number | null;
  menHighBpPct: number | null;
}

interface NfhsDistrict extends NfhsMetricValues {
  districtName: string;
  state: string;
  householdsSurveyed: number | null;
}

interface NfhsStateMetric extends NfhsMetricValues {
  state: string;
  districts: number;
  householdsSurveyed: number | null;
}

type IndicatorKey = keyof NfhsMetricValues;

interface Indicator {
  key: IndicatorKey;
  label: string;
  shortLabel: string;
  higherIsBetter: boolean;
}

interface StateSummary {
  state: string;
  latitude: number;
  longitude: number;
  districts: number;
  value: number | null;
  surveyedHouseholds: number;
  boundary: BoundaryFeature | null;
}

interface BoundaryProperties {
  shapeName?: string;
  shapeISO?: string;
}

type BoundaryFeature = Feature<Geometry, BoundaryProperties>;

const indiaCenter: [number, number] = [22.9734, 78.6569];
const numberFormatter = new Intl.NumberFormat('en-IN');
const districtQueryLimit = 120;

const indicators: Indicator[] = [
  { key: 'institutionalBirthPct', label: 'Institutional births', shortLabel: 'Institutional births', higherIsBetter: true },
  { key: 'skilledBirthAttendancePct', label: 'Births attended by skilled health personnel', shortLabel: 'Skilled births', higherIsBetter: true },
  { key: 'healthInsurancePct', label: 'Households with a member covered by health insurance', shortLabel: 'Health insurance', higherIsBetter: true },
  { key: 'improvedSanitationPct', label: 'Households using improved sanitation', shortLabel: 'Sanitation', higherIsBetter: true },
  { key: 'cleanFuelPct', label: 'Households using clean fuel for cooking', shortLabel: 'Clean fuel', higherIsBetter: true },
  { key: 'womenLiteracyPct', label: 'Women age 15-49 who are literate', shortLabel: 'Women literacy', higherIsBetter: true },
  { key: 'childStuntedPct', label: 'Children under 5 who are stunted', shortLabel: 'Child stunting', higherIsBetter: false },
  { key: 'childUnderweightPct', label: 'Children under 5 who are underweight', shortLabel: 'Child underweight', higherIsBetter: false },
  { key: 'womenAnaemiaPct', label: 'Women age 15-49 who are anaemic', shortLabel: 'Women anaemia', higherIsBetter: false },
  { key: 'womenHighBpPct', label: 'Women 15+ with high blood pressure', shortLabel: 'Women high BP', higherIsBetter: false },
  { key: 'menHighBpPct', label: 'Men 15+ with high blood pressure', shortLabel: 'Men high BP', higherIsBetter: false },
];

function isIndicatorKey(value: string): value is IndicatorKey {
  return indicators.some((indicator) => indicator.key === value);
}

const stateCentroids: Record<string, [number, number]> = {
  'Andaman & Nicobar Islands': [11.7401, 92.6586],
  'Andhra Pradesh': [15.9129, 79.74],
  'Arunachal Pradesh': [28.218, 94.7278],
  Assam: [26.2006, 92.9376],
  Bihar: [25.0961, 85.3131],
  Chandigarh: [30.7333, 76.7794],
  Chhattisgarh: [21.2787, 81.8661],
  'Dadra & Nagar Haveli and Daman & Diu': [20.1809, 73.0169],
  Delhi: [28.7041, 77.1025],
  Goa: [15.2993, 74.124],
  Gujarat: [22.2587, 71.1924],
  Haryana: [29.0588, 76.0856],
  'Himachal Pradesh': [31.1048, 77.1734],
  'Jammu & Kashmir': [33.7782, 76.5762],
  Jharkhand: [23.6102, 85.2799],
  Karnataka: [15.3173, 75.7139],
  Kerala: [10.8505, 76.2711],
  Ladakh: [34.2268, 77.5619],
  Lakshadweep: [10.5667, 72.6417],
  'Madhya Pradesh': [22.9734, 78.6569],
  Maharashtra: [19.7515, 75.7139],
  Manipur: [24.6637, 93.9063],
  Meghalaya: [25.467, 91.3662],
  Mizoram: [23.1645, 92.9376],
  Nagaland: [26.1584, 94.5624],
  Odisha: [20.9517, 85.0985],
  Puducherry: [11.9416, 79.8083],
  Punjab: [31.1471, 75.3412],
  Rajasthan: [27.0238, 74.2179],
  Sikkim: [27.533, 88.5122],
  'Tamil Nadu': [11.1271, 78.6569],
  Telangana: [18.1124, 79.0193],
  Tripura: [23.9408, 91.9882],
  'Uttar Pradesh': [26.8467, 80.9462],
  Uttarakhand: [30.0668, 79.0193],
  'West Bengal': [22.9868, 87.855],
};

function formatPct(value: number | null) {
  if (value === null) return 'No data';
  return `${value.toFixed(1)}%`;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDistrict(row: {
  districtName?: unknown;
  state?: unknown;
  householdsSurveyed?: unknown;
  improvedSanitationPct?: unknown;
  cleanFuelPct?: unknown;
  healthInsurancePct?: unknown;
  womenLiteracyPct?: unknown;
  institutionalBirthPct?: unknown;
  skilledBirthAttendancePct?: unknown;
  childStuntedPct?: unknown;
  childUnderweightPct?: unknown;
  womenAnaemiaPct?: unknown;
  womenHighBpPct?: unknown;
  menHighBpPct?: unknown;
}): NfhsDistrict {
  return {
    districtName: toText(row.districtName),
    state: toText(row.state),
    householdsSurveyed: toNumber(row.householdsSurveyed),
    improvedSanitationPct: toNumber(row.improvedSanitationPct),
    cleanFuelPct: toNumber(row.cleanFuelPct),
    healthInsurancePct: toNumber(row.healthInsurancePct),
    womenLiteracyPct: toNumber(row.womenLiteracyPct),
    institutionalBirthPct: toNumber(row.institutionalBirthPct),
    skilledBirthAttendancePct: toNumber(row.skilledBirthAttendancePct),
    childStuntedPct: toNumber(row.childStuntedPct),
    childUnderweightPct: toNumber(row.childUnderweightPct),
    womenAnaemiaPct: toNumber(row.womenAnaemiaPct),
    womenHighBpPct: toNumber(row.womenHighBpPct),
    menHighBpPct: toNumber(row.menHighBpPct),
  };
}

function normalizeStateMetric(row: {
  state?: unknown;
  districts?: unknown;
  householdsSurveyed?: unknown;
  improvedSanitationPct?: unknown;
  cleanFuelPct?: unknown;
  healthInsurancePct?: unknown;
  womenLiteracyPct?: unknown;
  institutionalBirthPct?: unknown;
  skilledBirthAttendancePct?: unknown;
  childStuntedPct?: unknown;
  childUnderweightPct?: unknown;
  womenAnaemiaPct?: unknown;
  womenHighBpPct?: unknown;
  menHighBpPct?: unknown;
}): NfhsStateMetric {
  return {
    state: toText(row.state),
    districts: toNumber(row.districts) ?? 0,
    householdsSurveyed: toNumber(row.householdsSurveyed),
    improvedSanitationPct: toNumber(row.improvedSanitationPct),
    cleanFuelPct: toNumber(row.cleanFuelPct),
    healthInsurancePct: toNumber(row.healthInsurancePct),
    womenLiteracyPct: toNumber(row.womenLiteracyPct),
    institutionalBirthPct: toNumber(row.institutionalBirthPct),
    skilledBirthAttendancePct: toNumber(row.skilledBirthAttendancePct),
    childStuntedPct: toNumber(row.childStuntedPct),
    childUnderweightPct: toNumber(row.childUnderweightPct),
    womenAnaemiaPct: toNumber(row.womenAnaemiaPct),
    womenHighBpPct: toNumber(row.womenHighBpPct),
    menHighBpPct: toNumber(row.menHighBpPct),
  };
}

function average(values: Array<number | null>) {
  const validValues = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (validValues.length === 0) return null;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function getColor(value: number | null, indicator: Indicator) {
  if (value === null) return 'hsl(var(--muted-foreground))';
  const score = Math.min(Math.max(value, 0), 100);
  const positive = indicator.higherIsBetter ? score : 100 - score;
  if (positive >= 75) return '#159A74';
  if (positive >= 55) return '#D5A11E';
  return '#D1493F';
}

function normalizeRegionName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function createBoundaryLookup(boundaries: FeatureCollection<Geometry, BoundaryProperties>) {
  return boundaries.features.reduce((lookup, feature) => {
    const stateName = feature.properties?.shapeName;
    if (stateName) {
      lookup.set(normalizeRegionName(stateName), feature);
    }
    return lookup;
  }, new Map<string, BoundaryFeature>());
}

function getStateBoundary(state: string, boundaries: Map<string, BoundaryFeature>) {
  return boundaries.get(normalizeRegionName(state)) ?? null;
}

function getFeatureBounds(feature: BoundaryFeature) {
  const bounds = L.geoJSON(feature).getBounds();
  return bounds.isValid() ? bounds : null;
}

function FitMapToStates({ states }: { states: StateSummary[] }) {
  const map = useMap();

  useEffect(() => {
    if (states.length === 0) {
      map.setView(indiaCenter, 5);
      return;
    }

    const featureBounds = states.reduce<L.LatLngBounds | null>((bounds, state) => {
      if (!state.boundary) return bounds;

      const stateBounds = getFeatureBounds(state.boundary);
      if (!stateBounds) return bounds;
      if (!bounds) return stateBounds;

      bounds.extend(stateBounds);
      return bounds;
    }, null);

    if (featureBounds) {
      map.fitBounds(featureBounds.pad(0.08), { animate: false, maxZoom: 7 });
      return;
    }

    const centroidBounds = L.latLngBounds(states.map((state) => [state.latitude, state.longitude]));
    map.fitBounds(centroidBounds.pad(0.25), { animate: false, maxZoom: 7 });
  }, [map, states]);

  return null;
}

function createStateSummaries(states: NfhsStateMetric[], indicator: Indicator, boundaries: Map<string, BoundaryFeature>) {
  return states
    .map((stateMetric) => {
      const { state } = stateMetric;
      const centroid = stateCentroids[state];
      if (!centroid) return null;

      return {
        state,
        latitude: centroid[0],
        longitude: centroid[1],
        districts: stateMetric.districts,
        value: stateMetric[indicator.key],
        surveyedHouseholds: stateMetric.householdsSurveyed ?? 0,
        boundary: getStateBoundary(state, boundaries),
      };
    })
    .filter((summary): summary is StateSummary => summary !== null)
    .sort((a, b) => a.state.localeCompare(b.state));
}

export function NfhsPage({ theme }: { theme: Theme }) {
  const [selectedIndicatorKey, setSelectedIndicatorKey] = useState<Indicator['key']>('institutionalBirthPct');
  const [selectedState, setSelectedState] = useState<string>('');
  const [query, setQuery] = useState('');
  const [stateBoundaries, setStateBoundaries] = useState<FeatureCollection<Geometry, BoundaryProperties> | null>(null);
  const selectedIndicator = indicators.find((indicator) => indicator.key === selectedIndicatorKey) ?? indicators[0];
  const normalizedQuery = query.trim();
  const stateQueryParameters = useMemo(() => ({}), []);
  const { data: stateData, loading: statesLoading, error: statesError } = useAnalyticsQuery('nfhs_state_health_indicators', stateQueryParameters);

  useEffect(() => {
    let cancelled = false;

    async function loadStateBoundaries() {
      const response = await fetch(indiaAdm1BoundariesUrl);
      if (!response.ok) return;

      const boundaries = (await response.json()) as FeatureCollection<Geometry, BoundaryProperties>;
      if (!cancelled) {
        setStateBoundaries(boundaries);
      }
    }

    void loadStateBoundaries().catch(() => {
      if (!cancelled) {
        setStateBoundaries(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const boundaryByStateName = useMemo(
    () => (stateBoundaries ? createBoundaryLookup(stateBoundaries) : new Map<string, BoundaryFeature>()),
    [stateBoundaries]
  );

  const stateSummaries = useMemo(
    () =>
      createStateSummaries(
        (stateData ?? []).map(normalizeStateMetric).filter((stateMetric) => stateMetric.state),
        selectedIndicator,
        boundaryByStateName
      ),
    [boundaryByStateName, selectedIndicator, stateData]
  );

  const activeState = stateSummaries.find((summary) => summary.state === selectedState) ?? stateSummaries[0];
  const districtQueryParameters = useMemo(
    () => ({
      state: sql.string(activeState?.state ?? ''),
      search: sql.string(normalizedQuery),
      limit: sql.number(districtQueryLimit),
    }),
    [activeState?.state, normalizedQuery]
  );
  const {
    data: districtData,
    loading: districtsLoading,
    error: districtsError,
  } = useAnalyticsQuery('nfhs_district_health_indicators', districtQueryParameters);
  const districts = useMemo(
    () =>
      (districtData ?? [])
        .map(normalizeDistrict)
        .filter((district) => district.districtName && district.state),
    [districtData]
  );

  const rankedDistricts = useMemo(() => {
    return [...districts]
      .filter((district) => district[selectedIndicator.key] !== null)
      .sort((a, b) => {
        const aValue = a[selectedIndicator.key] as number;
        const bValue = b[selectedIndicator.key] as number;
        return selectedIndicator.higherIsBetter ? bValue - aValue : aValue - bValue;
      })
      .slice(0, 8);
  }, [districts, selectedIndicator]);

  const nationalAverage = average(stateSummaries.map((state) => state.value));
  const loading = statesLoading || districtsLoading;
  const error = statesError ?? districtsError;

  return (
    <div className="grid h-[calc(100vh-180px)] min-h-0 gap-3 overflow-hidden xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-background">
        <div className="shrink-0 border-b px-4 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">NFHS District Health</h2>
              <p className="text-sm text-muted-foreground">
                Explore district-level health indicators across India.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative w-full sm:w-64">
                <ListFilter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <select
                  aria-label="Choose health indicator"
                  className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm"
                  value={selectedIndicatorKey}
                  onChange={(event) => {
                    if (isIndicatorKey(event.target.value)) {
                      setSelectedIndicatorKey(event.target.value);
                    }
                  }}
                >
                  {indicators.map((indicator) => (
                    <option key={indicator.key} value={indicator.key}>
                      {indicator.shortLabel}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative w-full sm:w-60">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search districts"
                  className="pl-9"
                  placeholder="Search state or district"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid min-h-0 flex-1 gap-3 p-3 md:grid-cols-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="min-h-0 md:col-span-3" />
          </div>
        ) : null}

        {error ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <div className="max-w-md rounded-lg border bg-muted/40 p-5 text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <h3 className="mt-3 font-semibold">District data is unavailable</h3>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="grid shrink-0 gap-2 border-b p-3 md:grid-cols-3">
              <Card>
                <CardHeader className="px-3 pb-1 pt-2">
                  <CardTitle className="text-sm text-muted-foreground">Districts</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-2 text-xl font-semibold tabular-nums">
                  {numberFormatter.format(activeState?.districts ?? districts.length)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="px-3 pb-1 pt-2">
                  <CardTitle className="text-sm text-muted-foreground">States and territories</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-2 text-xl font-semibold tabular-nums">
                  {numberFormatter.format(stateSummaries.length)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="px-3 pb-1 pt-2">
                  <CardTitle className="text-sm text-muted-foreground">{selectedIndicator.shortLabel}</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-2 text-xl font-semibold tabular-nums">
                  {formatPct(nationalAverage)}
                </CardContent>
              </Card>
            </div>

            <div className="min-h-0 flex-1 p-3">
              <div
                aria-label="NFHS India indicator map"
                className="relative h-full min-h-0 overflow-hidden rounded-lg border bg-muted"
              >
                <MapContainer center={indiaCenter} className="h-full w-full" minZoom={4} scrollWheelZoom worldCopyJump zoom={5}>
                  <TileLayer
                    attribution={
                      theme === 'dark'
                        ? '&copy; OpenStreetMap contributors &copy; CARTO | Boundaries: geoBoundaries/DataMeet'
                        : '&copy; OpenStreetMap contributors | Boundaries: geoBoundaries/DataMeet'
                    }
                    url={
                      theme === 'dark'
                        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                    }
                  />
                  <FitMapToStates states={stateSummaries} />
                  {stateSummaries.map((state) => {
                    if (!state.boundary) return null;

                    const stateColor = getColor(state.value, selectedIndicator);
                    const isActive = state.state === activeState?.state;

                    return (
                      <GeoJSONLayer
                        data={state.boundary}
                        eventHandlers={{ click: () => setSelectedState(state.state) }}
                        key={`${state.state}-${selectedIndicator.key}-${isActive}-${state.value ?? 'none'}`}
                        style={{
                          color: isActive ? 'hsl(var(--foreground))' : stateColor,
                          fillColor: stateColor,
                          fillOpacity: isActive ? 0.34 : 0.2,
                          lineCap: 'round',
                          lineJoin: 'round',
                          weight: isActive ? 4 : 2,
                        }}
                      >
                        <Popup autoPan autoPanPadding={[48, 48]} keepInView>
                          <div className="clinic-map-popup">
                            <div className="font-medium">{state.state}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                              {numberFormatter.format(state.districts)} districts
                            </div>
                            <div className="mt-3 text-sm">
                              {selectedIndicator.shortLabel}: <strong>{formatPct(state.value)}</strong>
                            </div>
                          </div>
                        </Popup>
                      </GeoJSONLayer>
                    );
                  })}
                </MapContainer>

                <div className="absolute left-3 top-3 max-w-sm rounded-md border bg-background/95 px-3 py-2 shadow-sm">
                  <div className="text-sm font-medium">{selectedIndicator.label}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-3.5 border-2 border-[#159A74] bg-[#159A74]/20" /> Stronger
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-3.5 border-2 border-[#D5A11E] bg-[#D5A11E]/20" /> Mid
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-3.5 border-2 border-[#D1493F] bg-[#D1493F]/20" /> Needs attention
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <aside className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
        <Card className="shrink-0">
          <CardHeader className="px-4 pb-2 pt-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPinned className="h-4 w-4" aria-hidden="true" />
              {activeState?.state ?? 'India'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-3 text-sm">
            <div>
              <div className="text-muted-foreground">{selectedIndicator.shortLabel}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{formatPct(activeState?.value ?? null)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-muted-foreground">Districts</div>
                <div className="mt-1 font-medium tabular-nums">{numberFormatter.format(activeState?.districts ?? 0)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Households</div>
                <div className="mt-1 font-medium tabular-nums">
                  {numberFormatter.format(activeState?.surveyedHouseholds ?? 0)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CardHeader className="shrink-0 px-4 pb-2 pt-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" aria-hidden="true" />
              Districts to Review
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-1.5 overflow-hidden px-4 pb-3">
            {rankedDistricts.length === 0 ? (
              <div className="text-sm text-muted-foreground">District-level values will appear here when data is ready.</div>
            ) : null}
            {rankedDistricts.map((district) => (
              <button
                className={cn(
                  'w-full rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted',
                  district.state === activeState?.state ? 'bg-background' : 'bg-muted/30'
                )}
                key={`${district.state}-${district.districtName}`}
                onClick={() => setSelectedState(district.state)}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium">{district.districtName}</span>
                  <Badge variant="secondary">{formatPct(district[selectedIndicator.key])}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{district.state}</div>
              </button>
            ))}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
