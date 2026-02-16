// ============================================================================
// Simple UI for Sample Interpretation (MA)
// ----------------------------------------------------------------------------
// Purpose:
// - Display the change classification map (RF result / omission strata).
// - Inspect CCDC fitting results (time-series chart) at sampled locations.
// - Provide a lightweight sample navigator (Prev/Next/Go) for interpretation.
// ----------------------------------------------------------------------------
// What you see in the UI:
// 1) Map layer: Change classification (strata/classes).
// 2) Interactive chart: CCDC model fit / time series at the selected point.
// 3) Sample selector: Jump through stratified samples used for accuracy assessment.
// ----------------------------------------------------------------------------
// Notes:
// - This UI is intentionally minimal: “classification + CCDC fitting view” only.
// - Sampling is stratified to support accuracy assessment and unbiased area estimation.
// - No processing logic is modified; this is visualization + navigation only.
// ============================================================================


var ut = require('users/kangjoon/Fall2021:publishable/Utilities_Therm')
var utils = require('projects/GLANCE:ccdcUtilities/api');
var uiUtils = require('projects/GLANCE:ccdcUtilities/ui');
var palettes = require('users/gena/packages:palettes');
var wd = 'projects/kangjoon/assets/MA_Solar/';
var output = wd + 'Results/maps_011925';
var region_path = 'projects/kangjoon/assets/MA_Solar/MA_boundary';
var region = ee.FeatureCollection(region_path);


// ---------------------------------------------------------------
// Global Variables
var GLOBAL = {};
var app = {};
var listener = 0;
var FILTER = {};
var PROPS = {};

GLOBAL.SUBCOEFS = ["INTP", "SLP", "COS", "SIN", "COS2", "SIN2", "COS3", "SIN3"];
GLOBAL.COEFS = GLOBAL.SUBCOEFS.concat("RMSE");
GLOBAL.FULLCOEFS = GLOBAL.COEFS.concat('PHASE', 'AMPLITUDE', 'PHASE2', 'AMPLITUDE2', 'PHASE3', 'AMPLITUDE3');
GLOBAL.SEGS = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"];

PROPS.dataPath = 'projects/kangjoon/assets/MA_Solar/Trial_040224/CCDC_Solar_2024';
PROPS.results = ee.ImageCollection(PROPS.dataPath);
var tempImg = PROPS.results.first();
PROPS.results = PROPS.results.mosaic();

tempImg.toDictionary().evaluate(function(dict){
    PROPS.dateFormat = dict['dateFormat'];
    PROPS.startDate = dict['startDate'];
    PROPS.endDate = dict['endDate'];
    
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
});




function annualSynt(ccdImage, startYear, endYear, doy, bands) {
  var years = ee.List.sequence(startYear, endYear);
  var spec = ['Albedo','TEMP','NDVI','NDBI','NDTI','BSI'];
  return ee.ImageCollection(years.map(function(year) {
    var t = ee.Number(year).add(doy/365.25);
    var synt = ut.getPeakMultiSynthetic(ccdImage, t, 1, bands, GLOBAL.SEGS)
              .set({year: ee.Number(year)});
    var synt2 = ut.getMeanMultiSynthetic(ccdImage, t, 1, bands, GLOBAL.SEGS)
              .set({year: ee.Number(year)}).rename(['Albedo_mean','TEMP_mean', 'NDVI_mean', 'NDBI_mean', 'NDTI_mean', 'BSI_mean']);

    return synt.addBands(synt2);
  }));
}

function addModDif_test(ccdImage, synt, startYear, endYear, bands, bandsmean, correction) {
  for (var i=1;i<=GLOBAL.SEGS.length;i++) {
    var tEnd = ccdImage.select('S' + i + '_tEnd');
    for (var j=1;j<=bands.length;j++) {
      var band = bands[j-1];
      ccdImage = ccdImage.addBands(modDif(tEnd, synt.select(band), startYear, endYear, correction)
                          .rename(['S' + i + '_' + band + '_DIF', 'S' + i + '_' + band + '_BEF', 'S' + i + '_' + band + '_AFT']));
    }
    for (var k=1;k<=bandsmean.length;k++) {
      var band = bandsmean[k-1];
      ccdImage = ccdImage.addBands(modDif(tEnd, synt.select(band), startYear, endYear, correction)
                          .rename(['S' + i + '_' + band + '_DIF', 'S' + i + '_' + band + '_BEF', 'S' + i + '_' + band + '_AFT']));
    }
    //var mag = ccdImage.select('S' + i + '_.*_DIF');
    //var maxMag = mag.abs().reduce('max').rename('S' + i + '_Max_DIF');
    //ccdImage = ccdImage.addBands(maxMag);
  }
  return ccdImage.addBands(synt.filterMetadata('year', 'equals', ee.Number(endYear)).first().select('Albedo').rename('Final_Albedo'))
                  .addBands(synt.filterMetadata('year', 'equals', ee.Number(endYear)).first().select('TEMP').rename('Final_TEMP'))
                  .addBands(synt.filterMetadata('year', 'equals', ee.Number(endYear)).first().select('NDVI').rename('Final_NDVI'))
                  .addBands(synt.filterMetadata('year', 'equals', ee.Number(endYear)).first().select('NDBI').rename('Final_NDBI'))
                  .addBands(synt.filterMetadata('year', 'equals', ee.Number(endYear)).first().select('NDTI').rename('Final_NDTI'))
                  .addBands(synt.filterMetadata('year', 'equals', ee.Number(endYear)).first().select('BSI').rename('Final_BSI'));
}

function addModDif_test2(ccdImage, synt, startYear, endYear, bands, bandsmean, correction) {

  return synt.filterMetadata('year', 'equals', ee.Number(endYear)).first().select('Albedo').rename('Final_Albedo')
                  .addBands(synt.filterMetadata('year', 'equals', ee.Number(endYear)).first().select('TEMP').rename('Final_TEMP'))
                  .addBands(synt.filterMetadata('year', 'equals', ee.Number(endYear)).first().select('NDVI').rename('Final_NDVI'))
                  .addBands(synt.filterMetadata('year', 'equals', ee.Number(endYear)).first().select('NDBI').rename('Final_NDBI'))
                  .addBands(synt.filterMetadata('year', 'equals', ee.Number(endYear)).first().select('NDTI').rename('Final_NDTI'))
                  .addBands(synt.filterMetadata('year', 'equals', ee.Number(endYear)).first().select('BSI').rename('Final_BSI'));
}


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


