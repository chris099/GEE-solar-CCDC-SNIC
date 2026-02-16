// ---------------------------------------------------------------
// Spatiotemporal Segmentation
// CCDC-SNIC for Utility Scale Solar
// 
// Author: Kangjoon Cho
//
// If you use this code or derivatives, please cite:
//
// Cho, K., Woodcock, C.E., 2025.
// Detecting utility-scale solar installations and associated land cover changes 
// using spatiotemporal segmentation of Landsat imagery.
// Science of Remote Sensing, 12, 100165.
// https://doi.org/10.1016/j.srs.2025.100165
//
// This implementation builds upon the Continuous Change Detection and Classification (CCDC) 
// framework (Zhu & Woodcock, 2014) and object-based segmentation using SNIC.
//
// Zhu, Z., Woodcock, C.E., 2014.
// Continuous change detection and classification of land cover using all available 
// Landsat data. Remote Sensing of Environment, 144, 152–171.
// https://doi.org/10.1016/j.rse.2014.01.011
//
// Purpose of this script:
// 1) Load previously exported MASK2 CCDC-derived product
// 2) Select and rescale key spectral / harmonic features
// 3) Construct feature stack for object-based segmentation
// 4) Apply SNIC segmentation at two spatial scales
// 5) Fuse segmentation outputs and export result
// ---------------------------------------------------------------


// ---------------------------------------------------------------
// Asset paths and export configuration
// ---------------------------------------------------------------
var wd = 'projects/kangjoon/assets/MA_Solar/ccd/CCD_Solar/';
var palettes = require('users/gena/packages:palettes');

// Output folder containing MASK2 results
var output = 'projects/kangjoon/assets/MA_Solar/Results/maps_011925';

var FILTER = {};

// Study region (Massachusetts boundary)
var region_path = 'projects/kangjoon/assets/MA_Solar/MA_boundary';
var region = ee.FeatureCollection(region_path);

var areaID = 'MA';
var geometry = region;


// ---------------------------------------------------------------
// Export helper function
// Exports image to Asset with fixed scale (30m)
// ---------------------------------------------------------------
var expt = function(img, name, geometry) {
  Export.image.toAsset({
    image: img,
    description: name,
    assetId: output + '/' + name,
    region: geometry,
    scale: 30,
    maxPixels: 1e13,
    pyramidingPolicy: {'.default': 'sample'}
  });
};


// ---------------------------------------------------------------
// Load MASK2 product from previous step
// (type = 'MASK2' used as filtered change candidate layer)
// ---------------------------------------------------------------
FILTER.SFMAP = ee.ImageCollection(output)
  .filterMetadata('type', 'equals', 'MASK2')
  .mosaic();

// Inspect projection (for later alignment)
var filterProjection = FILTER.SFMAP.projection();
print(filterProjection, 'Projection');


// ---------------------------------------------------------------
// Select relevant bands (change + harmonic + final-year metrics)
// Using regex-based selection
// ---------------------------------------------------------------
FILTER.TMP = FILTER.SFMAP.select([
  'NDVI_.*', 'NDTI_.*', 'NDBI_.*','BSI_.*', 'TEMP_.*', 'Albedo_.*',
  '.*_NDVI', '.*_NDTI', '.*_NDBI', '.*_BSI', '.*_TEMP', '.*_Albedo'
]);


// ---------------------------------------------------------------
// Select solar-relevant subset of features
// Includes final-year indices + selected harmonic amplitudes/RMSE
// ---------------------------------------------------------------
FILTER.SOLAR = FILTER.TMP.select([
  'Final_.*',
  'NDTI_AMP1_LAST', 'NDVI_AMP1_LAST', 'NDBI_AMP1_LAST', 'TEMP_AMP1_LAST',
  'Albedo_RMSE_LAST', 'BSI_RMSE_LAST', 'NDBI_RMSE_LAST',
  'BSI_AMP3_LAST'
]);

var tmpSelected = FILTER.TMP.select([
  'Final_.*',
  'NDTI_AMP1_LAST', 'NDVI_AMP1_LAST', 'NDBI_AMP1_LAST', 'TEMP_AMP1_LAST',
  'Albedo_RMSE_LAST', 'BSI_RMSE_LAST', 'NDBI_RMSE_LAST',
  'BSI_AMP3_LAST'
]);


