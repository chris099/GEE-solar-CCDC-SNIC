/**** 02_ccdc_run.js
 * CCDC fitting + tiled exports for Massachusetts (Landsat TS)
 * Author: Kangjoon Cho (original utilities by Xiaojing Tang / GLANCE CCDC utilities)
 *
 * What this script does:
 *  1) Build MA ROI and a covering grid
 *  2) For each grid cell: fetch Landsat time series (scaled), run CCDC, export result to Asset
 *
 * Expected outputs:
 *  - An asset Image per tile: <assetCollection>/<imageBaseName>tile<i>
 *
 * Notes:
 *  - This script focuses on CCDC fit only. Feature engineering / change metrics belong in later steps.
 ****/

// -----------------------------
// Imports
// -----------------------------
var ut = require('users/kangjoon/Solar_MA_CCDCSNIC/00_config');

// -----------------------------
// Config (ideally comes from 00_config.js)
// If you later move to 00_config.js, keep the variable names identical.
// -----------------------------
var ccdPeriod = ee.Dictionary({ start: '2005-01-01', end: '2025-01-01' });

// region and grid for processing
var region_path = 'projects/kangjoon/assets/MA_Solar/MA_boundary';
var region = ee.FeatureCollection(region_path);
Map.addLayer(region,{},'region')

var grid_path = 'projects/kangjoon/assets/MA_Solar/MA_grid';
var grid = ee.FeatureCollection(grid_path);

// CCDC Parameters
var ccdParam = {
  dateFormat: 1,
  breakpointBands: ['NDVI', 'NDBI', 'NDTI', 'BSI', 'TEMP', 'Albedo'],
  minObservations: 6,
  chiSquareProbability: 0.99,
  lambda: 5,
  maxIterations: 25000
};

// Landsat collection, # of segments, scaling metadata
var collection = 2;
var scaleFactor = 0.0001;
var nSeg = 10;
var res = 30;

// Define Global Variables
var GLOBAL = {};
var app = {};
var listener = 0;
var FILTER = {};
var PROPS = {};

GLOBAL.SUBCOEFS = ["INTP", "SLP", "COS", "SIN", "COS2", "SIN2", "COS3", "SIN3"];
GLOBAL.COEFS = GLOBAL.SUBCOEFS.concat("RMSE");
GLOBAL.FULLCOEFS = GLOBAL.COEFS.concat('PHASE', 'AMPLITUDE', 'PHASE2', 'AMPLITUDE2', 'PHASE3', 'AMPLITUDE3');
GLOBAL.SEGS = ["S1", "S2", "S3", "S4", "S5", "S6"];


// Spectral mixture endmembers
var endMembers = {
  high: [2500, 5000, 4300, 5100, 4100, 5600],
  low:  [ 800, 1300,  900,  900,  300,  400],
  vege: [ 900, 1300,  700, 5400, 1600, 1000],
  soil: [1000, 1700, 1500, 2700, 2600, 2800]
};

// Due to heavy CCDC processing, We will process pre-defined grid unit 
  var seq = ee.List.sequence(1, ee.Number(grid.size()));
  var roi = ee.FeatureCollection('TIGER/2018/States').filter(ee.Filter.equals('NAME','Massachusetts'));
  var projection = 'EPSG:4326'; //WGS lat lon
  var dx = 0.3;
  var dy = 0.3;
  
  var proj = ee.Projection(projection).scale(dx,dy);
  var grid = roi.geometry().coveringGrid(proj);
  
  var gridSize=grid.size().getInfo();
  var gridList=grid.toList(gridSize);

// Showing roi and grid info

//Map.addLayer(roi,{}, 'roi');
//Map.addLayer(grid,{}, 'grid');

// Bands you actually fit/export (keep consistent with breakpointBands)
var fitBands = ['NDVI', 'NDBI', 'NDTI', 'BSI', 'TEMP', 'Albedo'];

// Export naming
var imageBaseName = 'CCDC_Solar_2024_';
//var assetCollection = 'Define your path here';


// -----------------------------
// Helper functions
// -----------------------------
var runCCD = function(images) {
  return ut.runCCD(ccdParam, images);
};

var saveCCD = function(ccd, des, name, region, res, wd) {
  Export.image.toAsset({
        image: ccd,
        scale: res,
        description: des,
        assetId: wd + name,
        region: region,
        maxPixels: 1e13,
        pyramidingPolicy: {'.default': 'sample'}
  });
};
  

// -----------------------------
// Main CCDC export loop over grids
// -----------------------------
for (var i=0; i < gridSize; i++){

    // Extract grid polygon and filter S2 datasets for this region.
    var gridCell=ee.Feature(gridList.get(i)).geometry();
    
    var images = ut.getLandsatTS_scaled4(gridCell, ccdPeriod, endMembers, false, true).select(['NDVI', 'NDBI', 'NDTI', 'BSI', 'TEMP', 'Albedo']);
    
    var imagename = imagebaseName + 'tile' + i;
    
    var ccd = runCCD(images)
            .set({start: ccdPeriod.get('start'),
                  end: ccdPeriod.get('end'),
                  breakpointBands: ccdParam.breakpointBands,
                  dateFormat: ccdParam.dateFormat,
                  minObservations: ccdParam.minObservations,
                  maxIterations: ccdParam.maxIterations,
                  lambda: ccdParam.lambda,
                  site: 'MA',
                  id: i,
                  scaleFactor: scaleFactor,
                  collection: collection,
                  res: res
            });
  
    
   Export.image.toAsset({
       image: ccd,
       description: imagename,
       assetId: assetCollection + '/' + imagename,
       scale: 30,
       region: gridCell,
       maxPixels: 1e13,
       pyramidingPolicy: {'.default': 'sample'}
   });
  }