function filterMag(ccdResults, startDate, endDate, bands, segNames){
  var segMask = utils.CCDC.getChanges(ccdResults, startDate, endDate, segNames)
  var selectedMag = ee.Image();
  
  for (var i=0;i<bands.length;i++) {
    var selStr = ".*".concat(bands[i]).concat("_DIF");
    var selStr2 = ".*".concat(bands[i]).concat("_mean_DIF");
    
    var feat_bands = ccdResults.select(selStr)
    var feat_bands2 = ccdResults.select(selStr2)
    
    var filteredMag = feat_bands.mask(segMask)
    var filteredMag2 = feat_bands2.mask(segMask)
    
    var filteredAbsMag = filteredMag.abs()
    
    var maxAbsMag = filteredAbsMag.reduce(ee.Reducer.max())
    
    var matchedMagMask = filteredAbsMag.eq(maxAbsMag)
    
    var selectedMag_loop = filteredMag.mask(matchedMagMask).reduce(ee.Reducer.firstNonNull()).rename(bands[i] + '_DIF')
    var selectedMag_loop2 = filteredMag2.mask(matchedMagMask).reduce(ee.Reducer.firstNonNull()).rename(bands[i] + '_mean_DIF')
    var filteredTbreak_loop = ccdResults.select(".*tBreak").mask(matchedMagMask).reduce(ee.Reducer.firstNonNull()).rename(bands[i] + '_tBreak')
    var filteredTbreak2_loop = ccdResults.select(".*tBreak").mask(matchedMagMask).reduce(ee.Reducer.firstNonNull()).rename(bands[i] + '_mean_tBreak')
    
    selectedMag = selectedMag.addBands(selectedMag_loop)
                              //.addBands(selectedMag_loop2)
                              .addBands(filteredTbreak_loop)
                              //.addBands(filteredTbreak2_loop)
  }
  var bandNames = selectedMag.bandNames()
  //print(bandNames,'bandNames')
  var bandsToRemove = ['constant']
  var bandsToKeep = bandNames.removeAll(bandsToRemove)
  return selectedMag.select(bandsToKeep)
}

var expt = function(img, name, geometry) {
    Export.image.toAsset({image: img,
                      description: name,
                      assetId: output + '/' + name,
                      region: geometry,
                      scale: 30,
                      maxPixels: 1e13
    });
  };

//Load Change

  FILTER.bandList = ['Albedo','TEMP','NDVI','NDBI','NDTI','BSI'];
  FILTER.bandmeanList = ['Albedo_mean','TEMP_mean','NDVI_mean','NDBI_mean','NDTI_mean','BSI_mean'];
  FILTER.syntList = ['Albedo','TEMP','NDVI','NDBI','NDTI','BSI'];
  FILTER.peakSummer = 202;
  FILTER.changeStart = '2005-01-01';
  FILTER.changeEnd = '2024-12-31';
  var startParams = {inputFormat: 3, inputDate: FILTER.changeStart, outputFormat: 1};
  var endParams = {inputFormat: 3, inputDate: FILTER.changeEnd, outputFormat: 1};  
  FILTER.formattedStart = utils.Dates.convertDate(startParams).getInfo();
  FILTER.formattedEnd = utils.Dates.convertDate(endParams).getInfo();
  FILTER.ccdImage = utils.CCDC.buildCcdImage(PROPS.results, GLOBAL.SEGS.length, FILTER.bandList);
  
  



var utils = require('users/kangjoon/Fall2021:utilities/api') 
var uiUtils = require('users/kangjoon/Fall2021:utilities/ui') 
var palettes = require('users/gena/packages:palettes')


//////////////// GLOBAL VARIABLES ////////////////
var ccdParams = {}
var runParams = {}
var vizParams = {}
var GLOBAL = {}
var app = {}
// Dictionary to store variable states
var PROPS = {}
var VIS = {}
var FILTER = {};

// Massachusetts Boundary
var states = ee.FeatureCollection('TIGER/2016/States');
var Mass = states.filter(ee.Filter.eq('NAME','Massachusetts'));
var geometry = Mass.geometry();
var region = geometry;
var scale = 30; 
var areaID = 'MA';

var wd = 'projects/kangjoon/assets/MA_Solar/Reference/Interpreter/'
var sd = 'projects/kangjoon/assets/MA_Solar/Reference/Interpreter2/'

var INDEX_output0119 = 'projects/kangjoon/assets/MA_Solar/Results/maps_011925';


VIS.RF_omission = ee.ImageCollection(INDEX_output0119)
  .filterMetadata('type', 'equals', 'RF_omission')
  .mosaic();
  
  // stratifiedSample
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


// 임의 정렬 (optional)
samplePoints = samplePoints.randomColumn('rand', 192).sort('rand');
//print('Sampled points', samplePoints);

var samplePointsList = samplePoints.toList(samplePoints.size());
var totalCount = samplePoints.size();
//print('Total sample count:', totalCount);


VIS.visParam = {bands: ['High','Vege','Low'], min: 0, max: 1000};
  VIS.visParam_testMax = {bands: ['Vege_DIF','Albedo_DIF','TEMP_DIF'], min: -1000, max: 1000}; 
  VIS.visParam_test = {bands: ['Filter2'], min: 0, max: 1}; 
  VIS.visParam_test2 = {bands: ['Final_NDVI','Final_NDTI','Final_BSI'], min: -1000, max: 1000};
  VIS.visParam_SNIC = {bands: ['Albedo_DIF_mean','NDVI_DIF_mean','NDTI_DIF_mean'], min: -1000, max: 1000}
  VIS.visParam_CCDC = {bands: ['Albedo_magnitude','NDVI_magnitude','NDTI_magnitude'], min: -1000, max: 1000}

var landsatCollections = {
  "Landsat C2": 2,
}

GLOBAL.SUBCOEFS = ["INTP", "SLP", "COS", "SIN", "COS2", "SIN2", "COS3", "SIN3"]
GLOBAL.COEFS = GLOBAL.SUBCOEFS.concat("RMSE")
// GLOBAL.FULLCOEFS = GLOBAL.COEFS.concat('PHASE', 'AMPLITUDE')
GLOBAL.FULLCOEFS = GLOBAL.COEFS.concat(['PHASE', 'AMPLITUDE', 'PHASE2', 'AMPLITUDE2', 'PHASE3', 'AMPLITUDE3'])
GLOBAL.SEGS = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"]

// TODO:  adding grid for export
GLOBAL.GRIDS = ee.FeatureCollection('projects/GLANCE/GRIDS/GEOG_LAND/GLANCE_Classification_GRID_5count')
GLOBAL.REGIONS = ['Select Region','AF','AN','AS','EU','NA','OC','SA']

