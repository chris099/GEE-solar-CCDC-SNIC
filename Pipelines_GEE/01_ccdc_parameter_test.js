

// CCDC_Solar Viewer
// Original Author: Paulo Arevalo (parevalo@bu.edu)
// Modified by: Kangjoon Cho (Kangjoon@bu.edu)

// ---------------------------------------------------------------
// Imports and directory


var ut = require('users/kangjoon/Fall2021:publishable/Utilities_Therm')
var utils = require('projects/GLANCE:ccdcUtilities/api');
var uiUtils = require('projects/GLANCE:ccdcUtilities/ui');
var palettes = require('users/gena/packages:palettes');
var CCD = ee.ImageCollection('users/kangjoon/23_UtilitySolar/ccd/CCD_h066v036');
var regions = ee.FeatureCollection('projects/bu-landsat/projects/smart/areas/sites2');
var wd = 'projects/bu-landsat/projects/smart/';
var output = wd + 'results/maps';

// ---------------------------------------------------------------
// Global Variables
var GLOBAL = {};
var app = {};
var listener = 0;
var FILTER = {};
var PROPS = {};

var endMembers = {
  high: [2500, 5000, 4300, 5100, 4100, 5600],
  low: [800, 1300, 900, 900, 300, 400],
  vege: [900, 1300, 700, 5400, 1600, 1000],
  soil: [1000, 1700, 1500, 2700, 2600, 2800]
};

var vizParam = {bands: ['Red', 'Green', 'Blue'], min: 0, max: 3500};

GLOBAL.SUBCOEFS = ["INTP", "SLP", "COS", "SIN", "COS2", "SIN2", "COS3", "SIN3"];
GLOBAL.COEFS = GLOBAL.SUBCOEFS.concat("RMSE");
GLOBAL.FULLCOEFS = GLOBAL.COEFS.concat('PHASE', 'AMPLITUDE', 'PHASE2', 'AMPLITUDE2', 'PHASE3', 'AMPLITUDE3');
GLOBAL.SEGS = ["S1", "S2", "S3", "S4", "S5", "S6"];
GLOBAL.GRIDS = ee.FeatureCollection('projects/GLANCE/GRIDS/GEOG_LAND/GLANCE_Classification_GRID_5count');
GLOBAL.REGIONS = ['Select Region','AF','AN','AS','EU','NA','OC','SA'];
GLOBAL.CCDCPARAMS = [];

// For TS viewer
var INDICES = ['NDVI', 'NBR', 'EVI', 'EVI2', 'NDFI', 'GREENNESS', 'BRIGHTNESS', 'WETNESS'];
var BANDS = ['BLUE','GREEN','RED', 'NIR', 'SWIR1', 'SWIR2'] ;
var FULLBANDS = BANDS.concat(INDICES);
var BPBANDS = ['GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2'];
var TMBANDS = [];
var dateFormat = 1;

// Palettes
var PALETTES = {};
PALETTES.CHANGE = ['#67001f','#b2182b','#d6604d','#f4a582','#fddbc7','#f7f7f7','#d1e5f0','#92c5de','#4393c3','#2166ac','#053061'];
PALETTES.DATE = ['#ffffcc','#ffeda0','#fed976','#feb24c','#fd8d3c','#fc4e2a','#e31a1c','#bd0026','#800026'];
PALETTES.COUNT = ['#ffffd9','#edf8b1','#c7e9b4','#7fcdbb','#41b6c4','#1d91c0','#225ea8','#253494','#081d58'];

// Visualization parameters
var visLabels = {
  fontWeight: 'bold', 
  fontSize: '14px', 
  // width: '100%',
  padding: '4px 4px 4px 4px',
  border: '1px solid black',
  color: 'white',
  backgroundColor: 'black',
  textAlign: 'left',
  stretch: 'horizontal'
};
var horizontalStyle = {stretch: 'horizontal', width: '100%'};
FILTER.visParam = {bands: ['High','NDVI','Low'], min: 0, max: 1500};

// ---------------------------------------------------------------
// Callback Functions
// load button
var doLoad = function(obj){
  // Temporary: clear labels if load button is re clicked
  app.loader.infoBox.widgets().get(1).setValue('Suspected date format is: LOADING... Please wait');
  app.loader.infoBox.widgets().get(0).setValue('Available bands are: LOADING... Please wait');
  
  PROPS.pathType = app.loader.imOrCol.widgets().get(1).getValue();
  PROPS.dataPath = app.loader.coefImage.widgets().get(1).getValue();
  PROPS.filterVal = app.loader.filterBox.widgets().get(1).getValue();
  // Load results and extract band names and date format
  if (PROPS.pathType == 'Image') {
    PROPS.results = ee.Image(PROPS.dataPath);
    var tempImg = ee.Image(PROPS.dataPath);
  } else if (PROPS.pathType == 'Image Collection') {
    // Filter CCDC run, most recent one is z as of 04/16/2020.
    PROPS.results = CCD;
                      
    var tempImg = PROPS.results.first();
    PROPS.results = PROPS.results.mosaic();
  } else if (PROPS.pathType == 'Folder') {
    // TODO: Allow entering keyword to search for in folder, default is 'Change'
    PROPS.results = ee.ImageCollection(utils.Results.assetsToCollection(PROPS.dataPath, 'Image', 'Change'));
    var tempImg = PROPS.results.first();
    PROPS.results = PROPS.results.mosaic();
  }
  
  // Evaluate ccdc params dictionary and set date format according to it
  tempImg.toDictionary().evaluate(function(dict){
    PROPS.dateFormat = dict['dateFormat'];
    PROPS.startDate = dict['startDate'];
    PROPS.endDate = dict['endDate'];
    
    // Show potential date format
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
      dateFormatString = PROPS.dateFormat;
    }
    
    app.loader.infoBox.widgets().get(1).setValue('Suspected date format is: ' + dateFormatString);
    
  });
  
  // Get coefficient band names and display
  PROPS.bands = PROPS.results.select(".*_coefs")
                      .bandNames()
                      .map(function(x){ 
                        return ee.String(x).split('_').get(0);
                      });
  
  PROPS.bands.evaluate(function(vals){
    app.loader.infoBox.widgets().get(0).setValue('Available bands are: ' + vals);
    // Set synthetic panel
    var redBox = uiUtils.generateSelectorPanel('RED band', vals);
    var greenBox = uiUtils.generateSelectorPanel('GREEN band', vals);
    var blueBox = uiUtils.generateSelectorPanel('BLUE band', vals);
    app.synt.synthPanel.clear();
    app.synt.synthPanel.add(ui.Label('Create synthetic image',visLabels));
    app.synt.synthPanel.add(app.synt.dateBox);
    app.synt.synthPanel.add(redBox);
    app.synt.synthPanel.add(greenBox);
    app.synt.synthPanel.add(blueBox);
    app.synt.synthPanel.add(app.synt.minBox);
    app.synt.synthPanel.add(app.synt.maxBox);
    app.synt.synthPanel.add(app.synt.createSynt);
    
    // Set coefficient panel
    var coefBandPanelGenerator = function(){ return ui.Panel([
      ui.Select({items:vals, style:{stretch: 'horizontal'}}),
      ui.Select({items:GLOBAL.FULLCOEFS, style:{stretch: 'horizontal'}}),
      ui.Textbox({value:'0', style:{stretch: 'horizontal'}}) ,
      ui.Textbox({value:'1', style:{stretch: 'horizontal'}}) 
    ],
    ui.Panel.Layout.Flow('horizontal'),
    horizontalStyle)};
      
    var REDcoefBandPanel = coefBandPanelGenerator();
    var GREENcoefBandPanel = coefBandPanelGenerator();
    var BLUEcoefBandPanel = coefBandPanelGenerator();
    
    app.coefs.coefPanel.clear();
    app.coefs.coefPanel.add(ui.Label('Visualize coefficients',visLabels));
    app.coefs.coefPanel.add(app.coefs.coefsDateBox);
    app.coefs.coefPanel.add(app.coefs.singleCoefMode);
    app.coefs.coefPanel.add(REDcoefBandPanel);
    app.coefs.coefPanel.add(GREENcoefBandPanel);
    app.coefs.coefPanel.add(BLUEcoefBandPanel);
    app.coefs.coefPanel.add(app.coefs.showCoefs);
    
    // Set change panel
    var bandSelect = uiUtils.generateSelectorPanel('Magnitude band', vals);
    app.change.changePanel.clear();
    app.change.changePanel.add(ui.Label('Visualize change',visLabels));
    app.change.changePanel.add(app.change.sDate);
    app.change.changePanel.add(app.change.eDate);
    app.change.changePanel.add(bandSelect);
    app.change.changePanel.add(app.change.minMag);
    app.change.changePanel.add(app.change.maxMag);
    app.change.changePanel.add(app.change.changeSelect);
    app.change.changePanel.add(app.change.loadChgButton);
    app.change.changePanel.add(app.change.loadFirstChgButton);
    app.change.changePanel.add(app.change.loadLastChgButton);
    
    PROPS.bandList = app.synt.synthPanel.widgets().get(2).widgets().get(1).items().getJsArray();
    PROPS.ccdImage = utils.CCDC.buildCcdImage(PROPS.results, GLOBAL.SEGS.length, PROPS.bandList);
  });
};

// create synthetic button
var doCreateSynt = function(obj){
  // Get parameters
  PROPS.predDate = app.synt.dateBox.widgets().get(1).getValue();
  PROPS.R = app.synt.synthPanel.widgets().get(2).widgets().get(1).getValue();
  PROPS.G = app.synt.synthPanel.widgets().get(3).widgets().get(1).getValue();
  PROPS.B = app.synt.synthPanel.widgets().get(4).widgets().get(1).getValue();
  PROPS.stretchMin = app.synt.minBox.widgets().get(1).getValue();
  PROPS.stretchMax = app.synt.maxBox.widgets().get(1).getValue();
  
  var dateParams = {inputFormat: 3, inputDate: PROPS.predDate, outputFormat: 1};
  var formattedDate = utils.Dates.convertDate(dateParams);
   
  // Obtain synthetic and add
  var synthetic =utils.CCDC.getMultiSynthetic(PROPS.ccdImage, formattedDate, PROPS.dateFormat, PROPS.bandList, GLOBAL.SEGS);
  app.main.mapPanel.addLayer({eeObject:synthetic, 
                      visParams: {bands:[PROPS.R, PROPS.G, PROPS.B], 
                                  min:PROPS.stretchMin, max: PROPS.stretchMax}, 
                      name: 'Synthetic '+ PROPS.predDate});
};

