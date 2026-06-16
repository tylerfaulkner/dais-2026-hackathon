# Databricks notebook source
# /// script
# [tool.databricks.environment]
# environment_version = "5"
# ///
# DBTITLE 1,✅ USAGE GUIDE - Clean Workflow
# MAGIC %md
# MAGIC # ✅ USAGE GUIDE - Clean Workflow
# MAGIC
# MAGIC ## Quick Start: Setting Up NFHS-5 Mappings
# MAGIC
# MAGIC This notebook maintains the complete column mapping registry for NFHS-5 with **113 mappings** (109 bronze + 4 metadata).
# MAGIC
# MAGIC ### To initialize or refresh NFHS-5 mappings, run these cells in order:
# MAGIC
# MAGIC 1. **Create Metadata Table Structure** (Cell 2) - One-time setup
# MAGIC 2. **Delete Existing NFHS-5 Mappings** (if re-initializing)
# MAGIC 3. **Define Complete NFHS-5 Column Mappings (113 Total)** - The source of truth
# MAGIC 4. **Insert All Mappings into Table** - Loads mappings into Delta table
# MAGIC
# MAGIC ### To validate or query mappings, use:
# MAGIC
# MAGIC * **View All Active NFHS-5 Mappings** - Browse the registry
# MAGIC * **Validation - Check for Duplicates** - Quality check
# MAGIC * **View Mappings by Category** - Explore by domain
# MAGIC * **Generate Data Dictionary** - Export for documentation
# MAGIC
# MAGIC ### To maintain or update:
# MAGIC
# MAGIC * See **Managing Metadata - Update and Maintenance** for patterns
# MAGIC
# MAGIC ---
# MAGIC
# MAGIC ## Current Status
# MAGIC
# MAGIC ✅ **113 Total Mappings**
# MAGIC * 109 bronze column mappings (verified against actual table)
# MAGIC * 4 metadata columns (added during transformation)
# MAGIC
# MAGIC ✅ **16 Categories**: maternal_health (17), family_planning (12), vaccination (12), child_health (12), and 12 more
# MAGIC
# MAGIC ✅ **100% Coverage**: Every bronze column mapped to readable silver name
# MAGIC
# MAGIC ---

# COMMAND ----------

# DBTITLE 1,Column Mapping Registry - Metadata Management
# MAGIC %md
# MAGIC # Column Mapping Registry - Metadata Management
# MAGIC
# MAGIC ## ✅ Status: Complete
# MAGIC * **113 Total Mappings** (109 bronze + 4 metadata)
# MAGIC * **100% Coverage** of NFHS-5 bronze table columns  
# MAGIC * **16 Health Categories** organized by domain
# MAGIC * **Verified** against actual bronze table schema
# MAGIC
# MAGIC ## Purpose
# MAGIC Centralized registry for column name mappings across all datasets in the lakehouse. This metadata table provides:
# MAGIC
# MAGIC * **Version Control** - Delta table tracks all changes with full audit trail
# MAGIC * **Reusability** - Multiple pipelines reference the same standardized names
# MAGIC * **Governance** - Domain experts can review and approve mappings
# MAGIC * **Documentation** - Built-in descriptions and categorization
# MAGIC * **Validation** - Query-based checks for completeness and consistency
# MAGIC
# MAGIC ## Metadata Table Schema
# MAGIC
# MAGIC ```
# MAGIC virtue_foundation_dataset.metadata.column_mappings
# MAGIC ├─ bronze_column_name    (source column name from raw data)
# MAGIC ├─ silver_column_name    (standardized, readable name)
# MAGIC ├─ category              (groups related indicators)
# MAGIC ├─ description           (plain English explanation)
# MAGIC ├─ dataset               (e.g., 'nfhs_5', 'nfhs_6')
# MAGIC ├─ is_active             (boolean - enables/disables mappings)
# MAGIC ├─ created_at            (timestamp)
# MAGIC └─ created_by            (user email)
# MAGIC ```
# MAGIC
# MAGIC ## Usage Pattern
# MAGIC
# MAGIC **Notebooks consume this metadata** - they don't create it:
# MAGIC ```python
# MAGIC # In your silver notebook:
# MAGIC mappings = spark.table('virtue_foundation_dataset.metadata.column_mappings')
# MAGIC column_dict = {row['bronze_column_name']: row['silver_column_name'] 
# MAGIC                for row in mappings.filter(...).collect()}
# MAGIC ```
# MAGIC
# MAGIC **This notebook manages the metadata** - add, update, validate mappings here.

# COMMAND ----------

# DBTITLE 1,Create Metadata Table Structure
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, BooleanType, TimestampType