// Vars for TS viewer
var INDICES = ['NDVI', 'NDBI', 'NDTI', 'BSI', 'TEMP', 'Albedo']
var BANDS = ['BLUE','GREEN','RED', 'NIR', 'SWIR1', 'SWIR2'] 
//var FULLBANDS = BANDS.concat(INDICES)
var FULLBANDS = INDICES
var BPBANDS = ['GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2']
var TMBANDS = ['GREEN', 'SWIR2']
var dateFormat = 1

// Define all custom palettes here, or call gena palettes in the code itself
var PALETTES = {}
PALETTES.CHANGE = ['#67001f','#b2182b','#d6604d','#f4a582','#fddbc7','#f7f7f7',
    '#d1e5f0','#92c5de','#4393c3','#2166ac','#053061']
PALETTES.DATE = ['#ffffcc','#ffeda0','#fed976','#feb24c','#fd8d3c','#fc4e2a',
    '#e31a1c','#bd0026','#800026']
PALETTES.COUNT = ['#ffffd9','#edf8b1','#c7e9b4','#7fcdbb','#41b6c4','#1d91c0',
    '#225ea8','#253494','#081d58']
    
            
  
  VIS.RF_omission2 = ee.ImageCollection(INDEX_output0119)
                  .filterMetadata('type', 'equals', 'RF_omission2')
                  .mosaic()


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
  }

var horizontalStyle = {stretch: 'horizontal', width: '100%'}
GLOBAL.CCDCPARAMS = []


// Callback function for load button

var doLoad = function(obj){
  // Temporary: clear labels if load button is re clicked
  //app.loader.infoBox.widgets().get(1).setValue('Suspected date format is: LOADING... Please wait')
  //app.loader.infoBox.widgets().get(0).setValue('Available bands are: LOADING... Please wait')
  
  PROPS.pathType = 'Image Collection'
  PROPS.dataPath = 'projects/kangjoon/assets/MA_Solar/Trial_040224/CCDC_Solar_2024'
  PROPS.filterVal = ''
  // Load results and extract band names and date format
  if (PROPS.pathType == 'Image') {
    PROPS.results = ee.Image(PROPS.dataPath)
    var tempImg = ee.Image(PROPS.dataPath)
    
  } else {
    // Filter CCDC run, most recent one is z as of 04/16/2020.
    PROPS.results = ee.ImageCollection(PROPS.dataPath)
                      .filterMetadata('system:index', 'starts_with', PROPS.filterVal)
                      
    var tempImg = PROPS.results.first()
    PROPS.results = PROPS.results.mosaic()
    
  }
  
  // Evaluate ccdc params dictionary and set date format according to it
  tempImg.toDictionary().evaluate(function(dict){
    PROPS.dateFormat = dict['dateFormat']
    PROPS.startDate = dict['startDate']
    PROPS.endDate = dict['endDate']
    
    // Show potential date format
    var dateFormatString
    if (PROPS.dateFormat === null){
      dateFormatString = 'UNKNOWN'
    } else if (PROPS.dateFormat == 0){
      dateFormatString = 'Julian days (code 0)'
    } else if (PROPS.dateFormat == 1){
      dateFormatString = 'Fractional years (code 1)'
    } else if (PROPS.dateFormat == 2){  
      dateFormatString = 'Unix time in ms (code 2)'
    } else {
      dateFormatString = PROPS.dateFormat 
      PROPS.dateFormat = 1

    }
    
    //app.loader.infoBox.widgets().get(1).setValue('Suspected date format is: ' + dateFormatString)
    
  })
  
  
  // Get coefficient band names and display
  PROPS.bands = PROPS.results.select(".*_coefs")
                      .bandNames()
                      .map(function(x){ 
                        return ee.String(x).split('_').get(0)
                      })

  
}

doLoad();


// Callback function for create synthetic button
var doCreateSynt = function(obj){
  // Get bands as local list from widget
  PROPS.bandList = app.synt.synthPanel.widgets().get(2).widgets().get(1).items().getJsArray()
  // Get parameters
  PROPS.predDate = app.synt.dateBox.widgets().get(1).getValue()
  PROPS.R = app.synt.synthPanel.widgets().get(2).widgets().get(1).getValue()
  PROPS.G = app.synt.synthPanel.widgets().get(3).widgets().get(1).getValue()
  PROPS.B = app.synt.synthPanel.widgets().get(4).widgets().get(1).getValue()
  PROPS.stretchMin = app.synt.minBox.widgets().get(1).getValue()
  PROPS.stretchMax = app.synt.maxBox.widgets().get(1).getValue()
  
  // Get ccdc coefficients
  var ccdImage = utils.CCDC.buildCcdImage(PROPS.results, GLOBAL.SEGS.length, PROPS.bandList)
  
  // Convert format to output date
  // TODO: Ask user for input and output formats, or automate
  
  var dateParams = {inputFormat: 3, inputDate: PROPS.predDate, outputFormat: 1}
  var formattedDate = utils.Dates.convertDate(dateParams)
   
  // Obtain synthetic and add
  var synthetic =utils.CCDC.getMultiSynthetic(ccdImage, formattedDate, PROPS.dateFormat, PROPS.bandList, GLOBAL.SEGS)
  app.main.mapPanel.addLayer({eeObject:synthetic, 
                      visParams: {bands:[PROPS.R, PROPS.G, PROPS.B], 
                                  min:PROPS.stretchMin, max: PROPS.stretchMax}, 
                      name: 'Synthetic '+ PROPS.predDate})
  // // Test HSV viz for fun
  // mapPanel.addLayer({eeObject:synthetic.select([PROPS.R, PROPS.G, PROPS.B])
  //                                       .unitScale(ee.Number.parse(PROPS.stretchMin), 
  //                                                 ee.Number.parse(PROPS.stretchMax))
  //                                       .rgbToHsv(), 
  //                     name: 'Synthetic HSV'+ PROPS.predDate})

}


