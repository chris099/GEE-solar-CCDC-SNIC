// ---------------------------------------------------------------
// Sample Interpreter for Accuracy Assessment (Manual Reference Labeling)
// Author: Kangjoon Cho
//
// Purpose of this script:
// 1) Draw a stratified random sample from the final RF map (RF_omission)
// 2) Provide an interactive UI to navigate samples (Prev / Next / Go)
// 3) For each sample point:
//    - center the map and draw a 30 m square footprint
//    - show Landsat/CCDC-based time series chart at that location
//    - allow the interpreter to record reference labels + dates + confidence
// 4) Save interpretation results as asset-level metadata (per-sample assets)
//
// Intended use in the manuscript workflow:
// - Human interpretation of stratified validation samples
// - Reference labeling for confusion matrix and design-based unbiased area estimation
// ---------------------------------------------------------------


// sample intepreter


// ---------------------------------------------------------------
// Dependencies (custom utilities + UI helpers + palettes)
// ---------------------------------------------------------------
var utils = require('users/kangjoon/Fall2021:utilities/api');
var uiUtils = require('users/kangjoon/Fall2021:utilities/ui');
var palettes = require('users/gena/packages:palettes');


// ---------------------------------------------------------------
// Global state containers
// ---------------------------------------------------------------
var ccdParams = {};
var runParams = {};
var vizParams = {};
var GLOBAL = {};
var app = {};

// Dictionary-like objects used throughout UI callbacks
var PROPS = {};
var VIS = {};
var FILTER = {};


// ---------------------------------------------------------------
// Study region: Massachusetts boundary (used for sampling + display)
// ---------------------------------------------------------------
var states = ee.FeatureCollection('TIGER/2016/States');
var Mass = states.filter(ee.Filter.eq('NAME','Massachusetts'));
var geometry = Mass.geometry();
var region = geometry;
var scale = 30;
var areaID = 'MA';


// ---------------------------------------------------------------
// Interpreter asset folders
// wd: source assets (base sample assets)
// sd: destination assets (copied assets with updated metadata)
// ---------------------------------------------------------------
var wd = 'projects/kangjoon/assets/MA_Solar/Reference/Interpreter/';
var sd = 'projects/kangjoon/assets/MA_Solar/Reference/Interpreter2/';


// ---------------------------------------------------------------
// Output folder containing RF products
// ---------------------------------------------------------------
var INDEX_output0119 = 'projects/kangjoon/assets/MA_Solar/Results/maps_011925';


// ---------------------------------------------------------------
// Load RF classification map used for sampling
// (type='RF_omission' assumed to contain a band named 'classification')
// ---------------------------------------------------------------
VIS.RF_omission = ee.ImageCollection(INDEX_output0119)
  .filterMetadata('type', 'equals', 'RF_omission')
  .mosaic();


// ---------------------------------------------------------------
// Stratified sampling by mapped class (design-based validation sampling)
// - classValues / classPoints define per-class allocation
// - geometries=true keeps point geometry in output
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
// Optional: randomize sample order for interpretation workflow
// ---------------------------------------------------------------
samplePoints = samplePoints.randomColumn('rand', 192).sort('rand');

var samplePointsList = samplePoints.toList(samplePoints.size());
var totalCount = samplePoints.size();


// ---------------------------------------------------------------
// Visualization presets used by ancillary layers and QA
// (values depend on scaling conventions of upstream products)
// ---------------------------------------------------------------
VIS.visParam = {bands: ['High','Vege','Low'], min: 0, max: 1000};

VIS.visParam_testMax = {bands: ['Vege_DIF','Albedo_DIF','TEMP_DIF'], min: -1000, max: 1000};
VIS.visParam_test = {bands: ['Filter2'], min: 0, max: 1};
VIS.visParam_test2 = {bands: ['Final_NDVI','Final_NDTI','Final_BSI'], min: -1000, max: 1000};
VIS.visParam_SNIC = {bands: ['Albedo_DIF_mean','NDVI_DIF_mean','NDTI_DIF_mean'], min: -1000, max: 1000};
VIS.visParam_CCDC = {bands: ['Albedo_magnitude','NDVI_magnitude','NDTI_magnitude'], min: -1000, max: 1000};


// ---------------------------------------------------------------
// Landsat collections metadata (for TS viewer configuration)
// ---------------------------------------------------------------
var landsatCollections = {
  "Landsat C2": 2,
};


// ---------------------------------------------------------------
// CCDC coefficient naming conventions
// ---------------------------------------------------------------
GLOBAL.SUBCOEFS = ["INTP", "SLP", "COS", "SIN", "COS2", "SIN2", "COS3", "SIN3"];
GLOBAL.COEFS = GLOBAL.SUBCOEFS.concat("RMSE");
GLOBAL.FULLCOEFS = GLOBAL.COEFS.concat(['PHASE', 'AMPLITUDE', 'PHASE2', 'AMPLITUDE2', 'PHASE3', 'AMPLITUDE3']);

// Segment labels used by buildCcdImage / synthetic functions
GLOBAL.SEGS = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"];


// ---------------------------------------------------------------
// Optional global grids and region list (not essential for interpreter UI)
// ---------------------------------------------------------------
GLOBAL.GRIDS = ee.FeatureCollection('projects/GLANCE/GRIDS/GEOG_LAND/GLANCE_Classification_GRID_5count');
GLOBAL.REGIONS = ['Select Region','AF','AN','AS','EU','NA','OC','SA'];


// ---------------------------------------------------------------
// Time series viewer configuration
// - INDICES are used as input bands for TS plots and CCDC inspection
// ---------------------------------------------------------------
var INDICES = ['NDVI', 'NDBI', 'NDTI', 'BSI', 'TEMP', 'Albedo'];
var BANDS = ['BLUE','GREEN','RED', 'NIR', 'SWIR1', 'SWIR2'];
var FULLBANDS = INDICES;

