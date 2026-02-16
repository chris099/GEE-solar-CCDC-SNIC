// ============================================================================
// Solar Installation Year Map (Adjusted tBreak) — Massachusetts
// ----------------------------------------------------------------------------
// Purpose
// - Create a “solar installation year” layer from CCDC breakpoint timing.
// - For pixels classified as solar-related (class 2 or 3), use NDVI_tBreak as
//   the default installation timing, but switch to Albedo_tBreak when NDVI
//   appears later than Albedo for class 2.
//   (This handles cases where albedo responds earlier than NDVI during buildout.)
//
// Inputs (from the same output asset collection)
// - RF_omission2 : provides 'classification' band (change strata classes)
// - CHG         : provides 'NDVI_tBreak' and 'Albedo_tBreak'
//
// Output
// - Map layer: "Solar Installation Year" (integer year, 2005–2024)
// - Legend: year color ramp
// - Optional: yearly area chart + Drive export of the year raster
// ============================================================================

// --------------------------- Paths / Region ----------------------------------
var INDEX_output0119 = 'projects/kangjoon/assets/MA_Solar/Results/maps_011925';

// Massachusetts boundary (used for display + area stats + export)
var states = ee.FeatureCollection('TIGER/2016/States');
var Mass = states.filter(ee.Filter.eq('NAME', 'Massachusetts'));
var geometry = Mass.geometry();
var scale = 30;

// --------------------------- Load Assets -------------------------------------
// (1) Classification map (contains 'classification')
var classImg = ee.ImageCollection(INDEX_output0119)
  .filterMetadata('type', 'equals', 'RF_omission2')
  .mosaic();

// (2) Change metrics (contains NDVI_tBreak, Albedo_tBreak)
var chgImg = ee.ImageCollection(INDEX_output0119)
  .filterMetadata('type', 'equals', 'CHG')
  .mosaic();

var classMap = classImg.select('classification');
var ndviT = chgImg.select('NDVI_tBreak');
var albedoT = chgImg.select('Albedo_tBreak');

// --------------------- Build Adjusted Installation Timing --------------------
// Rule:
// - Start with NDVI_tBreak
// - For class == 2 pixels, if NDVI_tBreak > Albedo_tBreak, use Albedo_tBreak
var useAlbedo = classMap.eq(2).and(ndviT.gt(albedoT));
var adjustedTbreak = ndviT.where(useAlbedo, albedoT).rename('adjusted_tBreak');

// Convert fractional year to integer year
var adjustedYear = adjustedTbreak.floor().int16().rename('Solar_Install_Year');

// Mask to solar-related strata (class 2 or 3)
var solarMask = classMap.eq(2).or(classMap.eq(3));
var solarYearMasked = adjustedYear.updateMask(solarMask);

// --------------------------- Visualization -----------------------------------
var startYear = 2005;
var endYear = 2024;

// 20-color palette (2005–2024)
var yearColors = [
  '#440154', '#471063', '#482173', '#46327e', '#414487',
  '#39568c', '#32658e', '#2d718e', '#287d8e', '#23888e',
  '#1f948c', '#20a386', '#2db27d', '#45c06f', '#65cb5e',
  '#84d44b', '#a8db34', '#cae11f', '#eae51a', '#fde725'
];

Map.centerObject(Mass, 8);
Map.addLayer(solarYearMasked, {
  min: startYear,
  max: endYear,
  palette: yearColors
}, 'Solar Installation Year (Adjusted tBreak, class 2|3)');

// ----------------------------- Legend ----------------------------------------
// Year legend (bottom-right)
var legend = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '10px',
    backgroundColor: 'white'
  }
});

legend.add(ui.Label({
  value: 'Solar Installation Year',
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

// Year list
var yearList = ee.List.sequence(startYear, endYear);

// Compute area (km²) for each year
var areaStats = ee.FeatureCollection(
  yearList.map(function(year) {
    year = ee.Number(year);
    var yearMask = solarYearMasked.eq(year);

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

print('Annual solar installation area (km²):', areaStats);

// Bar chart
var chart = ui.Chart.feature.byFeature({
  features: areaStats,
  xProperty: 'year',
  yProperties: ['area_km2']
})
.setChartType('ColumnChart')
.setOptions({
  title: 'Annual Solar Installation Area (Adjusted tBreak, class 2|3)',
  hAxis: {title: 'Year', format: '####'},
  vAxis: {title: 'Area (km²)', minValue: 0},
  legend: {position: 'none'},
  colors: yearColors
});

print('Solar installation area chart', chart);

// Total area across all years (km²)
var totalArea = pixelArea.updateMask(solarYearMasked).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: geometry,
  scale: scale,
  maxPixels: 1e13
}).get('area');

print('Total solar area (km²):', ee.Number(totalArea).divide(1e6));

// ----------------------------- Optional Export -------------------------------
// Export the solar-installation-year raster to Google Drive
var solarYearExport = solarYearMasked.updateMask(solarYearMasked.neq(0));
