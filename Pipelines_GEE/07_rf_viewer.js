// ---------------------------------------------------------------
// RF Post-processing + Omission Error Filtering
// Author: Kangjoon Cho
//
// Purpose of this script:
// 1) Visualize Random Forest classification results
// 2) Apply additional omission-error detection filters
//    - Fuzzy RF threshold filtering
//    - No-break (nob) probability filtering
// 3) Update classification labels based on filtering logic
// 4) Compute class-wise area statistics
// 5) Provide interactive map interface for inspection
//
// This workflow corresponds to find possible omission error
// for accuracy assessment purposes described in the manuscript.
// ---------------------------------------------------------------



var VIS = {};
var FILTER = {};


// ---------------------------------------------------------------
// NOTE:
// INDEX_CCDC_path   : ImageCollection path to CCDC magnitude product
// INDEX_output0119  : Asset folder containing SNIC + MASK + RF outputs
// Must be defined before running this script.
// ---------------------------------------------------------------


// ---------------------------------------------------------------
// Visualization settings
// ---------------------------------------------------------------
VIS.visParam = {bands: ['High','Vege','Low'], min: 0, max: 1000};
VIS.visParam_test = {bands: ['Filter2'], min: 0, max: 1};
VIS.visParam_CCDC = {
  bands: ['Albedo_magnitude','NDVI_magnitude','NDTI_magnitude'],
  min: -1000,
  max: 1000
};


// ---------------------------------------------------------------
// Load Massachusetts geometry
// ---------------------------------------------------------------
var states = ee.FeatureCollection('TIGER/2016/States');
var Mass = states.filter(ee.Filter.eq('NAME','Massachusetts'));
var geometry = Mass.geometry();
var region = geometry;
var scale = 30;   // Landsat resolution


// ---------------------------------------------------------------
// Load intermediate products
// ---------------------------------------------------------------
VIS.INDEXCCDC = ee.ImageCollection(INDEX_CCDC_path);

VIS.SNIC_SFT = ee.ImageCollection(INDEX_output0119)
  .filterMetadata('type', 'equals', 'SNIC_SFT')
  .mosaic();

VIS.SNIC_MASK = ee.ImageCollection(INDEX_output0119)
  .filterMetadata('type', 'equals', 'MASK')
  .mosaic();

VIS.PEAK = ee.ImageCollection(INDEX_output0119)
  .filterMetadata('type', 'equals', 'Peak')
  .mosaic();

VIS.RF_nob = ee.ImageCollection(INDEX_output0119)
  .filterMetadata('type', 'equals', 'RF_MASK2')
  .mosaic();

VIS.CHG = ee.ImageCollection(INDEX_output0119)
  .filterMetadata('type', 'equals', 'CHG')
  .mosaic();


// ---------------------------------------------------------------
// Select relevant CCDC-derived features
// ---------------------------------------------------------------
VIS.CHG_all = VIS.CHG.select(['Final_.*','.*_LAST']);

VIS.CHG_sel = VIS.CHG_all.select([
  'Final_NDTI','Final_NDBI','Final_Albedo','Final_BSI',
  'NDBI_AMP1_LAST','NDTI_AMP1_LAST','NDVI_AMP1_LAST'
]);


// ---------------------------------------------------------------
// Reference solar polygons (MASSGIS) for validation
// ---------------------------------------------------------------
var assetPath2 = 'projects/kangjoon/assets/MA_Solar/Solar_MAGIS_Ref';
var Solarref2 = ee.FeatureCollection(assetPath2);


// ---------------------------------------------------------------
// Visualization layers
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
  eeObject: VIS.SNIC_SFT,
  visParams: VIS.imageVisParam,
  name: '2_2. SNIC_CCDC_SpatialFiltered'
});


// ---------------------------------------------------------------
// Export helper
// ---------------------------------------------------------------
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


// ---------------------------------------------------------------
// Omission Error Filtering – Stage 1
//
// Update classification based on buffer logic and NDVI-based masks.
// This modifies RF classification output.
// ---------------------------------------------------------------
var updatedClassification = classification
  .where(finalBuffer2.eq(1).and(mask_NDVI.eq(1)), 2)
  .where(finalBuffer2.eq(1).and(mask_NDVI.unmask(0).eq(0)), 4)
  .where(finalBuffer3.eq(1), 4);

var newClassificationBand = updatedClassification.rename('classification');

VIS.RF_buffer = VIS.RF_mono.addBands({
  srcImg: newClassificationBand,
  overwrite: true
});


// ---------------------------------------------------------------
// Omission Error Filtering – Stage 2
//
// Identify potential missed detections using:
//  - Fuzzy RF probabilities
//  - No-break probability thresholds
// ---------------------------------------------------------------

// Pixels classified as class 2
var Class2_mask = VIS.RF_buffer.select('classification').eq(2).selfMask();

// Extract fuzzy probabilities
var fuzzy_nob = VIS.RF_nob2.select([0]);
var fuzzy0 = fuzzy_nob.arrayGet([0]);

// Potential deforestation-linked solar omissions
var DefoMask = Class2_mask.and(fuzzy0.lt(0.66));


// ---------------------------------------------------------------
// Fuzzy-based omission filtering
// ---------------------------------------------------------------
var monoClass = VIS.RF_mono.select('classification');

var mask_2and3 = monoClass.eq(2).or(monoClass.eq(3));
var mask_1 = monoClass.eq(1);
var mask_noData = monoClass.mask().not();

var fuzzyBand0 = VIS.RF_fuzzy.select([0]);
var fuzzyFirst = fuzzyBand0.arrayGet([0]);

var fuzzyMask = mask_1.and(fuzzyFirst.lt(0.5));
var fuzzyFiltered = fuzzyFirst.updateMask(fuzzyMask);


