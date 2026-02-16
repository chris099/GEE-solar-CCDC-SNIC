# MA Solar CCDC Workflow (Massachusetts, 2005–2024)

## Overview

This repository contains Google Earth Engine (GEE) JavaScript workflows developed to detect and quantify utility-scale solar installations and associated land cover changes in Massachusetts.

The framework integrates:

- Continuous Change Detection and Classification (CCDC)
- SNIC superpixel segmentation
- Object-based Random Forest classification
- Stratified sampling for accuracy assessment
- Design-based unbiased area estimation

All processing is implemented in Google Earth Engine.

---

# 📚 Citation

If you use this code, methodology, or derived products, please cite:

Cho, K., Woodcock, C.E., et al. (2025).  
**Detecting Utility-Scale Solar Installations and Associated Land Cover Changes Using Spatiotemporal Segmentation of Landsat Imagery.**  
*Science of Remote Sensing*.  
https://doi.org/10.1016/j.srs.2025.XXXXXX](https://doi.org/10.1016/j.srs.2025.100337

---

## Research Objective

The workflow aims to:

1. Detect utility-scale solar installations across Massachusetts.
2. Distinguish solar-associated deforestation from other land cover change.
3. Derive solar installation year using CCDC break timing.
4. Quantify annual and cumulative solar expansion.
5. Estimate map accuracy and unbiased area using stratified inference.

---

## Study Area

- Massachusetts, USA
- Spatial resolution: 30 m (Landsat)
- Temporal range: 2005–2024

---

## Core Methodology

### 1. CCDC Time-Series Modeling
Harmonic regression-based temporal segmentation is applied to Landsat imagery to extract:

- Change magnitude (`*_DIF`)
- Break timing (`*_tBreak`)
- Slopes and amplitudes
- Synthetic end-of-period reflectance values

---

### 2. SNIC Segmentation
Superpixel segmentation converts pixel-level change metrics into object-level features to reduce noise and enable object-based classification.

---

### 3. Random Forest Classification
Object-level features are used to classify:

| Class | Description |
|-------|------------|
| 1 | Other land change |
| 2 | Solar after deforestation |
| 3 | Other solar installation |
| 4 | Solar buffer |
| 5 | Potential solar |
| 6 | Deforestation near solar |

---

### 4. Omission Finder
Additional rule-based and probability-based filtering reduces false negatives in solar detection.

---

### 5. Solar Installation Year Mapping
Installation year is derived from CCDC break timing and class-specific logic, followed by annual area calculation.

---

### 6. Accuracy & Area Estimation
Implements:

- Stratified random sampling
- Confusion matrix
- Producer’s/User’s accuracy
- Design-based unbiased area estimation

---

## Computing Environment

All scripts are designed for:

Google Earth Engine Code Editor  
https://code.earthengine.google.com/
