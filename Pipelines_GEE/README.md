MA Solar CCDC Workflow – Google Earth Engine Code
Overview

This repository contains Google Earth Engine (GEE) JavaScript scripts used to detect and quantify utility-scale solar installations and associated land cover changes in Massachusetts (2005–2024).

The workflow integrates:

Continuous Change Detection and Classification (CCDC)

SNIC superpixel segmentation

Object-based Random Forest classification

Omission filtering

Stratified sampling for accuracy assessment

Design-based unbiased area estimation

All scripts are designed to run in the Google Earth Engine Code Editor.

Study Objective

The primary objective of this workflow is to:

Detect utility-scale solar installations.

Distinguish solar-associated deforestation from other land cover change.

Derive installation year using CCDC break timing.

Quantify annual and cumulative solar expansion area.

Estimate accuracy and unbiased area following stratified sampling design.

Processing Pipeline
1. CCDC Time-Series Modeling

Landsat time series (2005–2024) are modeled using harmonic regression through CCDC.

Extracted metrics include:

Change magnitude (*_DIF)

Break timing (*_tBreak)

Slopes (*_SLP_LAST)

Amplitudes (*_AMP1_LAST)

Final-year synthetic values (Final_*)

These features form the basis for segmentation and classification.

2. SNIC Segmentation

Superpixel segmentation is applied to CCDC-derived features to:

Reduce pixel-level noise

Convert spectral-temporal features into object-level statistics

Enable object-based classification

Multi-scale SNIC outputs are fused to produce stable segmentation objects.

3. Random Forest Classification

Object-based Random Forest classification assigns land change classes:

Class	Description
1	Other land change
2	Solar after deforestation
3	Other solar installation
4	Solar buffer
5	Potential solar
6	Deforestation near solar

Variable importance diagnostics are computed for model interpretation.

4. Omission Filtering

Additional filtering is applied to:

Identify potential missed solar installations

Refine ambiguous classifications

Incorporate fuzzy probability thresholds

This step improves detection robustness prior to accuracy assessment.

5. Solar Installation Year Mapping

Solar installation year is derived from:

NDVI_tBreak

Albedo_tBreak

Conditional logic for class-specific adjustment

Annual solar area (2005–2024) is computed using:

Pixel-area reduction

Masked class strata

Outputs include:

Solar installation year raster

Annual area statistics (km²)

Total cumulative solar area

6. Accuracy Assessment & Area Estimation

Implements:

Stratified random sampling

Confusion matrix generation

Producer’s and User’s accuracy

Design-based unbiased area estimation

This framework follows statistically rigorous inference for map-based area estimation.

Data Dependencies

The scripts require the following Earth Engine assets:

projects/kangjoon/assets/MA_Solar/


These include:

CCDC coefficient image collections

SNIC-derived feature stacks

Random Forest classification outputs

Reference interpretation samples

Massachusetts boundary data

Asset paths must be updated if the workflow is replicated in another project.

Execution Environment

All scripts are intended to run in:

Google Earth Engine Code Editor
https://code.earthengine.google.com/

No external libraries or local dependencies are required.

Study Region

Massachusetts, USA
Spatial resolution: 30 meters
Temporal coverage: 2005–2024

Citation

If using components of this workflow, please cite:

Cho, K., Woodcock, C.E., et al.
Detecting Utility-Scale Solar Installations and Associated Land Cover Changes Using Spatiotemporal Segmentation of Landsat Imagery.
Science of Remote Sensing.

Notes

The workflow is scalable to other regions with asset path modification.

Designed for statewide monitoring of utility-scale solar expansion.

Integrates time-series modeling, object-based classification, and statistical inference within a unified GEE environment.
