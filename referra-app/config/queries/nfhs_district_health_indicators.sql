-- Executes through the AppKit analytics plugin against the configured Databricks SQL Warehouse.
-- Do not point this page at the Lakebase synced table; the NFHS page should read Unity Catalog directly.
SELECT
  district_name AS districtName,
  state_ut AS state,
  CAST(
    TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(households_surveyed AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE)
    AS BIGINT
  ) AS householdsSurveyed,
  CAST(
    TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(women_15_49_interviewed AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE)
    AS BIGINT
  ) AS womenInterviewed,
  CAST(
    TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(men_15_54_interviewed AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE)
    AS BIGINT
  ) AS menInterviewed,
  TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(hh_improved_water_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS improvedWaterPct,
  TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(hh_use_improved_sanitation_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS improvedSanitationPct,
  TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(households_using_clean_fuel_for_cooking_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS cleanFuelPct,
  TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(hh_member_covered_health_insurance_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS healthInsurancePct,
  TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(women_age_15_49_who_are_literate_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS womenLiteracyPct,
  TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(institutional_birth_5y_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS institutionalBirthPct,
  TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(births_attended_by_skilled_hp_5y_10_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS skilledBirthAttendancePct,
  TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(births_delivered_by_csection_5y_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS cSectionPct,
  TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(child_u5_who_are_stunted_height_for_age_18_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS childStuntedPct,
  TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(child_u5_who_are_wasted_weight_for_height_18_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS childWastedPct,
  TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(child_u5_who_are_underweight_weight_for_age_18_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS childUnderweightPct,
  TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(all_w15_49_who_are_anaemic_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS womenAnaemiaPct,
  TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS womenHighBpPct,
  TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(m15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS menHighBpPct
FROM virtue_foundation_dataset.bronze.nfhs_5_district_health_indicators
WHERE district_name IS NOT NULL
  AND state_ut IS NOT NULL
ORDER BY state, districtName
