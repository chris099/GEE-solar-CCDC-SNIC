# Script Documentation – MA Solar CCDC Workflow

This folder contains the full Google Earth Engine (GEE) JavaScript implementation of the Massachusetts solar change detection workflow (2005–2024).

All scripts are designed to be executed in the Google Earth Engine Code Editor.

---

# 🔁 Recommended Execution Order

Scripts are numbered to reflect the logical processing order.

---

## 00_config.js  
**Global configuration file**

Defines:
- Utility functions for processing CCDC

---

## 01_ccdc_parameter_test.js  
**CCDC parameter sensitivity testing**

Used to:
- Tune lambda
- Evaluate minimum observations
- Adjust segmentation behavior

Purpose: Optimize CCDC model stability before full run.

---

## 02_ccdc_run.js  
**Main CCDC implementation**

Runs harmonic time-series modeling over Landsat imagery.

Outputs:
- Break timing (tBreak)
- Coefficients
- Slopes
- Magnitudes

This produces the base CCDC coefficient image collection.

---

## 03_ccdc_extract_features.js  
**Feature extraction from CCDC results**

Extracts:
- Change magnitude (DIF)
- Slopes
- Harmonic amplitudes
- Synthetic end-of-period values

Prepares features for segmentation and classification.

---

## 04_mask_changes.js  
**Change filtering and masking**

Applies:
- Logical filters
- Threshold masks
- Candidate change pixel extraction

Purpose: Remove non-relevant pixels before object-based classification.

---

## 05_ccdc_snic.js  
**SNIC superpixel segmentation**

Converts pixel-level features into object-level units.

Outputs:
- Segmented objects
- Object-level mean feature values

Purpose: Enable object-based classification.

---

## 06_randomforest_changeclassification.js  
**Random Forest classification**

Trains and applies object-based Random Forest classifier.

Classes include:
1 – Other land change  
2 – Solar after deforestation  
3 – Other solar  
4 – Solar buffer  
5 – Potential solar  
6 – Deforestation near solar  

Outputs classified change map.

---

## 07_rf_viewer.js  
**Classification visualization interface**

Interactive UI to:
- Inspect RF outputs
- Explore classification results
- Compare layers

Used for validation and interpretation.

---

## 08_accuracy_assessment_stratifiedsampling.js  
**Stratified sampling for accuracy assessment**

Generates:
- Stratified random samples
- Validation dataset

Used for design-based inference.

---

## 09_sample_interpreter.js  
**Interactive reference interpretation tool**

UI interface to:
- Manually interpret samples
- Assign change labels
- Record deforestation and solar dates
- Store interpretation metadata

Critical for validation workflow.

---

## 10_confusionmatrix.js  
**Accuracy statistics**

Computes:
- Confusion matrix
- Overall accuracy
- Producer’s accuracy
- User’s accuracy

Supports unbiased area estimation.

---

## 11_map_results_ccdc_viewer.js  
**CCDC and classification results viewer**

---

## 12_1_solar_associated_deforestation_year.js  
**Solar-associated deforestation year mapping**

Derives:
- Deforestation year from CCDC break timing
- Annual deforestation area (km²)
- Total deforestation area

Includes:
- Yearly map visualization
- Annual area chart

---

## 12_2_solar_installation_year.js  
**Solar installation year mapping**

Derives:
- Solar installation year
- Class-adjusted break timing
- Annual solar expansion area (km²)

Includes:
- Yearly visualization
- Area statistics

---

# 🖥 Computing Environment

All scripts are designed for:

Google Earth Engine Code Editor  
https://code.earthengine.google.com/

To run:
1. Open a new script in GEE
2. Copy and paste desired `.js` file
3. Update asset paths if necessary
4. Run
5. Start export tasks manually

---

# 📊 Outputs

Primary outputs include:

- CCDC coefficient image collections
- Object-based classification map
- Solar installation year raster
- Solar-associated deforestation year raster
- Annual area statistics
- Accuracy metrics

---

# ⚠️ Notes

- Spatial resolution: 30 m (Landsat)
- Temporal coverage: 2005–2024
- Designed for Massachusetts statewide analysis
- Requires pre-existing Earth Engine assets