# Define the metadata table schema
schema = StructType([
    StructField('bronze_column_name', StringType(), False),
    StructField('silver_column_name', StringType(), False),
    StructField('category', StringType(), True),
    StructField('description', StringType(), True),
    StructField('dataset', StringType(), False),
    StructField('is_active', BooleanType(), False),
    StructField('created_at', TimestampType(), False),
    StructField('created_by', StringType(), True)
])

# Create empty DataFrame with schema
empty_df = spark.createDataFrame([], schema)

# Create the metadata table if it doesn't exist
metadata_table = 'virtue_foundation_dataset.metadata.column_mappings'

try:
    # Check if table exists
    existing = spark.table(metadata_table)
    print(f"✓ Metadata table already exists: {metadata_table}")
    print(f"  Current row count: {existing.count()}")
except Exception:
    # Table doesn't exist, create it
    empty_df.write \
        .format('delta') \
        .mode('overwrite') \
        .saveAsTable(metadata_table)
    print(f"✓ Created metadata table: {metadata_table}")
    print(f"  Schema: {len(schema.fields)} columns")

# COMMAND ----------

# DBTITLE 1,View All Active NFHS-5 Mappings
# MAGIC %sql
# MAGIC -- View all active mappings for NFHS-5
# MAGIC SELECT 
# MAGIC   bronze_column_name,
# MAGIC   silver_column_name,
# MAGIC   category,
# MAGIC   description
# MAGIC FROM virtue_foundation_dataset.metadata.column_mappings
# MAGIC WHERE dataset = 'nfhs_5' AND is_active = true
# MAGIC ORDER BY category, bronze_column_name
# MAGIC LIMIT 50;

# COMMAND ----------

# DBTITLE 1,Validation - Check for Duplicates
# MAGIC %sql
# MAGIC -- Check for duplicate silver column names (should be unique)
# MAGIC SELECT 
# MAGIC   silver_column_name,
# MAGIC   COUNT(*) as count
# MAGIC FROM virtue_foundation_dataset.metadata.column_mappings
# MAGIC WHERE dataset = 'nfhs_5' AND is_active = true
# MAGIC GROUP BY silver_column_name
# MAGIC HAVING COUNT(*) > 1;

# COMMAND ----------

# DBTITLE 1,View Mappings by Category
# MAGIC %sql
# MAGIC -- View all mappings for a specific category (e.g., maternal health)
# MAGIC SELECT 
# MAGIC   bronze_column_name,
# MAGIC   silver_column_name,
# MAGIC   description
# MAGIC FROM virtue_foundation_dataset.metadata.column_mappings
# MAGIC WHERE dataset = 'nfhs_5' 
# MAGIC   AND is_active = true
# MAGIC   AND category = 'maternal_health'
# MAGIC ORDER BY bronze_column_name;

# COMMAND ----------

# DBTITLE 1,Managing Metadata - Update and Maintenance
# MAGIC %md
# MAGIC # Managing Metadata - Update and Maintenance Patterns
# MAGIC
# MAGIC ## Update a Single Mapping
# MAGIC
# MAGIC ```python
# MAGIC spark.sql("""
# MAGIC   UPDATE virtue_foundation_dataset.metadata.column_mappings
# MAGIC   SET silver_column_name = 'improved_standardized_name',
# MAGIC       description = 'Updated definition with more context'
# MAGIC   WHERE bronze_column_name = 'old_column_name'
# MAGIC     AND dataset = 'nfhs_5'
# MAGIC """)
# MAGIC ```
# MAGIC
# MAGIC ## Deactivate Mappings (for deprecated datasets)
# MAGIC
# MAGIC ```python
# MAGIC spark.sql("""
# MAGIC   UPDATE virtue_foundation_dataset.metadata.column_mappings
# MAGIC   SET is_active = false
# MAGIC   WHERE dataset = 'nfhs_4'
# MAGIC """)
# MAGIC ```
# MAGIC
# MAGIC ## Delete and Re-insert (for major revisions)
# MAGIC
# MAGIC ```python
# MAGIC # Delete existing NFHS-5 mappings
# MAGIC spark.sql("""
# MAGIC   DELETE FROM virtue_foundation_dataset.metadata.column_mappings
# MAGIC   WHERE dataset = 'nfhs_5'
# MAGIC """)
# MAGIC
# MAGIC # Then re-run the "Insert NFHS-5 Column Mappings" cell above
# MAGIC ```
# MAGIC
# MAGIC ## Add Mappings for New Dataset (e.g., NFHS-6)
# MAGIC
# MAGIC ```python
# MAGIC nfhs6_mappings = [
# MAGIC     ('new_column', 'standardized_name', 'category', 'description'),
# MAGIC     # ... more mappings
# MAGIC ]
# MAGIC
# MAGIC mapping_df = spark.createDataFrame(
# MAGIC     nfhs6_mappings,
# MAGIC     schema=['bronze_column_name', 'silver_column_name', 'category', 'description']
# MAGIC ).withColumn('created_at', F.current_timestamp()) \
# MAGIC  .withColumn('created_by', F.lit('your.email@example.com')) \
# MAGIC  .withColumn('dataset', F.lit('nfhs_6')) \
# MAGIC  .withColumn('is_active', F.lit(True))
# MAGIC
# MAGIC mapping_df.write.mode('append').saveAsTable(metadata_table)
# MAGIC ```
# MAGIC
# MAGIC ## Time Travel (View Historical Mappings)
# MAGIC
# MAGIC ```sql
# MAGIC -- See mappings as they were at a specific time
# MAGIC SELECT * FROM virtue_foundation_dataset.metadata.column_mappings
# MAGIC TIMESTAMP AS OF '2026-06-01'
# MAGIC WHERE dataset = 'nfhs_5';
# MAGIC
# MAGIC -- See mappings from 5 versions ago
# MAGIC SELECT * FROM virtue_foundation_dataset.metadata.column_mappings
# MAGIC VERSION AS OF 5
# MAGIC WHERE dataset = 'nfhs_5';
# MAGIC ```