// Callback function for show coefs button
var doShowCoefs = function(obj){
  // Get bands as local list from widget
  PROPS.bandList = app.coefs.coefPanel.widgets().get(3).widgets().get(0).items().getJsArray()
  // Get date and coefficient mode status
  PROPS.coefDate = app.coefs.coefsDateBox.widgets().get(1).getValue()
  PROPS.singleCoefMode = app.coefs.coefPanel.widgets().get(2).widgets().get(0).getValue()
  
  // Get current band, coefficient and min/max
  PROPS.REDcoefBand = app.coefs.coefPanel.widgets().get(3).widgets().get(0).getValue()
  PROPS.REDcoefCoef = app.coefs.coefPanel.widgets().get(3).widgets().get(1).getValue()
  PROPS.REDmin = parseFloat(app.coefs.coefPanel.widgets().get(3).widgets().get(2).getValue())
  PROPS.REDmax = parseFloat(app.coefs.coefPanel.widgets().get(3).widgets().get(3).getValue())
  
  PROPS.GREENcoefBand = app.coefs.coefPanel.widgets().get(4).widgets().get(0).getValue()
  PROPS.GREENcoefCoef = app.coefs.coefPanel.widgets().get(4).widgets().get(1).getValue()
  PROPS.GREENmin = parseFloat(app.coefs.coefPanel.widgets().get(4).widgets().get(2).getValue())
  PROPS.GREENmax = parseFloat(app.coefs.coefPanel.widgets().get(4).widgets().get(3).getValue())
  
  PROPS.BLUEcoefBand = app.coefs.coefPanel.widgets().get(5).widgets().get(0).getValue()
  PROPS.BLUEcoefCoef = app.coefs.coefPanel.widgets().get(5).widgets().get(1).getValue()
  PROPS.BLUEmin = parseFloat(app.coefs.coefPanel.widgets().get(5).widgets().get(2).getValue())
  PROPS.BLUEmax = parseFloat(app.coefs.coefPanel.widgets().get(5).widgets().get(3).getValue())
  
  // Get ccdc coefficients
  var ccdImage = utils.CCDC.buildCcdImage(PROPS.results, GLOBAL.SEGS.length, PROPS.bandList)
  
  // Convert format to output date
  // TODO: Ask user for input and output formats, or automate
  var dateParams = {inputFormat: 3, inputDate: PROPS.coefDate, outputFormat: 1}
  var formattedDate = utils.Dates.convertDate(dateParams)
  
  // Normalized intercept requires slope
  var coefs = utils.CCDC.getMultiCoefs(ccdImage, formattedDate, PROPS.bandList, GLOBAL.COEFS, true, GLOBAL.SEGS, 'after')
  // var phaseAmpl = utils.CCDC.phaseAmplitude(coefs, PROPS.bandList, '_SIN', '_COS')
  var phaseAmpl = utils.CCDC.newPhaseAmplitude(coefs, '.*SIN.*', '.*COS.*')
  var selectedCoef = coefs.addBands(phaseAmpl)//.select(PROPS.coefBand + '_' + PROPS.coefCoef)
  
  var REDcoef = PROPS.REDcoefBand + '_' + PROPS.REDcoefCoef
  var GREENcoef = PROPS.GREENcoefBand + '_' + PROPS.GREENcoefCoef
  var BLUEcoef = PROPS.BLUEcoefBand + '_' + PROPS.BLUEcoefCoef
  
  // If single coef mode, just load that band. Otherwise load RGB
  if (PROPS.singleCoefMode ==  true){
    var coefLabel = REDcoef + ' ' + PROPS.coefDate
    app.main.mapPanel.addLayer({eeObject: selectedCoef,
                        visParams: {bands: [REDcoef], min:PROPS.REDmin, max: PROPS.REDmax, 
                                    palette: palettes.matplotlib.viridis[7]},
                                    name: coefLabel})
    var legend = uiUtils.generateColorbarLegend(PROPS.REDmin, PROPS.REDmax, 
                                                palettes.matplotlib.viridis[7], 'horizontal', coefLabel)
  
    app.main.mapPanel.add(legend)
    

  } else {
    app.main.mapPanel.addLayer({eeObject: selectedCoef,
                        visParams: {bands: [REDcoef, GREENcoef, BLUEcoef], 
                        min:[PROPS.REDmin, PROPS.GREENmin, PROPS.BLUEmin], max: [PROPS.REDmax, PROPS.GREENmax, PROPS.BLUEmax]}, 
                        name: REDcoef + ' ' + GREENcoef + ' ' + BLUEcoef + PROPS.coefDate})

  }
}


// Callback functoin for load change button
var doLoadChg = function(){
    // Get bands as local list from widget
    PROPS.bandList = app.change.changePanel.widgets().get(3).widgets().get(1).items().getJsArray()
    
    // Get parameters
    PROPS.changeStart = app.change.sDate.widgets().get(1).getValue()
    PROPS.changeEnd = app.change.eDate.widgets().get(1).getValue()
    PROPS.chgBand = app.change.changePanel.widgets().get(3).widgets().get(1).getValue()
    PROPS.minMagVal = app.change.changePanel.widgets().get(4).widgets().get(1).getValue()
    PROPS.maxMagVal = app.change.changePanel.widgets().get(5).widgets().get(1).getValue()
    PROPS.chgLayer = app.change.changePanel.widgets().get(6).widgets().get(1).getValue()

    
    // Convert format to output date
    // TODO: Ask user for input and output formats, or automate
    var startParams = {inputFormat: 3, inputDate: PROPS.changeStart, outputFormat: 1}
    var endParams = {inputFormat: 3, inputDate: PROPS.changeEnd, outputFormat: 1}
    var formattedStart = utils.Dates.convertDate(startParams).getInfo()
    var formattedEnd = utils.Dates.convertDate(endParams).getInfo()
    
    // Get ccdc coefficients
    var ccdImage = utils.CCDC.buildCcdImage(PROPS.results, GLOBAL.SEGS.length, PROPS.bandList)
    
    // Find magnitudes, number of breaks and time of max break for the given date range
    var filteredMags = utils.CCDC.filterMag(ccdImage, formattedStart, formattedEnd, PROPS.chgBand, GLOBAL.SEGS)

    // Add layers, use a dict somehow instead of if statement?
    if (PROPS.chgLayer === null){
      print("Select a change layer")
    } else if (PROPS.chgLayer === 'Max change magnitude'){
        var minMag = 0
        var maxMag = 0.15
        var maxMagLabel = "Max magnitude of change " + PROPS.changeStart + '---' + PROPS.changeEnd
        app.main.mapPanel.addLayer({eeObject: filteredMags.select('MAG'), 
                            visParams: {palette:palettes.matplotlib.viridis[7], min: PROPS.minMagVal, max: PROPS.maxMagVal}, 
                            name: maxMagLabel})  
        var legend = uiUtils.generateColorbarLegend(PROPS.minMagVal, PROPS.maxMagVal, palettes.matplotlib.viridis[7],
                                                    'horizontal', maxMagLabel)
      
    } else if (PROPS.chgLayer == 'Time of max magnitude'){
        var maxMagTimeLabel = "Time of max magnitude " + PROPS.changeStart + '---' + PROPS.changeEnd
        app.main.mapPanel.addLayer({eeObject:filteredMags.select('tBreak'),
                            visParams: {palette:PALETTES.DATE, min: formattedStart, max:formattedEnd},
                            name: maxMagTimeLabel})  
        var legend = uiUtils.generateColorbarLegend(formattedStart, formattedEnd, PALETTES.DATE, 'horizontal', maxMagTimeLabel)
    } else if (PROPS.chgLayer == 'Number of changes'){  
        var minChanges = 0
        var maxChanges = 10
        var maxChangesLabel = "Number of breaks " + PROPS.changeStart + '---' + PROPS.changeEnd
        app.main.mapPanel.addLayer({eeObject:filteredMags.select('numTbreak'), 
                            visParams: {palette:palettes.colorbrewer.YlOrRd[9], min:minChanges, max:maxChanges}, 
                            name:maxChangesLabel})  
        var legend = uiUtils.generateColorbarLegend(minChanges, maxChanges, palettes.colorbrewer.YlOrRd[9], 'horizontal', maxChangesLabel)
    } else {
        print("Unspecified error")
    }
    
    app.main.mapPanel.add(legend)
    
}