// show coefs button
var doShowCoefs = function(obj){
  // Get date and coefficient mode status
  PROPS.coefDate = app.coefs.coefsDateBox.widgets().get(1).getValue();
  PROPS.singleCoefMode = app.coefs.coefPanel.widgets().get(2).widgets().get(0).getValue();
  
  // Get current band, coefficient and min/max
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
  
  // Convert format to output date
  var dateParams = {inputFormat: 3, inputDate: PROPS.coefDate, outputFormat: 1};
  var formattedDate = utils.Dates.convertDate(dateParams);
  
  // Normalized intercept requires slope
  var coefs = utils.CCDC.getMultiCoefs(PROPS.ccdImage, formattedDate, PROPS.bandList, GLOBAL.COEFS, true, GLOBAL.SEGS, 'before');
  var phaseAmpl = utils.CCDC.newPhaseAmplitude(coefs, '.*SIN.*', '.*COS.*');
  var selectedCoef = coefs.addBands(phaseAmpl);
  
  var REDcoef = PROPS.REDcoefBand + '_' + PROPS.REDcoefCoef;
  var GREENcoef = PROPS.GREENcoefBand + '_' + PROPS.GREENcoefCoef;
  var BLUEcoef = PROPS.BLUEcoefBand + '_' + PROPS.BLUEcoefCoef;
  
  // If single coef mode, just load that band. Otherwise load RGB
  if (PROPS.singleCoefMode ==  true){
    var coefLabel = REDcoef + ' ' + PROPS.coefDate;
    app.main.mapPanel.addLayer({eeObject: selectedCoef,
                        visParams: {bands: [REDcoef], min:PROPS.REDmin, max: PROPS.REDmax, 
                                    palette: palettes.matplotlib.viridis[7]},
                                    name: coefLabel});
    var legend = uiUtils.generateColorbarLegend(PROPS.REDmin, PROPS.REDmax, 
                                                palettes.matplotlib.viridis[7], 'horizontal', coefLabel);
  
    app.main.mapPanel.add(legend);

  } else {
    app.main.mapPanel.addLayer({eeObject: selectedCoef,
                        visParams: {bands: [REDcoef, GREENcoef, BLUEcoef], 
                        min:[PROPS.REDmin, PROPS.GREENmin, PROPS.BLUEmin], max: [PROPS.REDmax, PROPS.GREENmax, PROPS.BLUEmax]}, 
                        name: REDcoef + ' ' + GREENcoef + ' ' + BLUEcoef + PROPS.coefDate});
  }
};

// load change button
var doLoadChg = function(){
    // Get parameters
    PROPS.changeStart = app.change.sDate.widgets().get(1).getValue();
    PROPS.changeEnd = app.change.eDate.widgets().get(1).getValue();
    PROPS.chgBand = app.change.changePanel.widgets().get(3).widgets().get(1).getValue();
    PROPS.minMagVal = app.change.changePanel.widgets().get(4).widgets().get(1).getValue();
    PROPS.maxMagVal = app.change.changePanel.widgets().get(5).widgets().get(1).getValue();
    PROPS.chgLayer = app.change.changePanel.widgets().get(6).widgets().get(1).getValue();
    
    // Convert format to output date
    var startParams = {inputFormat: 3, inputDate: PROPS.changeStart, outputFormat: 1};
    var endParams = {inputFormat: 3, inputDate: PROPS.changeEnd, outputFormat: 1};
    var formattedStart = utils.Dates.convertDate(startParams).getInfo();
    var formattedEnd = utils.Dates.convertDate(endParams).getInfo();
    
    // Find magnitudes, number of breaks and time of max break for the given date range
    var filteredMags = utils.CCDC.filterMag(PROPS.ccdImage, formattedStart, formattedEnd, PROPS.chgBand, GLOBAL.SEGS);

    // Add layers, use a dict somehow instead of if statement?
    if (PROPS.chgLayer === null){
      print("Select a change layer");
    } else if (PROPS.chgLayer === 'Max change magnitude'){
        var minMag = -1500;
        var maxMag = 1500;
        var maxMagLabel = "Max magnitude of change " + PROPS.changeStart + '---' + PROPS.changeEnd;
        app.main.mapPanel.addLayer({eeObject: filteredMags.select('MAG'), 
                            visParams: {palette:palettes.matplotlib.viridis[7], min: PROPS.minMagVal, max: PROPS.maxMagVal}, 
                            name: maxMagLabel});
        var legend = uiUtils.generateColorbarLegend(PROPS.minMagVal, PROPS.maxMagVal, palettes.matplotlib.viridis[7],
                                                    'horizontal', maxMagLabel);
      
    } else if (PROPS.chgLayer == 'Time of max magnitude'){
        var maxMagTimeLabel = "Time of max magnitude " + PROPS.changeStart + '---' + PROPS.changeEnd;
        app.main.mapPanel.addLayer({eeObject:filteredMags.select('tBreak'),
                            visParams: {palette:PALETTES.DATE, min: formattedStart, max:formattedEnd},
                            name: maxMagTimeLabel});
        var legend = uiUtils.generateColorbarLegend(formattedStart, formattedEnd, PALETTES.DATE, 'horizontal', maxMagTimeLabel)
    } else if (PROPS.chgLayer == 'Number of changes'){  
        var minChanges = 0;
        var maxChanges = 10;
        var maxChangesLabel = "Number of breaks " + PROPS.changeStart + '---' + PROPS.changeEnd;
        app.main.mapPanel.addLayer({eeObject:filteredMags.select('numTbreak'), 
                            visParams: {palette:palettes.colorbrewer.YlOrRd[9], min:minChanges, max:maxChanges}, 
                            name:maxChangesLabel})  ;
        var legend = uiUtils.generateColorbarLegend(minChanges, maxChanges, palettes.colorbrewer.YlOrRd[9], 'horizontal', maxChangesLabel)
    } else {
        print("Unspecified error");
    }
    
    app.main.mapPanel.add(legend);
};

// load first change
var doLoadFirstChg = function(){
  PROPS.changeStart = app.change.sDate.widgets().get(1).getValue();
  PROPS.changeEnd = app.change.eDate.widgets().get(1).getValue();
  var dateParams = {inputFormat: 3, inputDate: PROPS.changeStart, outputFormat: 1};
  var dateParams2 = {inputFormat: 3, inputDate: PROPS.changeEnd, outputFormat: 1};
  var formattedDate = utils.Dates.convertDate(dateParams);
  var formattedDate2 = utils.Dates.convertDate(dateParams2);
  var tBreak = PROPS.ccdImage.select('.*tBreak');
  tBreak = tBreak.multiply(tBreak.gte(formattedDate))
                  .multiply(tBreak.lte(formattedDate2));
  var firstChg = tBreak.selfMask().reduce(ee.Reducer.firstNonNull());
  // Convert to single evaluate with a dictionary
  formattedDate.evaluate(function(x){
    formattedDate2.evaluate(function(y){
      app.main.mapPanel.addLayer(firstChg, {palette: PALETTES.DATE, min:x, max:y}, 'First change');
      var legend = uiUtils.generateColorbarLegend(x, y, PALETTES.DATE, 'horizontal', 'Date of first change');
      app.main.mapPanel.add(legend);
    });
  });
};

// load last change
var doLoadLastChg = function(){
  PROPS.changeStart = app.change.sDate.widgets().get(1).getValue();
  PROPS.changeEnd = app.change.eDate.widgets().get(1).getValue();
  var dateParams = {inputFormat: 3, inputDate: PROPS.changeStart, outputFormat: 1};
  var dateParams2 = {inputFormat: 3, inputDate: PROPS.changeEnd, outputFormat: 1};
  var formattedDate = utils.Dates.convertDate(dateParams);
  var formattedDate2 = utils.Dates.convertDate(dateParams2);
  var tBreak = PROPS.ccdImage.select('.*tBreak');
  tBreak = tBreak.multiply(tBreak.gte(formattedDate))
                  .multiply(tBreak.lte(formattedDate2));
  var lastChg = tBreak.selfMask().reduce(ee.Reducer.max());
  // Convert to single evaluate with a dictionary
  formattedDate.evaluate(function(x){
    formattedDate2.evaluate(function(y){
      app.main.mapPanel.addLayer(lastChg, {palette: PALETTES.DATE, min:x, max:y}, 'Last change');
      var legend = uiUtils.generateColorbarLegend(x, y, PALETTES.DATE, 'horizontal', 'Date of last change');
      app.main.mapPanel.add(legend);
    });
  });
};

// load ancillary data
function loadAncillary(){
  // Support vector data only to simplify things
  var assetPath = app.misc.dataPath.widgets().get(1).getValue();
  var test = ee.String(ee.Algorithms.ObjectType(assetPath)).compareTo("FeatureCollection");
  var Solarref = ee.FeatureCollection(assetPath);
  
  var type1 = Solarref.filter(ee.Filter.eq('Type','1'));
  var type2 = Solarref.filter(ee.Filter.eq('Type','2'));
  var type3 = Solarref.filter(ee.Filter.eq('Type','3'));
  var type4 = Solarref.filter(ee.Filter.eq('Type','4'));
  
  app.main.mapPanel.addLayer(type1, {color:'yellow'}, "Barren/Cropland");
  app.main.mapPanel.addLayer(type2, {color:'red'}, "Developed");
  app.main.mapPanel.addLayer(type3, {color:'green'}, "Forest");
  app.main.mapPanel.addLayer(type4, {color:'blue'}, "Mixed");
  
  var legend_color = ['FFFF00','FF0000','green'];
  var legend_keys = ['Barren/Cropland', 'Developed', 'Forest'];
  
  var legend = ui.Panel({
    style: {
      position: 'bottom-left',
      padding: '5px'
    }
  });
  
  var legendTitle = ui.Label({
  value: 'Land Cover before solar',
  style: {
    fontSize: '20px',
    fontWeight: 'bold',
    margin: '0px'
  }
});

  legend.add(legendTitle);
  
  var list_legend = function(color,description) {
  
  var c = ui.Label({
    style: {
      backgroundColor: color,
      padding: '10px',
      margin: '3px'
    }
  })
  
  var ds = ui.Label({
    value: description,
    style: {
      padding: '2px',
      margin: '3px'
    }
  })
  
  return ui.Panel({
    widgets: [c, ds],
    layout: ui.Panel.Layout.Flow('horizontal')
  })
};

for(var i=0; i<3; i++){
  legend.add(list_legend(legend_color[i], legend_keys[i]))
}

  app.main.mapPanel.add(legend);

  
  
  //ee.Algorithms.If(test.eq(0), app.main.mapPanel.addLayer(ee.FeatureCollection(assetPath), {color:'red'}, "Ancillary dataset"));
  app.main.mapPanel.centerObject(ee.FeatureCollection(assetPath), 10);
  
}

// navigate to lat/lon
function doGoLatLon(){
  var lat = app.misc.lat.widgets().get(1).getValue();
  var lon = app.misc.lon.widgets().get(1).getValue();
  var label = "Lat: " + lat + " Lon: " + lon;
  var point = ee.Geometry.Point([parseFloat(lon), parseFloat(lat)]);
  app.main.mapPanel.addLayer(point, {}, label);
  app.main.mapPanel.centerObject(point, 14);
}

