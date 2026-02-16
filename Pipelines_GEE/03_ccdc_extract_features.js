// Feature extraction from CCDC fitting information
// Extract Break timing, change magnitude, amplitude, summer max


var ut = require('users/kangjoon/Solar_MA_CCDCSNIC/00_config');
var utils = require('projects/GLANCE:ccdcUtilities/api');
var palettes = require('users/gena/packages:palettes');
var wd = 'projects/kangjoon/assets/MA_Solar/';
//var output = wd + 'Define Map Path here';
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

// PROPS.dataPath = 'Define Imagecollection output here';
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
  
  print(FILTER.ccdImage, 'FILTER.ccdImage');

  var test = ut.getAmplitudeMulti(FILTER.ccdImage, Math.floor(FILTER.formattedEnd), 1, FILTER.bandList, GLOBAL.SEGS)
  print(test,'test');
  
  Map.addLayer(test,{},'test')
  
  FILTER.synt = annualSynt(FILTER.ccdImage, Math.floor(FILTER.formattedStart), 
                            Math.floor(FILTER.formattedEnd), FILTER.peakSummer, FILTER.syntList);
  print(FILTER.synt,'FILTER.synt');                 
  
  FILTER.ccdImage2 = addModDif_test(FILTER.ccdImage, FILTER.synt, Math.floor(FILTER.formattedStart), Math.floor(FILTER.formattedEnd),
                                      FILTER.bandList, FILTER.bandmeanList, FILTER.peakSummer/365.25);
  print(FILTER.ccdImage2,'FILTER.ccdImage2');
  
  FILTER.Max = filterMag(FILTER.ccdImage2, FILTER.formattedStart, FILTER.formattedEnd, FILTER.bandList, GLOBAL.SEGS);

  
  var dif = FILTER.Max.select('.*_DIF');
  var tBreak = FILTER.Max.select(['Albedo_tBreak','TEMP_tBreak','NDVI_tBreak','NDBI_tBreak','NDTI_tBreak','BSI_tBreak']);
  var last = FILTER.ccdImage2.select('Final_.*')

  
  //Selected Features
  FILTER.SFMAP = dif.addBands(tBreak).addBands(last).addBands(test);
  print(FILTER.SFMAP, 'SFMAP')
  
  var areaID = 'MA';
  var geometry = region;
  
  expt(FILTER.SFMAP.set({area: areaID, type: 'CHG'}), areaID + '_CHG', geometry);
  

  FILTER.peaktest = addModDif_test2(FILTER.ccdImage, FILTER.synt, Math.floor(FILTER.formattedStart), Math.floor(FILTER.formattedEnd),
                                      FILTER.bandList, FILTER.bandmeanList, FILTER.peakSummer/365.25);
  print(FILTER.peaktest,'FILTER.peaktest');
  
  var areaID = 'MA';
  var geometry = region;
  expt(FILTER.peaktest.set({area: areaID, type: 'Peak'}), areaID + '_Peak', geometry);
  
