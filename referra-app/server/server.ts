import { analytics, createApp, genie, lakebase, server } from '@databricks/appkit';
import { WorkspaceClient } from '@databricks/sdk-experimental';

const DEFAULT_LAKEBASE_FACILITIES_TABLE = 'public.facilities_serving';
const DEFAULT_WAREHOUSE_FACILITIES_SCHEMA = 'virtue_foundation_dataset.gold';

interface PresentedGenieResult {
  id: string;
  name: string;
  type: string | null;
  operatorType: string | null;
  confidenceScore: number | null;
  distanceKm: number | null;
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

interface LakebaseColumnRow {
  column_name: string;
  [key: string]: unknown;
}

interface FacilityGridRow {
  id: string | null;
  name: string | null;
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
  latitude: number | string | null;
  longitude: number | string | null;
  distance_km: number | string | null;
  [key: string]: unknown;
}

interface FacilityCountRow {
  matching_facilities: number | string | null;
  mapped_facilities: number | string | null;
  [key: string]: unknown;
}

interface FacilityFilterOptionRow {
  filter_type: string | null;
  value: string | null;
  label: string | null;
  facilities: number | string | null;
  [key: string]: unknown;
}

interface FacilityGridFilters {
  search: string;
  state: string;
  facilityType: string;
  specialty: string;
  procedure: string;
  limit: number;
  patientLatitude: number | null;
  patientLongitude: number | null;
}

interface UsageEventRow {
  id: number | string;
  session_id: string;
  event_type: string;
  page: string | null;
  target_type: string | null;
  target_id: string | null;
  properties: Record<string, unknown> | string | null;
  user_email: string | null;
  url_path: string | null;
  created_at: string;
  [key: string]: unknown;
}

type LakebaseQuery = <T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  values?: unknown[]
) => Promise<{ rows: T[] }>;

const facilitySourceColumns = {
  uniqueId: ['unique_id'],
  name: ['name'],
  facilityType: ['facilityTypeId', 'facility_type', 'facilitytypeid'],
  operatorType: ['organization_type', 'organization type', 'organizationType', 'operatorTypeId', 'operator_type', 'operatortypeid'],
  city: ['address_city'],
  state: ['address_stateOrRegion', 'address_state_or_region', 'address_stateorregion'],
  postalCode: ['address_zipOrPostCode', 'address_zipOrPostcode', 'address_zip_or_postcode'],
  addressLine1: ['address_line1'],
  addressLine2: ['address_line2'],
  addressLine3: ['address_line3'],
  officialPhone: ['officialPhone', 'official_phone', 'officialphone'],
  phoneNumbers: ['phone_numbers'],
  email: ['email'],
  officialWebsite: ['officialWebsite', 'official_website', 'officialwebsite'],
  websites: ['websites'],
  description: ['description'],
  specialties: ['specialties'],
  procedures: ['procedure', 'procedures'],
  equipment: ['equipment'],
  capability: ['capability'],
  numberDoctors: ['numberDoctors', 'number_doctors', 'numberdoctors'],
  capacity: ['capacity'],
  source: ['source'],
  sourceTypes: ['source_types'],
  sourceUrls: ['source_urls'],
  lastUpdated: ['recency_of_page_update', 'last_updated'],
  latitude: ['latitude'],
  longitude: ['longitude'],
  auditReason: ['audit_reason'],
} satisfies Record<string, string[]>;

type FacilitySourceColumnKey = keyof typeof facilitySourceColumns;
type ResolvedFacilityColumns = Record<FacilitySourceColumnKey, string | null>;

interface LakebaseTableReference {
  schema: string;
  table: string;
  sql: string;
  raw: string;
}

interface WarehouseFacilityTables {
  raw: string;
  facilities: string;
  core: string;
  contact: string;
  specialties: string;
  procedures: string;
  equipment: string;
  capabilities: string;
}

let cachedFacilitySource:
  | {
      raw: string;
      table: LakebaseTableReference;
      columns: ResolvedFacilityColumns;
    }
  | null = null;

function quotePgIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(identifier)) {
    throw new Error(`Invalid Lakebase identifier: ${identifier}`);
  }

  return `"${identifier.replace(/"/g, '""')}"`;
}

function getLakebaseFacilitiesTableReference(): LakebaseTableReference {
  const raw = (process.env.LAKEBASE_FACILITIES_TABLE ?? DEFAULT_LAKEBASE_FACILITIES_TABLE).trim();
  const parts = raw.split('.').map((part) => part.trim()).filter(Boolean);

  if (parts.length < 1 || parts.length > 2) {
    throw new Error('LAKEBASE_FACILITIES_TABLE must be a Postgres table name like public.facilities_serving.');
  }

  const schema = parts.length === 2 ? parts[0] : 'public';
  const table = parts.length === 2 ? parts[1] : parts[0];

  return {
    schema,
    table,
    sql: `${quotePgIdentifier(schema)}.${quotePgIdentifier(table)}`,
    raw,
  };
}

function quoteSqlIdentifier(identifier: string) {
  if (!identifier || identifier.includes('`')) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }

  return `\`${identifier}\``;
}

function getWarehouseFacilitiesTablesSql(): WarehouseFacilityTables {
  const raw = (process.env.WAREHOUSE_FACILITIES_SCHEMA ?? DEFAULT_WAREHOUSE_FACILITIES_SCHEMA).trim();
  const parts = raw.split('.').map((part) => part.trim()).filter(Boolean);

  if (parts.length !== 2) {
    throw new Error('WAREHOUSE_FACILITIES_SCHEMA must be a Unity Catalog schema name like catalog.schema.');
  }

  const schemaSql = parts.map(quoteSqlIdentifier).join('.');
  const tableSql = (table: string) => `${schemaSql}.${quoteSqlIdentifier(table)}`;

  return {
    raw,
    facilities: tableSql('facilities'),
    core: tableSql('facilities_core'),
    contact: tableSql('facilities_contact'),
    specialties: tableSql('facilities_specialties'),
    procedures: tableSql('facilities_procedures'),
    equipment: tableSql('facilities_equipment'),
    capabilities: tableSql('facilities_capabilities'),
  };
}