// ---------------------------------------------------------------
// ---------------------------------------------------------------
// ---------------------------------------------------------------
// Callback Functions for BAS-CCDC

// reload annotation
function reloadAnno() {
  ut.removeLayer(app.main.mapPanel, 'Annotation');
  //app.main.mapPanel.addLayer(annotation_clean, {color: 'red'}, 'Annotation Filled', false);
  app.main.mapPanel.addLayer(annotation_clean_outline, {min:0, max:2, palette: ['white','yellow','black']}, 'Annotation Clean');
}

// filter magnitude max
function filterMagMax(ccdResults, startDate, endDate, bands, segNames) {
  var segMask = utils.CCDC.getChanges(ccdResults, startDate, endDate, segNames);
  var selStr = ".*".concat('Max').concat(".*").concat("DIF");
  var max_bands = ccdResults.select(selStr);
  
  // Need abs vals because mags can be negative too!
  var filteredMax = max_bands.mask(segMask);
  var filteredAbs = filteredMax.abs();
  var maxAbsMag = filteredAbs.reduce(ee.Reducer.max());
  
  // Find which 'index' matches that abs mag
  var matchedMagMask = filteredAbs.eq(maxAbsMag);
  
  // Use that index to select the magnitude with the original sign, and the timing of that break
  var selectedMag = filteredMax.mask(matchedMagMask).reduce(ee.Reducer.firstNonNull()).rename('Max');
  var filteredTbreak = ccdResults.select(".*tBreak").mask(matchedMagMask).reduce(ee.Reducer.firstNonNull()).rename('tBreak');
  
  for (var i=0;i<bands.length;i++) {
    var bandSelStr = ".*".concat(bands[i]).concat(".*").concat("DIF");
    var bandSelStr2 = ".*".concat(bands[i]).concat(".*").concat("MAG");

    var feat_bands = ccdResults.select(bandSelStr);
    var feat_bands2 = ccdResults.select(bandSelStr2);

    var filteredDif = feat_bands.mask(segMask);
    var filteredMag = feat_bands2.mask(segMask);
    
    selectedMag = selectedMag.addBands(filteredDif.mask(matchedMagMask).reduce(ee.Reducer.firstNonNull()).rename(bands[i]))
                              .addBands(filteredMag.mask(matchedMagMask).reduce(ee.Reducer.firstNonNull()).rename(bands[i] + '_Mag'));
  }
  
  return selectedMag.updateMask(selectedMag.select('Max')).addBands(filteredTbreak);
}

// filter magnitude first
function filterMagFirst(ccdResults, startDate, endDate, bands, segNames) {
  var segMask = utils.CCDC.getChanges(ccdResults, startDate, endDate, segNames);
  var max_bands = ccdResults.select('.*Max.*DIF');
  
  // Need abs vals because mags can be negative too!
  var filteredMax = max_bands.mask(segMask);
  var firstMaxMag = filteredMax.selfMask().reduce(ee.Reducer.firstNonNull());
  
  // Find which 'index' matches that abs mag
  var matchedMagMask = filteredMax.eq(firstMaxMag);
  
  // Use that index to select the magnitude with the original sign, and the timing of that break
  var selectedMag = filteredMax.mask(matchedMagMask).reduce(ee.Reducer.firstNonNull()).rename('Max');
  var filteredTbreak = ccdResults.select(".*tBreak").mask(matchedMagMask).reduce(ee.Reducer.firstNonNull()).rename('tBreak');
  
  for (var i=0;i<bands.length;i++) {
    var bandSelStr = ".*".concat(bands[i]).concat(".*").concat("DIF");
    var bandSelStr2 = ".*".concat(bands[i]).concat(".*").concat("MAG");

    var feat_bands = ccdResults.select(bandSelStr);
    var feat_bands2 = ccdResults.select(bandSelStr2);

    var filteredDif = feat_bands.mask(segMask);
    var filteredMag = feat_bands2.mask(segMask);
    
    selectedMag = selectedMag.addBands(filteredDif.mask(matchedMagMask).reduce(ee.Reducer.firstNonNull()).rename(bands[i]))
                              .addBands(filteredMag.mask(matchedMagMask).reduce(ee.Reducer.firstNonNull()).rename(bands[i] + '_Mag'));
  }
  
  return selectedMag.updateMask(selectedMag.select('Max')).addBands(filteredTbreak);
}

// annual synthetic images
function annualSynt(ccdImage, startYear, endYear, doy, bands) {
  if (app.filtering.mdchecker) {
    var method = ut.getMeanMultiSynthetic;
  } else {
    var method = ut.getPeakMultiSynthetic;
  }
  var years = ee.List.sequence(startYear, endYear);
  var spec = ['Blue', 'Green', 'Red', 'NIR', 'SWIR1', 'SWIR2'];
  return ee.ImageCollection(years.map(function(year) {
    var t = ee.Number(year).add(doy/365.25);
    var synt = method(PROPS.ccdImage, t, 1, bands, GLOBAL.SEGS)
              .set({year: ee.Number(year)});
    return synt.addBands(synt.select(spec).reduce(ee.Reducer.mean()).rename('SPM'));
  }));
}

// add model difference
function addModDif(ccdImage, synt, startYear, endYear, bands, correction) {
  for (var i=1;i<=GLOBAL.SEGS.length;i++) {
    var tEnd = ccdImage.select('S' + i + '_tEnd');
    for (var j=1;j<=bands.length;j++) {
      var band = bands[j-1];
      ccdImage = ccdImage.addBands(modDif(tEnd, synt.select(band), startYear, endYear, correction)
                          .rename(['S' + i + '_' + band + '_DIF', 'S' + i + '_' + band + '_BEF', 'S' + i + '_' + band + '_AFT']));
    }
    ccdImage = ccdImage.addBands(modDif(tEnd, synt.select('SPM'), startYear, endYear, correction)
                        .rename(['S' + i + '_SPM_DIF', 'S' + i + '_SPM_BEF', 'S' + i + '_SPM_AFT']));
    var mag = ccdImage.select('S' + i + '_.*_DIF');
    var maxMag = mag.abs().reduce('max').rename('S' + i + '_Max_DIF');
    ccdImage = ccdImage.addBands(maxMag);
  }
  return ccdImage.addBands(synt.filterMetadata('year', 'equals', ee.Number(endYear-2)).first().select('NDVI').rename('Final_NDVI'));
}

// calculate model difference
function modDif(tEnd, synt, startYear, endYear, correction) {
  var years = ee.List.sequence(startYear, endYear - 1);
  return ee.ImageCollection(years.map(function(year) {
    year = ee.Number(year).toInt();
    var before = synt.filterMetadata('year', 'equals', year).first();
    var after = synt.filterMetadata('year', 'equals', year.add(1)).first();
    return after.subtract(before).addBands(before).addBands(after)
                .updateMask(tEnd.gte(year.add(correction))
                  .and(tEnd.lt(year.add(1 + correction))));
  })).reduce(ee.Reducer.firstNonNull()).unmask().rename(['dif', 'before', 'after']);
}

// filter extreme changes
function filterExtreme(ccdImage) {
  for (var i=1;i<=GLOBAL.SEGS.length;i++) {
    var seg = ccdImage.select('S' + i + '_.*');
    var mag = ccdImage.select('S' + i + '_.*_MAG');
    var dif = ccdImage.select('S' + i + '_.*_DIF');
    var segLen = seg.select('S' + i + '_tEnd')
                  .subtract(seg.select('S' + i + '_tStart'));
    var tStart = seg.select('S' + i + '_tStart');
    var maxSlope = seg.select('S' + i + '_.*coef_SLP').abs().reduce('max');
    var maxMag = mag.abs().reduce('max').rename('S' + i + '_Max_MAG');
    var remove = segLen.gt(0).and(segLen.lt(1.5)).and(maxSlope.gt(500)).and(tStart.lt(2014))
                        .not().rename('S' + i + '_Filter1');
    var newMag = mag.addBands(maxMag).multiply(remove);
    var newDif = dif.multiply(remove);
    ccdImage = ccdImage.addBands(newMag, newMag.bandNames(), true)
                        .addBands(newDif, newDif.bandNames(), true)
                        .addBands(remove);
  }
  //app.main.mapPanel.addLayer(ccdImage)
  return ccdImage;
}

// toggle ccd switch
function switchCCD() {
  if (listener == 1) {
    app.ccd2.switch.setLabel('CCD');
    listener = 0;
  } else {
    app.ccd2.switch.setLabel('Cancel');
    listener = 1;
  }
}

// reset all
function resetAll() {
  app.main.ccdChartPanel.clear();
  ut.removeLayer(app.main.mapPanel, '_');
  ut.removeLayer(app.main.mapPanel, 'HLS');
  ut.removeLayer(app.main.mapPanel, 'Clicked');
}