var BPBANDS = ['GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2'];
var TMBANDS = ['GREEN', 'SWIR2'];
var dateFormat = 1;


// ---------------------------------------------------------------
// Custom color palettes used by legends and date layers
// ---------------------------------------------------------------
var PALETTES = {};
PALETTES.CHANGE = ['#67001f','#b2182b','#d6604d','#f4a582','#fddbc7','#f7f7f7',
    '#d1e5f0','#92c5de','#4393c3','#2166ac','#053061'];
PALETTES.DATE = ['#ffffcc','#ffeda0','#fed976','#feb24c','#fd8d3c','#fc4e2a',
    '#e31a1c','#bd0026','#800026'];
PALETTES.COUNT = ['#ffffd9','#edf8b1','#c7e9b4','#7fcdbb','#41b6c4','#1d91c0',
    '#225ea8','#253494','#081d58'];


// ---------------------------------------------------------------
// UI styling helpers
// ---------------------------------------------------------------
var visLabels = {
  fontWeight: 'bold',
  fontSize: '14px',
  padding: '4px 4px 4px 4px',
  border: '1px solid black',
  color: 'white',
  backgroundColor: 'black',
  textAlign: 'left',
  stretch: 'horizontal'
};

var horizontalStyle = {stretch: 'horizontal', width: '100%'};
GLOBAL.CCDCPARAMS = [];


// ---------------------------------------------------------------
// LOAD: Read CCDC results (image collection) and infer basic metadata
// - Also extracts available coefficient band names
// ---------------------------------------------------------------
var doLoad = function(obj){

  PROPS.pathType = 'Image Collection';
  PROPS.dataPath = 'projects/kangjoon/assets/MA_Solar/Trial_040224/CCDC_Solar_2024';
  PROPS.filterVal = '';

  // Load results and identify a representative image for metadata inspection
  if (PROPS.pathType == 'Image') {
    PROPS.results = ee.Image(PROPS.dataPath);
    var tempImg = ee.Image(PROPS.dataPath);

  } else {
    PROPS.results = ee.ImageCollection(PROPS.dataPath)
      .filterMetadata('system:index', 'starts_with', PROPS.filterVal);

    var tempImg = PROPS.results.first();
    PROPS.results = PROPS.results.mosaic();
  }

  // Read image properties to infer date format and time bounds
  tempImg.toDictionary().evaluate(function(dict){
    PROPS.dateFormat = dict['dateFormat'];
    PROPS.startDate = dict['startDate'];
    PROPS.endDate = dict['endDate'];

    // Human-readable date format label (for UI display)
    var dateFormatString;
    if (PROPS.dateFormat === null){
      dateFormatString = 'UNKNOWN';
    } else if (PROPS.dateFormat == 0){
      dateFormatString = 'Julian days (code 0)';
    } else if (PROPS.dateFormat == 1){
      dateFormatString = 'Fractional years (code 1)';
    } else if (PROPS.dateFormat == 2){
      dateFormatString = 'Unix time in ms (code 2)';
    } else {
      // Default fallback
      dateFormatString = PROPS.dateFormat;
      PROPS.dateFormat = 1;
    }
  });

  // Extract coefficient band names (prefix before "_coefs")
  PROPS.bands = PROPS.results.select(".*_coefs")
    .bandNames()
    .map(function(x){
      return ee.String(x).split('_').get(0);
    });
};

doLoad();


// ---------------------------------------------------------------
// SYNTHETIC IMAGE: Generate and display synthetic CCDC prediction for a date
// ---------------------------------------------------------------
var doCreateSynt = function(obj){

  // Bands selected from UI widget
  PROPS.bandList = app.synt.synthPanel.widgets().get(2).widgets().get(1).items().getJsArray();

  // Visualization parameters from UI
  PROPS.predDate = app.synt.dateBox.widgets().get(1).getValue();
  PROPS.R = app.synt.synthPanel.widgets().get(2).widgets().get(1).getValue();
  PROPS.G = app.synt.synthPanel.widgets().get(3).widgets().get(1).getValue();
  PROPS.B = app.synt.synthPanel.widgets().get(4).widgets().get(1).getValue();
  PROPS.stretchMin = app.synt.minBox.widgets().get(1).getValue();
  PROPS.stretchMax = app.synt.maxBox.widgets().get(1).getValue();

  // Build CCDC coefficient image for selected bands
  var ccdImage = utils.CCDC.buildCcdImage(PROPS.results, GLOBAL.SEGS.length, PROPS.bandList);

  // Convert input date string to formatted CCDC date
  var dateParams = {inputFormat: 3, inputDate: PROPS.predDate, outputFormat: 1};
  var formattedDate = utils.Dates.convertDate(dateParams);

  // Generate synthetic image and add to map
  var synthetic = utils.CCDC.getMultiSynthetic(ccdImage, formattedDate, PROPS.dateFormat, PROPS.bandList, GLOBAL.SEGS);

  app.main.mapPanel.addLayer({
    eeObject: synthetic,
    visParams: {bands:[PROPS.R, PROPS.G, PROPS.B], min:PROPS.stretchMin, max: PROPS.stretchMax},
    name: 'Synthetic ' + PROPS.predDate
  });
};