function normalizeParam(value: unknown, fallback: string) {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizedLowerParam(value: unknown, fallback: string) {
  return normalizeParam(value, fallback).toLowerCase();
}

function toSafeLimitParam(value: unknown) {
  const parsed = Number(normalizeParam(value, '250'));
  if (!Number.isFinite(parsed)) return 250;
  return Math.min(Math.max(Math.trunc(parsed), 1), 500);
}

function toSafeCoordinateParam(value: unknown, min: number, max: number) {
  const parsed = Number(normalizeParam(value, ''));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function pickColumn(columnsByLowerName: Map<string, string>, candidates: string[]) {
  const match = candidates.find((candidate) => columnsByLowerName.has(candidate.toLowerCase()));
  const columnName = match ? columnsByLowerName.get(match.toLowerCase()) : undefined;
  return columnName ? quotePgIdentifier(columnName) : null;
}

async function resolveFacilitySource(lakebaseQuery: LakebaseQuery) {
  const table = getLakebaseFacilitiesTableReference();
  if (cachedFacilitySource?.raw === table.raw) return cachedFacilitySource;

  const { rows } = await lakebaseQuery<LakebaseColumnRow>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
    `,
    [table.schema, table.table]
  );

  if (rows.length === 0) {
    throw new Error(`Lakebase synced table ${table.raw} was not found.`);
  }

  const columnsByLowerName = new Map(rows.map((row) => [row.column_name.toLowerCase(), row.column_name]));
  const columns = {} as ResolvedFacilityColumns;

  for (const key of Object.keys(facilitySourceColumns) as FacilitySourceColumnKey[]) {
    columns[key] = pickColumn(columnsByLowerName, facilitySourceColumns[key]);
  }

  cachedFacilitySource = { raw: table.raw, table, columns };
  return cachedFacilitySource;
}

function textColumn(columns: ResolvedFacilityColumns, key: FacilitySourceColumnKey) {
  const column = columns[key];
  if (!column) return 'NULL';
  return `NULLIF(NULLIF(BTRIM(CAST(${column} AS TEXT)), ''), 'null')`;
}

function rawColumn(columns: ResolvedFacilityColumns, key: FacilitySourceColumnKey) {
  return columns[key] ?? 'NULL';
}

function sqlStringLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function warehouseCleanText(expression: string) {
  return `NULLIF(NULLIF(TRIM(CAST(${expression} AS STRING)), ''), 'null')`;
}

function sqlNumberLiteral(value: number | null) {
  return value === null ? 'NULL' : String(value);
}

function warehouseDistanceExpression(filters: FacilityGridFilters) {
  const patientLatitude = sqlNumberLiteral(filters.patientLatitude);
  const patientLongitude = sqlNumberLiteral(filters.patientLongitude);
  const facilityLatitude = 'TRY_CAST(latitude AS DOUBLE)';
  const facilityLongitude = 'TRY_CAST(longitude AS DOUBLE)';

  return `
    CASE
      WHEN ${patientLatitude} IS NULL OR ${patientLongitude} IS NULL OR ${facilityLatitude} IS NULL OR ${facilityLongitude} IS NULL THEN NULL
      ELSE 6371.0 * 2.0 * ASIN(LEAST(1.0, SQRT(
        POWER(SIN(RADIANS(${facilityLatitude} - ${patientLatitude}) / 2.0), 2.0)
        + COS(RADIANS(${patientLatitude})) * COS(RADIANS(${facilityLatitude}))
        * POWER(SIN(RADIANS(${facilityLongitude} - ${patientLongitude}) / 2.0), 2.0)
      )))
    END
  `;
}

function pgCoordinateExpression(column: string) {
  return `
    CASE
      WHEN ${column} IS NULL THEN NULL
      WHEN CAST(${column} AS TEXT) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN CAST(${column} AS DOUBLE PRECISION)
      ELSE NULL
    END
  `;
}

function lakebaseDistanceExpression() {
  const facilityLatitude = pgCoordinateExpression('latitude');
  const facilityLongitude = pgCoordinateExpression('longitude');

  return `
    CASE
      WHEN $6::DOUBLE PRECISION IS NULL OR $7::DOUBLE PRECISION IS NULL OR ${facilityLatitude} IS NULL OR ${facilityLongitude} IS NULL THEN NULL
      ELSE 6371.0 * 2.0 * ASIN(LEAST(1.0, SQRT(
        POWER(SIN(RADIANS(${facilityLatitude} - $6::DOUBLE PRECISION) / 2.0), 2.0)
        + COS(RADIANS($6::DOUBLE PRECISION)) * COS(RADIANS(${facilityLatitude}))
        * POWER(SIN(RADIANS(${facilityLongitude} - $7::DOUBLE PRECISION) / 2.0), 2.0)
      )))
    END
  `;
}

function buildWarehouseFacilitiesBaseSql(tables: WarehouseFacilityTables, filters: FacilityGridFilters) {
  const search = sqlStringLiteral(filters.search.toLowerCase());
  const state = sqlStringLiteral(filters.state);
  const facilityType = sqlStringLiteral(filters.facilityType);
  const specialty = sqlStringLiteral(filters.specialty);
  const procedure = sqlStringLiteral(filters.procedure);

  return `
    WITH contact AS (
      SELECT
        unique_id,
        MIN(${warehouseCleanText('phone')}) AS phone,
        NULLIF(ARRAY_JOIN(SORT_ARRAY(COLLECT_SET(${warehouseCleanText('website')})), ', '), '') AS websites,
        NULLIF(ARRAY_JOIN(SORT_ARRAY(ARRAY_DISTINCT(FLATTEN(COLLECT_LIST(email)))), ', '), '') AS email
      FROM ${tables.contact}
      GROUP BY unique_id
    ),
    specialties AS (
      SELECT unique_id, NULLIF(ARRAY_JOIN(SORT_ARRAY(COLLECT_SET(${warehouseCleanText('raw')})), ', '), '') AS specialties
      FROM ${tables.specialties}
      GROUP BY unique_id
    ),
    procedures AS (
      SELECT unique_id, NULLIF(ARRAY_JOIN(SORT_ARRAY(COLLECT_SET(${warehouseCleanText('raw')})), ', '), '') AS procedures
      FROM ${tables.procedures}
      GROUP BY unique_id
    ),
    equipment AS (
      SELECT unique_id, NULLIF(ARRAY_JOIN(SORT_ARRAY(COLLECT_SET(${warehouseCleanText('raw')})), ', '), '') AS equipment
      FROM ${tables.equipment}
      GROUP BY unique_id
    ),
    capabilities AS (
      SELECT unique_id, NULLIF(ARRAY_JOIN(SORT_ARRAY(COLLECT_SET(${warehouseCleanText('raw')})), ', '), '') AS capability
      FROM ${tables.capabilities}
      GROUP BY unique_id
    ),
    cleaned AS (
      SELECT
        ${warehouseCleanText('c.unique_id')} AS id,
        ${warehouseCleanText('c.name')} AS name,
        ${warehouseCleanText('c.facilityTypeId')} AS facility_type_raw,
        COALESCE(${warehouseCleanText('c.organization_type')}, ${warehouseCleanText('c.operatorTypeId')}) AS operator_type_raw,
        ${warehouseCleanText('f.address_city')} AS city,
        ${warehouseCleanText('f.address_stateOrRegion')} AS state,
        CAST(NULL AS STRING) AS postal_code,
        ${warehouseCleanText('f.address_line1')} AS address_line1,
        ${warehouseCleanText('f.address_line2')} AS address_line2,
        CAST(NULL AS STRING) AS address_line3,
        contact.phone AS official_phone,
        CAST(NULL AS STRING) AS phone_numbers,
        contact.email AS email,
        CAST(NULL AS STRING) AS official_website,
        contact.websites AS websites,
        capabilities.capability AS description,
        specialties.specialties,
        procedures.procedures,
        equipment.equipment,
        capabilities.capability,
        ${warehouseCleanText('c.numberDoctors')} AS number_doctors,
        ${warehouseCleanText('c.capacity')} AS capacity,
        CAST('gold' AS STRING) AS source,
        CAST(NULL AS STRING) AS source_types,
        contact.websites AS source_urls,
        CAST(NULL AS STRING) AS last_updated,
        f.latitude,
        f.longitude,
        LOWER(CONCAT_WS(
          ' ',
          CAST(c.name AS STRING),
          CAST(c.facilityTypeId AS STRING),
          CAST(c.organization_type AS STRING),
          CAST(c.operatorTypeId AS STRING),
          CAST(f.address_city AS STRING),
          CAST(f.address_stateOrRegion AS STRING),
          CAST(contact.websites AS STRING),
          CAST(specialties.specialties AS STRING),
          CAST(procedures.procedures AS STRING),
          CAST(equipment.equipment AS STRING),
          CAST(capabilities.capability AS STRING)
        )) AS search_text
      FROM ${tables.core} c
      LEFT JOIN ${tables.facilities} f ON f.unique_id = c.unique_id
      LEFT JOIN contact ON contact.unique_id = c.unique_id
      LEFT JOIN specialties ON specialties.unique_id = c.unique_id
      LEFT JOIN procedures ON procedures.unique_id = c.unique_id
      LEFT JOIN equipment ON equipment.unique_id = c.unique_id
      LEFT JOIN capabilities ON capabilities.unique_id = c.unique_id
    ),
    filtered AS (
      SELECT *
      FROM cleaned
      WHERE (${state} = 'all' OR LOWER(state) = ${state})
        AND (${facilityType} = 'all' OR LOWER(facility_type_raw) = ${facilityType})
        AND (${specialty} = 'all' OR LOWER(specialties) LIKE CONCAT('%', ${specialty}, '%'))
        AND (${procedure} = 'all' OR LOWER(procedures) LIKE CONCAT('%', ${procedure}, '%'))
        AND (${search} = '' OR search_text LIKE CONCAT('%', ${search}, '%'))
    )
  `;
}

function buildWarehouseFacilitiesGridSql(tables: WarehouseFacilityTables, filters: FacilityGridFilters) {
  return `
    ${buildWarehouseFacilitiesBaseSql(tables, filters)}
    SELECT
      id,
      COALESCE(name, 'Unnamed facility') AS name,
      INITCAP(REPLACE(COALESCE(facility_type_raw, 'unknown'), '_', ' ')) AS facility_type,
      INITCAP(REPLACE(COALESCE(operator_type_raw, 'unknown'), '_', ' ')) AS operator_type,
      INITCAP(city) AS city,
      INITCAP(state) AS state,
      postal_code,
      CONCAT_WS(', ', address_line1, address_line2, address_line3) AS address,
      COALESCE(official_phone, SPLIT_PART(phone_numbers, ',', 1)) AS phone,
      email,
      COALESCE(official_website, SPLIT_PART(websites, ',', 1)) AS website,
      description,
      specialties,
      procedures,
      equipment,
      capability,
      number_doctors,
      capacity,
      source,
      source_types,
      source_urls,
      last_updated,
      latitude,
      longitude,
      ${warehouseDistanceExpression(filters)} AS distance_km
    FROM filtered
    ORDER BY
      CASE WHEN distance_km IS NULL THEN 1 ELSE 0 END,
      distance_km,
      CASE WHEN name IS NULL THEN 1 ELSE 0 END,
      name
    LIMIT ${filters.limit}
  `;
}

function buildWarehouseFacilitiesCountSql(tables: WarehouseFacilityTables, filters: FacilityGridFilters) {
  return `
    ${buildWarehouseFacilitiesBaseSql(tables, filters)}
    SELECT
      COUNT(*) AS matching_facilities,
      SUM(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 ELSE 0 END) AS mapped_facilities
    FROM filtered
  `;
}

function buildWarehouseFacilitiesFilterOptionsSql(tables: WarehouseFacilityTables, filters: FacilityGridFilters) {
  const search = sqlStringLiteral(filters.search.toLowerCase());
  const state = sqlStringLiteral(filters.state);
  const facilityType = sqlStringLiteral(filters.facilityType);
  const specialty = sqlStringLiteral(filters.specialty);
  const procedure = sqlStringLiteral(filters.procedure);

  return `
    ${buildWarehouseFacilitiesBaseSql(tables, filters)},
    state_scope AS (
      SELECT *
      FROM cleaned
      WHERE (${facilityType} = 'all' OR LOWER(facility_type_raw) = ${facilityType})
        AND (${specialty} = 'all' OR LOWER(specialties) LIKE CONCAT('%', ${specialty}, '%'))
        AND (${procedure} = 'all' OR LOWER(procedures) LIKE CONCAT('%', ${procedure}, '%'))
        AND (${search} = '' OR search_text LIKE CONCAT('%', ${search}, '%'))
    ),
    facility_type_scope AS (
      SELECT *
      FROM cleaned
      WHERE (${state} = 'all' OR LOWER(state) = ${state})
        AND (${specialty} = 'all' OR LOWER(specialties) LIKE CONCAT('%', ${specialty}, '%'))
        AND (${procedure} = 'all' OR LOWER(procedures) LIKE CONCAT('%', ${procedure}, '%'))
        AND (${search} = '' OR search_text LIKE CONCAT('%', ${search}, '%'))
    ),
    specialty_scope AS (
      SELECT *
      FROM cleaned
      WHERE (${state} = 'all' OR LOWER(state) = ${state})
        AND (${facilityType} = 'all' OR LOWER(facility_type_raw) = ${facilityType})
        AND (${procedure} = 'all' OR LOWER(procedures) LIKE CONCAT('%', ${procedure}, '%'))
        AND (${search} = '' OR search_text LIKE CONCAT('%', ${search}, '%'))
    ),
    procedure_scope AS (
      SELECT *
      FROM cleaned
      WHERE (${state} = 'all' OR LOWER(state) = ${state})
        AND (${facilityType} = 'all' OR LOWER(facility_type_raw) = ${facilityType})
        AND (${specialty} = 'all' OR LOWER(specialties) LIKE CONCAT('%', ${specialty}, '%'))
        AND (${search} = '' OR search_text LIKE CONCAT('%', ${search}, '%'))
    ),
    filter_options AS (
      SELECT
        'state' AS filter_type,
        LOWER(state) AS value,
        INITCAP(state) AS label,
        COUNT(*) AS facilities
      FROM state_scope
      WHERE state IS NOT NULL
      GROUP BY state

      UNION ALL

      SELECT
        'facility_type' AS filter_type,
        LOWER(facility_type_raw) AS value,
        INITCAP(REPLACE(facility_type_raw, '_', ' ')) AS label,
        COUNT(*) AS facilities
      FROM facility_type_scope
      WHERE facility_type_raw IS NOT NULL
      GROUP BY facility_type_raw

      UNION ALL

      SELECT
        'specialty' AS filter_type,
        LOWER(TRIM(s.raw)) AS value,
        INITCAP(REPLACE(TRIM(s.raw), '_', ' ')) AS label,
        COUNT(DISTINCT specialty_scope.id) AS facilities
      FROM specialty_scope
      INNER JOIN ${tables.specialties} s ON s.unique_id = specialty_scope.id
      WHERE TRIM(s.raw) <> ''
      GROUP BY TRIM(s.raw)

      UNION ALL

      SELECT
        'procedure' AS filter_type,
        LOWER(TRIM(p.raw)) AS value,
        INITCAP(REPLACE(TRIM(p.raw), '_', ' ')) AS label,
        COUNT(DISTINCT procedure_scope.id) AS facilities
      FROM procedure_scope
      INNER JOIN ${tables.procedures} p ON p.unique_id = procedure_scope.id
      WHERE TRIM(p.raw) <> ''
      GROUP BY TRIM(p.raw)
    )
    SELECT filter_type, value, label, facilities
    FROM (
      SELECT
        filter_type,
        value,
        label,
        facilities,
        ROW_NUMBER() OVER (PARTITION BY filter_type ORDER BY facilities DESC, label) AS option_rank
      FROM filter_options
    ) ranked_options
    WHERE filter_type IN ('state', 'facility_type')
      OR option_rank <= 80
    ORDER BY filter_type, facilities DESC, label
  `;
}

function buildFacilitiesBaseSql(table: LakebaseTableReference, columns: ResolvedFacilityColumns) {
  const auditReason = columns.auditReason;
  const searchColumns = [
    'name',
    'facilityType',
    'operatorType',
    'city',
    'state',
    'description',
    'specialties',
    'procedures',
    'equipment',
    'capability',
  ] satisfies FacilitySourceColumnKey[];

  return `
    WITH cleaned AS (
      SELECT
        ${textColumn(columns, 'uniqueId')} AS id,
        ${textColumn(columns, 'name')} AS name,
        ${textColumn(columns, 'facilityType')} AS facility_type_raw,
        ${textColumn(columns, 'operatorType')} AS operator_type_raw,
        ${textColumn(columns, 'city')} AS city,
        ${textColumn(columns, 'state')} AS state,
        ${textColumn(columns, 'postalCode')} AS postal_code,
        ${textColumn(columns, 'addressLine1')} AS address_line1,
        ${textColumn(columns, 'addressLine2')} AS address_line2,
        ${textColumn(columns, 'addressLine3')} AS address_line3,
        ${textColumn(columns, 'officialPhone')} AS official_phone,
        ${textColumn(columns, 'phoneNumbers')} AS phone_numbers,
        ${textColumn(columns, 'email')} AS email,
        ${textColumn(columns, 'officialWebsite')} AS official_website,
        ${textColumn(columns, 'websites')} AS websites,
        ${textColumn(columns, 'description')} AS description,
        ${textColumn(columns, 'specialties')} AS specialties,
        ${textColumn(columns, 'procedures')} AS procedures,
        ${textColumn(columns, 'equipment')} AS equipment,
        ${textColumn(columns, 'capability')} AS capability,
        ${textColumn(columns, 'numberDoctors')} AS number_doctors,
        ${textColumn(columns, 'capacity')} AS capacity,
        ${textColumn(columns, 'source')} AS source,
        ${textColumn(columns, 'sourceTypes')} AS source_types,
        ${textColumn(columns, 'sourceUrls')} AS source_urls,
        ${textColumn(columns, 'lastUpdated')} AS last_updated,
        ${rawColumn(columns, 'latitude')} AS latitude,
        ${rawColumn(columns, 'longitude')} AS longitude,
        LOWER(CONCAT_WS(
          ' ',
          ${searchColumns.map((key) => `CAST(${rawColumn(columns, key)} AS TEXT)`).join(',\n          ')}
        )) AS search_text
      FROM ${table.sql}
      ${auditReason ? `WHERE ${auditReason} IS NULL` : ''}
    ),
    filtered AS (
      SELECT *
      FROM cleaned
      WHERE ($2 = 'all' OR LOWER(state) = $2)
        AND ($3 = 'all' OR LOWER(facility_type_raw) = $3)
        AND ($4 = 'all' OR LOWER(specialties) LIKE ('%' || $4 || '%'))
        AND ($5 = 'all' OR LOWER(procedures) LIKE ('%' || $5 || '%'))
        AND ($1 = '' OR search_text LIKE ('%' || LOWER($1) || '%'))
    )
  `;
}

function buildFacilitiesGridSql(table: LakebaseTableReference, columns: ResolvedFacilityColumns) {
  return `
    ${buildFacilitiesBaseSql(table, columns)}
    SELECT
      id,
      COALESCE(name, 'Unnamed facility') AS name,
      INITCAP(REPLACE(COALESCE(facility_type_raw, 'unknown'), '_', ' ')) AS facility_type,
      INITCAP(REPLACE(COALESCE(operator_type_raw, 'unknown'), '_', ' ')) AS operator_type,
      INITCAP(city) AS city,
      INITCAP(state) AS state,
      postal_code,
      CONCAT_WS(', ', address_line1, address_line2, address_line3) AS address,
      COALESCE(official_phone, SPLIT_PART(phone_numbers, ',', 1)) AS phone,
      email,
      COALESCE(official_website, SPLIT_PART(websites, ',', 1)) AS website,
      description,
      specialties,
      procedures,
      equipment,
      capability,
      number_doctors,
      capacity,
      source,
      source_types,
      source_urls,
      last_updated,
      latitude,
      longitude,
      ${lakebaseDistanceExpression()} AS distance_km
    FROM filtered
    ORDER BY
      CASE WHEN distance_km IS NULL THEN 1 ELSE 0 END,
      distance_km,
      CASE WHEN name IS NULL THEN 1 ELSE 0 END,
      name
    LIMIT $8
  `;
}

function buildFacilitiesCountSql(table: LakebaseTableReference, columns: ResolvedFacilityColumns) {
  return `
    ${buildFacilitiesBaseSql(table, columns)}
    SELECT
      COUNT(*) AS matching_facilities,
      SUM(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 ELSE 0 END) AS mapped_facilities
    FROM filtered
  `;
}

function buildFacilitiesFilterOptionsSql(table: LakebaseTableReference, columns: ResolvedFacilityColumns) {
  const searchColumns = [
    'name',
    'facilityType',
    'operatorType',
    'city',
    'state',
    'description',
    'specialties',
    'procedures',
    'equipment',
    'capability',
  ] satisfies FacilitySourceColumnKey[];

  return `
    WITH cleaned AS (
      SELECT
        ${textColumn(columns, 'state')} AS state,
        ${textColumn(columns, 'facilityType')} AS facility_type,
        ${textColumn(columns, 'specialties')} AS specialties,
        ${textColumn(columns, 'procedures')} AS procedures,
        ${rawColumn(columns, 'latitude')} AS latitude,
        ${rawColumn(columns, 'longitude')} AS longitude,
        LOWER(CONCAT_WS(
          ' ',
          ${searchColumns.map((key) => `CAST(${rawColumn(columns, key)} AS TEXT)`).join(',\n          ')}
        )) AS search_text
      FROM ${table.sql}
      ${columns.auditReason ? `WHERE ${columns.auditReason} IS NULL` : ''}
    ),
    state_scope AS (
      SELECT *
      FROM cleaned
      WHERE ($3 = 'all' OR LOWER(facility_type) = $3)
        AND ($4 = 'all' OR LOWER(specialties) LIKE ('%' || $4 || '%'))
        AND ($5 = 'all' OR LOWER(procedures) LIKE ('%' || $5 || '%'))
        AND ($1 = '' OR search_text LIKE ('%' || LOWER($1) || '%'))
    ),
    facility_type_scope AS (
      SELECT *
      FROM cleaned
      WHERE ($2 = 'all' OR LOWER(state) = $2)
        AND ($4 = 'all' OR LOWER(specialties) LIKE ('%' || $4 || '%'))
        AND ($5 = 'all' OR LOWER(procedures) LIKE ('%' || $5 || '%'))
        AND ($1 = '' OR search_text LIKE ('%' || LOWER($1) || '%'))
    ),
    specialty_scope AS (
      SELECT *
      FROM cleaned
      WHERE ($2 = 'all' OR LOWER(state) = $2)
        AND ($3 = 'all' OR LOWER(facility_type) = $3)
        AND ($5 = 'all' OR LOWER(procedures) LIKE ('%' || $5 || '%'))
        AND ($1 = '' OR search_text LIKE ('%' || LOWER($1) || '%'))
    ),
    procedure_scope AS (
      SELECT *
      FROM cleaned
      WHERE ($2 = 'all' OR LOWER(state) = $2)
        AND ($3 = 'all' OR LOWER(facility_type) = $3)
        AND ($4 = 'all' OR LOWER(specialties) LIKE ('%' || $4 || '%'))
        AND ($1 = '' OR search_text LIKE ('%' || LOWER($1) || '%'))
    ),
    filter_options AS (
      SELECT
        'state' AS filter_type,
        LOWER(state) AS value,
        INITCAP(state) AS label,
        COUNT(*) AS facilities
      FROM state_scope
      WHERE state IS NOT NULL
      GROUP BY state

      UNION ALL

      SELECT
        'facility_type' AS filter_type,
        LOWER(facility_type) AS value,
        INITCAP(REPLACE(facility_type, '_', ' ')) AS label,
        COUNT(*) AS facilities
      FROM facility_type_scope
      WHERE facility_type IS NOT NULL
      GROUP BY facility_type

      UNION ALL

      SELECT
        'specialty' AS filter_type,
        LOWER(BTRIM(specialty)) AS value,
        INITCAP(BTRIM(specialty)) AS label,
        COUNT(*) AS facilities
      FROM specialty_scope
      CROSS JOIN LATERAL regexp_split_to_table(COALESCE(specialties, ''), ',') AS specialty_value(specialty)
      WHERE BTRIM(specialty) <> ''
      GROUP BY BTRIM(specialty)

      UNION ALL

      SELECT
        'procedure' AS filter_type,
        LOWER(BTRIM(procedure)) AS value,
        INITCAP(BTRIM(procedure)) AS label,
        COUNT(*) AS facilities
      FROM procedure_scope
      CROSS JOIN LATERAL regexp_split_to_table(COALESCE(procedures, ''), ',') AS procedure_value(procedure)
      WHERE BTRIM(procedure) <> ''
      GROUP BY BTRIM(procedure)
    )
    SELECT filter_type, value, label, facilities
    FROM (
      SELECT
        filter_type,
        value,
        label,
        facilities,
        ROW_NUMBER() OVER (PARTITION BY filter_type ORDER BY facilities DESC, label) AS option_rank
      FROM filter_options
    ) ranked_options
    WHERE filter_type IN ('state', 'facility_type')
      OR option_rank <= 80
    ORDER BY filter_type, facilities DESC, label
  `;
}

function serializeFacilityGridRow(row: FacilityGridRow) {
  return {
    ...row,
    id: row.id ?? '',
    name: row.name ?? 'Unnamed facility',
    latitude: row.latitude === null ? null : toNumber(row.latitude),
    longitude: row.longitude === null ? null : toNumber(row.longitude),
    distance_km: row.distance_km === null ? null : toNumber(row.distance_km),
  };
}

function toNumber(value: string | number): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanUsageString(value: unknown, fallback = '', maxLength = 500) {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLength) || fallback;
}

function cleanUsageProperties(value: unknown) {
  if (!isRecord(value)) return {};
  return value;
}

const usageIndexStatements = [
  `
    CREATE INDEX IF NOT EXISTS idx_usage_events_created_at
      ON app_usage.events(created_at DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_usage_events_session_created_at
      ON app_usage.events(session_id, created_at DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_usage_events_type_created_at
      ON app_usage.events(event_type, created_at DESC)
  `,
];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isOptionalUsageIndexError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('must be owner of table') || message.includes('permission denied');
}

async function setupUsageAnalytics(lakebaseQuery: LakebaseQuery) {
  await lakebaseQuery(`
    CREATE SCHEMA IF NOT EXISTS app_usage;

    CREATE TABLE IF NOT EXISTS app_usage.sessions (
      session_id UUID PRIMARY KEY,
      user_email TEXT,
      user_agent TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app_usage.events (
      id BIGSERIAL PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES app_usage.sessions(session_id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      page TEXT,
      target_type TEXT,
      target_id TEXT,
      properties JSONB NOT NULL DEFAULT '{}'::jsonb,
      user_email TEXT,
      url_path TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  for (const statement of usageIndexStatements) {
    try {
      await lakebaseQuery(statement);
    } catch (error) {
      if (!isOptionalUsageIndexError(error)) throw error;
      console.warn(`Skipping optional usage analytics index setup: ${getErrorMessage(error)}`);
    }
  }
}

let usageAnalyticsSetupPromise: Promise<void> | null = null;

function ensureUsageAnalytics(lakebaseQuery: LakebaseQuery) {
  usageAnalyticsSetupPromise ??= setupUsageAnalytics(lakebaseQuery).catch((error: unknown) => {
    usageAnalyticsSetupPromise = null;
    throw error;
  });

  return usageAnalyticsSetupPromise;
}

function serializeUsageEvent(row: UsageEventRow) {
  let properties: Record<string, unknown> = {};
  if (isRecord(row.properties)) {
    properties = row.properties;
  } else if (typeof row.properties === 'string') {
    try {
      const parsedProperties = JSON.parse(row.properties) as unknown;
      properties = isRecord(parsedProperties) ? parsedProperties : {};
    } catch {
      properties = {};
    }
  }

  return {
    id: String(row.id),
    sessionId: row.session_id,
    eventType: row.event_type,
    page: row.page,
    targetType: row.target_type,
    targetId: row.target_id,
    properties,
    userEmail: row.user_email,
    urlPath: row.url_path,
    createdAt: row.created_at,
  };
}

function stripSqlComments(sql: string) {
  return sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
}

function findKeyword(sql: string, keyword: string, startIndex = 0) {
  const target = keyword.toLowerCase();
  let quote: "'" | '"' | '`' | null = null;
  let depth = 0;

  for (let index = startIndex; index < sql.length; index += 1) {
    const char = sql[index];
    const previous = sql[index - 1];

    if (quote) {
      if (char === quote && previous !== '\\') quote = null;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);

    if (depth === 0 && sql.slice(index, index + target.length).toLowerCase() === target) {
      const before = sql[index - 1];
      const after = sql[index + target.length];
      const startsCleanly = !before || /[^a-z0-9_]/i.test(before);
      const endsCleanly = !after || /[^a-z0-9_]/i.test(after);
      if (startsCleanly && endsCleanly) return index;
    }
  }

  return -1;
}

function validateGeneratedSelectSql(generatedSql: string) {
  const sql = stripSqlComments(generatedSql).replace(/;+\s*$/g, '');
  const unsafePattern = /\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|copy|optimize|vacuum)\b/i;

  if (!/^select\b/i.test(sql) && !/^with\b/i.test(sql)) {
    throw new Error('Generated SQL must be a SELECT query.');
  }

  if (unsafePattern.test(sql)) {
    throw new Error('Generated SQL contains unsupported operations.');
  }

  if (findKeyword(sql, ';') !== -1 || /;/.test(sql)) {
    throw new Error('Generated SQL must contain a single SELECT statement.');
  }

  return sql;
}

function rowToObject<T extends object>(columns: string[], values: unknown[]) {
  return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? null])) as T;
}

async function executeWarehouseRows<T extends Record<string, unknown>>(statement: string, rowLimit = 1000) {
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;

  if (!warehouseId) {
    throw new Error('DATABRICKS_WAREHOUSE_ID is required for SQL warehouse fallback.');
  }

  const workspace = new WorkspaceClient({});
  const result = await workspace.statementExecution.executeStatement({
    warehouse_id: warehouseId,
    statement,
    wait_timeout: '30s',
    row_limit: rowLimit,
    format: 'JSON_ARRAY',
  });
  const columns = result.manifest?.schema?.columns?.map((column) => column.name ?? '') ?? [];
  const rows = result.result?.data_array ?? [];

  return rows.map((values) => rowToObject<T>(columns, values));
}

function normalizeFieldName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanResultValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(cleanResultValue).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value).trim();
  return '';
}

function getRawField(row: Record<string, unknown>, candidates: string[]) {
  const fields = Object.entries(row);
  const normalizedCandidates = candidates.map(normalizeFieldName);
  const match = fields.find(([key]) => normalizedCandidates.includes(normalizeFieldName(key)));
  return match?.[1] ?? null;
}

function getResultText(row: Record<string, unknown>, candidates: string[]) {
  return cleanResultValue(getRawField(row, candidates)) || null;
}

function getResultNumber(row: Record<string, unknown>, candidates: string[]) {
  const value = getRawField(row, candidates);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForStatementResult(workspace: WorkspaceClient, initialStatementId: string) {
  let statement = await workspace.statementExecution.getStatement({ statement_id: initialStatementId });
  const startedAt = Date.now();
  const maxPollDurationMs = 110_000;

  while (statement.status?.state === 'PENDING' || statement.status?.state === 'RUNNING') {
    if (Date.now() - startedAt >= maxPollDurationMs) return statement;
    await delay(2_500);
    statement = await workspace.statementExecution.getStatement({ statement_id: initialStatementId });
  }

  return statement;
}

async function executeGeneratedSqlStatement(workspace: WorkspaceClient, warehouseId: string, statement: string) {
  const initialResult = await workspace.statementExecution.executeStatement({
    warehouse_id: warehouseId,
    statement,
    wait_timeout: '50s',
    on_wait_timeout: 'CONTINUE',
    row_limit: 50,
    disposition: 'INLINE',
    format: 'JSON_ARRAY',
  });

  if (initialResult.status?.state === 'SUCCEEDED') return initialResult;

  if (
    (initialResult.status?.state === 'PENDING' || initialResult.status?.state === 'RUNNING') &&
    initialResult.statement_id
  ) {
    return waitForStatementResult(workspace, initialResult.statement_id);
  }

  return initialResult;
}

function createRawFields(row: Record<string, unknown>) {
  return Object.entries(row)
    .map(([key, value]) => ({
      label: key.replace(/_/g, ' '),
      value: cleanResultValue(value),
    }))
    .filter((field) => field.value)
    .slice(0, 18);
}

function serializeGeneratedSqlRow(row: Record<string, unknown>, index: number): PresentedGenieResult {
  const name =
    getResultText(row, ['name', 'facility_name', 'clinic_name', 'hospital_name', 'district_name', 'districtName']) ??
    `Result ${index + 1}`;
  const city = getResultText(row, ['address_city', 'city', 'district', 'district_name', 'districtName']);
  const state = getResultText(row, ['address_stateOrRegion', 'address_state_or_region', 'state', 'state_ut']);
  const address = [
    getResultText(row, ['address', 'full_address', 'full address', 'address_line1', 'street_address']),
    getResultText(row, ['address_line2']),
    getResultText(row, ['address_line3']),
  ]
    .filter(Boolean)
    .join(', ');

  return {
    id: getResultText(row, ['unique_id', 'id', 'facility_id']) ?? String(index),
    name,
    type: getResultText(row, ['facility_type', 'facilityTypeId', 'type', 'organization_type', 'organization type']),
    operatorType: getResultText(row, [
      'organization_type',
      'organizationType',
      'organization type',
      'org_type',
      'org type',
      'operator_type',
      'operatorTypeId',
      'operator',
    ]),
    confidenceScore: getResultNumber(row, ['confidence_score', 'score', 'relevance_score', 'model_score']),
    distanceKm: getResultNumber(row, ['distance_km', 'distanceKm', 'distance', 'model_distance_km']),
    description: getResultText(row, ['description', 'summary', 'blurb', 'capability', 'capabilities']),
    address,
    city,
    state,
    postalCode: getResultText(row, ['address_zipOrPostcode', 'address_zip_or_postcode', 'postal_code', 'postcode']),
    phone: getResultText(row, ['officialPhone', 'official_phone', 'official phone', 'official_phone_number', 'phone', 'phone_numbers']),
    email: getResultText(row, ['email', 'official_email', 'official email']),
    website: getResultText(row, ['officialWebsite', 'official_website', 'official website', 'website', 'websites']),
    specialties: getResultText(row, ['specialties', 'specialty', 'clinical_specialties']),
    procedures: getResultText(row, ['procedure', 'procedures', 'clinical_procedures']),
    equipment: getResultText(row, ['equipment']),
    capability: getResultText(row, ['capability', 'capabilities']),
    numberDoctors: getResultText(row, ['numberDoctors', 'number_doctors', 'number of doctors', 'doctors', 'doctor_count']),
    capacity: getResultText(row, ['capacity']),
    latitude: getResultNumber(row, ['latitude', 'lat']),
    longitude: getResultNumber(row, ['longitude', 'lon', 'lng']),
    sourceUrls: getResultText(row, ['source_urls', 'source_url', 'url']),
    rawFields: createRawFields(row),
  };
}

function getGeneratedSqlFromBody(body: unknown) {
  if (!body || typeof body !== 'object' || !('generatedSql' in body)) return '';

  const generatedSql = body.generatedSql;
  return typeof generatedSql === 'string' ? generatedSql : '';
}

createApp({
  plugins: [
    server(),
    analytics(),
    lakebase(),
    genie({
      spaces: {
        default: process.env.DATABRICKS_GENIE_SPACE_ID ?? '',
      },
    }),
  ],
  onPluginsReady(appkit) {
    const lakebaseQuery: LakebaseQuery = (text, values) => appkit.lakebase.query(text, values);
    void ensureUsageAnalytics(lakebaseQuery).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : 'Unable to set up usage analytics.');
    });

    appkit.server.extend((app) => {
      app.get('/api/whoami', (req, res) => {
        res.json({
          email: req.header('x-forwarded-email') ?? null,
          user: req.header('x-forwarded-user') ?? null,
        });
      });

      app.post('/api/usage/events', async (req, res) => {
        try {
          await ensureUsageAnalytics(lakebaseQuery);

          const body = isRecord(req.body) ? req.body : {};
          const sessionId = cleanUsageString(body.sessionId, '', 64);
          const eventType = cleanUsageString(body.eventType, '', 120);

          if (!sessionId || !eventType) {
            res.status(400).json({ message: 'sessionId and eventType are required.' });
            return;
          }

          const userEmail = req.header('x-forwarded-email') ?? null;
          const userAgent = cleanUsageString(req.header('user-agent'), '', 1000) || null;
          const page = cleanUsageString(body.page, '', 120) || null;
          const targetType = cleanUsageString(body.targetType, '', 120) || null;
          const targetId = cleanUsageString(body.targetId, '', 500) || null;
          const urlPath = cleanUsageString(body.urlPath, '', 1000) || null;
          const properties = JSON.stringify(cleanUsageProperties(body.properties));

          await lakebaseQuery(
            `
              INSERT INTO app_usage.sessions (session_id, user_email, user_agent, started_at, last_seen_at)
              VALUES ($1::uuid, $2, $3, NOW(), NOW())
              ON CONFLICT (session_id)
              DO UPDATE SET
                user_email = COALESCE(EXCLUDED.user_email, app_usage.sessions.user_email),
                user_agent = COALESCE(EXCLUDED.user_agent, app_usage.sessions.user_agent),
                last_seen_at = NOW()
            `,
            [sessionId, userEmail, userAgent]
          );

          await lakebaseQuery(
            `
              INSERT INTO app_usage.events (
                session_id,
                event_type,
                page,
                target_type,
                target_id,
                properties,
                user_email,
                url_path
              )
              VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, $7, $8)
            `,
            [sessionId, eventType, page, targetType, targetId, properties, userEmail, urlPath]
          );

          res.status(204).send();
        } catch (error) {
          res.status(400).json({
            message: error instanceof Error ? error.message : 'Unable to log usage event.',
          });
        }
      });

      app.get('/api/usage/analytics', async (_req, res) => {
        try {
          await ensureUsageAnalytics(lakebaseQuery);

          const [summaryResult, actionsResult, pagesResult, dailyResult, recentResult, sessionsResult] = await Promise.all([
            lakebaseQuery<{
              total_events: number | string;
              total_sessions: number | string;
              first_event_at: string | null;
              last_event_at: string | null;
            }>(`
              SELECT
                COUNT(*) AS total_events,
                COUNT(DISTINCT session_id) AS total_sessions,
                MIN(created_at) AS first_event_at,
                MAX(created_at) AS last_event_at
              FROM app_usage.events
            `),
            lakebaseQuery<{
              event_type: string;
              events: number | string;
              sessions: number | string;
              last_seen_at: string;
            }>(`
              SELECT
                event_type,
                COUNT(*) AS events,
                COUNT(DISTINCT session_id) AS sessions,
                MAX(created_at) AS last_seen_at
              FROM app_usage.events
              GROUP BY event_type
              ORDER BY events DESC, event_type
              LIMIT 50
            `),
            lakebaseQuery<{
              page: string | null;
              events: number | string;
              sessions: number | string;
            }>(`
              SELECT
                COALESCE(page, 'unknown') AS page,
                COUNT(*) AS events,
                COUNT(DISTINCT session_id) AS sessions
              FROM app_usage.events
              GROUP BY COALESCE(page, 'unknown')
              ORDER BY events DESC, page
            `),
            lakebaseQuery<{
              day: string;
              events: number | string;
              sessions: number | string;
            }>(`
              SELECT
                DATE_TRUNC('day', created_at)::date AS day,
                COUNT(*) AS events,
                COUNT(DISTINCT session_id) AS sessions
              FROM app_usage.events
              GROUP BY DATE_TRUNC('day', created_at)::date
              ORDER BY day DESC
              LIMIT 30
            `),
            lakebaseQuery<UsageEventRow>(`
              SELECT
                id,
                session_id::text AS session_id,
                event_type,
                page,
                target_type,
                target_id,
                properties,
                user_email,
                url_path,
                created_at
              FROM app_usage.events
              ORDER BY created_at DESC
              LIMIT 100
            `),
            lakebaseQuery<{
              session_id: string;
              user_email: string | null;
              started_at: string;
              last_seen_at: string;
              events: number | string;
            }>(`
              SELECT
                s.session_id::text AS session_id,
                s.user_email,
                s.started_at,
                s.last_seen_at,
                COUNT(e.id) AS events
              FROM app_usage.sessions s
              LEFT JOIN app_usage.events e ON e.session_id = s.session_id
              GROUP BY s.session_id, s.user_email, s.started_at, s.last_seen_at
              ORDER BY s.last_seen_at DESC
              LIMIT 50
            `),
          ]);

          const summary = summaryResult.rows[0];
          res.json({
            summary: {
              totalEvents: toNumber(summary?.total_events ?? 0) ?? 0,
              totalSessions: toNumber(summary?.total_sessions ?? 0) ?? 0,
              firstEventAt: summary?.first_event_at ?? null,
              lastEventAt: summary?.last_event_at ?? null,
            },
            actions: actionsResult.rows.map((row) => ({
              eventType: row.event_type,
              events: toNumber(row.events) ?? 0,
              sessions: toNumber(row.sessions) ?? 0,
              lastSeenAt: row.last_seen_at,
            })),
            pages: pagesResult.rows.map((row) => ({
              page: row.page ?? 'unknown',
              events: toNumber(row.events) ?? 0,
              sessions: toNumber(row.sessions) ?? 0,
            })),
            daily: dailyResult.rows.map((row) => ({
              day: row.day,
              events: toNumber(row.events) ?? 0,
              sessions: toNumber(row.sessions) ?? 0,
            })),
            recentEvents: recentResult.rows.map(serializeUsageEvent),
            sessions: sessionsResult.rows.map((row) => ({
              sessionId: row.session_id,
              userEmail: row.user_email,
              startedAt: row.started_at,
              lastSeenAt: row.last_seen_at,
              events: toNumber(row.events) ?? 0,
            })),
          });
        } catch (error) {
          res.status(500).json({
            message: error instanceof Error ? error.message : 'Unable to load usage analytics.',
          });
        }
      });

      app.post('/api/clinic-recommendations', async (req, res) => {
        try {
          const generatedSql = getGeneratedSqlFromBody(req.body as unknown);

          if (!generatedSql.trim()) {
            res.status(400).json({
              status: 'error',
              message: 'Generated SQL is required.',
            });
            return;
          }

          const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;
          if (!warehouseId) {
            res.status(500).json({
              status: 'error',
              message: 'Warehouse is not configured.',
            });
            return;
          }

          const statement = validateGeneratedSelectSql(generatedSql);
          const workspace = new WorkspaceClient({});
          const result = await executeGeneratedSqlStatement(workspace, warehouseId, statement);

          if (result.status?.state === 'PENDING' || result.status?.state === 'RUNNING') {
            res.status(202).json({
              status: 'preparing',
              message: 'The recommendation model query is still running. Try again in a moment.',
            });
            return;
          }

          if (result.status?.state !== 'SUCCEEDED') {
            res.status(400).json({
              status: 'error',
              message: result.status?.error?.message ?? 'Unable to build clinic recommendations from the generated SQL.',
            });
            return;
          }

          const columns = result.manifest?.schema?.columns?.map((column) => column.name ?? '') ?? [];
          const rows = result.result?.data_array ?? [];
          const results = rows
            .map((values) => rowToObject<Record<string, unknown>>(columns, values))
            .map(serializeGeneratedSqlRow);

          res.json({
            status: 'ready',
            results,
            clinics: results,
          });
        } catch (error) {
          res.status(400).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unable to build clinic recommendations.',
          });
        }
      });

      app.get('/api/facilities-grid', async (req, res) => {
        const filters: FacilityGridFilters = {
          search: normalizeParam(req.query.search, ''),
          state: normalizedLowerParam(req.query.state, 'all'),
          facilityType: normalizedLowerParam(req.query.facility_type, 'all'),
          specialty: normalizedLowerParam(req.query.specialty, 'all'),
          procedure: normalizedLowerParam(req.query.procedure, 'all'),
          limit: toSafeLimitParam(req.query.limit),
          patientLatitude: toSafeCoordinateParam(req.query.patient_latitude, -90, 90),
          patientLongitude: toSafeCoordinateParam(req.query.patient_longitude, -180, 180),
        };

        try {
          const warehouseTables = getWarehouseFacilitiesTablesSql();
          const [facilitiesRows, countRows, filterOptionsRows] = await Promise.all([
            executeWarehouseRows<FacilityGridRow>(buildWarehouseFacilitiesGridSql(warehouseTables, filters), filters.limit),
            executeWarehouseRows<FacilityCountRow>(buildWarehouseFacilitiesCountSql(warehouseTables, filters), 1),
            executeWarehouseRows<FacilityFilterOptionRow>(buildWarehouseFacilitiesFilterOptionsSql(warehouseTables, filters), 500),
          ]);
          const count = countRows[0];

          res.json({
            facilities: facilitiesRows.map(serializeFacilityGridRow),
            matchingFacilities: toNumber(count?.matching_facilities ?? 0) ?? 0,
            mappedFacilities: toNumber(count?.mapped_facilities ?? 0) ?? 0,
            filterOptions: filterOptionsRows,
            dataSource: 'warehouse',
            sourceTable: warehouseTables.raw,
          });
        } catch (warehouseError) {
          try {
          const lakebaseQuery: LakebaseQuery = (text, values) => appkit.lakebase.query(text, values);
          const source = await resolveFacilitySource(lakebaseQuery);
          const parameters = [filters.search, filters.state, filters.facilityType, filters.specialty, filters.procedure];

          const [facilitiesResult, countResult, filterOptionsResult] = await Promise.all([
            lakebaseQuery<FacilityGridRow>(buildFacilitiesGridSql(source.table, source.columns), [
              ...parameters,
              filters.patientLatitude,
              filters.patientLongitude,
              filters.limit,
            ]),
            lakebaseQuery<FacilityCountRow>(buildFacilitiesCountSql(source.table, source.columns), parameters),
            lakebaseQuery<FacilityFilterOptionRow>(
              buildFacilitiesFilterOptionsSql(source.table, source.columns),
              parameters
            ),
          ]);

          const count = countResult.rows[0];

          res.json({
            facilities: facilitiesResult.rows.map(serializeFacilityGridRow),
            matchingFacilities: toNumber(count?.matching_facilities ?? 0) ?? 0,
            mappedFacilities: toNumber(count?.mapped_facilities ?? 0) ?? 0,
            filterOptions: filterOptionsResult.rows,
            dataSource: 'lakebase',
            sourceTable: source.table.raw,
            fallbackReason: warehouseError instanceof Error ? warehouseError.message : 'SQL warehouse facility data is unavailable.',
          });
          } catch (lakebaseError) {
            const warehouseMessage = warehouseError instanceof Error ? warehouseError.message : 'SQL warehouse fallback is unavailable.';
            const lakebaseMessage = lakebaseError instanceof Error ? lakebaseError.message : 'Lakebase facility data is unavailable.';

            res.status(500).json({
              message: `Unable to load facility data. Warehouse error: ${warehouseMessage} Lakebase fallback error: ${lakebaseMessage}`,
            });
          }
        }
      });

    });
  },
}).catch(console.error);