// clicking on the map
function mapCallback(coords){
  function chartCCD(coords){
    
      function getChart(ccdTS, sensor, band, pixel, coords){
    var segList = ut.genSegList(6);
    var ccdTable = ut.getCCDTable(ccdTS, segList);
    ccdTable.evaluate(function(t, e) {
      var chart = ut.getCCDChart(t, sensor, band, coords.lat, coords.lon, 6, ccdParam);
      chart.onClick(function(date) {
        if (date === null) {
          ut.removeLayer(app.main.mapPanel, '_');
        } else {
          var img = ee.Image(ut.getLandsatImage(pixel, date));
          app.main.mapPanel.addLayer(img, vizParam, img.get('system:index').getInfo());
        }
      });
      var chartPanel = ui.Panel({
        widgets: [chart],
        style: {height: '200px'}
      });
      app.main.ccdChartPanel.add(chartPanel);
    });
  }
    
    var pixel = ee.Geometry.Point([coords.lon, coords.lat]);
    var period =  ee.Dictionary({
      'start': app.ccd2.sDate.widgets().get(1).getValue(), 
      'end': app.ccd2.eDate.widgets().get(1).getValue()});
    var images = ut.getLandsatTS_therm(pixel, period);
    // print(images, 'images')
    
    var images3 = ut.getLandsatTS(pixel, period, endMembers, false, true);
    var images4 = ut.getLandsatTS_scaled2(pixel, period, endMembers, false, true);
    // print(images4, 'images_scaled');
    var images2 = ut.getLandsatTS_scaled3(pixel, period, endMembers, false, true);
    
    
    //print(images2,'tmp')
    
    ut.addPixel(app.main.mapPanel, coords, 0.000135, '0000FF', 'Clicked');
    //var ccd = ee.Image(ee.Algorithms.If(
    //              CCD.filterBounds(pixel).first(),
    //              CCD.filterBounds(pixel).first(),
    //              ut.runCCD(ccdParam, images)));
    //var ccd = ee.Image(ut.runCCD(ccdParam, images2));
    //var ccd2 = ee.Image(ut.runCCD(ccdParam2, images2));
    //var ccd3 = ee.Image(ut.runCCD(ccdParam3, images3));
    //print(ccd);
    //app.main.mapPanel.addLayer(ccd);
    
    var model_select = app.ccd2.modelSelector.widgets().get(1).getValue();
    
    if (model_select == 'BAS-HLS') {
      var ccdParam = {
        dateFormat: 1,
        breakpointBands: ['High', 'Low', 'Soil']
      };
      ccdParam.chiSquareProbability = parseFloat(app.ccd2.chisprob.widgets().get(1).getValue());
      ccdParam.lambda = parseFloat(app.ccd2.lambda.widgets().get(1).getValue());
      ccdParam.minObservations = parseInt(app.ccd2.minob.widgets().get(1).getValue());
      
      //print(ccdParam, 'ccdParam');
      
      var ccd = ee.Image(ut.runCCD(ccdParam, images3));
      
      var highTS = ut.getTimeSeries(images3, ccd, pixel, 1, 'High', 0.1);
      getChart(highTS, 'Landsat', 'High', pixel, coords);
      var lowTS = ut.getTimeSeries(images3, ccd, pixel, 1, 'Low', 0.1);
      getChart(lowTS, 'Landsat', 'Low', pixel, coords);
      // var vegeTS = ut.getTimeSeries(images3, ccd, pixel, 1, 'Vege', 0.1);
      // getChart(vegeTS, 'Landsat', 'Vege', pixel, coords);
      var soilTS = ut.getTimeSeries(images3, ccd, pixel, 1, 'Soil', 0.1);
      getChart(soilTS, 'Landsat', 'Soil', pixel, coords);
      
    }
    else if (model_select == 'BAS-LVS') {
      var ccdParam = {
        dateFormat: 1,
        breakpointBands: ['Vege', 'Low', 'Soil']
      }
      ccdParam.chiSquareProbability = parseFloat(app.ccd2.chisprob.widgets().get(1).getValue());
      ccdParam.lambda = parseFloat(app.ccd2.lambda.widgets().get(1).getValue());
      ccdParam.minObservations = parseInt(app.ccd2.minob.widgets().get(1).getValue());
      
      var ccd = ee.Image(ut.runCCD(ccdParam, images3));
      
      //var highTS = ut.getTimeSeries(images3, ccd, pixel, 1, 'High', 0.1);
      //getChart(highTS, 'Landsat', 'High', pixel, coords);
      var lowTS = ut.getTimeSeries(images3, ccd, pixel, 1, 'Low', 0.1);
      getChart(lowTS, 'Landsat', 'Low', pixel, coords);
      var vegeTS = ut.getTimeSeries(images3, ccd, pixel, 1, 'Vege', 0.1);
      getChart(vegeTS, 'Landsat', 'Vege', pixel, coords);
      var soilTS = ut.getTimeSeries(images3, ccd, pixel, 1, 'Soil', 0.1);
      getChart(soilTS, 'Landsat', 'Soil', pixel, coords);
      
    } 
    else if (model_select == 'Temperature') {
      var ccdParam = {
        dateFormat: 1,
        breakpointBands: ['TEMP']
      }
      ccdParam.chiSquareProbability = parseFloat(app.ccd2.chisprob.widgets().get(1).getValue());
      ccdParam.lambda = parseFloat(app.ccd2.lambda.widgets().get(1).getValue());
      ccdParam.minObservations = parseInt(app.ccd2.minob.widgets().get(1).getValue());
      
      var ccd = ee.Image(ut.runCCD(ccdParam, images4));
      
      var tempTS = ut.getTimeSeries(images4, ccd, pixel, 1, 'TEMP', 0.1);
      // print(tempTS,'tmp2');
      getChart(tempTS, 'Landsat', 'TEMP', pixel, coords);
    }
    else if (model_select == 'Albedo') {
      var ccdParam = {
        dateFormat: 1,
        breakpointBands: ['Albedo']
      }
      ccdParam.chiSquareProbability = parseFloat(app.ccd2.chisprob.widgets().get(1).getValue());
      ccdParam.lambda = parseFloat(app.ccd2.lambda.widgets().get(1).getValue());
      ccdParam.minObservations = parseInt(app.ccd2.minob.widgets().get(1).getValue());
      
      var ccd = ee.Image(ut.runCCD(ccdParam, images));
      
      var albedoTS = ut.getTimeSeries(images, ccd, pixel, 1, 'Albedo', 0.1);
      getChart(albedoTS, 'Landsat', 'Albedo', pixel, coords);
    }
    else if (model_select == 'HLVS+TA') {
      var ccdParam = {
        dateFormat: 1,
        breakpointBands: ['High', 'Low', 'Vege', 'Soil', 'TEMP', 'Albedo']
      }
      ccdParam.chiSquareProbability = parseFloat(app.ccd2.chisprob.widgets().get(1).getValue());
      ccdParam.lambda = parseFloat(app.ccd2.lambda.widgets().get(1).getValue());
      ccdParam.minObservations = parseInt(app.ccd2.minob.widgets().get(1).getValue());
      
      var ccd = ee.Image(ut.runCCD(ccdParam, images4));
      // print(ccd, 'ccd');
      
      var albedoTS = ut.getTimeSeries(images4, ccd, pixel, 1, 'Albedo', 0.1);
      print(albedoTS, 'albedoTS')
      getChart(albedoTS, 'Landsat', 'Albedo', pixel, coords);
      var tempTS = ut.getTimeSeries(images4, ccd, pixel, 1, 'TEMP', 0.1);
      getChart(tempTS, 'Landsat', 'TEMP', pixel, coords);
      var highTS = ut.getTimeSeries(images4, ccd, pixel, 1, 'High', 0.1);
      getChart(highTS, 'Landsat', 'High', pixel, coords);
      var lowTS = ut.getTimeSeries(images4, ccd, pixel, 1, 'Low', 0.1);
      getChart(lowTS, 'Landsat', 'Low', pixel, coords);
      var vegeTS = ut.getTimeSeries(images4, ccd, pixel, 1, 'Vege', 0.1);
      getChart(vegeTS, 'Landsat', 'Vege', pixel, coords);
      var soilTS = ut.getTimeSeries(images4, ccd, pixel, 1, 'Soil', 0.1);
      getChart(soilTS, 'Landsat', 'Soil', pixel, coords);
    }
    else if (model_select == 'test') {
      var ccdParam = {
        dateFormat: 1,
        breakpointBands: ['Low', 'Vege', 'Soil', 'TEMP', 'Albedo']
      }
      ccdParam.chiSquareProbability = parseFloat(app.ccd2.chisprob.widgets().get(1).getValue());
      ccdParam.lambda = parseFloat(app.ccd2.lambda.widgets().get(1).getValue());
      ccdParam.minObservations = parseInt(app.ccd2.minob.widgets().get(1).getValue());
      
      var ccd = ee.Image(ut.runCCD(ccdParam, images4));
      // print(ccd, 'ccd');
      
      var albedoTS = ut.getTimeSeries(images4, ccd, pixel, 1, 'Albedo', 0.1);
      // print(albedoTS, 'albedoTS')
      getChart(albedoTS, 'Landsat', 'Albedo', pixel, coords);
      var tempTS = ut.getTimeSeries(images4, ccd, pixel, 1, 'TEMP', 0.1);
      getChart(tempTS, 'Landsat', 'TEMP', pixel, coords);
      // var highTS = ut.getTimeSeries(images4, ccd, pixel, 1, 'High', 0.1);
      // getChart(highTS, 'Landsat', 'High', pixel, coords);
      var lowTS = ut.getTimeSeries(images4, ccd, pixel, 1, 'Low', 0.1);
      getChart(lowTS, 'Landsat', 'Low', pixel, coords);
      var vegeTS = ut.getTimeSeries(images4, ccd, pixel, 1, 'Vege', 0.1);
      getChart(vegeTS, 'Landsat', 'Vege', pixel, coords);
      var soilTS = ut.getTimeSeries(images4, ccd, pixel, 1, 'Soil', 0.1);
      getChart(soilTS, 'Landsat', 'Soil', pixel, coords);
    }
    else if (model_select == 'test2') {
      var ccdParam = {
        dateFormat: 1,
        breakpointBands: ['Low', 'Vege', 'Soil', 'TEMP', 'Albedo']
      }
      ccdParam.chiSquareProbability = parseFloat(app.ccd2.chisprob.widgets().get(1).getValue());
      ccdParam.lambda = parseFloat(app.ccd2.lambda.widgets().get(1).getValue());
      ccdParam.minObservations = parseInt(app.ccd2.minob.widgets().get(1).getValue());
      
      var ccd = ee.Image(ut.runCCD(ccdParam, images2));
      // print(ccd, 'ccd');
      
      var albedoTS = ut.getTimeSeries(images2, ccd, pixel, 1, 'Albedo', 0.1);
      // print(albedoTS, 'albedoTS')
      getChart(albedoTS, 'Landsat', 'Albedo', pixel, coords);
      var tempTS = ut.getTimeSeries(images2, ccd, pixel, 1, 'TEMP', 0.1);
      getChart(tempTS, 'Landsat', 'TEMP', pixel, coords);
      // var highTS = ut.getTimeSeries(images4, ccd, pixel, 1, 'High', 0.1);
      // getChart(highTS, 'Landsat', 'High', pixel, coords);
      var lowTS = ut.getTimeSeries(images2, ccd, pixel, 1, 'Low', 0.1);
      getChart(lowTS, 'Landsat', 'Low', pixel, coords);
      var vegeTS = ut.getTimeSeries(images2, ccd, pixel, 1, 'Vege', 0.1);
      getChart(vegeTS, 'Landsat', 'Vege', pixel, coords);
      var soilTS = ut.getTimeSeries(images2, ccd, pixel, 1, 'Soil', 0.1);
      getChart(soilTS, 'Landsat', 'Soil', pixel, coords);
    }
  }
  
  if (listener == 1) {
    chartCCD(coords);
  }
}

