// ============================================================================
// Deforestation Year Map (NDVI tBreak) — Massachusetts
// ----------------------------------------------------------------------------
// Purpose
// - Visualize the year of deforestation using the CCDC NDVI breakpoint year
//   (NDVI_tBreak) for pixels classified as "solar with deforestation" (class=2).
//
// Inputs
// - RF classification map:  type == 'RF_omission2'  (contains 'classification')
// - Change metrics image:   type == 'CHG'           (contains 'NDVI_tBreak', etc.)
//
// Output
// - Map layer: "Deforestation Year" (integer year)
// - Legend: year color ramp (2005–2024)
// - Optional: yearly area chart + Drive export of the year raster
// ============================================================================

// --------------------------- Paths / Region ----------------------------------
var VIS = {};

var INDEX_output0119 = 'projects/kangjoon/assets/MA_Solar/Results/maps_011925';

// Massachusetts boundary (used for display + area stats + export)
var states = ee.FeatureCollection('TIGER/2016/States');
var Mass = states.filter(ee.Filter.eq('NAME', 'Massachusetts'));
var geometry = Mass.geometry();
var scale = 30;

// --------------------------- Load Assets -------------------------------------
// (1) Classification result (contains 'classification')
var rf = ee.ImageCollection(INDEX_output0119)
  .filterMetadata('type', 'equals', 'RF_omission2')
  .mosaic();

// (2) Change metrics (contains NDVI_tBreak among others)
var chg = ee.ImageCollection(INDEX_output0119)
  .filterMetadata('type', 'equals', 'CHG')
  .mosaic();

// Keep only NDVI breakpoint timing (fractional year)
var ndviTbreak = chg.select('NDVI_tBreak');

// --------------------- Build Deforestation Year Layer ------------------------
// Convert NDVI_tBreak to integer year (floor: e.g., 2017.8 -> 2017)
var ndviYearInt = ndviTbreak.floor().int16().rename('NDVI_Year');

// Mask to “solar with deforestation” (class = 2)
var class2Mask = rf.select('classification').eq(2);

// Apply class mask
var ndviYearMasked = ndviYearInt.updateMask(class2Mask);

// --------------------------- Visualization -----------------------------------
// Year range to display
var startYear = 2005;
var endYear = 2024;

// 20-color palette (2005–2024)
var yearColors = [
  '#f0f921', '#f2fc0f', '#f5f414', '#f7e225', '#f8cf3a',
  '#f9bd50', '#f9aa65', '#f99874', '#f98682', '#f9738e',
  '#f96098', '#f74ca0', '#f536a7', '#ef1fad', '#e309b1',
  '#cd02ac', '#b201a3', '#96009a', '#780096', '#5a0091'
];

// Add deforestation year map
Map.centerObject(Mass, 8);
Map.addLayer(ndviYearMasked, {
  min: startYear,
  max: endYear,
  palette: yearColors
}, 'Deforestation Year (NDVI tBreak, class=2)');

// ----------------------------- Legend ----------------------------------------
// Create a year legend (bottom-right)
var legend = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '10px',
    backgroundColor: 'white'
  }
});

legend.add(ui.Label({
  value: 'Deforestation Year',
  style: {fontWeight: 'bold', fontSize: '14px', margin: '0 0 6px 0'}
}));

for (var y = 0; y <= (endYear - startYear); y++) {
  var box = ui.Label({
    style: {backgroundColor: yearColors[y], padding: '8px', margin: '2px'}
  });

  var label = ui.Label({
    value: String(startYear + y),
    style: {margin: '2px 6px'}
  });

  legend.add(ui.Panel([box, label], ui.Panel.Layout.Flow('horizontal')));
}

Map.add(legend);

// ---------------------- Optional: Area by Year + Chart -----------------------
// Pixel-area image (m²)
var pixelArea = ee.Image.pixelArea();

// List of years
var yearList = ee.List.sequence(startYear, endYear);

// Compute area (km²) for each year
var areaStats = ee.FeatureCollection(
  yearList.map(function(year) {
    year = ee.Number(year);
    var yearMask = ndviYearMasked.eq(year);

    var area = pixelArea.updateMask(yearMask).reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: geometry,
      scale: scale,
      maxPixels: 1e13
    }).get('area');

    return ee.Feature(null, {
      year: year,
      area_km2: ee.Number(area).divide(1e6)
    });
  })
);

print('Annual deforestation area (km²):', areaStats);

// Bar chart of annual deforestation area
var chart = ui.Chart.feature.byFeature({
  features: areaStats,
  xProperty: 'year',
  yProperties: ['area_km2']
})
.setChartType('ColumnChart')
.setOptions({
  title: 'Annual Deforestation Area (NDVI tBreak, class=2)',
  hAxis: {title: 'Year', format: '####'},
  vAxis: {title: 'Area (km²)', minValue: 0},
  legend: {position: 'none'},
  colors: yearColors
});

print('NDVI tBreak deforestation area chart', chart);

// Total area across all years (km²)
var totalArea = pixelArea.updateMask(ndviYearMasked).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: geometry,
  scale: scale,
  maxPixels: 1e13
}).get('area');

print('Total deforestation area (km²):', ee.Number(totalArea).divide(1e6));

// ----------------------------- Optional Export -------------------------------
// Export the deforestation-year raster to Google Drive (GeoTIFF)
Export.image.toDrive({
  image: ndviYearMasked,
  description: 'Deforestation_Year_MA_class2',
  folder: 'GEE_Exports',
  fileNamePrefix: 'deforestation_year_MA_class2',
  region: geometry,
  scale: 30,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