// ---------------------------------------------------------------
// COEFFICIENT VIEW: Visualize CCDC coefficients or phase/amplitude products
// ---------------------------------------------------------------
var doShowCoefs = function(obj){

  // Band list from UI
  PROPS.bandList = app.coefs.coefPanel.widgets().get(3).widgets().get(0).items().getJsArray();

  // Date and display mode from UI
  PROPS.coefDate = app.coefs.coefsDateBox.widgets().get(1).getValue();
  PROPS.singleCoefMode = app.coefs.coefPanel.widgets().get(2).widgets().get(0).getValue();

  // RGB coefficient specification from UI
  PROPS.REDcoefBand = app.coefs.coefPanel.widgets().get(3).widgets().get(0).getValue();
  PROPS.REDcoefCoef = app.coefs.coefPanel.widgets().get(3).widgets().get(1).getValue();
  PROPS.REDmin = parseFloat(app.coefs.coefPanel.widgets().get(3).widgets().get(2).getValue());
  PROPS.REDmax = parseFloat(app.coefs.coefPanel.widgets().get(3).widgets().get(3).getValue());

  PROPS.GREENcoefBand = app.coefs.coefPanel.widgets().get(4).widgets().get(0).getValue();
  PROPS.GREENcoefCoef = app.coefs.coefPanel.widgets().get(4).widgets().get(1).getValue();
  PROPS.GREENmin = parseFloat(app.coefs.coefPanel.widgets().get(4).widgets().get(2).getValue());
  PROPS.GREENmax = parseFloat(app.coefs.coefPanel.widgets().get(4).widgets().get(3).getValue());

  PROPS.BLUEcoefBand = app.coefs.coefPanel.widgets().get(5).widgets().get(0).getValue();
  PROPS.BLUEcoefCoef = app.coefs.coefPanel.widgets().get(5).widgets().get(1).getValue();
  PROPS.BLUEmin = parseFloat(app.coefs.coefPanel.widgets().get(5).widgets().get(2).getValue());
  PROPS.BLUEmax = parseFloat(app.coefs.coefPanel.widgets().get(5).widgets().get(3).getValue());

  // Build coefficient image
  var ccdImage = utils.CCDC.buildCcdImage(PROPS.results, GLOBAL.SEGS.length, PROPS.bandList);

  // Convert date
  var dateParams = {inputFormat: 3, inputDate: PROPS.coefDate, outputFormat: 1};
  var formattedDate = utils.Dates.convertDate(dateParams);

  // Extract coefficients and derive phase/amplitude
  var coefs = utils.CCDC.getMultiCoefs(ccdImage, formattedDate, PROPS.bandList, GLOBAL.COEFS, true, GLOBAL.SEGS, 'after');
  var phaseAmpl = utils.CCDC.newPhaseAmplitude(coefs, '.*SIN.*', '.*COS.*');
  var selectedCoef = coefs.addBands(phaseAmpl);

  var REDcoef = PROPS.REDcoefBand + '_' + PROPS.REDcoefCoef;
  var GREENcoef = PROPS.GREENcoefBand + '_' + PROPS.GREENcoefCoef;
  var BLUEcoef = PROPS.BLUEcoefBand + '_' + PROPS.BLUEcoefCoef;

  // Single-band or RGB view
  if (PROPS.singleCoefMode == true){

    var coefLabel = REDcoef + ' ' + PROPS.coefDate;

    app.main.mapPanel.addLayer({
      eeObject: selectedCoef,
      visParams: {bands: [REDcoef], min:PROPS.REDmin, max: PROPS.REDmax, palette: palettes.matplotlib.viridis[7]},
      name: coefLabel
    });

    var legend = uiUtils.generateColorbarLegend(PROPS.REDmin, PROPS.REDmax, palettes.matplotlib.viridis[7], 'horizontal', coefLabel);
    app.main.mapPanel.add(legend);

  } else {

    app.main.mapPanel.addLayer({
      eeObject: selectedCoef,
      visParams: {
        bands: [REDcoef, GREENcoef, BLUEcoef],
        min:[PROPS.REDmin, PROPS.GREENmin, PROPS.BLUEmin],
        max:[PROPS.REDmax, PROPS.GREENmax, PROPS.BLUEmax]
      },
      name: REDcoef + ' ' + GREENcoef + ' ' + BLUEcoef + PROPS.coefDate
    });
  }
};