// load change
function loadChange() {
  FILTER.bandList = ['High','Low','Soil','Vege','Albedo','TEMP'];
  FILTER.syntList = ['High','Low','Soil','Vege','Albedo','TEMP'];
  FILTER.peakSummer = 202;
  FILTER.changeStart = app.filtering.sDate.widgets().get(1).getValue();
  FILTER.changeEnd = app.filtering.eDate.widgets().get(1).getValue();
  
  var startParams = {inputFormat: 3, inputDate: FILTER.changeStart, outputFormat: 1};
  var endParams = {inputFormat: 3, inputDate: FILTER.changeEnd, outputFormat: 1};
  FILTER.formattedStart = utils.Dates.convertDate(startParams).getInfo();
  FILTER.formattedEnd = utils.Dates.convertDate(endParams).getInfo();
  
  FILTER.ccdImage = utils.CCDC.buildCcdImage(PROPS.results, GLOBAL.SEGS.length, FILTER.bandList);
  FILTER.synt = annualSynt(FILTER.ccdImage, Math.floor(FILTER.formattedStart), 
                            Math.ceil(FILTER.formattedEnd), FILTER.peakSummer, FILTER.syntList);
  FILTER.ccdImage2 = addModDif(FILTER.ccdImage, FILTER.synt, Math.floor(FILTER.formattedStart), Math.ceil(FILTER.formattedEnd),
                                      FILTER.bandList, FILTER.peakSummer/365.25);
  FILTER.ccdImageFiltered = filterExtreme(FILTER.ccdImage2)
                              .select(['.*MAG','.*_t.*','.*_DIF','.*_BEF','.*_AFT','.*Filter.*','Final_NDVI']);
                                      
  FILTER.RAWMAP = filterMagFirst(FILTER.ccdImage2, FILTER.formattedStart, FILTER.formattedEnd, FILTER.bandList, GLOBAL.SEGS);
  FILTER.CHGMAP = filterMagFirst(FILTER.ccdImageFiltered, FILTER.formattedStart, FILTER.formattedEnd, FILTER.bandList, GLOBAL.SEGS);

  //print(CHGMAP);
  app.main.mapPanel.addLayer(PROPS.ccdImage);
  //app.main.mapPanel.addLayer(PROPS.results);
  //app.main.mapPanel.addLayer(FILTER.ccdImageFiltered);
  //app.main.mapPanel.addLayer(FILTER.ccdImageFiltered.select('S1.*MAG2'));
  //app.main.mapPanel.addLayer(FILTER.ccdImageFiltered.select('S1.*tBreak'));
  //app.main.mapPanel.addLayer(FILTER.synt);
  
  app.main.mapPanel.addLayer({eeObject: FILTER.ccdImageFiltered, 
                      name: 'CCDImage', shown: false});
  app.main.mapPanel.addLayer({eeObject: FILTER.synt, 
                      name: 'Synthetics', shown: false});
  
  //print(FILTER.ccdImageFiltered);
  app.main.mapPanel.addLayer({eeObject: FILTER.RAWMAP, 
                      visParams: FILTER.visParam, 
                      name: 'Raw Change Magnitude'});
  app.main.mapPanel.addLayer({eeObject: FILTER.CHGMAP, 
                      visParams: FILTER.visParam, 
                      name: 'Change Magnitude'});
  //app.main.mapPanel.add(legend)
}

// filter changes
function filterChange(ccdImage) {
  
  var rule1_high = app.filtering.rule1.widgets().get(1).getValue();
  var rule1_soil = app.filtering.rule1.widgets().get(2).getValue();
  if(rule1_soil == 0){rule1_soil = -20000}

  var rule2_soil = app.filtering.rule2.widgets().get(1).getValue();
  var rule2_low = app.filtering.rule2.widgets().get(2).getValue();
  
  var rule3_ndvi = app.filtering.rule3.widgets().get(1).getValue();
  
  var rule4_soil = app.filtering.rule4.widgets().get(1).getValue();
  var rule4_late = app.filtering.rule4.widgets().get(2).getValue();
  
  //var rule5_length = app.filtering.rule5.widgets().get(1).getValue();
  var rule5_ndvi = app.filtering.rule5.widgets().get(1).getValue();

  var rule6_spm = app.filtering.rule6.widgets().get(1).getValue();
  if(rule6_spm == 0){rule6_spm = -20000}

  var rule7_high = app.filtering.rule7.widgets().get(1).getValue();
  var rule7_low = app.filtering.rule7.widgets().get(2).getValue();
  
  var rule8_change = app.filtering.rule8.widgets().get(1).getValue();
  var rule8_total = app.filtering.rule8.widgets().get(2).getValue();

  var ccdImageFiltered = ccdImage;

  var masks = ee.Image(0).rename('placeholder');
  
  if(app.filtering.fvfilter) {
    if(app.filtering.hemisphere){
      var period =  ee.Dictionary({
        start: '2021-06-01', 
        end: '2021-09-30'});
    } else {
      var period =  ee.Dictionary({
        start: '2021-12-01', 
        end: '2022-02-30'});
      };
    var lastGrowingSeason = ut.getLandsatTS(regions, period, endMembers, false, false).median();
    var finalNDVI = lastGrowingSeason.select('NDVI');
    app.main.mapPanel.addLayer(finalNDVI);
  } else {
    var finalNDVI = ccdImage.select('Final_NDVI');
  }
  
  for (var i=1;i<GLOBAL.SEGS.length;i++){
    var dif = ccdImage.select('S' + i + '_.*_DIF');
    var mag = ccdImage.select('S' + i + '_.*_MAG');
    var spm = ccdImage.select('S' + i + '_SPM_.*');
    var aft = ccdImage.select('S' + i + '_.*_AFT');
    var tStart = ccdImage.select('S' + i + '_tStart');
    var tLength = ccdImage.select('S' + i + '_tEnd').subtract(tStart);

    var spm_dif = spm.select('S' + i + '_SPM_DIF');
    var spm_bef = spm.select('S' + i + '_SPM_BEF');
    var spm_aft = spm.select('S' + i + '_SPM_AFT');

    var high_dif = dif.select('S' + i + '_High_DIF');
    var low_dif = dif.select('S' + i + '_Low_DIF');
    var soil_dif = dif.select('S' + i + '_Soil_DIF');
    var vege_dif = dif.select('S' + i + '_Vege_DIF');
    var ndvi_dif = dif.select('S' + i + '_NDVI_DIF');

    var soil_aft = aft.select('S' + i + '_Soil_AFT');
    var low_aft = aft.select('S' + i + '_Low_AFT');

    var high_mag = mag.select('S' + i + '_High_MAG');
    var low_mag = mag.select('S' + i + '_Low_MAG');
    var soil_mag = mag.select('S' + i + '_Soil_MAG');
    var vege_mag = mag.select('S' + i + '_Vege_MAG');
    var ndvi_mag = mag.select('S' + i + '_NDVI_MAG');
    
    var mask1 = high_dif.gte(rule1_high).and(soil_mag.gte(rule1_soil));
    var mask2 = soil_dif.lte(rule2_soil).and(low_dif.gte(rule2_low));
    var mask3 = ndvi_dif.gte(rule3_ndvi).or(ndvi_mag.gte(rule3_ndvi));
    //var mask41 = soil_mag.gte(rule4_soil).and(tStart.gt(rule4_late));
    //var mask42 = tStart.gt(rule4_late).and(mask41.not());
    var mask5 = finalNDVI.gte(rule5_ndvi);
    var mask6 = spm_aft.lte(rule6_spm);
    var mask7 = high_mag.gte(rule7_high).and(low_dif.abs().lte(rule7_low));
    var mask8 = soil_dif.add(low_dif).gte(rule8_change).and(soil_aft.add(low_aft).gte(rule8_total));

    masks = masks.addBands(mask1.rename('S' + i + '_Bright'))
                  .addBands(mask2.rename('S' + i + '_Dark'))
                  .addBands(mask3.rename('S' + i + '_Greening'))
                  .addBands(mask5.rename('S' + i + '_Reveg'))
                  .addBands(mask6.rename('S' + i + '_Water'))
                  .addBands(mask7.rename('S' + i + '_FastBright'))
                  .addBands(mask8.rename('S' + i + '_FastDark'))
                  .unmask();

    var mask = (mask1.or(mask2).or(mask7).or(mask8)).and((mask3.or(mask5).or(mask6)).not());
    var bits = mask8
                    .multiply(2).add(mask7)
                    .multiply(2).add(mask6)
                    .multiply(2).add(mask5)
                    .multiply(2).add(mask3)
                    .multiply(2).add(mask2)
                    .multiply(2).add(mask1)
                    .multiply(2).add(mask).rename('S' + i + '_Filter2');
    
    ccdImageFiltered = ccdImageFiltered.addBands(dif.multiply(mask), dif.bandNames(), true)
                                                    .addBands(bits);
  }
  
  FILTER.masks = masks.select('S.*');
  return ccdImageFiltered;
}

// load confirmed change by filtering
function confirmedChange(){
  FILTER.ccdImageConfirmed = filterChange(FILTER.ccdImageFiltered);
  FILTER.FLTMAP = filterMagFirst(FILTER.ccdImageConfirmed, FILTER.formattedStart, FILTER.formattedEnd, FILTER.bandList, GLOBAL.SEGS);
  ut.removeLayer(app.main.mapPanel, 'Confirmed Change');
  app.main.mapPanel.addLayer({eeObject: FILTER.FLTMAP, 
                      visParams: FILTER.visParam, 
                      name: 'Confirmed Change'});
  if (FILTER.PSBMAP != null) {
    app.filtering.saveChanges.setDisabled(false);
    app.filtering.saveToDrive.setDisabled(false);
    app.filtering.saveFullChange.setDisabled(false);
  }
}

// load possible change by filtering
function possibleChange(){
  FILTER.ccdImagePossible = filterChange(FILTER.ccdImageFiltered);
  FILTER.PSBMAP = filterMagFirst(FILTER.ccdImagePossible, FILTER.formattedStart, FILTER.formattedEnd, FILTER.bandList, GLOBAL.SEGS);
  ut.removeLayer(app.main.mapPanel, 'Possible Change');
  app.main.mapPanel.addLayer({eeObject: FILTER.PSBMAP, 
                      visParams: FILTER.visParam, 
                      name: 'Possible Change'});
  if (FILTER.FLTMAP != null) {
    app.filtering.saveChanges.setDisabled(false);
    app.filtering.saveToDrive.setDisabled(false);
    app.filtering.saveFullChange.setDisabled(false);
  }
}

// spatial filter and fillin
function spatialFillin(confirmed, possible, changes) {
  var maskCfm = confirmed.select('cfmSize');
  var maskPsb = possible.select('psbSize');
  var maskCfm2 = maskCfm.gt(8).unmask().not();
  var maskDif = possible.select([1,2]).mask().toInt().selfMask().updateMask(maskCfm2)
                  .reduceConnectedComponents(ee.Reducer.sum()).rename('difSize');
  var filled = maskCfm.unmask().gt(8).add(maskDif.lt(maskPsb).unmask()).rename('filled');
  return changes.addBands(maskCfm).addBands(maskPsb).addBands(maskDif).addBands(filled);
}

// save changes
function saveChanges() {
  var expt = function(img, name, geometry) {
    Export.image.toAsset({image: img,
                      description: name,
                      assetId: output + '/' + name,
                      region: geometry,
                      scale: 30,
                      maxPixels: 1e13
    });
  };
  
  var maskCfm = FILTER.FLTMAP.select([1,2]).mask().toInt().selfMask()
                  .reduceConnectedComponents(ee.Reducer.sum()).rename('cfmSize');
  var maskPsb = FILTER.PSBMAP.select([1,2]).mask().toInt().selfMask()
                  .reduceConnectedComponents(ee.Reducer.sum()).rename('psbSize');
  
  var areaList = areas.toList(30);
  var nArea = areas.size().getInfo();
  for (var i = 0; i < nArea; i++) {
    var area = ee.Feature(areaList.get(i));
    var areaID = area.getString('site').getInfo();
    var geometry = area.geometry();
    expt(FILTER.FLTMAP.addBands(maskCfm).set({area: areaID, type: 'CFM'}), areaID + '_CFM', geometry);
    expt(FILTER.PSBMAP.addBands(maskPsb).set({area: areaID, type: 'PSB'}), areaID + '_PSB', geometry);
    expt(FILTER.CHGMAP.set({area: areaID, type: 'CHG'}), areaID + '_CHG', geometry);
  }
}

