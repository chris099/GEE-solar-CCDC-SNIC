// ------------------------------------------------------------
// Visualization + simple rule-based masking (QC / screening step)
// Purpose:
//  - Load CCDC-derived products (magnitude/change map + peak summer values)
//  - Overlay reference solar polygons (MASSGIS)
//  - Apply heuristic masks using final-year indices + NDVI change thresholds
//  - Export masked layers to Asset for downstream checks
// ------------------------------------------------------------

var VIS = {};

// Base asset root (project workspace)
var wd = 'projects/kangjoon/assets/MA_Solar/';

// Massachusetts boundary (used for export region / area context)
var region_path = 'projects/kangjoon/assets/MA_Solar/MA_boundary';
var region = ee.FeatureCollection(region_path);

// -----------------------------
// Visualization parameter presets
// Note: band values appear to be stored in scaled integer units (e.g., *10000).
// Adjust min/max if you later standardize scaling.
// -----------------------------
VIS.visParam = { bands: ['High','Vege','Low'], min: 0, max: 1000 };

// For viewing "change" layers (DIF bands): wide range for quick inspection
VIS.visParam_testMax = { bands: ['NDVI_DIF','Albedo_DIF','TEMP_DIF'], min: -10000, max: 10000 };

// Binary/flag layer quick view (0/1)
VIS.visParam_test = { bands: ['Filter2'], min: 0, max: 1 };

// For viewing final-year (peak summer) indices
VIS.visParam_test2 = { bands: ['Final_NDVI','Final_NDTI','Final_BSI'], min: -10000, max: 10000 };

// SNIC-based mean features (if available; used for object-level viz)
VIS.visParam_SNIC = { bands: ['Albedo_DIF_mean','NDVI_DIF_mean','NDTI_DIF_mean'], min: -10000, max: 10000 };

// CCDC magnitude composites (if using magnitude output product)
VIS.visParam_CCDC = { bands: ['Albedo_magnitude','NDVI_magnitude','NDTI_magnitude'], min: -1000, max: 1000 };

// -----------------------------
// Load products (placeholders expected to be defined above this script)
// INDEX_CCDC_path : ImageCollection path for CCDC magnitude (or related) outputs
// INDEX_output    : ImageCollection path for derived maps (change + peak layers)
// -----------------------------
VIS.INDEXCCDC = ee.ImageCollection(INDEX_CCDC_path).mosaic();

// Change map: select items tagged as type='CHG' and mosaic to single image
VIS.SFMAP = ee.ImageCollection(INDEX_output)
  .filterMetadata('type', 'equals', 'CHG')
  .mosaic();

// Peak (e.g., last-year peak summer) product: type='Peak'
VIS.PEAK = ee.ImageCollection(INDEX_output)
  .filterMetadata('type', 'equals', 'Peak')
  .mosaic();

// -----------------------------
// Export helper: export an image to asset under output/<name>
// output variable is assumed to be defined above (asset folder path)
// -----------------------------
var expt = function(img, name, geometry) {
  Export.image.toAsset({
    image: img,
    description: name,
    assetId: output + '/' + name,
    region: geometry,
    scale: 30,
    maxPixels: 1e13
  });
};

// -----------------------------
// Reference dataset: MASSGIS solar polygons (for visual comparison / QA)
// -----------------------------
var assetPath2 = 'projects/kangjoon/assets/MA_Solar/Solar_MAGIS_Ref';
var Solarref2 = ee.FeatureCollection(assetPath2);

// -----------------------------
// Map layers for quick visual QA
//  1) CCDC magnitude composite
//  2) CHG map (DIF bands, etc.) before any masking
//  3) Peak summer / final-year indices
//  4) Reference solar polygons overlay
// -----------------------------
Map.addLayer({
  eeObject: VIS.INDEXCCDC,
  visParams: VIS.visParam_CCDC,
  name: '1. CCDC'
});

Map.addLayer({
  eeObject: VIS.SFMAP,
  visParams: VIS.visParam_testMax,
  name: '2. BeforeMASK'
});

Map.addLayer({
  eeObject: VIS.PEAK,
  visParams: VIS.visParam_test2,
  name: '3. Last year peak summer value'
});

Map.addLayer(Solarref2, { color:'#BF40BF' }, "5. MASSGIS_Reference");

// -----------------------------
// Masking: heuristic screening rules using final-year indices + NDVI change
// Intent (high-level):
//  - Keep pixels consistent with plausible post-installation surface conditions
//  - Optionally isolate strong NDVI decrease signals
//
// Note: thresholds below are empirical and in scaled units.
//       Consider documenting how scaling is applied in upstream processing.
// -----------------------------
var areaID = 'MA';
var geometry = region;

// Rule set based on final-year values
var mask1 = VIS.SFMAP.select('Final_NDVI').lte(9000);
var mask2 = VIS.SFMAP.select('Final_Albedo').lte(3000).and(VIS.SFMAP.select('Final_Albedo').gte(500));
var mask3 = VIS.SFMAP.select('Final_NDTI').gte(-4500);
var mask4 = VIS.SFMAP.select('Final_BSI').gte(-3000);
var mask5 = VIS.SFMAP.select('Final_NDBI').gte(-3000);

// NDVI change filters
// mask6: generic upper bound (guards against extreme/erroneous DIF values)
var mask6 = VIS.SFMAP.select('NDVI_DIF').lte(10000);

// mask_NDVI: strong NDVI decrease candidate subset (more restrictive)
var mask_NDVI = VIS.SFMAP.select('NDVI_DIF').lte(-2000);

// Combined mask variants
// mask: includes mask6 + all final-year constraints
var mask = mask6.and(mask1.and(mask2).and(mask3).and(mask4).and(mask5));

// mask02: same as above but without mask6 (slightly looser)
var mask02 = mask1.and(mask2).and(mask3).and(mask4).and(mask5);

// Apply masks (updateMask keeps only pixels passing the condition)
VIS.MASK  = VIS.SFMAP.updateMask(mask);
VIS.MASK2 = VIS.SFMAP.updateMask(mask02);
VIS.MASK3 = VIS.SFMAP.updateMask(mask_NDVI);

// Visualize masked outputs for QC
Map.addLayer(VIS.MASK,  VIS.visParam_test2, 'VIS.MASK');
Map.addLayer(VIS.MASK2, VIS.visParam_test2, 'VIS.MASK2');
Map.addLayer(VIS.MASK3, VIS.visParam_test2, 'VIS.MASK3');

// Export masked layers for downstream use / inspection
expt(VIS.MASK.set({  area: areaID, type: 'MASK'  }),  areaID + '_MASK',  geometry);
expt(VIS.MASK2.set({ area: areaID, type: 'MASK2' }), areaID + '_MASK2', geometry);