// ---------------------------------------------------------------
// Rescale selected bands
// Note: scaling reflects original integer storage (e.g., *10000)
// Adjustments are empirical for segmentation feature balance
// ---------------------------------------------------------------

// Multiply selected bands by 10
var scaledAlbedo = tmpSelected
  .select(['Final_Albedo', 'NDTI_AMP1_LAST'])
  .multiply(10)
  .rename(['Final_Albedo', 'NDTI_AMP1_LAST']);

// Multiply selected bands by 2
var scaledNDTIBI = tmpSelected
  .select(['Final_NDTI', 'Final_NDBI'])
  .multiply(2)
  .rename(['Final_NDTI', 'Final_NDBI']);

// Keep NDVI and BSI as-is
var NDVI = tmpSelected.select(['Final_NDVI', 'Final_BSI']);

// Scale remaining bands to reflect reflectance-based normalization
var restBands = tmpSelected
  .select([
    'Final_TEMP',
    'NDVI_AMP1_LAST', 'NDBI_AMP1_LAST', 'TEMP_AMP1_LAST',
    'Albedo_RMSE_LAST', 'BSI_RMSE_LAST', 'NDBI_RMSE_LAST',
    'BSI_AMP3_LAST'
  ])
  .multiply(0.0001)
  .rename([
    'Final_TEMP',
    'NDVI_AMP1_LAST', 'NDBI_AMP1_LAST', 'TEMP_AMP1_LAST',
    'Albedo_RMSE_LAST', 'BSI_RMSE_LAST', 'NDBI_RMSE_LAST',
    'BSI_AMP3_LAST'
  ]);

// Merge all processed bands into final feature stack
FILTER.SOLAR2 = restBands
  .addBands(scaledAlbedo)
  .addBands(scaledNDTIBI)
  .addBands(NDVI);

print(FILTER.SOLAR2, 'FILTER.SOLAR2');


// ---------------------------------------------------------------
// SNIC Segmentation Function
// Performs superpixel segmentation with specified parameters
// ---------------------------------------------------------------
function ApplySNIC(inputimage, size, comp, connect, neighbor, scale2) {

  var size_segmentation = size;

  var seeds = ee.Algorithms.Image.Segmentation.seedGrid(size_segmentation);

  var snic_image = ee.Algorithms.Image.Segmentation.SNIC({
    image: inputimage,
    compactness: comp,
    connectivity: connect,
    neighborhoodSize: neighbor,
    seeds: seeds
  }).reproject({
    crs: 'EPSG:4326',
    scale: scale2
  });

  return snic_image;
}


// ---------------------------------------------------------------
// Apply SNIC at two spatial resolutions (30m and 15m)
// ---------------------------------------------------------------
FILTER.snic1 = ApplySNIC(FILTER.SOLAR2, 5, 0.5, 4, 256, 30);
FILTER.snic2 = ApplySNIC(FILTER.SOLAR2, 5, 0.5, 4, 256, 15);


// ---------------------------------------------------------------
// Align SNIC outputs to common projection
// ---------------------------------------------------------------
var snic30Proj = FILTER.snic1.projection();

// Reproject 15m segmentation to match 30m grid
var snic15Aligned = FILTER.snic2.reproject({
  crs: snic30Proj.crs(),
  scale: snic30Proj.nominalScale()
});

// Fuse segmentation results:
// Fill masked pixels in snic1 with aligned snic2 values
FILTER.snic3 = FILTER.snic1.unmask(snic15Aligned);


// ---------------------------------------------------------------
// Visualization for inspection
// ---------------------------------------------------------------
Map.addLayer(FILTER.snic2, {}, 'snic2');
Map.addLayer(FILTER.snic1.randomVisualizer(), {}, 'snic1');
Map.addLayer(FILTER.snic3, {}, 'snic_fused');


// ---------------------------------------------------------------
// Export fused SNIC segmentation result
// ---------------------------------------------------------------
expt(
  FILTER.snic3.set({area: areaID, type: 'SNIC_MASK2_Fused'}),
  areaID + '_SNIC_MASK2_Fused',
  geometry
);