// ---------------------------------------------------------------
// CHANGE VIEW: Load change magnitude / timing / counts for a date range
// ---------------------------------------------------------------
var doLoadChg = function(){

  PROPS.bandList = app.change.changePanel.widgets().get(3).widgets().get(1).items().getJsArray();

  PROPS.changeStart = app.change.sDate.widgets().get(1).getValue();
  PROPS.changeEnd = app.change.eDate.widgets().get(1).getValue();
  PROPS.chgBand = app.change.changePanel.widgets().get(3).widgets().get(1).getValue();
  PROPS.minMagVal = app.change.changePanel.widgets().get(4).widgets().get(1).getValue();
  PROPS.maxMagVal = app.change.changePanel.widgets().get(5).widgets().get(1).getValue();
  PROPS.chgLayer = app.change.changePanel.widgets().get(6).widgets().get(1).getValue();

  // Convert date bounds to formatted fractional years
  var startParams = {inputFormat: 3, inputDate: PROPS.changeStart, outputFormat: 1};
  var endParams = {inputFormat: 3, inputDate: PROPS.changeEnd, outputFormat: 1};
  var formattedStart = utils.Dates.convertDate(startParams).getInfo();
  var formattedEnd = utils.Dates.convertDate(endParams).getInfo();

  // Build coefficient image
  var ccdImage = utils.CCDC.buildCcdImage(PROPS.results, GLOBAL.SEGS.length, PROPS.bandList);

  // Compute filtered magnitude products for the period
  var filteredMags = utils.CCDC.filterMag(ccdImage, formattedStart, formattedEnd, PROPS.chgBand, GLOBAL.SEGS);

  // Display the selected change layer
  if (PROPS.chgLayer === null){
    print("Select a change layer");

  } else if (PROPS.chgLayer === 'Max change magnitude'){

    var maxMagLabel = "Max magnitude of change " + PROPS.changeStart + '---' + PROPS.changeEnd;

    app.main.mapPanel.addLayer({
      eeObject: filteredMags.select('MAG'),
      visParams: {palette:palettes.matplotlib.viridis[7], min: PROPS.minMagVal, max: PROPS.maxMagVal},
      name: maxMagLabel
    });

    var legend = uiUtils.generateColorbarLegend(PROPS.minMagVal, PROPS.maxMagVal, palettes.matplotlib.viridis[7], 'horizontal', maxMagLabel);

  } else if (PROPS.chgLayer == 'Time of max magnitude'){

    var maxMagTimeLabel = "Time of max magnitude " + PROPS.changeStart + '---' + PROPS.changeEnd;

    app.main.mapPanel.addLayer({
      eeObject: filteredMags.select('tBreak'),
      visParams: {palette:PALETTES.DATE, min: formattedStart, max:formattedEnd},
      name: maxMagTimeLabel
    });

    var legend = uiUtils.generateColorbarLegend(formattedStart, formattedEnd, PALETTES.DATE, 'horizontal', maxMagTimeLabel);

  } else if (PROPS.chgLayer == 'Number of changes'){

    var minChanges = 0;
    var maxChanges = 10;
    var maxChangesLabel = "Number of breaks " + PROPS.changeStart + '---' + PROPS.changeEnd;

    app.main.mapPanel.addLayer({
      eeObject: filteredMags.select('numTbreak'),
      visParams: {palette:palettes.colorbrewer.YlOrRd[9], min:minChanges, max:maxChanges},
      name: maxChangesLabel
    });

    var legend = uiUtils.generateColorbarLegend(minChanges, maxChanges, palettes.colorbrewer.YlOrRd[9], 'horizontal', maxChangesLabel);

  } else {
    print("Unspecified error");
  }

  app.main.mapPanel.add(legend);
};


// ---------------------------------------------------------------
// FIRST/LAST CHANGE LAYERS: convenience layers for CCDC breakpoint timing
// ---------------------------------------------------------------
var doLoadFirstChg = function(){
  var firstChg = PROPS.results.select('tBreak')
    .arrayReduce(ee.Reducer.first(), [0])
    .arrayFlatten([['first']])
    .selfMask();

  var dateParams = {inputFormat: 3, inputDate: PROPS.startDate, outputFormat: 1};
  var dateParams2 = {inputFormat: 3, inputDate: PROPS.endDate, outputFormat: 1};

  var formattedDate = utils.Dates.convertDate(dateParams);
  var formattedDate2 = utils.Dates.convertDate(dateParams2);

  formattedDate.evaluate(function(x){
    formattedDate2.evaluate(function(y){
      app.main.mapPanel.addLayer(firstChg, {palette: PALETTES.DATE, min:x, max:y}, 'First change');
      var legend = uiUtils.generateColorbarLegend(x, y, PALETTES.DATE, 'horizontal', 'Date of first change');
      app.main.mapPanel.add(legend);
    });
  });
};

var doLoadLastChg = function(){
  var lastChg = PROPS.results.select('tBreak')
    .arrayReduce(ee.Reducer.max(), [0])
    .arrayFlatten([['last']])
    .selfMask();

  var dateParams = {inputFormat: 3, inputDate: PROPS.startDate, outputFormat: 1};
  var dateParams2 = {inputFormat: 3, inputDate: PROPS.endDate, outputFormat: 1};

  var formattedDate = utils.Dates.convertDate(dateParams);
  var formattedDate2 = utils.Dates.convertDate(dateParams2);

  formattedDate.evaluate(function(x){
    formattedDate2.evaluate(function(y){
      app.main.mapPanel.addLayer(lastChg, {palette: PALETTES.DATE, min:x, max:y}, 'Last change');
      var legend = uiUtils.generateColorbarLegend(x, y, PALETTES.DATE, 'horizontal', 'Date of last change');
      app.main.mapPanel.add(legend);
    });
  });
};


// ---------------------------------------------------------------
// Map click callback: update selected band for TS chart (from UI widget)
// ---------------------------------------------------------------
function mapCallback(){
  runParams.bandSelect = app.ccd.bandSelector.widgets().get(1).getValue();
}


// ---------------------------------------------------------------
// Default CCDC and visualization parameters for TS chart panel
// ---------------------------------------------------------------
ccdParams.breakpointBands = ['NDVI', 'NDBI', 'NDTI', 'BSI', 'TEMP', 'Albedo'];
ccdParams.dateFormat = 1;
ccdParams.lambda = 5;
ccdParams.maxIterations = 25000;
ccdParams.minObservations = 6;
ccdParams.chiSquareProbability = 0.99;

runParams.landsatCol = 2;
runParams.sDate = '2005-01-01';
runParams.eDate = '2025-01-01';
runParams.nSegs = 10;

vizParams.tsType = "Time series";
vizParams.red = "NDVI";
vizParams.green = "NDTI";
vizParams.blue = "BSI";
vizParams.redMin = 0;
vizParams.greenMin = 0;
vizParams.blueMin = 0;
vizParams.redMax = 0.15;
vizParams.greenMax = 0.15;
vizParams.blueMax = 0.15;


