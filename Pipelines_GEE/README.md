📂 Code Directory – MA Solar CCDC Workflow
Overview

This directory contains Google Earth Engine (GEE) JavaScript scripts used to detect and quantify utility-scale solar installations and associated land cover changes in Massachusetts (2005–2024).

The workflow integrates:

Continuous Change Detection and Classification (CCDC)

SNIC superpixel segmentation

Object-based Random Forest classification

Omission filtering

Stratified sampling for accuracy assessment

Unbiased area estimation

All scripts are written for execution in the Google Earth Engine Code Editor.

Workflow Structure

The processing pipeline follows the sequence below:

1️⃣ CCDC Time-Series Modeling

Build harmonic models using Landsat time series

Extract:

Change magnitudes

Break timing (tBreak)

Slopes and amplitudes

Peak synthetic values

Key outputs:

*_DIF

*_tBreak

*_SLP_LAST

Final_*

2️⃣ SNIC Segmentation

Apply superpixel segmentation on CCDC-derived features

Fuse multi-scale SNIC outputs

Convert pixel-based metrics to object-level features

Purpose:

Reduce salt-and-pepper noise

Enable object-based classification

3️⃣ Random Forest Classification

Object-level classification of land cover change into:

Class	Description
1	Other land change
2	Solar after deforestation
3	Other solar installation
4	Solar buffer
5	Potential solar
6	Deforestation near solar

Variable importance is computed for diagnostic purposes.

4️⃣ Omission Filtering

Additional filtering to detect:

Potential missed solar installations

Ambiguous RF predictions

Fuzzy probability-based refinements

This stage refines the classification product prior to accuracy assessment.

5️⃣ Installation Year Mapping

Solar installation year is derived from:

NDVI_tBreak

Albedo_tBreak

Conditional adjustment logic for class 2 objects

Annual solar area (2005–2024) is computed using:

Pixel area reduction

Masked classification strata

Outputs:

Solar installation year raster

Annual area statistics (km²)

Total cumulative area

6️⃣ Accuracy Assessment & Unbiased Area Estimation

Implements:

Stratified random sampling

Confusion matrix generation

Producer’s and User’s accuracy

Area estimation consistent with design-based inference

Data Dependencies

The scripts assume access to the following Earth Engine assets:

CCDC coefficient image collections

SNIC-derived feature stacks

Random Forest classification outputs

Reference interpretation samples

Massachusetts boundary

These assets are stored under:

projects/kangjoon/assets/MA_Solar/


Paths must be updated if reproduced elsewhere.

Execution Environment

All scripts are intended to run in:

Google Earth Engine Code Editor
https://code.earthengine.google.com/

No external dependencies required.

Citation

If using components of this workflow, please cite:

Cho, K., Woodcock, C.E., et al.
Detecting Utility-Scale Solar Installations and Associated Land Cover Changes Using Spatiotemporal Segmentation of Landsat Imagery.
Science of Remote Sensing.

Notes

All computations use 30 m spatial resolution.

Time range: 2005–2024.

Designed for statewide application.

Scalable to other regions with asset path modification.