// load changes
function loadChanges() {
  FILTER.FLTMAP = ee.ImageCollection(output)
                  .filterMetadata('type', 'equals', 'CFM')
                  .mosaic();
  FILTER.PSBMAP = ee.ImageCollection(output)
                  .filterMetadata('type', 'equals', 'PSB')
                  .mosaic();  
  FILTER.CHGMAP = ee.ImageCollection(output)
                  .filterMetadata('type', 'equals', 'CHG')
                  .mosaic();  

  ut.removeLayer(app.main.mapPanel, 'Full Change');
  app.main.mapPanel.addLayer({eeObject: FILTER.CHGMAP, 
                      visParams: FILTER.visParam, 
                      name: 'Full Change'});

  ut.removeLayer(app.main.mapPanel, 'Confirmed Change');
  app.main.mapPanel.addLayer({eeObject: FILTER.FLTMAP, 
                      visParams: FILTER.visParam, 
                      name: 'Confirmed Change'});

  ut.removeLayer(app.main.mapPanel, 'Possible Change');
  app.main.mapPanel.addLayer({eeObject: FILTER.PSBMAP, 
                      visParams: FILTER.visParam, 
                      name: 'Possible Change'});

  ut.removeLayer(app.main.mapPanel, 'Spatially Filtered');
  app.main.mapPanel.addLayer({eeObject: FILTER.FLTMAP.updateMask(FILTER.FLTMAP.select('cfmSize').gt(8)), 
                      visParams: FILTER.visParam, 
                      name: 'Spatially Filtered'});
  
  app.filtering.saveMap.setDisabled(false);
  app.filtering.saveToDrive.setDisabled(false);
}

// save maps
function saveMap() {
  var expt = function(img, name, geometry) {
    Export.image.toAsset({image: img,
                      description: name,
                      assetId: output + '/' + name,
                      region: geometry,
                      scale: 30,
                      maxPixels: 1e13
    });
  };
  
  var map = spatialFillin(FILTER.FLTMAP, FILTER.PSBMAP, FILTER.CHGMAP);
  
  var areaList = areas.toList(30);
  var nArea = areas.size().getInfo();
  for (var i = 0; i < nArea; i++) {
    var area = ee.Feature(areaList.get(i));
    var areaID = area.getString('site').getInfo();
    var geometry = area.geometry();
    expt(map.set({area: areaID, type: 'Map'}), areaID + '_Map', geometry);
  }
}

// save full change
function saveFullChange() {
  var expt = function(img, name, geometry) {
    Export.image.toAsset({image: img,
                      description: name,
                      assetId: output + '/' + name,
                      region: geometry,
                      scale: 30,
                      maxPixels: 1e13
    });
  };
  
  var areaList = areas.toList(30);
  var nArea = areas.size().getInfo();
  for (var i = 0; i < nArea; i++) {
    var area = ee.Feature(areaList.get(i));
    var areaID = area.getString('site').getInfo();
    var geometry = area.geometry();
    expt(FILTER.ccdImageConfirmed.set({area: areaID, type: 'Full'}), areaID + '_Full', geometry);
    expt(FILTER.ccdImagePossible.set({area: areaID, type: 'FullPsb'}), areaID + '_FullPsb', geometry);
  }
}

// save result to Drive
function saveToDrive() {
  var expt = function(img, name, geometry) {
    Export.image.toDrive({image: img,
                          description: 'Save' + name,
                          folder: 'GEE',
                          fileNamePrefix: name,
                          region: geometry,
                          crs: 'EPSG:32652',
                          scale: 30,
                          maxPixels: 1e13
    });
  };
  
  //var map = spatialFillin(FILTER.FLTMAP, FILTER.PSBMAP, FILTER.CHGMAP);
  //var year = map.select('tBreak').floor();
  //var frac = map.select('tBreak').subtract(year);
  //var doy = year.multiply(1000).add(frac.multiply(365)).round().toInt32();
  //var map2 = map.select(['High','Low','Soil','Vege','NDVI','filled']).toInt32()
  //              .addBands(doy);//.updateMask(map.select('filled'));
  //var map2 = FILTER.ccdImage2.toFloat();
  var map2 = FILTER.masks.toInt();
  print(map2);
  
  var areaList = areas.toList(30);
  var nArea = areas.size().getInfo();
  for (var i = 0; i < nArea; i++) {
    var area = ee.Feature(areaList.get(i));
    var areaID = area.getString('site').getInfo();
    var geometry = area.geometry();
    expt(map2.set({area: areaID, type: 'Map'}), areaID + '_Map', geometry);
  }
}

// load saved results
function loadResults() {
  var result = ee.ImageCollection(output)
                  .filterMetadata('type', 'equals', 'Map')
                  .select(['High', 'Low', 'Soil', 'Vege', 'NDVI', 'cfmSize', 'psbSize', 'difSize', 'filled'])
                  .mosaic();  
  
  ut.removeLayer(app.main.mapPanel, 'Spatially Filtered');
  app.main.mapPanel.addLayer({eeObject: result.updateMask(result.select('cfmSize').gt(8)), 
                      visParams: FILTER.visParam, 
                      name: 'Spatially Filtered'});
  ut.removeLayer(app.main.mapPanel, 'Spatially Filled');
  app.main.mapPanel.addLayer({eeObject: result.updateMask(result.select('filled')), 
                      visParams: FILTER.visParam, 
                      name: 'Spatially Filled'});
}

function setToConfirmed() {
  app.filtering.rule1.widgets().get(1).setValue(500);
  app.filtering.rule1.widgets().get(2).setValue(400);
  app.filtering.rule2.widgets().get(1).setValue(-800);
  app.filtering.rule2.widgets().get(2).setValue(800);
  app.filtering.rule3.widgets().get(1).setValue(1000);
  //app.filtering.rule4.widgets().get(1).setValue(1600);
  //app.filtering.rule4.widgets().get(2).setValue(2020.5);
  app.filtering.rule5.widgets().get(1).setValue(3500);
  app.filtering.rule6.widgets().get(1).setValue(800);
  app.filtering.rule7.widgets().get(1).setValue(1600);
  app.filtering.rule7.widgets().get(2).setValue(600);
  app.filtering.rule8.widgets().get(1).setValue(1600);
  app.filtering.rule8.widgets().get(2).setValue(4000);
}

function setToPossible() {
  app.filtering.rule1.widgets().get(1).setValue(300);
  app.filtering.rule1.widgets().get(2).setValue(0);
  app.filtering.rule2.widgets().get(1).setValue(-500);
  app.filtering.rule2.widgets().get(2).setValue(500);
  app.filtering.rule3.widgets().get(1).setValue(2000);
  //app.filtering.rule4.widgets().get(1).setValue(1000);
  //app.filtering.rule4.widgets().get(2).setValue(2020.5);
  app.filtering.rule5.widgets().get(1).setValue(5000);
  app.filtering.rule6.widgets().get(1).setValue(500);
  app.filtering.rule7.widgets().get(1).setValue(1000);
  app.filtering.rule7.widgets().get(2).setValue(1000);
  app.filtering.rule8.widgets().get(1).setValue(1000);
  app.filtering.rule8.widgets().get(2).setValue(2000);
}

// ---------------------------------------------------------------
// ---------------------------------------------------------------
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// User Interface