# COMMAND ----------

# DBTITLE 1,Generate Data Dictionary
# MAGIC %sql
# MAGIC -- Auto-generate data dictionary for documentation
# MAGIC SELECT 
# MAGIC   silver_column_name AS `Column Name`,
# MAGIC   description AS `Description`,
# MAGIC   category AS `Category`
# MAGIC FROM virtue_foundation_dataset.metadata.column_mappings
# MAGIC WHERE dataset = 'nfhs_5' AND is_active = true
# MAGIC ORDER BY category, silver_column_name;

# COMMAND ----------

# DBTITLE 1,Delete Existing NFHS-5 Mappings
# MAGIC %sql
# MAGIC -- ⚠️ WARNING: Only run this if you need to re-initialize ALL NFHS-5 mappings
# MAGIC -- This deletes all existing NFHS-5 mappings to start fresh
# MAGIC -- Use UPDATE statements (see Maintenance cell) for single-column fixes
# MAGIC DELETE FROM virtue_foundation_dataset.metadata.column_mappings
# MAGIC WHERE dataset = 'nfhs_5';
# MAGIC
# MAGIC SELECT 'Deleted all NFHS-5 mappings' AS status;

# COMMAND ----------

# DBTITLE 1,Define Complete NFHS-5 Column Mappings (113 Total)
# Complete NFHS-5 column mappings: 109 bronze columns + 4 metadata columns = 113 total
# All bronze column names verified against actual table schema

