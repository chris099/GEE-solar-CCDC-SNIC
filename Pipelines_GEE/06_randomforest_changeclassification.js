// ---------------------------------------------------------------
// SNIC Feature Conversion + Random Forest Classification
// Author: Kangjoon Cho
//
// Purpose of this script:
// 1) Load SNIC-fused object-level features
// 2) Rescale / harmonize feature magnitudes for classification
// 3) Export converted SNIC feature stack
// 4) Train and apply Random Forest classifier
// 5) Export RF classification result
// ---------------------------------------------------------------

// Global Variabls

var VIS = {};
var FILTER = {};

// ---------------------------------------------------------------
// NOTE:
// INDEX_CCDC_path      : ImageCollection path to CCDC magnitude product
// INDEX_output    : Asset folder containing SNIC + MASK outputs
// These must be defined before running this script.
// ---------------------------------------------------------------


// ---------------------------------------------------------------
// Study region
// ---------------------------------------------------------------
var region_path = 'projects/kangjoon/assets/MA_Solar/MA_boundary';
var region = ee.FeatureCollection(region_path);


// ---------------------------------------------------------------
// Visualization parameters
// Used for quick inspection of intermediate products
// ---------------------------------------------------------------
VIS.visParam = {bands: ['High','Vege','Low'], min: 0, max: 1000};

VIS.visParam_testMax = {
  bands: ['NDVI_DIF','Albedo_DIF','TEMP_DIF'],
  min: -10000,
  max: 10000
};

VIS.visParam_test = {bands: ['Filter2'], min: 0, max: 1};

VIS.visParam_test2 = {
  bands: ['Final_NDVI','Final_NDTI','Final_BSI'],
  min: -10000,
  max: 10000
};

VIS.visParam_SNIC1 = {
  bands: ['Albedo_DIF_mean','NDVI_DIF_mean','NDTI_DIF_mean'],
  min: -10000,
  max: 10000
};

VIS.visParam_SNIC2 = {
  bands: ['Final_NDVI_mean','Final_NDTI_mean','Final_BSI_mean'],
  min: -10000,
  max: 10000
};

VIS.visParam_CCDC = {
  bands: ['Albedo_magnitude','NDVI_magnitude','NDTI_magnitude'],
  min: -1000,
  max: 1000
};


// ---------------------------------------------------------------
// Load datasets
// ---------------------------------------------------------------

// CCDC magnitude product
VIS.INDEXCCDC = ee.ImageCollection(INDEX_CCDC_path);

// SNIC fused feature stack (MASK2-based segmentation result)
VIS.SNIC_SOLAR_Fused = ee.ImageCollection(INDEX_output)
  .filterMetadata('type', 'equals', 'SNIC_MASK2_Fused')
  .mosaic();

// MASK product for visualization reference
VIS.SNIC_MASK = ee.ImageCollection(INDEX_output)
  .filterMetadata('type', 'equals', 'MASK')
  .mosaic();

// Peak product (if needed for QA)
VIS.PEAK = ee.ImageCollection(INDEX_output)
  .filterMetadata('type', 'equals', 'Peak')
  .mosaic();

FILTER.snic_SF = VIS.SNIC_SOLAR_Fused;


// ---------------------------------------------------------------
// Feature Rescaling / Harmonization
// Purpose:
// Normalize feature magnitudes before Random Forest training.
// Scaling choices are empirical and reflect stored integer units.
// ---------------------------------------------------------------

// Scale selected features by 0.1
var scaledAlbedo = FILTER.snic_SF
  .select(['Final_Albedo_mean', 'NDTI_AMP1_LAST_mean'])
  .multiply(0.1)
  .rename(['Final_Albedo', 'NDTI_AMP1_LAST']);

// Scale selected features by 0.5
var scaledNDTIBI = FILTER.snic_SF
  .select(['Final_NDTI_mean', 'Final_NDBI_mean'])
  .multiply(0.5)
  .rename(['Final_NDTI', 'Final_NDBI']);

// Keep NDVI and BSI features (rename to remove "_mean")
var NDVI = FILTER.snic_SF
  .select(['Final_NDVI_mean', 'Final_BSI_mean'])
  .rename(['Final_NDVI', 'Final_BSI']);

// Rescale remaining harmonic / RMSE features
var restBands = FILTER.snic_SF.select([
  'Final_TEMP_mean',
  'NDVI_AMP1_LAST_mean', 'NDBI_AMP1_LAST_mean', 'TEMP_AMP1_LAST_mean',
  'Albedo_RMSE_LAST_mean', 'BSI_RMSE_LAST_mean', 'NDBI_RMSE_LAST_mean',
  'BSI_AMP3_LAST_mean'
])
.multiply(10000)
.rename([
  'Final_TEMP',
  'NDVI_AMP1_LAST', 'NDBI_AMP1_LAST', 'TEMP_AMP1_LAST',
  'Albedo_RMSE_LAST', 'BSI_RMSE_LAST', 'NDBI_RMSE_LAST',
  'BSI_AMP3_LAST'
]);