// ---------------------------------------------------------------
// No-break filtering
// ---------------------------------------------------------------
var nobBand0 = VIS.RF_nob.select([0]);
var nobFirst = nobBand0.arrayGet([0]);

var nobMask = nobFirst.lt(0.5).and(mask_2and3.not());
var nobFiltered = nobFirst.updateMask(nobMask);


// ---------------------------------------------------------------
// Combine fuzzy + no-break filters
// ---------------------------------------------------------------
var combinedMask = fuzzyFiltered.unmask().or(nobFiltered.unmask());

var combinedFiltered = fuzzyFiltered
  .unmask()
  .add(nobFiltered.unmask())
  .updateMask(combinedMask);


// ---------------------------------------------------------------
// Pixel count diagnostics (for omission analysis)
// ---------------------------------------------------------------
var fuzzyPixelCount = fuzzyFiltered.reduceRegion({
  reducer: ee.Reducer.count(),
  geometry: region,
  scale: scale,
  maxPixels: 1e13
}).getNumber('classification');

var nobPixelCount = nobFiltered.reduceRegion({
  reducer: ee.Reducer.count(),
  geometry: region,
  scale: scale,
  maxPixels: 1e13
}).getNumber('classification');

var combinedPixelCount = combinedFiltered.reduceRegion({
  reducer: ee.Reducer.count(),
  geometry: region,
  scale: scale,
  maxPixels: 1e13
}).getNumber('classification');

print('Fuzzy omission pixels:', fuzzyPixelCount);
print('No-break omission pixels:', nobPixelCount);
print('Combined omission pixels:', combinedPixelCount);


// ---------------------------------------------------------------
// Update classification labels based on omission filters
// ---------------------------------------------------------------
var updatedClassification = VIS.RF_buffer.select('classification')
  .where(combinedFiltered.mask()
  .and(VIS.RF_buffer.select('classification').eq(1)), 5);

var newClassificationBand = updatedClassification.rename('classification');

var updatedClassification2 = newClassificationBand
  .where(DefoMask.select('classification').eq(1).selfMask(), 2)
  .where(DefoMask.select('classification').eq(0).selfMask(), 6);

var newClassificationBand2 = updatedClassification2.rename('classification');

VIS.RF_buffer = VIS.RF_buffer.addBands({
  srcImg: newClassificationBand2,
  overwrite: true
});


// ---------------------------------------------------------------
// Class-wise area calculation (km²)
// ---------------------------------------------------------------
function getAreaByClass(classMask) {
  return ee.Image.pixelArea()
    .updateMask(classMask)
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: region,
      scale: scale,
      maxPixels: 1e13
    })
    .getNumber('area')
    .divide(1e6);
}

print('Class 1 area (km²):', getAreaByClass(VIS.RF_buffer.eq(1)));
print('Class 2 area (km²):', getAreaByClass(VIS.RF_buffer.eq(2)));
print('Class 3 area (km²):', getAreaByClass(VIS.RF_buffer.eq(3)));
print('Class 4 area (km²):', getAreaByClass(VIS.RF_buffer.eq(4)));
print('Class 5 area (km²):', getAreaByClass(VIS.RF_buffer.eq(5)));
print('Class 6 area (km²):', getAreaByClass(VIS.RF_buffer.eq(6)));


// ---------------------------------------------------------------
// Interactive Map UI for inspection
// Allows manual inspection of omission-prone locations
// ---------------------------------------------------------------
ui.root.clear();

var mapPanel = ui.Map();
mapPanel.setCenter(-71.06, 42.35, 8);
mapPanel.setOptions('HYBRID');


// Coordinate navigation panel
var coordPanel = ui.Panel([
  ui.Label('Enter Lon, Lat'),
  ui.Textbox({value: '-72.602802, 42.27096', style:{stretch: 'horizontal'}})
], ui.Panel.Layout.Flow('horizontal'));

var goButton = ui.Button({
  label: 'Go!',
  onClick: function(){
    var inputText = coordPanel.widgets().get(1).getValue();
    var coords = inputText.split(',');
    if (coords.length === 2) {
      var lon = parseFloat(coords[0].trim());
      var lat = parseFloat(coords[1].trim());
      if (!isNaN(lon) && !isNaN(lat)) {
        var point = ee.Geometry.Point([lon, lat]);
        mapPanel.centerObject(point, 14);
      }
    }
  }
});

var latLonPanel = ui.Panel({
  widgets: [
    ui.Label('Go to Lon, Lat', {fontWeight: 'bold', fontSize: '14px'}),
    coordPanel,
    goButton
  ],
  style: {width: '220px', padding: '8px'}
});

var mainPanel = ui.SplitPanel({
  firstPanel: latLonPanel,
  secondPanel: mapPanel,
  orientation: 'horizontal'
});
ui.root.add(mainPanel);


// ---------------------------------------------------------------
// Add final visualization layers
// ---------------------------------------------------------------
mapPanel.addLayer(fuzzyFiltered, {}, 'Yesbreak_potential');
mapPanel.addLayer(nobFiltered, {}, 'Nobreak_potential');
mapPanel.addLayer(combinedFiltered, {}, 'combined_potential');

mapPanel.addLayer({
  eeObject: VIS.RF_buffer.clip(region),
  visParams: {
    min: 1,
    max: 6,
    palette: ['white','green','blue','red','purple','orange']
  },
  name: 'Revised Classified Change Map'
});


// ---------------------------------------------------------------
// Export final RF map with omission correction
// ---------------------------------------------------------------
expt(
  VIS.RF_buffer.set({area: 'MA', type: 'RF_omission2'}),
  'MA_RF_omission2',
  geometry
);