// Load first change
var doLoadFirstChg = function(){
  var firstChg = PROPS.results.select('tBreak').arrayReduce(ee.Reducer.first(), [0]).arrayFlatten([['first']]).selfMask()
  var dateParams = {inputFormat: 3, inputDate: PROPS.startDate, outputFormat: 1}
  var dateParams2 = {inputFormat: 3, inputDate: PROPS.endDate, outputFormat: 1}
  var formattedDate = utils.Dates.convertDate(dateParams)
  var formattedDate2 = utils.Dates.convertDate(dateParams2)
  // Convert to single evaluate with a dictionary
  formattedDate.evaluate(function(x){
    formattedDate2.evaluate(function(y){
    app.main.mapPanel.addLayer(firstChg, {palette: PALETTES.DATE, min:x, max:y}, 'First change')
    var legend = uiUtils.generateColorbarLegend(x, y, PALETTES.DATE, 'horizontal', 'Date of first change')
    app.main.mapPanel.add(legend)
    })
  })
  
}

var doLoadLastChg = function(){
  var lastChg = PROPS.results.select('tBreak').arrayReduce(ee.Reducer.max(), [0]).arrayFlatten([['last']]).selfMask()
  
  var dateParams = {inputFormat: 3, inputDate: PROPS.startDate, outputFormat: 1}
  var dateParams2 = {inputFormat: 3, inputDate: PROPS.endDate, outputFormat: 1}
  var formattedDate = utils.Dates.convertDate(dateParams)
  var formattedDate2 = utils.Dates.convertDate(dateParams2)
  
  // Convert to single evaluate with a dictionary
  formattedDate.evaluate(function(x){
    formattedDate2.evaluate(function(y){
    app.main.mapPanel.addLayer(lastChg, {palette: PALETTES.DATE, min:x, max:y}, 'Last change')
    var legend = uiUtils.generateColorbarLegend(x, y, PALETTES.DATE, 'horizontal', 'Date of last change')
    app.main.mapPanel.add(legend)
    })
  })
}

// Callback function for clicking on the map

  function mapCallback(){
    runParams.bandSelect = app.ccd.bandSelector.widgets().get(1).getValue()
  }

  // Retrieve ccdc arguments
  ccdParams.breakpointBands = ['NDVI', 'NDBI', 'NDTI', 'BSI', 'TEMP', 'Albedo']
  //ccdParams.tmaskBands= TMBANDS
  ccdParams.dateFormat = 1
  ccdParams.lambda = 5
  ccdParams.maxIterations = 25000
  ccdParams.minObservations = 6
  ccdParams.chiSquareProbability = 0.99
  //ccdParams.minNumOfYearsScaler = parseFloat(app.ccd.minYears.widgets().get(1).getValue())
  
  // Retrieve run and viz arguments
  //var currentCol = app.ccd.collectionSelector.widgets().get(1).getValue()
  runParams.landsatCol = 2
  
  runParams.sDate = '2005-01-01'
  runParams.eDate = '2025-01-01'
  runParams.nSegs = 10
  
  vizParams.tsType = "Time series"
  vizParams.red = "NDVI"
  vizParams.green = "NDTI"
  vizParams.blue = "BSI"
  vizParams.redMin = 0
  vizParams.greenMin = 0
  vizParams.blueMin = 0
  vizParams.redMax = 0.15
  vizParams.greenMax = 0.15
  vizParams.blueMax = 0.15


// Callback for button to load ancillary data
function loadAncillary(){
  
  var INDEX_CCDC_path = 'projects/kangjoon/assets/MA_Solar/Trial_040224/CCDC_Solar_2024';
  var INDEX_output = 'projects/kangjoon/assets/MA_Solar/Trial_040224/MA_SNIC_comparison_INDEX';
  var OMISSION_LASTYR = 'projects/kangjoon/assets/MA_Solar/Results/maps_omission';
  
  VIS.INDEXCCDC = ee.ImageCollection(INDEX_CCDC_path)
                    .mosaic()
                    
  VIS.SNICINDEX = ee.ImageCollection(INDEX_output)
                  .filterMetadata('type', 'equals', 'SNIC1')
                  .mosaic()
  
  VIS.INDEXRF = ee.ImageCollection(INDEX_output)
                  .filterMetadata('type', 'equals', 'RF1_adj')
                  .mosaic()
  
  VIS.PEAK = ee.ImageCollection(OMISSION_LASTYR)
                  .filterMetadata('type', 'equals', 'LASRYR')
                  .mosaic()
  
  //VIS.OMISSION = 
  
  var assetPath2 = 'projects/kangjoon/assets/MA_Solar/Solar_MAGIS_Ref';
  //var test = ee.String(ee.Algorithms.ObjectType(assetPath)).compareTo("FeatureCollection");
  var Solarref2 = ee.FeatureCollection(assetPath2);

  
  app.main.mapPanel.addLayer({eeObject: VIS.INDEXCCDC, 
                      visParams: VIS.visParam_CCDC, 
                      name: '1. CCDC'}); 
  
  app.main.mapPanel.addLayer({eeObject: VIS.SNICINDEX, 
                      name: '2. SNIC_CCDC'}); 
                      
  app.main.mapPanel.addLayer({eeObject: VIS.INDEXRF, 
                      visParams: {min: 1, max: 3, palette: ['black', 'green', 'blue']}, 
                      name: '3. Classified Change Map_Pixel'});
  
  app.main.mapPanel.addLayer({eeObject: VIS.PEAK, 
                      visParams: VIS.visParam_test2,
                      name: '4. Last year peak summer value'});                     
                      
  app.main.mapPanel.addLayer(Solarref2, {color:'#BF40BF'}, "5. MASSGIS_Reference");
  
  // Support vector data only to simplify things
  //app.main.mapPanel.addLayer(image, visParam, name)
}