// ---------------------------------------------------------------
// Ancillary data loader (optional)
// Adds background layers to help interpretation:
// - CCDC products, SNIC index, RF map, peak-year values, MASSGIS reference
// ---------------------------------------------------------------
function loadAncillary(){

  var INDEX_CCDC_path = 'projects/kangjoon/assets/MA_Solar/Trial_040224/CCDC_Solar_2024';
  var INDEX_output = 'projects/kangjoon/assets/MA_Solar/Trial_040224/MA_SNIC_comparison_INDEX';
  var OMISSION_LASTYR = 'projects/kangjoon/assets/MA_Solar/Results/maps_omission';

  VIS.INDEXCCDC = ee.ImageCollection(INDEX_CCDC_path).mosaic();

  VIS.SNICINDEX = ee.ImageCollection(INDEX_output)
    .filterMetadata('type', 'equals', 'SNIC1')
    .mosaic();

  VIS.INDEXRF = ee.ImageCollection(INDEX_output)
    .filterMetadata('type', 'equals', 'RF1_adj')
    .mosaic();

  VIS.PEAK = ee.ImageCollection(OMISSION_LASTYR)
    .filterMetadata('type', 'equals', 'LASRYR')
    .mosaic();

  var assetPath2 = 'projects/kangjoon/assets/MA_Solar/Solar_MAGIS_Ref';
  var Solarref2 = ee.FeatureCollection(assetPath2);

  app.main.mapPanel.addLayer({eeObject: VIS.INDEXCCDC, visParams: VIS.visParam_CCDC, name: '1. CCDC'});
  app.main.mapPanel.addLayer({eeObject: VIS.SNICINDEX, name: '2. SNIC_CCDC'});
  app.main.mapPanel.addLayer({eeObject: VIS.INDEXRF, visParams: {min: 1, max: 3, palette: ['black', 'green', 'blue']}, name: '3. Classified Change Map_Pixel'});
  app.main.mapPanel.addLayer({eeObject: VIS.PEAK, visParams: VIS.visParam_test2, name: '4. Last year peak summer value'});
  app.main.mapPanel.addLayer(Solarref2, {color:'#BF40BF'}, "5. MASSGIS_Reference");
}


// ---------------------------------------------------------------
// Lat/Lon navigation helper: add point and center map
// ---------------------------------------------------------------
function doGoLatLon(){
  var lat = app.misc.lat.widgets().get(1).getValue();
  var lon = app.misc.lon.widgets().get(1).getValue();
  var label = "Lat: " + lat + " Lon: " + lon;
  var point = ee.Geometry.Point([parseFloat(lon), parseFloat(lat)]);
  app.main.mapPanel.addLayer(point, {}, label);
  app.main.mapPanel.centerObject(point, 14);
}