complete_nfhs5_mappings = [
    # Geography (2)
    ('district_name', 'district_name', 'geography', 'District name'),
    ('state_ut', 'state_union_territory', 'geography', 'State or Union Territory'),
    
    # Survey Metadata (3)
    ('households_surveyed', 'households_surveyed', 'survey_metadata', 'Number of households surveyed'),
    ('women_15_49_interviewed', 'women_age_15_to_49_interviewed', 'survey_metadata', 'Number of women age 15-49 interviewed'),
    ('men_15_54_interviewed', 'men_age_15_to_54_interviewed', 'survey_metadata', 'Number of men age 15-54 interviewed'),
    
    # Education (3)
    ('female_population_age_6_years_and_above_ever_schooled_pct', 'female_population_age_6_plus_ever_schooled_percent', 'education', 'Percentage of female population age 6+ who ever attended school'),
    ('women_age_15_49_who_are_literate_pct', 'women_age_15_to_49_literate_percent', 'education', 'Literacy rate among women age 15-49'),
    ('women_age_15_49_with_10_or_more_years_of_schooling_pct', 'women_age_15_to_49_with_10plus_years_schooling_percent', 'education', 'Women age 15-49 with 10+ years of schooling'),
    ('child_5y_who_attended_pre_primary_school_during_the_school_pct', 'children_age_5_attended_pre_primary_school_percent', 'education', 'Children age 5 who attended pre-primary school'),
    
    # Demographics (9)
    ('population_below_age_15_years_pct', 'population_below_age_15_percent', 'demographics', 'Percentage of population below age 15'),
    ('sex_ratio_total_f_per_1000_m', 'sex_ratio_females_per_1000_males', 'demographics', 'Overall sex ratio (females per 1000 males)'),
    ('sex_ratio_at_birth_5y_f_per_1000_m', 'sex_ratio_at_birth_females_per_1000_males_past_5_years', 'demographics', 'Sex ratio at birth (past 5 years)'),
    ('child_u5_whose_birth_was_civil_reg_pct', 'children_under_5_with_civil_registration_percent', 'demographics', 'Birth registration rate for children under 5'),
    ('deaths_in_the_last_3_years_civil_reg_pct', 'deaths_past_3_years_with_civil_registration_percent', 'demographics', 'Death registration rate (past 3 years)'),
    ('w20_24_married_before_age_18_years_pct', 'women_age_20_to_24_married_before_18_percent', 'demographics', 'Early marriage: women 20-24 married before age 18'),
    ('births_in_the_5_years_preceding_the_survey_that_are_birth_3_pct', 'births_past_5_years_that_are_third_or_higher_order_percent', 'demographics', 'Birth order: 3rd or higher order births'),
    ('w15_19_who_were_already_mothers_or_pregnant_at_the_time_of_pct', 'women_age_15_to_19_already_mothers_or_pregnant_percent', 'demographics', 'Adolescent pregnancy rate'),
    ('w15_24_who_use_menstrual_hygiene_pct', 'women_age_15_to_24_using_menstrual_hygiene_percent', 'demographics', 'Women 15-24 using hygienic menstrual protection'),
    
    # Household Infrastructure (6)
    ('hh_electricity_pct', 'households_with_electricity_percent', 'household_infrastructure', 'Households with electricity'),
    ('hh_improved_water_pct', 'households_with_improved_water_percent', 'household_infrastructure', 'Households with improved drinking water source'),
    ('hh_use_improved_sanitation_pct', 'households_with_improved_sanitation_percent', 'household_infrastructure', 'Households with improved sanitation facility'),
    ('households_using_clean_fuel_for_cooking_pct', 'households_using_clean_cooking_fuel_percent', 'household_infrastructure', 'Households using clean fuel for cooking'),
    ('households_using_iodized_salt_pct', 'households_using_iodized_salt_percent', 'household_infrastructure', 'Households using adequately iodized salt'),
    ('hh_member_covered_health_insurance_pct', 'household_members_with_health_insurance_percent', 'household_infrastructure', 'Household members covered by health insurance'),
    
    # Family Planning (12)
    ('fp_cm_w15_49_any_method_pct', 'family_planning_any_method_married_women_percent', 'family_planning', 'Currently married women using any contraceptive method'),
    ('fp_cm_w15_49_modern_method_pct', 'family_planning_modern_method_married_women_percent', 'family_planning', 'Currently married women using modern contraceptive method'),
    ('fp_cm_w15_49_f_steril_pct', 'family_planning_female_sterilization_married_women_percent', 'family_planning', 'Currently married women using female sterilization'),
    ('fp_cm_w15_49_m_steril_pct', 'family_planning_male_sterilization_married_women_percent', 'family_planning', 'Currently married women whose partner had male sterilization'),
    ('fp_cm_w15_49_iud_pct', 'family_planning_iud_married_women_percent', 'family_planning', 'Currently married women using IUD'),
    ('fp_cm_w15_49_pill_pct', 'family_planning_pill_married_women_percent', 'family_planning', 'Currently married women using pill'),
    ('fp_cm_w15_49_condom_pct', 'family_planning_condom_married_women_percent', 'family_planning', 'Currently married women whose partner uses condom'),
    ('fp_cm_w15_49_injectables_pct', 'family_planning_injectables_married_women_percent', 'family_planning', 'Currently married women using injectables'),
    ('fp_unmet_total_cm_w15_49_7_pct', 'family_planning_unmet_need_married_women_percent', 'family_planning', 'Unmet need for family planning (total)'),
    ('fp_unmet_spacing_cm_w15_49_7_pct', 'family_planning_unmet_need_spacing_married_women_percent', 'family_planning', 'Unmet need for spacing'),
    ('health_worker_ever_talked_to_female_non_users_about_family_pct', 'health_worker_counseled_non_users_family_planning_percent', 'family_planning', 'Female non-users counseled by health worker'),
    ('current_users_ever_told_about_side_effects_of_current_metho_pct', 'family_planning_users_informed_about_side_effects_percent', 'family_planning', 'Current users informed about method side effects'),
    
    # Maternal Health (25)
    ('institutional_birth_5y_pct', 'institutional_births_past_5_years_percent', 'maternal_health', 'Institutional births (past 5 years)'),
    ('institutional_birth_in_public_facility_5y_pct', 'institutional_births_in_public_facility_past_5_years_percent', 'maternal_health', 'Institutional births in public facilities'),
    ('births_delivered_by_csection_5y_pct', 'births_delivered_by_c_section_past_5_years_percent', 'maternal_health', 'C-section delivery rate'),
    ('births_in_a_public_fac_that_were_delivered_by_csection_5y_pct', 'c_section_births_in_public_facility_past_5_years_percent', 'maternal_health', 'C-section rate in public facilities'),
    ('births_in_a_private_fac_that_were_delivered_by_csection_5y_pct', 'c_section_births_in_private_facility_past_5_years_percent', 'maternal_health', 'C-section rate in private facilities'),
    ('births_attended_by_skilled_hp_5y_10_pct', 'births_attended_by_skilled_health_personnel_past_5_years_percent', 'maternal_health', 'Births attended by skilled health personnel'),
    ('home_birth_that_were_conducted_by_skilled_hp_5y_10_pct', 'home_births_conducted_by_skilled_health_personnel_past_5_years_percent', 'maternal_health', 'Home births conducted by skilled health personnel'),
    ('mothers_who_had_an_anc_visit_in_the_first_trimester_lb5y_pct', 'mothers_anc_visit_first_trimester_past_5_years_percent', 'maternal_health', 'Mothers with ANC visit in first trimester'),
    ('mothers_who_had_at_least_4_anc_visits_lb5y_pct', 'mothers_at_least_4_anc_visits_past_5_years_percent', 'maternal_health', 'Mothers with 4+ ANC visits'),
    ('mothers_whose_last_birth_was_protected_against_neo_tetanus_pct', 'mothers_last_birth_protected_neonatal_tetanus_percent', 'maternal_health', 'Last birth protected against neonatal tetanus'),
    ('mothers_who_consumed_ifa_for_100_days_or_more_when_they_wer_pct', 'mothers_consumed_ifa_100_plus_days_percent', 'maternal_health', 'Mothers consuming IFA 100+ days during pregnancy'),
    ('mothers_who_consumed_ifa_for_180_days_or_more_when_they_wer_pct', 'mothers_consumed_ifa_180_plus_days_percent', 'maternal_health', 'Mothers consuming IFA 180+ days during pregnancy'),
    ('registered_pregnancies_for_which_the_mother_received_a_mcp_pct', 'registered_pregnancies_received_mcp_card_percent', 'maternal_health', 'Registered pregnancies receiving MCP card'),
    ('mothers_who_received_pnc_from_a_doctor_nurse_lhv_anm_midwif_pct', 'mothers_received_postnatal_care_from_skilled_provider_percent', 'maternal_health', 'Mothers receiving PNC from skilled provider'),
    ('children_who_received_pnc_from_a_doctor_nurse_lhv_anm_midwi_pct', 'children_received_postnatal_care_from_skilled_provider_percent', 'maternal_health', 'Children receiving PNC from skilled provider'),
    ('children_born_at_home_who_were_taken_to_a_health_facility_f_pct', 'home_births_taken_to_health_facility_percent', 'maternal_health', 'Home births where child was taken to health facility'),
    ('average_out_of_pocket_expenditure_per_delivery_in_a_public_fac', 'average_out_of_pocket_delivery_cost_public_facility', 'maternal_health', 'Average out-of-pocket cost per delivery in public facility'),
    
    # Vaccination (12)
    ('child_12_23m_fully_vaccinated_based_on_information_from_eit_pct', 'children_age_12_to_23_months_fully_vaccinated_any_source_percent', 'vaccination', 'Fully vaccinated children 12-23 months (any source)'),
    ('child_12_23m_fully_vaccinated_based_on_information_from_vax_pct', 'children_age_12_to_23_months_fully_vaccinated_card_verified_percent', 'vaccination', 'Fully vaccinated children 12-23 months (card verified)'),
    ('child_12_23m_who_have_received_bcg_pct', 'children_age_12_to_23_months_received_bcg_percent', 'vaccination', 'BCG vaccination coverage'),
    ('child_12_23m_who_have_received_3_doses_of_polio_vaccine_pct', 'children_age_12_to_23_months_received_3_polio_doses_percent', 'vaccination', 'Polio 3-dose coverage'),
    ('child_12_23m_who_have_received_3_doses_of_penta_or_dpt_vacc_pct', 'children_age_12_to_23_months_received_3_pentavalent_dpt_doses_percent', 'vaccination', 'Pentavalent/DPT 3-dose coverage'),
    ('child_12_23m_who_have_received_the_first_dose_of_mcv_mcv_pct', 'children_age_12_to_23_months_received_measles_first_dose_percent', 'vaccination', 'Measles first dose (MCV1)'),
    ('child_24_35m_who_have_received_a_second_dose_of_mcv_mcv_pct', 'children_age_24_to_35_months_received_measles_second_dose_percent', 'vaccination', 'Measles second dose (MCV2)'),
    ('child_12_23m_who_have_received_3_doses_of_rotavirus_vaccine_pct', 'children_age_12_to_23_months_received_3_rotavirus_doses_percent', 'vaccination', 'Rotavirus 3-dose coverage'),
    ('child_12_23m_who_have_received_3_doses_of_penta_or_hepatiti_pct', 'children_age_12_to_23_months_received_3_pentavalent_hepatitis_doses_percent', 'vaccination', 'Pentavalent/Hepatitis B 3-dose coverage'),
    ('child_9_35m_who_received_a_vit_a_in_the_last_6_months_pct', 'children_age_9_to_35_months_received_vitamin_a_past_6_months_percent', 'vaccination', 'Vitamin A supplementation (past 6 months)'),
    ('child_12_23m_who_received_most_of_their_vaccinations_in_a_p_pct', 'children_age_12_to_23_months_vaccinated_in_public_facility_percent', 'vaccination', 'Vaccinations received in public facilities'),
    ('child_12_23m_who_received_most_of_their_vaccinations_in_a_2_pct', 'children_age_12_to_23_months_vaccinated_in_private_facility_percent', 'vaccination', 'Vaccinations received in private facilities'),
    
    # Child Nutrition (6)
    ('child_u6m_exclusively_breastfed_pct', 'children_under_6_months_exclusively_breastfed_percent', 'child_nutrition', 'Exclusive breastfeeding under 6 months'),
    ('children_under_age_3_years_breastfed_within_one_hour_of_bir_pct', 'children_under_3_breastfed_within_1_hour_of_birth_percent', 'child_nutrition', 'Early breastfeeding initiation within 1 hour'),
    ('child_6_8m_receiving_solid_or_semi_solid_food_and_breastmil_pct', 'children_age_6_to_8_months_receiving_complementary_food_percent', 'child_nutrition', 'Timely complementary feeding (6-8 months)'),
    ('breastfeeding_child_6_23m_receiving_an_adequate_diet16_17_pct', 'breastfeeding_children_age_6_to_23_months_adequate_diet_percent', 'child_nutrition', 'Breastfed children 6-23 months with adequate diet'),
    ('non_breastfeeding_child_6_23m_receiving_an_adequate_diet16_pct', 'non_breastfeeding_children_age_6_to_23_months_adequate_diet_percent', 'child_nutrition', 'Non-breastfed children 6-23 months with adequate diet'),
    ('total_child_6_23m_receiving_an_adequate_diet16_17_pct', 'total_children_age_6_to_23_months_adequate_diet_percent', 'child_nutrition', 'All children 6-23 months with adequate diet'),
    
    # Child Health (15)
    ('child_u5_who_are_stunted_height_for_age_18_pct', 'children_under_5_stunted_height_for_age_percent', 'child_health', 'Child stunting rate (height-for-age <-2 SD)'),
    ('child_u5_who_are_wasted_weight_for_height_18_pct', 'children_under_5_wasted_weight_for_height_moderate_percent', 'child_health', 'Child moderate wasting rate'),
    ('child_u5_who_are_severe_wasted_weight_for_height_19_pct', 'children_under_5_severely_wasted_weight_for_height_percent', 'child_health', 'Child severe wasting rate (weight-for-height <-3 SD)'),
    ('child_u5_who_are_underweight_weight_for_age_18_pct', 'children_under_5_underweight_weight_for_age_moderate_percent', 'child_health', 'Child moderate underweight rate'),
    ('child_u5_who_are_overweight_weight_for_height_20_pct', 'children_under_5_overweight_weight_for_height_percent', 'child_health', 'Child overweight rate (weight-for-height >2 SD)'),
    ('child_6_59m_who_are_anaemic_lt_11_0_g_dl_22_pct', 'children_age_6_to_59_months_anemic_alternate_threshold_percent', 'child_health', 'Anemia in children 6-59 months (alternate measure)'),
    ('prev_diarrhoea_2wk_child_u5_pct', 'children_under_5_with_diarrhea_past_2_weeks_percent', 'child_health', 'Diarrhea prevalence (past 2 weeks)'),
    ('children_with_diarrhoea_2wk_who_received_oral_rehydration_s_pct', 'children_with_diarrhea_received_ors_percent', 'child_health', 'Children with diarrhea receiving ORS'),
    ('children_with_diarrhoea_2wk_who_received_zinc_child_u5_pct', 'children_with_diarrhea_received_zinc_percent', 'child_health', 'Children with diarrhea receiving zinc'),
    ('children_with_diarrhoea_2wk_taken_to_a_health_facility_or_h_pct', 'children_with_diarrhea_taken_to_health_facility_percent', 'child_health', 'Children with diarrhea taken to health facility'),
    ('children_prev_symptoms_of_acute_respiratory_infection_ari_2_pct', 'children_with_acute_respiratory_infection_symptoms_past_2_weeks_percent', 'child_health', 'ARI symptoms prevalence (past 2 weeks)'),
    ('children_with_fever_or_symptoms_of_ari_2wk_taken_to_a_healt_pct', 'children_with_fever_ari_taken_to_health_facility_percent', 'child_health', 'Children with fever/ARI taken to health facility'),
    
    # Anemia (5)
    ('non_pregnant_w15_49_who_are_anaemic_lt_12_0_g_dl_22_pct', 'non_pregnant_women_age_15_to_49_anemic_percent', 'anemia', 'Anemia in non-pregnant women 15-49 (Hb <12.0 g/dL)'),
    ('pregnant_w15_49_who_are_anaemic_lt_11_0_g_dl_22_pct', 'pregnant_women_age_15_to_49_anemic_alternate_threshold_percent', 'anemia', 'Anemia in pregnant women 15-49 (alternate measure)'),
    ('all_w15_19_who_are_anaemic_pct', 'all_women_age_15_to_19_anemic_percent', 'anemia', 'Anemia prevalence in all women 15-19'),
    ('all_w15_49_who_are_anaemic_pct', 'all_women_age_15_to_49_anemic_percent', 'anemia', 'Anemia prevalence in all women 15-49'),
    
    # Women's Health (7)
    ('women_age_15_49_years_who_are_overweight_obese_bmi_gte_25_0_pct', 'women_age_15_to_49_overweight_obese_bmi_25_plus_percent', 'womens_health', 'Women 15-49 overweight/obese (BMI ≥25)'),
    ('women_age_15_49_years_whose_bmi_bmi_is_underweight_bmi_lt_1_pct', 'women_age_15_to_49_underweight_bmi_under_18_5_percent', 'womens_health', 'Women 15-49 underweight (BMI <18.5)'),
    ('women_age_15_49_years_who_have_high_risk_whr_gte_0_85_pct', 'women_age_15_to_49_high_risk_waist_hip_ratio_percent', 'womens_health', 'Women 15-49 with high-risk waist-hip ratio (≥0.85)'),
    ('women_age_30_49_years_ever_undergone_a_breast_exam_pct', 'women_age_30_to_49_ever_had_breast_examination_percent', 'womens_health', 'Women 30-49 who ever had breast examination'),
    ('women_age_30_49_years_ever_undergone_a_cervical_screen_pct', 'women_age_30_to_49_ever_had_cervical_screening_percent', 'womens_health', 'Women 30-49 who ever had cervical cancer screening'),
    ('women_age_30_49_years_ever_undergone_an_oral_cancer_exam_pct', 'women_age_30_to_49_ever_had_oral_cancer_exam_percent', 'womens_health', 'Women 30-49 who ever had oral cancer examination'),
    
    # Blood Pressure (6)
    ('w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct', 'women_age_15_plus_with_high_blood_pressure_percent', 'blood_pressure', 'Women 15+ with high BP (≥140/90 mmHg)'),
    ('w15_plus_with_mildly_high_bp_sys_140_159_mmhg_and_or_dia_90_pct', 'women_age_15_plus_with_mildly_high_blood_pressure_percent', 'blood_pressure', 'Women 15+ with mildly high BP (140-159/90-99 mmHg)'),
    ('w15_plus_with_moderately_or_severely_high_bp_sys_gte_160_mm_pct', 'women_age_15_plus_with_moderately_severely_high_blood_pressure_percent', 'blood_pressure', 'Women 15+ with moderate/severe high BP (≥160/100 mmHg)'),
    ('m15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct', 'men_age_15_plus_with_high_blood_pressure_percent', 'blood_pressure', 'Men 15+ with high BP (≥140/90 mmHg)'),
    ('m15_plus_with_mildly_high_bp_sys_140_159_mmhg_and_or_dia_90_pct', 'men_age_15_plus_with_mildly_high_blood_pressure_percent', 'blood_pressure', 'Men 15+ with mildly high BP (140-159/90-99 mmHg)'),
    ('m15_plus_with_moderately_or_severely_high_bp_sys_gte_160_mm_pct', 'men_age_15_plus_with_moderately_severely_high_blood_pressure_percent', 'blood_pressure', 'Men 15+ with moderate/severe high BP (≥160/100 mmHg)'),
    
    # Blood Sugar (6)
    ('w15_plus_with_high_or_very_high_gt_140_mg_dl_blood_sugar_or_pct', 'women_age_15_plus_with_high_or_very_high_blood_sugar_percent', 'blood_sugar', 'Women 15+ with high/very high blood sugar (>140 mg/dL)'),
    ('w15_plus_with_very_high_gt_160_mg_dl_blood_sugar_pct', 'women_age_15_plus_with_very_high_blood_sugar_percent', 'blood_sugar', 'Women 15+ with very high blood sugar (>160 mg/dL)'),
    ('women_age_15_years_and_above_with_high_141_160_mg_dl_blood_pct', 'women_age_15_plus_with_high_blood_sugar_141_160_percent', 'blood_sugar', 'Women 15+ with high blood sugar (141-160 mg/dL)'),
    ('m15_plus_with_high_or_very_high_gt_140_mg_dl_blood_sugar_or_pct', 'men_age_15_plus_with_high_or_very_high_blood_sugar_percent', 'blood_sugar', 'Men 15+ with high/very high blood sugar (>140 mg/dL)'),
    ('men_age_15_years_and_above_with_very_high_gt_160_mg_dl_bloo_pct', 'men_age_15_plus_with_very_high_blood_sugar_percent', 'blood_sugar', 'Men 15+ with very high blood sugar (>160 mg/dL)'),
    ('m15_plus_with_high_141_160_mg_dl_blood_sugar_pct', 'men_age_15_plus_with_high_blood_sugar_141_160_percent', 'blood_sugar', 'Men 15+ with high blood sugar (141-160 mg/dL)'),
    
    # Substance Use (4)
    ('w15_plus_who_consume_alcohol_pct', 'women_age_15_plus_consuming_alcohol_percent', 'substance_use', 'Women 15+ who consume alcohol'),
    ('w15_plus_who_use_any_kind_of_tobacco_pct', 'women_age_15_plus_using_tobacco_percent', 'substance_use', 'Women 15+ who use any tobacco'),
    ('m15_plus_who_consume_alcohol_pct', 'men_age_15_plus_consuming_alcohol_percent', 'substance_use', 'Men 15+ who consume alcohol'),
    ('m15_plus_who_use_any_kind_of_tobacco_pct', 'men_age_15_plus_using_tobacco_percent', 'substance_use', 'Men 15+ who use any tobacco'),
    
    # Metadata columns (4) - created during silver transformation
    ('data_year', 'data_year', 'metadata', 'Survey data year'),
    ('has_low_sample_indicators', 'has_low_sample_size_indicators', 'metadata', 'Flag for low sample size indicators'),
    ('processed_timestamp', 'processed_timestamp', 'metadata', 'Timestamp when data was processed'),
    ('source_dataset', 'source_dataset', 'metadata', 'Source dataset identifier'),
]

