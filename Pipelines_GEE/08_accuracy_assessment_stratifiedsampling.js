// ---------------------------------------------------------------
// Accuracy Assessment Sampling UI (Design-based / Unbiased Area Estimation)
// Author: Kangjoon Cho
//
// Purpose of this script:
// 1) Load final RF classification map (with omission correction)
// 2) Draw a stratified random sample by mapped class
// 3) Provide an interactive UI to step through samples for labeling/QA
// 4) Export each sample location as a KML (one-click download) for external review
//
// Intended use:
// - Create a validation sample set for confusion matrix + unbiased area estimation
//   (design-based inference using stratified sampling by mapped classes).
// ---------------------------------------------------------------

var VIS = {};
var FILTER = {};

// ---------------------------------------------------------------
// Asset folder containing RF outputs
// ---------------------------------------------------------------
// ---------------------------------------------------------------
// NOTE:
// INDEX_output0119  : Asset folder containing SNIC + MASK + RF outputs
// Must be defined before running this script.
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// Study region: Massachusetts boundary (used for sampling region)
// ---------------------------------------------------------------
var states = ee.FeatureCollection('TIGER/2016/States');
var Mass = states.filter(ee.Filter.eq('NAME','Massachusetts'));
var geometry = Mass.geometry();
var region = geometry;
var scale = 30;  // sampling scale (Landsat 30 m)

// ---------------------------------------------------------------
// Load RF classification result used for validation sampling
// Assumption: band name is "classification" (classes 1..5 here)
// ---------------------------------------------------------------
VIS.RF_omission = ee.ImageCollection(INDEX_output0119)
  .filterMetadata('type', 'equals', 'RF_omission')
  .mosaic();

// ---------------------------------------------------------------
// Stratified random sampling by mapped class
// - numPoints: 0 because we specify classPoints explicitly
// - classValues: mapped class codes
// - classPoints: target number of samples per class
// - geometries: true to keep point geometries in the output FeatureCollection
// ---------------------------------------------------------------
var samplePoints = VIS.RF_omission.stratifiedSample({
  numPoints: 0,
  classBand: 'classification',
  region: region,
  scale: 30,
  classValues: [1, 2, 3, 4, 5],
  classPoints: [515, 75, 75, 75, 50],
  geometries: true,
  seed: 957
});

// ---------------------------------------------------------------
// Optional: randomize order for manual interpretation workflow
// ---------------------------------------------------------------
samplePoints = samplePoints.randomColumn('rand', 192).sort('rand');
print('Sampled points', samplePoints);

// Convert to list for index-based UI navigation
var samplePointsList = samplePoints.toList(samplePoints.size());
var totalCount = samplePoints.size();
print('Total sample count:', totalCount);

// ---------------------------------------------------------------
// UI panel for navigating samples
// - Enter an index, or use Prev/Next/Go
// - The map centers on the selected sample and draws a 30 m square
// - A downloadable KML link is generated for the current sample
// ---------------------------------------------------------------
var panel = ui.Panel({
  layout: ui.Panel.Layout.flow('vertical'),
  style: { width: '300px', position: 'top-left' }
});
Map.add(panel);

// Index input box
var indexInput = ui.Textbox({
  placeholder: 'Index (0 ~ ' + (totalCount.subtract(1).getInfo()) + ')',
  value: '0',
  style: { width: '60px' }
});
panel.add(indexInput);

// Information label (shows current sample ID)
var infoLabel = ui.Label({
  value: 'Sample ID: 0',
  style: { fontSize: '14px', margin: '8px 0 8px 0' }
});
panel.add(infoLabel);

// Global variable to store the current downloadable KML label
var downloadKMLLabel = null;

// ---------------------------------------------------------------
// Navigation buttons
// ---------------------------------------------------------------
var prevButton = ui.Button('Prev', function() {
  var idx = parseInt(indexInput.getValue(), 10);
  if (isNaN(idx)) idx = 0;
  idx--;
  if (idx < 0) idx = 0;
  indexInput.setValue(idx.toString());
  focusFeature(idx);
});
panel.add(prevButton);

var nextButton = ui.Button('Next', function() {
  var idx = parseInt(indexInput.getValue(), 10);
  if (isNaN(idx)) idx = 0;
  idx++;
  var maxIndex = totalCount.subtract(1).getInfo();
  if (idx > maxIndex) idx = maxIndex;
  indexInput.setValue(idx.toString());
  focusFeature(idx);
});
panel.add(nextButton);

var goButton = ui.Button('Go', function() {
  var idx = parseInt(indexInput.getValue(), 10);
  if (isNaN(idx)) idx = 0;
  var maxIndex = totalCount.subtract(1).getInfo();
  if (idx < 0) idx = 0;
  if (idx > maxIndex) idx = maxIndex;
  indexInput.setValue(idx.toString());
  focusFeature(idx);
});
panel.add(goButton);

// ---------------------------------------------------------------
// Focus on a given sample (by index)
// 1) Remove previous 30 m square overlay
// 2) Center map on sample point
// 3) Draw a 30 m square (buffer 15 m in Web Mercator)
// 4) Update label and generate a one-click KML download link
// ---------------------------------------------------------------
function focusFeature(index) {

  // Remove the previously drawn square overlay (if any)
  Map.layers().forEach(function(layer) {
    if (layer.getName() === '30m square') {
      Map.remove(layer);
    }
  });

  // Get the selected sample feature and geometry
  var feature = ee.Feature(samplePointsList.get(index));
  var geom = feature.geometry();

  // Center map on sample location
  Map.centerObject(geom, 17);

  // Create a 30 m square around the point:
  // - transform to EPSG:3857 (meters)
  // - buffer by 15 m radius
  // - bounds() converts buffered circle to a square box
  var square = geom
    .transform('EPSG:3857', 1)
    .buffer(15)
    .bounds();

  Map.addLayer(square, { color: 'red', fillColor: '00000000', strokeWidth: 2 }, '30m square');

  // Update UI label (sample ID)
  feature.get('classification').evaluate(function(val) {
    infoLabel.setValue('Sample ID: ' + index);
  });

  // Remove previous KML download label if it exists
  if (downloadKMLLabel) {
    panel.remove(downloadKMLLabel);
    downloadKMLLabel = null;
  }

  // Build a KML download link on the client side
  // This supports exporting the current sample location for external review/labeling
  feature.evaluate(function(f) {
    var coords = f.geometry.coordinates; // assumes Point geometry
    var lng = coords[0];
    var lat = coords[1];

    var kmlString =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<kml xmlns="http://www.opengis.net/kml/2.2">\n' +
      '  <Placemark>\n' +
      '    <name>Sample_ID_' + index + '</name>\n' +
      '    <Point>\n' +
      '      <coordinates>' + lng + ',' + lat + ',0</coordinates>\n' +
      '    </Point>\n' +
      '  </Placemark>\n' +
      '</kml>';

    var dataUrl = 'data:application/vnd.google-earth.kml+xml;charset=utf-8,' +
      encodeURIComponent(kmlString);

    // Create a clickable download label in the UI
    downloadKMLLabel = ui.Label({
      value: 'Download KML (Sample_ID_' + index + ')',
      style: { color: 'blue', textDecoration: 'underline', margin: '4px 0 4px 0' }
    });
    downloadKMLLabel.setUrl(dataUrl);
    panel.add(downloadKMLLabel);
  });
}

// Initialize at the first sample
focusFeature(0);
