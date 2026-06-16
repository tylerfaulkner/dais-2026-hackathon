-- State-level NFHS metrics. Keep result size small for AppKit streaming.
WITH parsed AS (
  SELECT
    state_ut AS state,
    TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(households_surveyed AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS households_surveyed,
    TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(hh_use_improved_sanitation_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS improvedSanitationPct,
    TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(households_using_clean_fuel_for_cooking_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS cleanFuelPct,
    TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(hh_member_covered_health_insurance_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS healthInsurancePct,
    TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(women_age_15_49_who_are_literate_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS womenLiteracyPct,
    TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(institutional_birth_5y_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS institutionalBirthPct,
    TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(births_attended_by_skilled_hp_5y_10_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS skilledBirthAttendancePct,
    TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(child_u5_who_are_stunted_height_for_age_18_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS childStuntedPct,
    TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(child_u5_who_are_underweight_weight_for_age_18_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS childUnderweightPct,
    TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(all_w15_49_who_are_anaemic_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS womenAnaemiaPct,
    TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS womenHighBpPct,
    TRY_CAST(NULLIF(REGEXP_EXTRACT(REGEXP_REPLACE(CAST(m15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct AS STRING), ',', ''), '[-+]?[0-9]+([.][0-9]+)?', 0), '') AS DOUBLE) AS menHighBpPct
  FROM virtue_foundation_dataset.bronze.nfhs_5_district_health_indicators
  WHERE state_ut IS NOT NULL
    AND district_name IS NOT NULL
)
SELECT
  state,
  COUNT(*) AS districts,
  CAST(SUM(households_surveyed) AS BIGINT) AS householdsSurveyed,
  AVG(improvedSanitationPct) AS improvedSanitationPct,
  AVG(cleanFuelPct) AS cleanFuelPct,
  AVG(healthInsurancePct) AS healthInsurancePct,
  AVG(womenLiteracyPct) AS womenLiteracyPct,
  AVG(institutionalBirthPct) AS institutionalBirthPct,
  AVG(skilledBirthAttendancePct) AS skilledBirthAttendancePct,
  AVG(childStuntedPct) AS childStuntedPct,
  AVG(childUnderweightPct) AS childUnderweightPct,
  AVG(womenAnaemiaPct) AS womenAnaemiaPct,
  AVG(womenHighBpPct) AS womenHighBpPct,
  AVG(menHighBpPct) AS menHighBpPct
FROM parsed
GROUP BY state
ORDER BY state