print(f"Total mappings defined: {len(complete_nfhs5_mappings)}")
print("\nBreakdown:")
from collections import Counter
categories = Counter([m[2] for m in complete_nfhs5_mappings])
for category, count in sorted(categories.items()):
    print(f"  • {category}: {count}")

# COMMAND ----------

# DBTITLE 1,Insert All Mappings into Table
# Create DataFrame and insert all mappings
mapping_df = spark.createDataFrame(
    complete_nfhs5_mappings,
    schema=['bronze_column_name', 'silver_column_name', 'category', 'description']
)

# Add metadata fields
mapping_df = mapping_df.withColumn('created_at', F.current_timestamp()) \
    .withColumn('created_by', F.lit('aiden.vandenbush@xorbix.com')) \
    .withColumn('dataset', F.lit('nfhs_5')) \
    .withColumn('is_active', F.lit(True))

# Insert into table
mapping_df.write \
    .mode('append') \
    .format('delta') \
    .saveAsTable(metadata_table)

print(f"✓ Inserted {mapping_df.count()} NFHS-5 column mappings")
print(f"  Table: {metadata_table}")
print("\n📊 Coverage by category:")
spark.table(metadata_table).filter(F.col('dataset') == 'nfhs_5') \
    .groupBy('category').count().orderBy('category').show(truncate=False)