// Callback to navigate to lat/lon
function doGoLatLon(){
   var lat = app.misc.lat.widgets().get(1).getValue()
   var lon = app.misc.lon.widgets().get(1).getValue()
   var label = "Lat: " + lat + " Lon: " + lon
   var point = ee.Geometry.Point([parseFloat(lon), parseFloat(lat)])
   app.main.mapPanel.addLayer(point, {}, label)
   app.main.mapPanel.centerObject(point, 14)
   
  }

//////////////// CREATE INTERFACE ////////////////



var initApp = function(){
  ui.root.clear()
  
  app.main = []
  app.loader = []
  app.TS = []
  app.synt = []
  app.coefs = []
  app.change = []
  app.export = []
  app.ccd = []
  app.SS = []
  app.IP = []
  app.viz = []
  app.misc = []
  app.main.mainPanel = ui.Panel()
  app.main.mapPanel = ui.Map({onClick: mapCallback, style: {height: '80%', cursor: 'crosshair'}})
  app.main.mapPanel.setOptions('HYBRID');
  app.main.mapPanel.setControlVisibility({zoomControl:false, layerList:true})

  var width = visLabels.width
  // app.main.mapPanel.addLayer(table)
  
  //////////////// LOAD PANEL WIDGETS ////////////////
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
  )

  app.loader.loadButton = ui.Button({label:'Load image', style: {width: '95%'}, onClick: doLoad})
  
  
  //////////////// Band selector PANEL WIDGETS ////////////////
  // Band selector
  app.ccd.bandSelector = ui.Panel(
      [
        ui.Label({value: 'Select band', style:{stretch: 'horizontal', color:'black'}}),
        ui.Select({items: FULLBANDS, value: 'NDVI', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
    )
  
  
 
  
  //////////////// LEFT PANEL FOR SINGLE TS VISUALIZATION ////////////////

  // Start date for ccdc
  app.ccd.sDate = ui.Panel(
      [
        ui.Label({value:'Start date' , style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value:'2000-01-01', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  )
    
  //End date for ccdc
  app.ccd.eDate = ui.Panel(
      [
        ui.Label({value:'End date' , style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value:'2023-01-01', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  )
  
  // Lambda
  app.ccd.lambda = ui.Panel(
      [
        ui.Label({value:'Lambda', style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value: 0.002, style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  )
  
  // maxIterations
  app.ccd.maxIter = ui.Panel(
      [
        ui.Label({value:'Max iterations', style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value: 10000, style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  )
  
  
  // minObservations
  app.ccd.minObs = ui.Panel(
      [
        ui.Label({value:'Min observations', style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value: 6, style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  )
  
  // chiSquareProbability
  app.ccd.chiSq = ui.Panel(
      [
        ui.Label({value:'Chi square prob', style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value: 0.99, style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  )
  
  // minNumOfYearsScaler
  app.ccd.minYears = ui.Panel(
      [
        ui.Label({value:'Min years scaler', style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value: 1.33, style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  )
  
  // // Band selector
  // app.ccd.bandSelector = ui.Panel(
  //     [
  //       ui.Label({value: 'Select band', style:{stretch: 'horizontal', color:'black'}}),
  //       ui.Select({items: FULLBANDS, value: 'SWIR1', style:{stretch: 'horizontal'}}) 
  //     ],
  //     ui.Panel.Layout.Flow('horizontal'),
  //     {stretch: 'horizontal'}
  //   )
  
  // Collection selector
  app.ccd.collectionSelector = ui.Panel(
      [
        ui.Label({value: 'Select collection', style:{stretch: 'horizontal', color:'black'}}),
        ui.Select({items: ['Landsat C2'], value: 'Landsat C2', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
    )

  ////// VIZ PARAMS  
  
  // Select DOY plot or regular
  app.viz.tsType = ui.Panel(
      [
        ui.Label({value: 'Chart type', style:{stretch: 'horizontal', color:'black'}}),
        ui.Select({items: ['Time series', 'DOY'], value: 'Time series', style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
    )
  
  
  // Number of segments for chart
  app.viz.nSegs = ui.Panel(
      [
        ui.Label({value:'Num segments' , style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value:6, style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  )
  
  var coefBandPanelGenerator = function(){ return ui.Panel([
        ui.Select({items:FULLBANDS, style:{stretch: 'horizontal'}}),
        ui.Textbox({value: 0, style:{stretch: 'horizontal'}}) ,
        ui.Textbox({value: 0.6, style:{stretch: 'horizontal'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      horizontalStyle)}  
    
  app.viz.redBox = coefBandPanelGenerator()
  app.viz.greenBox = coefBandPanelGenerator()
  app.viz.blueBox = coefBandPanelGenerator()
  
  app.viz.redBox.widgets().get(0).setValue('NDVI')
  app.viz.greenBox.widgets().get(0).setValue('NDTI')
  app.viz.blueBox.widgets().get(0).setValue('BSI')
  
  app.misc.loadButton = ui.Button({label:'Load asset', style: {width: '95%'}, onClick: loadAncillary})
  
  // Navigate to lat/lon panel
  app.misc.lat = ui.Panel(
      [
        ui.Label({value:'Lat' , style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value:'0', style:{stretch: 'horizontal', width: '60%'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  )
  
  app.misc.lon = ui.Panel(
      [
        ui.Label({value:'Lon' , style:{stretch: 'horizontal',color:'black'}}),
        ui.Textbox({value:'0', style:{stretch: 'horizontal', width: '60%'}}) 
      ],
      ui.Panel.Layout.Flow('horizontal'),
      {stretch: 'horizontal'}
  )
  
  app.misc.goLatLon = ui.Button({label:'Go!', onClick: doGoLatLon, style:{stretch: 'horizontal'}})
  
  app.misc.latLon = ui.Panel([app.misc.lat, app.misc.lon],
                    ui.Panel.Layout.Flow('horizontal'),
                    {stretch: 'horizontal'})
  
  app.misc.clearMap = ui.Button({label:'Clear map layers', style: {width: '95%'}, 
                                onClick: function(){
                                  app.main.mapPanel.widgets().reset()
                                  app.main.mapPanel.layers().reset()
                                  }
                               })

  var citationLabel = 'Arévalo, P., Bullock, E.L., Woodcock, C.E., Olofsson, P., 2020. \
  A Suite of Tools for Continuous Land Change Monitoring in Google Earth Engine. \
  Front. Clim. 2.' 
  var citationURL = 'https://doi.org/10.3389/fclim.2020.576740'
  app.misc.citation = ui.Label(citationLabel, {}, citationURL)

  // Make CCDC control Panels
  app.ccd.controlPanel = ui.Panel({style: {width: '100%'},
                            widgets: [ui.Label('CCD TS controls', visLabels),
                            app.ccd.collectionSelector, app.ccd.bandSelector, 
                            app.ccd.sDate, app.ccd.eDate, app.ccd.lambda,
                            app.ccd.maxIter, app.ccd.minObs, app.ccd.chiSq, app.ccd.minYears
                            ]})
                        
  app.viz.controlPanel = ui.Panel({style: {width: '100%'},
                            widgets: [ui.Label('Visualization params', visLabels), app.viz.tsType,
                            app.viz.nSegs,app.viz.redBox, app.viz.greenBox, app.viz.blueBox]})
  
  app.SS.indexInput = ui.Textbox({
  placeholder: 'Sample ID: (0 ~ ' + (totalCount.subtract(1).getInfo()) + ')',
  value: '0',
  style: { width: '60px' }
  });
  
  app.SS.infoLabel = ui.Label({
  value: 'Sample ID: 0',
  style: { fontSize: '14px', margin: '8px 0 8px 0' }
  });
  
  var downloadKMLLabel = null;
  
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
  
  function loadProperties(idx) {
  // 1) asset 경로
  var assetPath = wd + areaID + '_' + idx;  
  // 예: "projects/kangjoon/assets/MA_Solar/Reference/Interpreter/MA_123"

  // 2) FeatureCollection 형태로 읽어오기
  var fc = ee.FeatureCollection(assetPath);

  // 3) 여기서는 단일 Feature만 들어있다고 가정하므로, .first()
  var feature = fc.first();

  // 4) client-side로 evaluate
  feature.evaluate(function(f) {
    if (!f) {
      print('No Feature found at idx=' + idx);
      return;
    }

    // 5) f.properties에서 필요한 값 읽기
    var props = f.properties;  // JavaScript 객체 (key-value)

    // 6) UI 반영
    app.IP.yearBox.setValue( props.D_year );
    app.IP.monthBox.setValue( props.D_month );
    app.IP.dayBox.setValue( props.D_day );
    app.IP.yearBox2.setValue( props.S_year );
    app.IP.monthBox2.setValue( props.S_month );
    app.IP.dayBox2.setValue( props.S_day );
    app.IP.changeSelect.setValue( props.change );
    app.IP.chgConfSelect.setValue( props.chgconf );
    app.IP.dateConfSelect.setValue( props.dateconf );
    app.IP.noteBox.setValue( props.note1 );
    app.IP.noteBox2.setValue( props.note2 );
    
    //print('Loaded properties:', props);
  });
  }
  
  // 포커스 함수
function focusFeature(index) {
  // 기존 레이어를 삭제
  // Remove only the '30m square' layer
  var layers = app.main.mapPanel.layers();
  for (var i = layers.length() - 1; i >= 0; i--) {
    if (layers.get(i).getName() === 'Sample Point') {
      app.main.mapPanel.layers().remove(layers.get(i));
    }
  }
  
  var feature = ee.Feature(samplePointsList.get(index));
  var geom = feature.geometry();
  
  // 지도 이동
  app.main.mapPanel.centerObject(geom, 17);

  app.main.mapPanel.addLayer(geom, {
    color: 'red',
    pointSize: 6
  }, 'Sample Point');

  // classification 라벨 업데이트
  feature.get('classification').evaluate(function(val) {
    app.SS.infoLabel.setValue('Sample ID: ' + index);
  });
  
  feature.geometry().evaluate(function(clientGeom) {
    if (clientGeom) {
      var coords = clientGeom.coordinates;
      var lng = coords[0];
      var lat = coords[1];

      // 차트 갱신
      app.main.ccdChartPanel.clear();
      app.main.ccdChartPanel.add(uiUtils.getTSChart5(app.main.mapPanel, ccdParams, runParams, vizParams, clientGeom));
    } else {
      print("Feature geometry is null. Skipping chart update.");
    }
  });

  
  // 이전의 KML 라벨 제거
  if (app.SS.downloadKMLLabel) {
    app.SampleSelection.remove(app.SS.downloadKMLLabel);
    app.SS.downloadKMLLabel = null;
  }
  
  // Feature를 클라이언트 사이드로 가져와 KML 링크 만들기
  feature.evaluate(function(f) {
    var coords = f.geometry.coordinates; // Point assumed
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

    var dataUrl = 'data:application/vnd.google-earth.kml+xml;charset=utf-8,' + encodeURIComponent(kmlString);

    // 새 라벨 생성
    var newLabel = ui.Label({
      value: 'Download KML (Sample_ID_' + index + ')',
      style: { color: 'blue', textDecoration: 'underline', margin: '4px 0 4px 0' }
    });
    newLabel.setUrl(dataUrl);
    
    app.SampleSelection.add(newLabel);
    app.SS.downloadKMLLabel = newLabel;
    
    loadProperties(index); 
  });
}


                          
  app.SampleSelection = ui.Panel({style: {width: '100%'},
                          widgets: [ui.Label('Sample Selector', visLabels),  
                          app.SS.indexInput, app.SS.infoLabel, app.SS.prevButton,
                          app.SS.nextButton, app.SS.goButton]})
                          
  app.IP.changeSelect = ui.Select({
  items: ['SolarPanel + Defo', 'SolarPanel + Other changes', 
          'Defo + Solar associated', 'NA'], 
  placeholder: 'Change',
  value: 'NA'
  });

  app.IP.changeSet = ui.Panel([
  ui.Label('Change?'), 
  app.IP.changeSelect
  ], ui.Panel.Layout.Flow('horizontal'));
  
  app.IP.chgConfSelect = ui.Select({
  items: ['High', 'Fair', 'Low'], 
  placeholder: 'Confidence',
  value: 'High'
  });
  app.IP.chgConfSet = ui.Panel([
  ui.Label('Change Confidence?'), 
  app.IP.chgConfSelect
  ], ui.Panel.Layout.Flow('horizontal'));
  
  app.IP.noteBox = ui.Textbox({
  placeholder: 'Comments about change',
  style:{width: '200px'}
  });
  
  //Date
  app.IP.entryLabel = ui.Label('Deforestation Date:');
  app.IP.yearBox = ui.Textbox({
  placeholder:'Year...',
  value:'0',
  style:{width: '50px'}
  });
  app.IP.monthBox = ui.Textbox({
  placeholder:'Month...',
  value:'0',
  style:{width: '35px'}
  });
  app.IP.dayBox = ui.Textbox({
  placeholder:'Day...',
  value:'0',
  style:{width: '35px'}
  });

  app.IP.entrySet_Defo = ui.Panel([
  app.IP.entryLabel, 
  app.IP.yearBox, 
  app.IP.monthBox, 
  app.IP.dayBox
  ], ui.Panel.Layout.Flow('horizontal'));
  
  app.IP.entryLabel2 = ui.Label('Solar change Date:');
  app.IP.yearBox2 = ui.Textbox({
  placeholder:'Year...',
  value:'0',
  style:{width: '50px'}
  });
  app.IP.monthBox2 = ui.Textbox({
  placeholder:'Month...',
  value:'0',
  style:{width: '35px'}
  });
  app.IP.dayBox2 = ui.Textbox({
  placeholder:'Day...',
  value:'0',
  style:{width: '35px'}
  });

  app.IP.entrySet_Solar = ui.Panel([
  app.IP.entryLabel2, 
  app.IP.yearBox2, 
  app.IP.monthBox2, 
  app.IP.dayBox2
  ], ui.Panel.Layout.Flow('horizontal'));
  
  //Date Confidence?
  app.IP.dateConfSelect = ui.Select({
  items: ['High', 'Fair', 'Low'], 
  placeholder: 'Date Confidence',
  value: 'High'
  });
  app.IP.dateConfSet = ui.Panel([
  ui.Label('Date Confidence?'), 
  app.IP.dateConfSelect
  ], ui.Panel.Layout.Flow('horizontal'));
  
  // Note
  app.IP.noteBox2 = ui.Textbox({
  placeholder: 'Comments about dates',
  style:{width: '200px'}
  });
  
  app.IP.saveButton = ui.Button('Save');
  
// 부분만 발췌 - Save 버튼 이벤트:

app.IP.saveButton = ui.Button('Save');

// Save 버튼 클릭 이벤트
  app.IP.saveButton.onClick(function() {
  // 1) 현재 Sample ID 구하기
  var idx = parseInt(app.SS.indexInput.getValue(), 10);
  if (isNaN(idx)) idx = 0;

  // 2) UI에서 입력 받은 값들로, 자산 레벨에 저장할 프로퍼티만 구성
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

  // 3) 수정하려는 Asset 경로 (기존에 이미 존재하는 자산)
  var source = wd + areaID + '_' + idx; // 예: "projects/.../MA_123"
  var target = sd + areaID + '_' + idx;
  
  // 4) ee.data.setAssetProperties(...)로 메타데이터만 업데이트
  try{ee.data.copyAsset(source, target)}catch(err){print('Already exist, overwriting')}
  ee.data.setAssetProperties(target, newProps);
  ee.data.setAssetAcl(target, {'all_users_can_read': true});

  print('Done updating meta properties on asset:', target);
  });

// 이후에 finishButton.onClick(...)도 필요하다면 같은 방식을 적용


  
  app.IP.finishButton = ui.Button('Finish');
  
  app.SampleInt = ui.Panel({style: {width: '100%'},
                          widgets: [ui.Label('Sample Interpreter', visLabels), 
                          app.IP.changeSet, app.IP.chgConfSet, app.IP.noteBox,
                          app.IP.entrySet_Defo, app.IP.entrySet_Solar,
                          app.IP.dateConfSet, app.IP.noteBox2,
                          app.IP.saveButton, app.IP.finishButton]})

  
  //////////////// GLOBAL PANEL SETUP ////////////////
  app.loader.loadPanel = ui.Panel({style: {width: '100%'}, 
                            widgets: [ui.Label('Load CCDC results',visLabels),
                            app.loader.imOrCol, app.loader.coefImage, app.loader.filterBox, app.loader.loadButton, app.loader.infoBox]})
  
  app.TS.bandSelector = ui.Panel({style: {width: '100%'},
                            widgets: [ui.Label('Select bands',visLabels),
                            app.ccd.bandSelector]})
                            
  
  app.main.rightPanel = ui.Panel({style: {width: '15%'},
    widgets: [app.SampleSelection],
    layout: ui.Panel.Layout.Flow('vertical')
  })
  
  
  app.main.ccdChartPanel = uiUtils.getTSChart2(app.main.mapPanel, ccdParams, runParams, vizParams);
  
  app.main.centerPanel = ui.Panel({style: {width: '80%'}, widgets:[ui.SplitPanel(app.main.mapPanel, app.main.ccdChartPanel, 'vertical', false, {height:"95%"})]})

  var mainPanel = ui.Panel({style: {width: '900%'}, widgets:[ui.SplitPanel(app.main.centerPanel, app.main.rightPanel, 'horizontal')]})
  var fullUI = ui.SplitPanel(app.main.leftPanel, mainPanel, 'horizontal')
  app.main.mapPanel.addLayer({
    eeObject: VIS.RF_omission2, 
    visParams: {
      min: 1, 
      max: 6, 
      palette: ['white', 'green', 'blue', 'red', 'purple','orange']
    }, 
    name: 'Change Classification Map'
  });
  
  
  
    var legend = ui.Panel({
    style: {
      position: 'bottom-left',
      padding: '5px'
    }
  });
  
  var legendTitle = ui.Label({
  value: 'Change Strata',
  style: {
    fontSize: '20px',
    fontWeight: 'bold',
    margin: '0px'
  }
});

  legend.add(legendTitle);

  var legend_keys = [
  'other_change',
  'solar_defor',
  'solar_other',
  'solar_buffer',
  'solar_potential',
  'defor_adj'
  ];
  var legend_color = ['black', 'green', 'blue', 'red', 'purple','orange'];

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

for(var i=0; i<6; i++){
  legend.add(list_legend(legend_color[i], legend_keys[i]))
}

  app.main.mapPanel.add(legend)
  
  ui.root.add(fullUI)
  
  focusFeature(0)
};

initApp()