// ---------------------------------------------------------------
// UI Construction
// Builds:
// - Map panel (left/center) + time series chart panel
// - Sample selector panel (navigate stratified samples)
// - Interpreter panel (enter reference labels/dates/confidence and save)
// ---------------------------------------------------------------
var initApp = function(){
  ui.root.clear();

  // Initialize panel namespaces
  app.main = [];
  app.loader = [];
  app.TS = [];
  app.synt = [];
  app.coefs = [];
  app.change = [];
  app.export = [];
  app.ccd = [];
  app.SS = [];     // Sample selection widgets
  app.IP = [];     // Interpreter widgets
  app.viz = [];
  app.misc = [];

  // Main UI containers
  app.main.mainPanel = ui.Panel();
  app.main.mapPanel = ui.Map({onClick: mapCallback, style: {height: '80%', cursor: 'crosshair'}});
  app.main.mapPanel.setOptions('HYBRID');
  app.main.mapPanel.setControlVisibility({zoomControl:false, layerList:true});

  // -------------------------------------------------------------
  // LOAD PANEL: points to CCDC results and fetches metadata
  // -------------------------------------------------------------
  app.loader.imOrCol = ui.Panel(
    [
      ui.Label({value:'Image or Collection?', style:{stretch: 'horizontal', color:'black'}}),
      ui.Select({items: ['Image', 'Image Collection'], value: 'Image Collection', style:{stretch: 'horizontal'}})
    ],
    ui.Panel.Layout.Flow('horizontal'),
    horizontalStyle
  );

  app.loader.coefImage = ui.Panel(
    [
      ui.Label({value:'CCDC coefficients', style:{stretch: 'horizontal', color:'black'}}),
      ui.Textbox({value:'projects/kangjoon/assets/MA_Solar/Trial_040224/CCDC_Solar_2024', style:{stretch: 'horizontal'}})
    ],
    ui.Panel.Layout.Flow('horizontal'),
    horizontalStyle
  );

  app.loader.filterBox = ui.Panel(
    [
      ui.Label({value:'Filter CCDC run', style:{stretch: 'horizontal', color:'black'}}),
      ui.Textbox({value:'', style:{stretch: 'horizontal'}})
    ],
    ui.Panel.Layout.Flow('horizontal'),
    horizontalStyle
  );

  app.loader.infoBox = ui.Panel(
    [
      ui.Label({value:'Available bands are: ', style: {stretch: 'both'}}),
      ui.Label({value: 'Suspected date format is: ', style:{stretch: 'both'}})
    ],
    ui.Panel.Layout.Flow('vertical'),
    horizontalStyle
  );

  app.loader.loadButton = ui.Button({label:'Load image', style: {width: '95%'}, onClick: doLoad});


  // -------------------------------------------------------------
  // BAND SELECTOR: used by TS chart callback
  // -------------------------------------------------------------
  app.ccd.bandSelector = ui.Panel(
    [
      ui.Label({value: 'Select band', style:{stretch: 'horizontal', color:'black'}}),
      ui.Select({items: FULLBANDS, value: 'NDVI', style:{stretch: 'horizontal'}})
    ],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );


  // -------------------------------------------------------------
  // CCDC PARAMETER CONTROLS (for TS chart configuration)
  // -------------------------------------------------------------
  app.ccd.sDate = ui.Panel(
    [ui.Label({value:'Start date' , style:{stretch: 'horizontal',color:'black'}}),
     ui.Textbox({value:'2000-01-01', style:{stretch: 'horizontal'}})],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );

  app.ccd.eDate = ui.Panel(
    [ui.Label({value:'End date' , style:{stretch: 'horizontal',color:'black'}}),
     ui.Textbox({value:'2023-01-01', style:{stretch: 'horizontal'}})],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );

  app.ccd.lambda = ui.Panel(
    [ui.Label({value:'Lambda', style:{stretch: 'horizontal',color:'black'}}),
     ui.Textbox({value: 0.002, style:{stretch: 'horizontal'}})],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );

  app.ccd.maxIter = ui.Panel(
    [ui.Label({value:'Max iterations', style:{stretch: 'horizontal',color:'black'}}),
     ui.Textbox({value: 10000, style:{stretch: 'horizontal'}})],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );

  app.ccd.minObs = ui.Panel(
    [ui.Label({value:'Min observations', style:{stretch: 'horizontal',color:'black'}}),
     ui.Textbox({value: 6, style:{stretch: 'horizontal'}})],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );

  app.ccd.chiSq = ui.Panel(
    [ui.Label({value:'Chi square prob', style:{stretch: 'horizontal',color:'black'}}),
     ui.Textbox({value: 0.99, style:{stretch: 'horizontal'}})],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );

  app.ccd.minYears = ui.Panel(
    [ui.Label({value:'Min years scaler', style:{stretch: 'horizontal',color:'black'}}),
     ui.Textbox({value: 1.33, style:{stretch: 'horizontal'}})],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );

  app.ccd.collectionSelector = ui.Panel(
    [ui.Label({value: 'Select collection', style:{stretch: 'horizontal', color:'black'}}),
     ui.Select({items: ['Landsat C2'], value: 'Landsat C2', style:{stretch: 'horizontal'}})],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );


  // -------------------------------------------------------------
  // VIZ PARAMS: chart type, number of segments, RGB bands and stretch
  // -------------------------------------------------------------
  app.viz.tsType = ui.Panel(
    [ui.Label({value: 'Chart type', style:{stretch: 'horizontal', color:'black'}}),
     ui.Select({items: ['Time series', 'DOY'], value: 'Time series', style:{stretch: 'horizontal'}})],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );

  app.viz.nSegs = ui.Panel(
    [ui.Label({value:'Num segments' , style:{stretch: 'horizontal',color:'black'}}),
     ui.Textbox({value:6, style:{stretch: 'horizontal'}})],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );

  // Helper to generate RGB band panels with min/max textboxes
  var coefBandPanelGenerator = function(){ return ui.Panel([
      ui.Select({items:FULLBANDS, style:{stretch: 'horizontal'}}),
      ui.Textbox({value: 0, style:{stretch: 'horizontal'}}),
      ui.Textbox({value: 0.6, style:{stretch: 'horizontal'}})
    ],
    ui.Panel.Layout.Flow('horizontal'),
    horizontalStyle
  );};

  app.viz.redBox = coefBandPanelGenerator();
  app.viz.greenBox = coefBandPanelGenerator();
  app.viz.blueBox = coefBandPanelGenerator();

  app.viz.redBox.widgets().get(0).setValue('NDVI');
  app.viz.greenBox.widgets().get(0).setValue('NDTI');
  app.viz.blueBox.widgets().get(0).setValue('BSI');


  // -------------------------------------------------------------
  // Ancillary data loader + map utilities
  // -------------------------------------------------------------
  app.misc.loadButton = ui.Button({label:'Load asset', style: {width: '95%'}, onClick: loadAncillary});


  // -------------------------------------------------------------
  // Sample selector widgets (index-based navigation)
  // -------------------------------------------------------------
  app.SS.indexInput = ui.Textbox({
    placeholder: 'Sample ID: (0 ~ ' + (totalCount.subtract(1).getInfo()) + ')',
    value: '0',
    style: { width: '60px' }
  });

  app.SS.infoLabel = ui.Label({
    value: 'Sample ID: 0',
    style: { fontSize: '14px', margin: '8px 0 8px 0' }
  });

  // downloadKMLLabel is attached dynamically per sample
  var downloadKMLLabel = null;

  // Prev/Next/Go buttons update index and call focusFeature()
  app.SS.prevButton = ui.Button('Prev', function() {
    var idx = parseInt(indexInput.getValue(), 10);
    if (isNaN(idx)) idx = 0;
    idx--;
    if (idx < 0) idx = 0;
    indexInput.setValue(idx.toString());
    focusFeature(idx);
  });

  app.SS.nextButton = ui.Button('Next', function() {
    var idx = parseInt(app.SS.indexInput.getValue(), 10);
    if (isNaN(idx)) idx = 0;
    idx++;
    var maxIndex = totalCount.subtract(1).getInfo();
    if (idx > maxIndex) idx = maxIndex;
    app.SS.indexInput.setValue(idx.toString());
    focusFeature(idx);
  });

  app.SS.goButton = ui.Button('Go', function() {
    var idx = parseInt(app.SS.indexInput.getValue(), 10);
    if (isNaN(idx)) idx = 0;
    var maxIndex = totalCount.subtract(1).getInfo();
    if (idx < 0) idx = 0;
    if (idx > maxIndex) idx = maxIndex;
    app.SS.indexInput.setValue(idx.toString());
    focusFeature(idx);
  });


  // -------------------------------------------------------------
  // Load previously saved interpretation fields from asset metadata
  // Each sample has a corresponding asset (sd + areaID + '_' + idx)
  // -------------------------------------------------------------
  function loadProperties(idx) {
    var assetPath = sd + areaID + '_' + idx;
    var fc = ee.FeatureCollection(assetPath);
    var feature = fc.first();

    feature.evaluate(function(f) {
      if (!f) {
        print('No Feature found at idx=' + idx);
        return;
      }

      // Populate interpreter UI fields from stored properties
      var props = f.properties;

      app.IP.yearBox.setValue(props.D_year);
      app.IP.monthBox.setValue(props.D_month);
      app.IP.dayBox.setValue(props.D_day);
      app.IP.yearBox2.setValue(props.S_year);
      app.IP.monthBox2.setValue(props.S_month);
      app.IP.dayBox2.setValue(props.S_day);
      app.IP.changeSelect.setValue(props.change);
      app.IP.chgConfSelect.setValue(props.chgconf);
      app.IP.dateConfSelect.setValue(props.dateconf);
      app.IP.noteBox.setValue(props.note1);
      app.IP.noteBox2.setValue(props.note2);
    });
  }

  // Same idea as above, but reads asset-level metadata directly
  function loadPropertiesFromMetadata(idx) {
    var targetPath = sd + areaID + '_' + idx;

    ee.data.getAsset(targetPath, function(assetInfo) {
      if (!assetInfo || !assetInfo.properties) {
        print('No asset metadata found at idx=' + idx);
        return;
      }

      var props = assetInfo.properties;

      // Populate interpreter UI with saved values (fallback defaults if missing)
      app.IP.yearBox.setValue(props.D_year || '0');
      app.IP.monthBox.setValue(props.D_month || '0');
      app.IP.dayBox.setValue(props.D_day || '0');
      app.IP.yearBox2.setValue(props.S_year || '0');
      app.IP.monthBox2.setValue(props.S_month || '0');
      app.IP.dayBox2.setValue(props.S_day || '0');
      app.IP.changeSelect.setValue(props.change || 'NA');
      app.IP.chgConfSelect.setValue(props.chgconf || 'High');
      app.IP.dateConfSelect.setValue(props.dateconf || 'High');
      app.IP.noteBox.setValue(props.note1 || '');
      app.IP.noteBox2.setValue(props.note2 || '');
    });
  }


  // -------------------------------------------------------------
  // Focus on a selected sample point:
  // 1) Clear map layers
  // 2) Center map on the point and draw a 30 m square footprint
  // 3) Update the TS chart panel for that location
  // 4) Create a KML download link for the current point
  // 5) Load previously saved interpreter fields from metadata
  // -------------------------------------------------------------
  function focusFeature(index) {

    // Clear existing layers for a clean view per sample
    app.main.mapPanel.layers().reset();

    var feature = ee.Feature(samplePointsList.get(index));
    var geom = feature.geometry();

    // Center map on the sample location
    app.main.mapPanel.centerObject(geom, 17);

    // 30 m square footprint around point (buffer 15 m in meters)
    var square = geom
      .transform('EPSG:3857', 1)
      .buffer(15)
      .bounds();

    app.main.mapPanel.addLayer(square, { color: 'red', fillColor: '00000000', strokeWidth: 2 }, '30m square');

    // Update sample ID label
    feature.get('classification').evaluate(function(val) {
      app.SS.infoLabel.setValue('Sample ID: ' + index);
    });

    // Update TS chart using the clicked geometry
    feature.geometry().evaluate(function(clientGeom) {
      if (clientGeom) {
        app.main.ccdChartPanel.clear();
        app.main.ccdChartPanel.add(
          uiUtils.getTSChart4(app.main.mapPanel, ccdParams, runParams, vizParams, clientGeom)
        );
      } else {
        print("Feature geometry is null. Skipping chart update.");
      }
    });

    // Remove previous per-sample KML link label
    if (app.SS.downloadKMLLabel) {
      app.SampleSelection.remove(app.SS.downloadKMLLabel);
      app.SS.downloadKMLLabel = null;
    }

    // Create a per-sample KML download link (client-side)
    feature.evaluate(function(f) {
      var coords = f.geometry.coordinates;
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

      var newLabel = ui.Label({
        value: 'Download KML (Sample_ID_' + index + ')',
        style: { color: 'blue', textDecoration: 'underline', margin: '4px 0 4px 0' }
      });

      newLabel.setUrl(dataUrl);

      app.SampleSelection.add(newLabel);
      app.SS.downloadKMLLabel = newLabel;

      // Load existing interpretation fields (if already saved)
      loadPropertiesFromMetadata(index);
    });
  }


  // -------------------------------------------------------------
  // Sample selection panel (navigation UI)
  // -------------------------------------------------------------
  app.SampleSelection = ui.Panel({
    style: {width: '100%'},
    widgets: [
      ui.Label('Sample Selector', visLabels),
      app.SS.indexInput, app.SS.infoLabel,
      app.SS.prevButton, app.SS.nextButton, app.SS.goButton
    ]
  });


  // -------------------------------------------------------------
  // Interpreter input fields:
  // - Change type + confidence
  // - Two dates (deforestation + solar change) and date confidence
  // - Notes
  // -------------------------------------------------------------
  app.IP.changeSelect = ui.Select({
    items: ['SolarPanel + Defo', 'SolarPanel + Other changes', 'Defo + Solar associated', 'NA'],
    placeholder: 'Change',
    value: 'NA'
  });

  app.IP.changeSet = ui.Panel([ui.Label('Change?'), app.IP.changeSelect],
    ui.Panel.Layout.Flow('horizontal')
  );

  app.IP.chgConfSelect = ui.Select({
    items: ['High', 'Fair', 'Low'],
    placeholder: 'Confidence',
    value: 'High'
  });

  app.IP.chgConfSet = ui.Panel([ui.Label('Change Confidence?'), app.IP.chgConfSelect],
    ui.Panel.Layout.Flow('horizontal')
  );

  app.IP.noteBox = ui.Textbox({placeholder: 'Comments about change', style:{width: '200px'}});

  // Deforestation date entry
  app.IP.entryLabel = ui.Label('Deforestation Date:');
  app.IP.yearBox  = ui.Textbox({placeholder:'Year...',  value:'0', style:{width: '50px'}});
  app.IP.monthBox = ui.Textbox({placeholder:'Month...', value:'0', style:{width: '35px'}});
  app.IP.dayBox   = ui.Textbox({placeholder:'Day...',   value:'0', style:{width: '35px'}});

  app.IP.entrySet_Defo = ui.Panel([app.IP.entryLabel, app.IP.yearBox, app.IP.monthBox, app.IP.dayBox],
    ui.Panel.Layout.Flow('horizontal')
  );

  // Solar change date entry
  app.IP.entryLabel2 = ui.Label('Solar change Date:');
  app.IP.yearBox2  = ui.Textbox({placeholder:'Year...',  value:'0', style:{width: '50px'}});
  app.IP.monthBox2 = ui.Textbox({placeholder:'Month...', value:'0', style:{width: '35px'}});
  app.IP.dayBox2   = ui.Textbox({placeholder:'Day...',   value:'0', style:{width: '35px'}});

  app.IP.entrySet_Solar = ui.Panel([app.IP.entryLabel2, app.IP.yearBox2, app.IP.monthBox2, app.IP.dayBox2],
    ui.Panel.Layout.Flow('horizontal')
  );

  // Date confidence selector
  app.IP.dateConfSelect = ui.Select({
    items: ['High', 'Fair', 'Low'],
    placeholder: 'Date Confidence',
    value: 'High'
  });

  app.IP.dateConfSet = ui.Panel([ui.Label('Date Confidence?'), app.IP.dateConfSelect],
    ui.Panel.Layout.Flow('horizontal')
  );

  app.IP.noteBox2 = ui.Textbox({placeholder: 'Comments about dates', style:{width: '200px'}});


  // -------------------------------------------------------------
  // Save button: writes interpreter inputs as asset metadata
  // Workflow:
  // - Copy source asset -> target asset (if not exists)
  // - Update metadata properties on the target asset
  // - Set ACL so assets are readable (for collaborators)
  // -------------------------------------------------------------
  app.IP.saveButton = ui.Button('Save');

  app.IP.saveButton.onClick(function() {

    // Current sample ID
    var idx = parseInt(app.SS.indexInput.getValue(), 10);
    if (isNaN(idx)) idx = 0;

    // Assemble properties to save (asset-level metadata)
    var newProps = {
      'D_year':  parseFloat(app.IP.yearBox.getValue()),
      'D_month': parseFloat(app.IP.monthBox.getValue()),
      'D_day':   parseFloat(app.IP.dayBox.getValue()),
      'S_year':  parseFloat(app.IP.yearBox2.getValue()),
      'S_month': parseFloat(app.IP.monthBox2.getValue()),
      'S_day':   parseFloat(app.IP.dayBox2.getValue()),
      'change':  app.IP.changeSelect.getValue(),
      'chgconf': app.IP.chgConfSelect.getValue(),
      'dateconf':app.IP.dateConfSelect.getValue(),
      'note1':   app.IP.noteBox.getValue(),
      'note2':   app.IP.noteBox2.getValue()
    };

    // Source/target assets for this sample
    var source = wd + areaID + '_' + idx;
    var target = sd + areaID + '_' + idx;

    // Copy if needed; then update metadata properties
    try{ ee.data.copyAsset(source, target); } catch(err){ print('Already exist, overwriting'); }

    ee.data.setAssetProperties(target, newProps);
    ee.data.setAssetAcl(target, {'all_users_can_read': true});

    print('Done updating meta properties on asset:', target);
  });

  app.IP.finishButton = ui.Button('Finish');


  // -------------------------------------------------------------
  // Sample interpreter panel: form-style UI for labeling
  // -------------------------------------------------------------
  app.SampleInt = ui.Panel({
    style: {width: '100%'},
    widgets: [
      ui.Label('Sample Interpreter', visLabels),
      app.IP.changeSet, app.IP.chgConfSet, app.IP.noteBox,
      app.IP.entrySet_Defo, app.IP.entrySet_Solar,
      app.IP.dateConfSet, app.IP.noteBox2,
      app.IP.saveButton, app.IP.finishButton
    ]
  });


  // -------------------------------------------------------------
  // Right-side panel: sample selector + interpreter form
  // -------------------------------------------------------------
  app.main.rightPanel = ui.Panel({
    style: {width: '15%'},
    widgets: [app.SampleSelection, app.SampleInt],
    layout: ui.Panel.Layout.Flow('vertical')
  });


  // -------------------------------------------------------------
  // Time series chart panel (updates per selected sample)
  // -------------------------------------------------------------
  app.main.ccdChartPanel = uiUtils.getTSChart4(app.main.mapPanel, ccdParams, runParams, vizParams, null);

  // Center panel: map (top) + chart (bottom)
  app.main.centerPanel = ui.Panel({
    style: {width: '80%'},
    widgets:[ui.SplitPanel(app.main.mapPanel, app.main.ccdChartPanel, 'vertical', false, {height:"95%"})]
  });

  // Full layout assembly (center + right)
  var mainPanel = ui.Panel({style: {width: '900%'}, widgets:[ui.SplitPanel(app.main.centerPanel, app.main.rightPanel, 'horizontal')]});
  var fullUI = ui.SplitPanel(app.main.leftPanel, mainPanel, 'horizontal');
  ui.root.add(fullUI);

  // Initialize at sample 0
  focusFeature(0);
};

initApp();