# COMMAND ----------

# DBTITLE 1,✅ Final Validation - Coverage Summary
# Final validation: Verify complete coverage
print("\n" + "="*70)
print("FINAL VALIDATION - COVERAGE SUMMARY")
print("="*70)

# Get all bronze columns from actual table
bronze_columns = set(spark.table('virtue_foundation_dataset.bronze.nfhs_5_district_health_indicators').columns)

# Get all mapped columns (excluding metadata)
metadata_cols = {'data_year', 'has_low_sample_indicators', 'processed_timestamp', 'source_dataset'}
mapped_df = spark.table('virtue_foundation_dataset.metadata.column_mappings').filter("dataset = 'nfhs_5' AND is_active = true")
all_mappings = [row['bronze_column_name'] for row in mapped_df.collect()]
bronze_mapped = set([col for col in all_mappings if col not in metadata_cols])

print(f"\nBronze table columns: {len(bronze_columns)}")
print(f"Bronze column mappings: {len(bronze_mapped)}")
print(f"Metadata column mappings: {len(metadata_cols)}")
print(f"Total NFHS-5 mappings: {len(all_mappings)}")

if bronze_columns == bronze_mapped:
    print("\n✅ PERFECT COVERAGE!")
    print("  ✓ All bronze columns have standardized names")
    print("  ✓ No missing columns")
    print("  ✓ No extra/invalid mappings")
else:
    missing = bronze_columns - bronze_mapped
    extra = bronze_mapped - bronze_columns
    if missing:
        print(f"\n⚠ {len(missing)} bronze columns without mappings:")
        for col in sorted(missing):
            print(f"  - {col}")
    if extra:
        print(f"\n⚠ {len(extra)} mappings don't match bronze columns:")
        for col in sorted(extra):
            print(f"  - {col}")

print("\n" + "="*70)
print("CATEGORY BREAKDOWN")
print("="*70 + "\n")
mapped_df.groupBy('category').count().orderBy('count', ascending=False).show(truncate=False)