var initApp = function(){
  ui.root.clear();
  
  app.main = [];
  app.loader = [];
  app.synt = [];
  app.coefs = [];
  app.change = [];
  app.export = [];
  app.ccd = [];
  app.viz = [];
  app.misc = [];
  app.main.mainPanel = ui.Panel();
  app.main.mapPanel = ui.Map({onClick: mapCallback, style: {height: '80%', cursor: 'crosshair'}});
  app.main.mapPanel.setOptions('HYBRID');
  app.main.mapPanel.setControlVisibility({zoomControl:false, layerList:true});

  var width = visLabels.width;

  // LOAD PANEL WIDGETS
  app.loader.imOrCol = ui.Panel(
    [
      ui.Label({value:'Input type', style:{stretch: 'horizontal', color:'black'}}),
      ui.Select({items: ['Image', 'Image Collection', 'Folder'], value: 'Image', style:{stretch: 'horizontal'}})  
    ],
    ui.Panel.Layout.Flow('horizontal'),
    horizontalStyle
  );
  
  app.loader.coefImage = ui.Panel(
    [
      ui.Label({value:'Path to CCDC results', style:{stretch: 'horizontal', color:'black'}}),
      ui.Textbox({value:'projects/kangjoon/assets/MA_Solar/ccd/CCD_test_solar', style:{stretch: 'horizontal'}}) 
    ],
    ui.Panel.Layout.Flow('horizontal'),
    horizontalStyle
  );
  
  app.loader.filterBox = ui.Panel(
    [
      ui.Label({value:'Filter CCDC run', style:{stretch: 'horizontal', color:'black'}}),
      ui.Textbox({value:'Landsat', style:{stretch: 'horizontal'}}) 
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
  
  // SYNT PANEL WIDGETS
  app.synt.dateBox = ui.Panel(
    [
      ui.Label({value:'Date', style:{stretch: 'horizontal', color:'black'}}),
      ui.Textbox({value:'2001-01-01', style:{stretch: 'horizontal'}}) 
    ],
    ui.Panel.Layout.Flow('horizontal'),
    horizontalStyle
  );
  
  app.synt.minBox = ui.Panel(
    [
      ui.Label({value:'Stretch (Min)', style:{stretch: 'horizontal', color:'black'}}),
      ui.Textbox({value:'0', style:{stretch: 'horizontal'}}) 
    ],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );
  
  app.synt.maxBox = ui.Panel(
    [
      ui.Label({value:'Stretch (Max)', style:{stretch: 'horizontal', color:'black'}}),
      ui.Textbox({value:'0.6', style:{stretch: 'horizontal'}}) 
    ],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );
  
  app.synt.createSynt = ui.Button({label: 'Create Image', style: {width: '95%'}, onClick: doCreateSynt});
  
  // COEF PANEL WIDGETS
  app.coefs.singleCoefMode = ui.Panel(
    [
      ui.Checkbox({label: 'Single coefficient?', onChange:(function(checked){
        if (checked == true){
          app.coefs.coefPanel.widgets().get(4).widgets().get(0).setDisabled(true);
          app.coefs.coefPanel.widgets().get(4).widgets().get(1).setDisabled(true);
          app.coefs.coefPanel.widgets().get(4).widgets().get(2).setDisabled(true);
          app.coefs.coefPanel.widgets().get(4).widgets().get(3).setDisabled(true);
          app.coefs.coefPanel.widgets().get(5).widgets().get(0).setDisabled(true);
          app.coefs.coefPanel.widgets().get(5).widgets().get(1).setDisabled(true);
          app.coefs.coefPanel.widgets().get(5).widgets().get(2).setDisabled(true);
          app.coefs.coefPanel.widgets().get(5).widgets().get(3).setDisabled(true);
        } else {
          app.coefs.coefPanel.widgets().get(4).widgets().get(0).setDisabled(false);
          app.coefs.coefPanel.widgets().get(4).widgets().get(1).setDisabled(false);
          app.coefs.coefPanel.widgets().get(4).widgets().get(2).setDisabled(false);
          app.coefs.coefPanel.widgets().get(4).widgets().get(3).setDisabled(false);
          app.coefs.coefPanel.widgets().get(5).widgets().get(0).setDisabled(false);
          app.coefs.coefPanel.widgets().get(5).widgets().get(1).setDisabled(false);
          app.coefs.coefPanel.widgets().get(5).widgets().get(2).setDisabled(false);
          app.coefs.coefPanel.widgets().get(5).widgets().get(3).setDisabled(false);
        } 
      })})
    
    ]  
  );
  
  app.coefs.coefsDateBox = ui.Panel(
    [
      ui.Label({value:'Date', style:{stretch: 'horizontal',color:'black'}}),
      ui.Textbox({value:'2001-01-01', style:{stretch: 'horizontal'}}) 
    ],
    ui.Panel.Layout.Flow('horizontal'),
    horizontalStyle
  );
  
  app.coefs.stretchMin = ui.Panel(
    [
      ui.Label({value:'Stretch (Min)', style:{stretch: 'horizontal', color:'black'}}),
      ui.Textbox({value:'0', style:{stretch: 'horizontal'}}) 
    ],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );
  
  app.coefs.stretchMax = ui.Panel(
    [
      ui.Label({value:'Stretch (Max)', style:{stretch: 'horizontal', color:'black'}}),
      ui.Textbox({value:'1', style:{stretch: 'horizontal'}}) 
    ],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );
  
  app.coefs.showCoefs = ui.Button({label: 'Show image', style: {width: '95%'}, onClick: doShowCoefs});

  // CHANGE PANEL
  app.change.sDate = ui.Panel(
    [
      ui.Label({value:'Start date' , style:{stretch: 'horizontal',color:'black'}}),
      ui.Textbox({value:'2005-01-01', style:{stretch: 'horizontal'}}) 
    ],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );
  
  app.change.eDate = ui.Panel(
    [
      ui.Label({value:'End date' , style:{stretch: 'horizontal',color:'black'}}),
      ui.Textbox({value:'2023-01-01', style:{stretch: 'horizontal'}}) 
    ],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );
  
  app.change.minMag = ui.Panel(
    [
      ui.Label({value:'Min magnitude' , style:{stretch: 'horizontal',color:'black'}}),
      ui.Textbox({value:-1500, style:{stretch: 'horizontal'}}) 
    ],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );
  
  app.change.maxMag = ui.Panel(
    [
      ui.Label({value:'Max magnitude' , style:{stretch: 'horizontal',color:'black'}}),
      ui.Textbox({value:1500, style:{stretch: 'horizontal'}}) 
    ],
    ui.Panel.Layout.Flow('horizontal'),
    {stretch: 'horizontal'}
  );
  
  app.change.changeSelect = uiUtils.generateSelectorPanel('Change layer', 
                                ['Max change magnitude', 'Time of max magnitude', 'Number of changes']);
  
  // Load changes
  app.change.loadChgButton = ui.Button({
    label: 'Load changes',
    style:{stretch: 'horizontal'},
    onClick: doLoadChg});
  
  // Load first change
  app.change.loadFirstChgButton = ui.Button({
    label: 'Load first change',
    style:{stretch: 'horizontal'},
    onClick: doLoadFirstChg});
  
  // Load last change
  app.change.loadLastChgButton = ui.Button({
    label: 'Load last change',
    style:{stretch: 'horizontal'},
    onClick: doLoadLastChg});
  
  //LEFT PANEL FOR SINGLE TS VISUALIZATION
  // Start date for ccdc
  app.ccd.sDate = ui.Panel(
      [
        ui.Label({value:'Start date' , style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value:'2008-01-01', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
    
  //End date for ccdc
  app.ccd.eDate = ui.Panel(
      [
        ui.Label({value:'End date' , style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value:'2023-01-01', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
  
  // Lambda
  app.ccd.lambda = ui.Panel(
      [
        ui.Label({value:'Lambda', style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value: 0.002, style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
  
  // maxIterations
  app.ccd.maxIter = ui.Panel(
      [
        ui.Label({value:'Max iterations', style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value: 10000, style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
  
  
  // minObservations
  app.ccd.minObs = ui.Panel(
      [
        ui.Label({value:'Min observations', style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value: 6, style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
  
  // chiSquareProbability
  app.ccd.chiSq = ui.Panel(
      [
        ui.Label({value:'Chi square prob', style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value: 0.99, style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
  
  // minNumOfYearsScaler
  app.ccd.minYears = ui.Panel(
      [
        ui.Label({value:'Min years scaler', style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value: 1.33, style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
  
  // Band selector
  app.ccd.bandSelector = ui.Panel(
      [
        ui.Label({value: 'Select band', style:{stretch: 'horizontal', color:'black'}}),
        ui.Select({items: FULLBANDS, value: 'SWIR1', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
    );
  

  // VIZ PARAMS  
  // Select DOY plot or regular
  app.viz.tsType = ui.Panel(
      [
        ui.Label({value: 'Chart type', style:{stretch: 'horizontal', color:'black'}}),
        ui.Select({items: ['Time series', 'DOY'], value: 'Time series', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
    );
  
  // Number of segments for chart
  app.viz.nSegs = ui.Panel(
      [
        ui.Label({value:'Num segments' , style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value:6, style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
  
  var coefBandPanelGenerator = function(){ return ui.Panel([
        ui.Select({items:FULLBANDS, style:{stretch: 'horizontal'}}),
        ui.Textbox({value: 0, style:{stretch: 'horizontal'}}) ,
        ui.Textbox({value: 0.6, style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      horizontalStyle)};
    
  app.viz.redBox = coefBandPanelGenerator();
  app.viz.greenBox = coefBandPanelGenerator();
  app.viz.blueBox = coefBandPanelGenerator();
  
  app.viz.redBox.widgets().get(0).setValue('SWIR1');
  app.viz.greenBox.widgets().get(0).setValue('NIR');
  app.viz.blueBox.widgets().get(0).setValue('RED');
  
  // ANCILLARY DATA  
  app.misc.dataPath = ui.Panel(
      [
        ui.Label({value:'Asset path' , style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value:'users/kangjoon/23_UtilitySolar/UtilitySolar_Ref_addfield', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
  
  app.misc.loadButton = ui.Button({label:'Load asset', style: {width: '95%'}, onClick: loadAncillary});
  
  // Navigate to lat/lon panel
  app.misc.lat = ui.Panel(
      [
        ui.Label({value:'Lat' , style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value:'0', style:{stretch: 'horizontal', width: '60%'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
  
  app.misc.lon = ui.Panel(
      [
        ui.Label({value:'Lon' , style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value:'0', style:{stretch: 'horizontal', width: '60%'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
  
  app.misc.goLatLon = ui.Button({label:'Go!', onClick: doGoLatLon, style:{stretch: 'horizontal'}});
  
  app.misc.latLon = ui.Panel([app.misc.lat, app.misc.lon],
                    ui.Panel.Layout.Flow('horizontal'),
                    {stretch: 'horizontal'});
  
  app.misc.clearMap = ui.Button({label:'Clear map layers', style: {width: '95%'}, 
                                onClick: function(){
                                  app.main.mapPanel.widgets().reset();
                                  app.main.mapPanel.layers().reset();
                                }});
  
  // Make CCDC control Panels
  app.ccd.controlPanel = ui.Panel({style: {width: '100%'},
                            widgets: [ui.Label('CCD TS controls', visLabels),
                            app.ccd.bandSelector, app.ccd.sDate, app.ccd.eDate, app.ccd.lambda,
                            app.ccd.maxIter, app.ccd.minObs, app.ccd.chiSq, app.ccd.minYears
                            ]});
                        
  app.viz.controlPanel = ui.Panel({style: {width: '100%'},
                            widgets: [ui.Label('Visualization params', visLabels), app.viz.tsType,
                            app.viz.nSegs, app.viz.redBox, app.viz.greenBox, app.viz.blueBox]});
                            
  app.misc.controlPanel = ui.Panel({style: {width: '100%'},
                          widgets: [ui.Label('Other controls', visLabels), app.misc.dataPath, 
                          app.misc.loadButton, app.misc.latLon, app.misc.goLatLon, app.misc.clearMap]});
  
  // ---------------------------------------------------------------
  // ---------------------------------------------------------------
  // ---------------------------------------------------------------
  // Widgets for BAS-CCDC
  app.ccd2 = [];

  // master control switch
  app.ccd2.switch = ui.Button({label: 'CCD', onClick: switchCCD, style: {stretch: 'horizontal'}});

  // clear plots 
  app.ccd2.resetall = ui.Button({label: 'Reset', onClick: resetAll, style: {stretch: 'horizontal'}});

  // Sentinel-1 checker
  app.ccd2.s1checker = ui.Checkbox({label: 'Plot Sentinel-1 Too', value: false, style: {stretch: 'horizontal'}});

  // data source selector
  app.ccd2.bandSelector = ui.Panel(
      [
        ui.Label({value: 'Select data', style:{stretch: 'horizontal', color:'black'}}),
        ui.Select({items: ['Landsat', 'HLS'], value: 'Landsat', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
    );
    
  // ccdc model selector
  app.ccd2.modelSelector = ui.Panel(
      [
        ui.Label({value: 'Select model', style:{stretch: 'horizontal', color:'black'}}),
        ui.Select({items: ['BAS-HLS','BAS-LVS','Temperature', 'Albedo','HLVS+TA', 'test1', 'test2'], value: 'test2', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
    );

  // Start date for ccdc
  app.ccd2.sDate = ui.Panel(
      [
        ui.Label({value:'Start date' , style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value:'2005-01-01', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
  
  // Lambda for ccdc
  app.ccd2.lambda = ui.Panel(
      [
        ui.Label({value:'Lambda', style:{stretch: 'horizontal', color: 'black'}}),
        ui.Textbox({value:'20', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
  
  // Minimum observations for ccdc
  app.ccd2.minob = ui.Panel(
      [
        ui.Label({value:'minObservations', style:{stretch: 'horizontal', color: 'black'}}),
        ui.Textbox({value:'6', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
  
  // chisquare probability for ccdc
  app.ccd2.chisprob = ui.Panel(
      [
        ui.Label({value:'chiSquareProbability', style:{stretch: 'horizontal', color: 'black'}}),
        ui.Textbox({value:'0.99', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
    
  // End date for ccdc
  app.ccd2.eDate = ui.Panel(
      [
        ui.Label({value:'End date' , style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value:'2023-01-01', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
  
  // Make CCDC control Panels
  app.ccd2.controlPanel = ui.Panel({style: {width: '100%'},
                            widgets: [ui.Label('CCD TS controls', visLabels),
                            app.ccd2.switch, app.ccd2.resetall, app.ccd2.bandSelector, app.ccd2.modelSelector, app.ccd2.lambda,
                            app.ccd2.chisprob, app.ccd2.minob, app.ccd2.sDate, app.ccd2.eDate
                            ]});

  // change filtering tools
  app.filtering = [];
  
  // Start date for change
  app.filtering.sDate = ui.Panel(
      [
        ui.Label({value:'Start date' , style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value:'2015-01-01', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
    
  // End date for change
  app.filtering.eDate = ui.Panel(
      [
        ui.Label({value:'End date' , style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value:'2021-01-01', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  );
  
  // model difference checker
  app.filtering.mdchecker = ui.Checkbox({label: 'Use Mean Model Difference', value: false, style: {stretch: 'horizontal'}});
  
  // load change button
  app.filtering.loadChange = ui.Button({label:'Load Change', onClick: loadChange, style:{stretch: 'horizontal'}});

  // rule 1: increase in high
  app.filtering.rule1 = ui.Panel(
    [
      ui.Label({value:'Rule 1: High Albedo' , style:{stretch: 'horizontal',color:'black'}}),
      ui.Slider({min:0, max:2000, value:500, step:100, style: {width: '200px'}}),
      ui.Slider({min:0, max:2000, value:400, step:100, style: {width: '200px'}})
    ],
    ui.Panel.Layout.Flow('vertical')
  );
  
  // rule 2: soil to low
  app.filtering.rule2 = ui.Panel(
    [
      ui.Label({value:'Rule 2: Soil to Low' , style:{stretch: 'horizontal',color:'black'}}),
      ui.Slider({min:-3000, max:1, value:-800, step:100, style: {width: '200px'}}),
      ui.Slider({min:0, max:3000, value:800, step:100, style: {width: '200px'}})
    ],
    ui.Panel.Layout.Flow('vertical')
  );

  // rule 3: increase in vege
  app.filtering.rule3 = ui.Panel(
    [
      ui.Label({value:'Rule 3: NDVI' , style:{stretch: 'horizontal',color:'black'}}),
      ui.Slider({min:0, max:3000, value:1000, step:100, style: {width: '200px'}})
    ],
    ui.Panel.Layout.Flow('vertical')
  );
  
  // rule 4: late increse in soil only
  app.filtering.rule4 = ui.Panel(
    [
      ui.Label({value:'Rule 4: Late Soil' , style:{stretch: 'horizontal',color:'black'}}),
      ui.Slider({min:0, max:5000, value:1600, step:200, style: {width: '200px'}}),
      ui.Slider({min:2018, max:2022, value:2020.5, step:0.5, style: {width: '200px'}})
    ],
    ui.Panel.Layout.Flow('vertical')
  );
  
  // rule 5: revegetation
  app.filtering.rule5 = ui.Panel(
    [
      ui.Label({value:'Rule 5: Revegetation' , style:{stretch: 'horizontal',color:'black'}}),
      ui.Slider({min:2000, max:6000, value:3500, step:500, style: {width: '200px'}})
    ],
    ui.Panel.Layout.Flow('vertical')
  );
  
  // rule 6: water
  app.filtering.rule6 = ui.Panel(
    [
      ui.Label({value:'Rule 6: Water' , style:{stretch: 'horizontal',color:'black'}}),
      ui.Slider({min:0, max:2000, value:800, step:100, style: {width: '200px'}})
    ],
    ui.Panel.Layout.Flow('vertical')
  );
  
  // rule 7: super increase in high
  app.filtering.rule7 = ui.Panel(
    [
      ui.Label({value:'Rule 7: Super High' , style:{stretch: 'horizontal',color:'black'}}),
      ui.Slider({min:1000, max:3000, value:1600, step:200, style: {width: '200px'}}),
      ui.Slider({min:0, max:2000, value:600, step:100, style: {width: '200px'}})
    ],
    ui.Panel.Layout.Flow('vertical')
  );
  
  // rule 8 sum of soil and low
  app.filtering.rule8 = ui.Panel(
    [
      ui.Label({value:'Rule 8: Sum of Soil & Low' , style:{stretch: 'horizontal',color:'black'}}),
      ui.Slider({min:1000, max:3000, value:1600, step:200, style: {width: '200px'}}),
      ui.Slider({min:2000, max:5000, value:4000, step:200, style: {width: '200px'}})
    ],
    ui.Panel.Layout.Flow('vertical')
  );
  
  // final ndvi real data checker
  app.filtering.fvfilter = ui.Checkbox({label: 'Final Vegetation Filter', value: true, style: {stretch: 'horizontal'}});
  
  // southern hemisphere checker
  app.filtering.hemisphere = ui.Checkbox({label: 'Southern Hemisphere', value: false, style: {stretch: 'horizontal'}});
  
  // confirmed change button
  app.filtering.confirmedChange = ui.Button({label:'Load Confirmed Change', onClick: confirmedChange, style:{stretch: 'horizontal'}});

  // possible change button
  app.filtering.possibleChange = ui.Button({label:'Load Possible Change', onClick: possibleChange, style:{stretch: 'horizontal'}});

  // save simple change button
  app.filtering.saveChanges = ui.Button({label:'Save Changes', onClick: saveChanges, style:{stretch: 'horizontal'}, disabled: true});

  // laod changes button
  app.filtering.loadChanges = ui.Button({label:'Load Changes', onClick: loadChanges, style:{stretch: 'horizontal'}});

  // save map button
  app.filtering.saveMap = ui.Button({label:'Save Map', onClick: saveMap, style:{stretch: 'horizontal'}, disabled: true});

  // save full change button
  app.filtering.saveFullChange = ui.Button({label:'Save Full Change', onClick: saveFullChange, style:{stretch: 'horizontal'}, disabled: true});

  // save change to Drive button
  app.filtering.saveToDrive = ui.Button({label:'Save To Drive', onClick: saveToDrive, style:{stretch: 'horizontal'}, disabled: true});

  // laod results button
  app.filtering.loadResults = ui.Button({label:'Load Results', onClick: loadResults, style:{stretch: 'horizontal'}});

  // switch between default values
  app.filtering.setValues = ui.Panel(
    [
      ui.Button({label:'Set to Confirmed', onClick: setToConfirmed, style:{stretch: 'horizontal'}}),
      ui.Button({label:'Set to Possible', onClick: setToPossible, style:{stretch: 'horizontal'}})
    ],
    ui.Panel.Layout.Flow('horizontal')
  );

  // filtering panel
  app.filtering.filterPanel = ui.Panel({style: {width: '100%'},
                            widgets: [ui.Label('Filter change',visLabels),
                            app.filtering.sDate, app.filtering.eDate, 
                            app.filtering.mdchecker, app.filtering.loadChange, app.filtering.setValues,
                            app.filtering.rule1, app.filtering.rule2, app.filtering.rule3,
                            app.filtering.rule5, app.filtering.rule6,
                            app.filtering.rule7, app.filtering.rule8,
                            app.filtering.fvfilter, app.filtering.hemisphere,
                            app.filtering.confirmedChange, app.filtering.possibleChange, 
                            app.filtering.saveChanges, app.filtering.loadChanges, 
                            app.filtering.saveMap, app.filtering.saveToDrive,
                            app.filtering.saveFullChange, app.filtering.loadResults]});
  
  app.loader.reload = ui.Button({label: 'Reload Annotation', onClick: reloadAnno, style:{stretch: 'horizontal'}});

  // ---------------------------------------------------------------
  // ---------------------------------------------------------------
  // ---------------------------------------------------------------
  
  // GLOBAL PANEL SETUP
  app.loader.loadPanel = ui.Panel({style: {width: '100%'}, 
                            widgets: [ui.Label('Load CCDC results',visLabels),
                            app.loader.imOrCol, app.loader.coefImage, app.loader.filterBox,
                            app.loader.loadButton, app.loader.infoBox, app.loader.reload]});
  
  app.synt.synthPanel = ui.Panel({style: {width: '100%'},
                            widgets: [ui.Label('Create synthetic image',visLabels),
                            app.synt.dateBox,  app.synt.minBox, app.synt.maxBox, app.synt.createSynt]});
  app.coefs.coefPanel = ui.Panel({style: {width: '100%'},
                            widgets: [ui.Label('Visualize coefficients',visLabels),
                            app.coefs.coefsDateBox, app.coefs.singleCoefMode, app.coefs.showCoefs]});
  app.change.changePanel = ui.Panel({style: {width: '100%'},
                            widgets: [ui.Label('Visualize change',visLabels),
                            app.change.sDate, app.change.eDate, app.change.minMag, app.change.maxMag, 
                            app.change.changeSelect, app.change.loadChgButton]});
                            
  app.main.rightPanel = ui.Panel({style: {width: '15%'},
    widgets: [app.loader.loadPanel, app.synt.synthPanel, app.coefs.coefPanel, app.change.changePanel, app.filtering.filterPanel],
    // widgets: [app.loader.loadPanel],
    layout: ui.Panel.Layout.Flow('vertical')
  });
  
  app.main.leftPanel = ui.Panel({style: {width: '10%'},
    //widgets: [app.ccd2.controlPanel,  app.viz.controlPanel, app.misc.controlPanel],
    widgets: [app.ccd2.controlPanel, app.misc.controlPanel],
    layout: ui.Panel.Layout.Flow('vertical')
  });
  
  app.main.ccdChartPanel = ui.Panel([ui.Label('TS Area')]);
  app.main.centerPanel = ui.Panel({style: {width: '80%'}, widgets:[ui.SplitPanel(app.main.mapPanel, app.main.ccdChartPanel, 'vertical', false, {height:"95%"})]});

  var mainPanel = ui.Panel({style: {width: '900%'}, widgets:[ui.SplitPanel(app.main.centerPanel, app.main.rightPanel, 'horizontal')]});
  var fullUI = ui.SplitPanel(app.main.leftPanel, mainPanel, 'horizontal');
  ui.root.add(fullUI);
};

// ---------------------------------------------------------------
// Initialization
initApp();
var areas = regions;
app.main.mapPanel.addLayer(areas, {color: 'red'}, 'Areas', false);
//print(areas.getDownloadURL('kml'));

// ---------------------------------------------------------------
// End