// Preserve cluster ID band from SNIC segmentation
var restBand2 = FILTER.snic_SF.select('clusters');


// ---------------------------------------------------------------
// Construct final SNIC feature stack for classification
// Reproject to standard 30 m grid
// ---------------------------------------------------------------
FILTER.SNIC_conv = restBands
  .addBands(restBand2)
  .addBands(scaledAlbedo)
  .addBands(scaledNDTIBI)
  .addBands(NDVI)
  .reproject({
    crs: 'EPSG:4326',
    scale: 30
  });

Map.addLayer(FILTER.SNIC_conv, {}, 'conv');


// ---------------------------------------------------------------
// Export converted SNIC feature stack
// ---------------------------------------------------------------
var areaID = 'MA';
var geometry = region;

var expt = function(img, name, geometry) {
  Export.image.toAsset({
    image: img,
    description: name,
    assetId: INDEX_output0119 + '/' + name,
    region: geometry,
    scale: 30,
    maxPixels: 1e13,
    pyramidingPolicy: {'.default': 'sample'}
  });
};

expt(
  FILTER.SNIC_conv.set({area: areaID, type: 'MASK2_SFT'}),
  areaID + '_MASK2_SFT',
  geometry
);


// ---------------------------------------------------------------
// Load reference solar polygons (for visual comparison)
// ---------------------------------------------------------------
var assetPath2 = 'projects/kangjoon/assets/MA_Solar/Solar_MAGIS_Ref';
var Solarref2 = ee.FeatureCollection(assetPath2);


// Visualization parameters for cluster band
VIS.imageVisParam = {
  bands: ['clusters'],
  min: -2142595777,
  max: 2139444519,
  opacity: 1,
  palette: ['ff0000', '1000ff', 'fbff00', 'ef00ff', '00ff4e', '00f3ff']
};


// ---------------------------------------------------------------
// Add layers for QA visualization
// ---------------------------------------------------------------
Map.addLayer({
  eeObject: VIS.INDEXCCDC,
  visParams: VIS.visParam_CCDC,
  name: '1. CCDC'
});

Map.addLayer({
  eeObject: VIS.SNIC_MASK,
  visParams: VIS.visParam_test2,
  name: '1_2. CCDC_MASK'
});

Map.addLayer({
  eeObject: VIS.SNIC_SOLAR_Fused,
  visParams: VIS.imageVisParam,
  name: '2_3. SNIC_CCDC_Solar_Fused'
});

Map.addLayer(Solarref2, {color:'#BF40BF'}, "5. MASSGIS_Reference");


// ---------------------------------------------------------------
// Load training samples
// ---------------------------------------------------------------
var training_path = 'projects/kangjoon/assets/MA_Solar/Trial_040224/Training_Solar_adjusted';
var training = ee.FeatureCollection(training_path);


// ---------------------------------------------------------------
// Random Forest Classification Function
//  - Extract feature bands (excluding cluster / break bands)
//  - Sample training data
//  - Train RF (1000 trees)
//  - Classify full image
//  - Print variable importance chart
// ---------------------------------------------------------------
function Run_RF(image, training){

  var RF_Bands = image.bandNames()
    .remove("clusters")
    .remove("tBreak")
    .remove("tBreak");

  var points = ee.FeatureCollection(training);
  var label = 'Class';

  var training_RF = image.select(RF_Bands).sampleRegions({
    collection: points,
    properties: [label],
    scale: 30,
    tileScale: 2
  });

  var RF_trained = ee.Classifier.smileRandomForest(1000)
    .train(training_RF, label);

  var output = image.select(RF_Bands).classify(RF_trained);

  // Variable importance extraction
  var dict = RF_trained.explain();
  var variable_importance = ee.Feature(null, ee.Dictionary(dict).get('importance'));

  var chart = ui.Chart.feature.byProperty(variable_importance)
    .setChartType('ColumnChart')
    .setOptions({
      title: 'RF Variable Importance',
      legend: {position: 'none'},
      hAxis: {title: 'Bands'},
      vAxis: {minValue:0, title: 'Importance'}
    });

  print(chart, 'Relative Importance');

  return output;
}


// ---------------------------------------------------------------
// Run Random Forest classification
// ---------------------------------------------------------------
FILTER.rf = Run_RF(FILTER.snicconv, training);

// Export RF classification result
expt(
  FILTER.rf.set({area: areaID, type: 'RF'}),
  areaID + '_RF',
  geometry
);


// ---------------------------------------------------------------
// Diagnostic prints + visualization
// ---------------------------------------------------------------
print(RF_Bands, 'RF_Bands');
print(training, 'training');
print(FILTER.rf, 'classified');

Map.addLayer(
  FILTER.rf,
  {min:1, max: 5, palette:['black','green','blue','red','yellow']},
  'FILTER_RF'
);
