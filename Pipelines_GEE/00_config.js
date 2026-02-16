
// Utilities

// CCD Utilities
// ---------------------------------------------------------------
var utils =
    require('users/kangjoon/Fall2021:utilities/CCDC.js');

// ---------------------------------------------------------------
// Common Utilities
var convertDateFormat = function(date, format) {
  if (format == 0) { 
    var epoch = 719529;
    var days = date.difference(ee.Date('1970-01-01'), 'day');
    return days.add(epoch);
  } else if (format == 1) {
    var year = date.get('year');
    var fYear = date.difference(ee.Date.fromYMD(year, 1, 1), 'year');
    return year.add(fYear);
  } else {
    return date.millis();
  }
};

var addPixel = function(mapObject, coords, pixelSize, color, name) {
  var pixel = ee.Geometry.Rectangle([coords.lon-pixelSize, coords.lat-pixelSize, 
                                      coords.lon+pixelSize, coords.lat+pixelSize]);
  mapObject.addLayer(pixel, {color: color}, name);
};

var removeLayer = function(mapObject, name) {
  var layers = mapObject.layers();
  var nLayer = layers.length();
  for (var i = nLayer-1; i >= 0; i--) {
    var layer = layers.get(i);
    if (layer.getName().match(name)) {
      layers.remove(layer);
    }
  }
};

var getDateList = function(collection, format) {
  return collection.aggregate_array('system:time_start')
                    .map(function(t){return(convertDateFormat(ee.Date(t),1))});
};

var addImgDate = function(col) {
  return col.map(function(img){
    return img.set({image_date: img.date().format('yyyy-MM-dd')});
  });
};

var dailyComposite = function(col) {
  var dates = col.aggregate_array('image_date').distinct();
  
  var combine = function(col) {
    var img = col.mosaic();
    var first = col.first();
    return img.rename(first.bandNames()).copyProperties(first).set({'system:time_start': first.get('system:time_start')});
  };
  
  return ee.ImageCollection(dates.map(function(date) {
    var col2 = col.filterMetadata('image_date', 'equals', date);
    return combine(col2);
  }));
};

var genSegTag = function(nSegments) {
  return ee.List.sequence(1, nSegments).map(function(i) {
    return ee.String('S').cat(ee.Number(i).int())});
};

var genBandTag = function(bands, tag) {
  return ee.List(bands).map(function(s) {
    return ee.String(s).cat(tag)});
};

// ---------------------------------------------------------------
// CCDC Utilities
var genCCDCImage = function(fit, nSeg, bands) {
  bands = bands.map(function(x){return x + '_'});
  var magnitude = genCoefImg(fit, nSeg, bands, 'magnitude');
  var rmse = genCoefImg(fit, nSeg, bands, 'rmse');
  var coef = genHarmImg(fit, nSeg, bands);
  var tStart = genCoefImg(fit, nSeg, [''], 'tStart');
  var tEnd = genCoefImg(fit, nSeg, [''], 'tEnd');
  var tBreak = genCoefImg(fit, nSeg, [''], 'tBreak');
  var probs = genCoefImg(fit, nSeg, [''], 'changeProb');
  var nobs = genCoefImg(fit, nSeg, [''], 'numObs');
  return ee.Image.cat(rmse, magnitude, coef, tStart, tEnd, tBreak, probs, nobs);
};

var genCoefImg = function(fit, nSeg, bands, coef) {
  var segTag = genSegTag(nSeg);
  var zeros = ee.Array(0).repeat(0, nSeg);
  var getCoefImg = function(band) {
    var coefImg = fit.select(band + coef).arrayCat(zeros, 0).float().arraySlice(0, 0, nSeg);
    var tags = segTag.map(function(x) {
      return ee.String(x).cat('_').cat(band).cat(coef)});
    return coefImg.arrayFlatten([tags]);
  };
  return ee.Image(bands.map(getCoefImg));
};

var genHarmImg = function(fit, nSeg, bands) {
  var harmTag = ['INTP','SLP','COS','SIN','COS2','SIN2','COS3','SIN3'];
  var segTag = genSegTag(nSeg);
  var bandTag = genBandTag(bands, 'coef');
  var zeros = ee.Image(ee.Array([ee.List.repeat(0, harmTag.length)])).arrayRepeat(0, nSeg);
  var getHarmImg = function(band) {
    var coefImg = fit.select(band + 'coefs').arrayCat(zeros, 0).float().arraySlice(0, 0, nSeg);
    var tags = segTag.map(function(x) {
      return ee.String(x).cat('_').cat(band).cat('coef')});
    return coefImg.arrayFlatten([tags, harmTag]);
  };
  return ee.Image(bands.map(getHarmImg));
};

// ---------------------------------------------------------------
// Landsat Utilities
var c2ToSR = function(img) {
  return img.addBands(img.multiply(0.0000275).add(-0.2).multiply(10000), img.bandNames(), true);
};
var c2ToLST = function(img) {
  return img.addBands(img.multiply(0.00341802).add(149.0).add(-273.15).multiply(100), img.bandNames(), true);
};

var getLandsatImage = function(region, date) {
  var collection5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
                      .filterBounds(region).map(maskL754);
  var collection7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
                      .filterBounds(region).map(maskL754);
  var collection8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
                      .filterBounds(region).map(maskL8);
  var col = collection5.merge(collection7).merge(collection8);
  //var col = ee.ImageCollection([collection5, collection7, collection8]).flatten();
  var imDate = ee.Date(date);
  var befDate = imDate.advance(-1, 'day');
  var aftDate = imDate.advance(1, 'day');
  var selectedImage = col.filterDate(befDate, aftDate);
  return ee.Algorithms.If(selectedImage.size().gt(0), selectedImage.first(), null);
};

var getLandsatTS = function(region, params, endMembers, merge, filter) {
  var collection5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
      .filterDate(params.get('start'), params.get('end'))
      .filterBounds(region).map(maskL754);
  var collection7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
      .filterDate(params.get('start'), params.get('end'))
      .filterBounds(region).map(maskL754);
  var collection8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
      .filterDate(params.get('start'), params.get('end'))
      .filterBounds(region).map(maskL8);
  var col = collection5.merge(collection7).merge(collection8);
  //var col = ee.ImageCollection([collection5, collection7, collection8]).flatten();
  var col_vi = col.map(calNDVI);
  
  if (filter) {
    var unmixed = extremeFilter(unmixing(col_vi, endMembers));
  } else {
    var unmixed = unmixing(col_vi, endMembers);
  } 
  
  if (merge) {
    return dailyComposite(addImgDate(unmixed));
  } else {
    return unmixed;
  } 
};


var getLandsatTS_therm = function(region, params) {
  var collection5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
      .filterDate(params.get('start'), params.get('end'))
      .filterBounds(region).map(maskL754_therm);
  var collection7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
      .filterDate(params.get('start'), params.get('end'))
      .filterBounds(region).map(maskL754_therm);
  var collection8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
      .filterDate(params.get('start'), params.get('end'))
      .filterBounds(region).map(maskL8_therm);
  var col = collection5.merge(collection7).merge(collection8);
  var col_albedo = col.map(calc_albedo);
  //var mergedCollection = ee.ImageCollection(col_albedo).filterDate(params.get('start'), params.get('end'));
  //var col = ee.ImageCollection([collection5, collection7, collection8]).flatten();
  return col_albedo
  
};


var getLandsatTS_scaled2 = function(region, params, endMembers, merge, filter) {
  var collection5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
      .filterDate(params.get('start'), params.get('end'))
      .filterBounds(region).map(maskL754);
  var collection7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
      .filterDate(params.get('start'), params.get('end'))
      .filterBounds(region).map(maskL754);
  var collection8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
      .filterDate(params.get('start'), params.get('end'))
      .filterBounds(region).map(maskL8);
  var col = collection5.merge(collection7).merge(collection8);
  //var col = ee.ImageCollection([collection5, collection7, collection8]).flatten();
  var col_vi = col.map(calNDVI);
  var col_albedo = col.map(calc_albedo);
  
  if (filter) {
    var unmixed = extremeFilter(unmixing(col_albedo, endMembers));
  } else {
    var unmixed = unmixing(col_albedo, endMembers);
  } 
  
  if (merge) {
    return dailyComposite(addImgDate(unmixed));
  } else {
    return unmixed;
  } 
};


var getLandsatTS_scaled3 = function(region, params, endMembers, merge, filter) {
  var collection5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
      .filterDate(params.get('start'), params.get('end'))
      .filterBounds(region).map(maskL754);
  var collection7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
      .filterDate(params.get('start'), params.get('end'))
      .filterBounds(region).map(maskL754);
  var collection8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
      .filterDate(params.get('start'), params.get('end'))
      .filterBounds(region).map(maskL8);
  var col = collection5.merge(collection7).merge(collection8);
  //var col = ee.ImageCollection([collection5, collection7, collection8]).flatten();
  var col_vi = col.map(calNDVI);
  var col_albedo = col.map(calc_albedo);
  
  if (filter) {
    var unmixed = extremeFilter2(unmixing_scaled(col_albedo, endMembers));
  } else {
    var unmixed = unmixing_scaled(col_albedo, endMembers);
  } 
  
  if (merge) {
    return dailyComposite(addImgDate(unmixed));
  } else {
    return unmixed;
  } 
};

var getLandsatTS_scaled4 = function(region, params, endMembers, merge, filter) {
  var collection5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
      .filterDate(params.get('start'), params.get('end'))
      .filterBounds(region).map(maskL754);
  var collection7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
      .filterDate(params.get('start'), params.get('end'))
      .filterBounds(region).map(maskL754);
  var collection8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
      .filterDate(params.get('start'), params.get('end'))
      .filterBounds(region).map(maskL8);
  var col = collection5.merge(collection7).merge(collection8);
  //var col = ee.ImageCollection([collection5, collection7, collection8]).flatten();
  var col_ndvi = col.map(calNDVI);
  var col_ndbi = col_ndvi.map(calNDBI);
  var col_ndti = col_ndbi.map(calNDTI);
  var col_bsi = col_ndti.map(calc_bsi);
  var col_albedo = col_bsi.map(calc_albedo);
  
  
  if (filter) {
    var unmixed = extremeFilter2(unmixing_scaled(col_albedo, endMembers));
  } else {
    var unmixed = unmixing_scaled(col_albedo, endMembers);
  } 
  
  if (merge) {
    return dailyComposite(addImgDate(unmixed));
  } else {
    return unmixed;
  } 
};

// var doIndices = function(iCol) {
//   var iColIndices = iCol.map(function(image) {
//                         var albedo =  calc_albedo(image);
//                         var imageIndices = image.addBands([albedo])
//                         return imageIndices;
//                     });
//   return iColIndices;
// }


var calc_albedo = function(img) {
  var albedo = img.expression(
          'float((BLUE * 0.356) + (RED * 0.130) + (NIR * 0.373) + (SWIR1 * 0.085) + (SWIR2 * 0.072) - 0.0018)/1.016',
          {
          'SWIR2': img.select('SWIR2'),
          'SWIR1': img.select('SWIR1'),
          'NIR': img.select('NIR'),
          'RED': img.select('RED'),
          'GREEN': img.select('GREEN'),
          'BLUE': img.select('BLUE')
          });
  var mask3 = albedo.reduce(ee.Reducer.min()).gt(0);
  var mask4 = albedo.reduce(ee.Reducer.max()).lt(6000);
  var Albedo = ee.Image(albedo).rename('Albedo');
  return img.addBands(Albedo);
};


var calc_bsi = function(img) {
  var bsi = img.expression(
          'float(((SWIR1 + RED - NIR - BLUE)/(SWIR1 + RED + NIR + BLUE)) * 10000)',
          {
          'SWIR2': img.select('SWIR2'),
          'SWIR1': img.select('SWIR1'),
          'NIR': img.select('NIR'),
          'RED': img.select('RED'),
          'GREEN': img.select('GREEN'),
          'BLUE': img.select('BLUE')
          });
  var BSI = ee.Image(bsi).rename('BSI');
  return img.addBands(BSI);
};


var maskL8 = function(img) {
  var sr = c2ToSR(img.select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7']))
              .rename(['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2']);
  var lst = c2ToLST(img.select(['ST_B10']))
              .rename(['TEMP'])
  var scaled = sr.addBands(lst, null, true)
  var validQA = [21824, 21888, 21952];
  var mask1 = img.select(['QA_PIXEL']).remap(validQA, ee.List.repeat(1, validQA.length), 0);
  var mask2 = sr.reduce(ee.Reducer.min()).gt(0);
  var mask3 = sr.reduce(ee.Reducer.max()).lt(10000);
  var mask4 = img.select('QA_RADSAT').eq(0);
  return scaled.updateMask(mask1.and(mask2).and(mask3).and(mask4));
};

var maskL8_scaled = function(img) {
  
  var bandList = ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7', 'ST_B10']
  var nameList = ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2', 'TEMP']
  var subBand = ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2']
  
  var opticalBands = img.select('SR_B.').multiply(0.0000275).add(-0.2).multiply(10000);
  var thermalBand = img.select('ST_B10').multiply(0.00341802).add(149.0).add(-273.15).multiply(100);
  var scaled = opticalBands.addBands(thermalBand, null, true).select(bandList)
      .rename(nameList);
  
  var validQA = [21824, 21888, 21952];
  
  var mask1 = img.select(['QA_PIXEL']).remap(validQA, ee.List.repeat(1, validQA.length), 0);
  var mask2 = img.select('QA_RADSAT').eq(0);
  var mask3 = scaled.reduce(ee.Reducer.min()).gt(0);
  var mask4 = scaled.reduce(ee.Reducer.max()).lt(10000);
  
  return ee.Image(img).addBands(scaled).updateMask(mask1.and(mask2).and(mask3).and(mask4)).select(['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2', 'TEMP']);
};

var maskL8_therm = function(img) {
  
  var bandList = ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7', 'ST_B10']
  var nameList = ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2', 'TEMP']
  var subBand = ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2']
  
  var opticalBands = img.select('SR_B.').multiply(0.0000275).add(-0.2).multiply(10000);
  var thermalBand = img.select('ST_B10').multiply(0.00341802).add(149.0);
  var scaled = opticalBands.addBands(thermalBand, null, true).select(bandList)
      .rename(nameList);
  
  var validQA = [21824, 21888, 21952];
  
  var mask1 = img.select(['QA_PIXEL']).remap(validQA, ee.List.repeat(1, validQA.length), 0);
  var mask2 = img.select('QA_RADSAT').eq(0);
  var mask3 = scaled.reduce(ee.Reducer.min()).gt(0);
  var mask4 = scaled.reduce(ee.Reducer.max()).lt(10000);
  
  return ee.Image(img).addBands(scaled).updateMask(mask1.and(mask2).and(mask3).and(mask4)).select(['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2', 'TEMP']);
};

var maskL754 = function(img) {
  var sr = c2ToSR(img.select(['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7']))
              .rename(['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2']);
  var lst = c2ToLST(img.select(['ST_B6']))
              .rename(['TEMP'])
  var scaled = sr.addBands(lst, null, true)
  var validQA = [5440, 5504];
  var mask1 = img.select(['QA_PIXEL']).remap(validQA, ee.List.repeat(1, validQA.length), 0);
  var mask2 = img.select('QA_RADSAT').eq(0);
  var mask3 = sr.reduce(ee.Reducer.min()).gt(0);
  var mask4 = sr.reduce(ee.Reducer.max()).lt(10000);
  return scaled.updateMask(mask1.and(mask2).and(mask3).and(mask4));
};

var maskL754_therm = function(img) {
  var bandList = ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7', 'ST_B6']
  var nameList = ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2', 'TEMP']
  var subBand = ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2']
  
  var opticalBands = img.select('SR_B.').multiply(0.0000275).add(-0.2).multiply(10000);
  var thermalBand = img.select('ST_B6').multiply(0.00341802).add(149.0);
  var scaled = opticalBands.addBands(thermalBand, null, true).select(bandList)
      .rename(nameList);
  
  var validQA = [5440, 5504];
  
  var mask1 = img.select(['QA_PIXEL']).remap(validQA, ee.List.repeat(1, validQA.length), 0);
  var mask2 = img.select('QA_RADSAT').eq(0);
  var mask3 = scaled.reduce(ee.Reducer.min()).gt(0);
  var mask4 = scaled.reduce(ee.Reducer.max()).lt(10000);
  
  return ee.Image(img).addBands(scaled).updateMask(mask1.and(mask2).and(mask3).and(mask4)).select(['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2', 'TEMP']);
};

var maskL754_scaled = function(img) {
  var bandList = ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7', 'ST_B6']
  var nameList = ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2', 'TEMP']
  var subBand = ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2']
  
  var opticalBands = img.select('SR_B.').multiply(0.0000275).add(-0.2).multiply(10000);
  var thermalBand = img.select('ST_B6').multiply(0.00341802).add(149.0).add(-273.15).multiply(100);
  var scaled = opticalBands.addBands(thermalBand, null, true).select(bandList)
      .rename(nameList);
  
  var validQA = [5440, 5504];
  
  var mask1 = img.select(['QA_PIXEL']).remap(validQA, ee.List.repeat(1, validQA.length), 0);
  var mask2 = img.select('QA_RADSAT').eq(0);
  var mask3 = scaled.reduce(ee.Reducer.min()).gt(0);
  var mask4 = scaled.reduce(ee.Reducer.max()).lt(10000);
  
  return ee.Image(img).addBands(scaled).updateMask(mask1.and(mask2).and(mask3).and(mask4)).select(['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2', 'TEMP']);
};

var unmixing = function(col, endMembers) { 
  var high = endMembers.high;
  var low = endMembers.low;
  var vege = endMembers.vege;
  var soil = endMembers.soil;
  
  return col.map(function(img){
    var unmixed = img.select(['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2'])
                    .unmix([high, low, vege, soil], true, true).multiply(10000)
                    .rename(['High','Low','Vege','Soil']);
    
    return img.addBands(unmixed);
  });
};

var unmixing_scaled = function(col, endMembers) { 
  var high = endMembers.high;
  var low = endMembers.low;
  var vege = endMembers.vege;
  var soil = endMembers.soil;
  
  return col.map(function(img){
    var unmixed = img.select(['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2'])
                    .unmix([high, low, vege, soil], true, true).multiply(1000)
                    .rename(['High','Low','Vege','Soil']);
    
    return img.addBands(unmixed);
  });
};

var calNDVI = function(img) {
   var ndvi = img.normalizedDifference(['NIR', 'RED']).multiply(10000).rename('NDVI');
   return img.addBands(ndvi);
};

var calNDBI = function(img) {
   var ndbi = img.normalizedDifference(['SWIR1', 'NIR']).multiply(10000).rename('NDBI');
   return img.addBands(ndbi);
};

var calNDTI = function(img) {
   var ndti = img.normalizedDifference(['SWIR2', 'SWIR1']).multiply(10000).rename('NDTI');
   return img.addBands(ndti);
};



var extremeFilter = function(col) {
  var high_cand = col.select('High').reduce(ee.Reducer.percentile([95])).lt(50);
  var low_cand = col.select('Low').reduce(ee.Reducer.percentile([95])).lt(50);
  var soil_cand = col.select('Soil').reduce(ee.Reducer.percentile([95])).lt(50);
  var vege_cand = col.select('Vege').reduce(ee.Reducer.percentile([95])).lt(50);
  return ee.ImageCollection(col.map(function(img){
    return img.updateMask(img.select('High').gt(500).and(high_cand).not())
              .updateMask(img.select('Low').gt(500).and(low_cand).not())
              .updateMask(img.select('Soil').gt(500).and(soil_cand).not())
              .updateMask(img.select('Vege').gt(500).and(vege_cand).not());
  }));
};

var extremeFilter2 = function(col) {
  var high_cand = col.select('High').reduce(ee.Reducer.percentile([95])).lt(5);
  var low_cand = col.select('Low').reduce(ee.Reducer.percentile([95])).lt(5);
  var soil_cand = col.select('Soil').reduce(ee.Reducer.percentile([95])).lt(5);
  var vege_cand = col.select('Vege').reduce(ee.Reducer.percentile([95])).lt(5);
  return ee.ImageCollection(col.map(function(img){
    return img.updateMask(img.select('High').gt(50).and(high_cand).not())
              .updateMask(img.select('Low').gt(50).and(low_cand).not())
              .updateMask(img.select('Soil').gt(50).and(soil_cand).not())
              .updateMask(img.select('Vege').gt(50).and(vege_cand).not());
  }));
};


var runCCD = function(ccdParam, collection) {
  ccdParam.collection = collection;
  return ee.Algorithms.TemporalSegmentation.Ccdc(ccdParam);
};
  
  // generate a header list based on number of segments
var genSegList = function(nSeg) {
  var segList = ["dateString", "x"];
  for (var i = 0; i < nSeg; i++) {
    segList.push("h".concat(i.toString()));
  }
  segList.push("fit");
  return segList;
};

  // get CCD time series
var getTimeSeriesNoCCD = function(data, geometry, dateFormat, band) {
  var proj = ee.Projection("EPSG:4326").atScale(30);
  
  function produceTimeSeries(collection, geometry, band) {
    collection = collection.sort('system:time_start');

    var timeSeries = collection.map(function(img) {
      var time = convertDateFormat(img.date(), dateFormat);
      var value = img.select(band).reduceRegion({
        reducer: ee.Reducer.first(), 
        geometry: geometry,
        crs: proj
      }).getNumber(band);
      return ee.Feature(geometry).set({
        x: value,
        fitTime: time,
        dateString: img.date().format("YYYY-MM-dd")
      });
    });
    return timeSeries;
  }
  
  return produceTimeSeries(data, geometry, band);
};

  // get CCD time series
var getTimeSeries = function(train, ccd, geometry, dateFormat, band, padding) {
  var proj = ee.Projection("EPSG:4326").atScale(30);
  var ccdFits = ccd.reduceRegion({
    reducer: ee.Reducer.first(), 
    geometry: geometry, 
    crs: proj});

  function dateToSegment(t, fit) {
    var tStart = ee.Array(fit.get('tStart'));
    var tEnd = ee.Array(fit.get('tEnd'));
    var segment = tEnd.gte(t).toList().indexOf(1);
    var last = tStart.toList().length().subtract(1);
    return ee.Number(ee.Algorithms.If(segment.add(1), segment, last));
  }
  
  function produceTimeSeries(collection, geometry, band) {
    if (padding) {
      collection = collection.sort('system:time_start');
      var first = collection.first();
      var last = collection.sort('system:time_start', false).first();
      var fakeDates = ee.List.sequence(first.date().get('year'), last.date().get('year'), padding)
        .map(function(t) {
        var fYear = ee.Number(t);
        var year = fYear.floor();
        return  ee.Date.fromYMD(year, 1, 1).advance(fYear.subtract(year), 'year')});
      fakeDates = fakeDates.map(function(d) { 
        return ee.Image().rename(band).set('system:time_start', ee.Date(d).millis())});
      collection = collection.merge(fakeDates);
    }    
    collection = collection.sort('system:time_start');

    var timeSeries = collection.map(function(img) {
      var time = convertDateFormat(img.date(), dateFormat);
      var segment = dateToSegment(time, ccdFits);
      var value = img.select(band).reduceRegion({
        reducer: ee.Reducer.first(), 
        geometry: geometry,
        crs: proj
      }).getNumber(band);
      var coef = ee.Algorithms.If(segment.add(1), 
        ccdFits.getArray(band + '_coefs')
          .slice(0, segment, segment.add(1))
          .project([1]),
        ee.Array([0, 0, 0, 0, 0, 0, 0, 0, 0]));
      var fit = harmonicFit(time, ee.Array(coef), dateFormat);
      return img.set({
        x: value,
        fitTime: time,
        fit: fit,
        coef: coef,
        segment: segment,
        dateString: img.date().format("YYYY-MM-dd")
      }).set(segment.format("h%d"), fit);
    });
    return timeSeries;
  }
  
  return produceTimeSeries(train, geometry, band);
};

  // convert CCD time series to a table for charting
var getCCDTable = function(ccdTS, segList) {
  var listLen = segList.length;
  return ccdTS.reduceColumns(ee.Reducer.toList(listLen, listLen), segList).get('list');
};

  // make a CCD chart
var getCCDChart = function(table, sensor, band, lat, lon, nSeg, ccdParam) {
  function getLetter(x){
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var charCode = alphabet.charCodeAt(x);
    return String.fromCharCode(charCode);
  }
  
  function genDict(letter, index) {
    var fitName = 'fit '.concat(index.toString());
    return {id: letter, label: fitName, type: 'number'};
  }
  
  function formatTable(table) {
    var cols = [{id: 'A', label: 'Date', type: 'date'},
            {id: 'B', label: sensor, type: 'number'}];
    for (var i = 1; i <= nSeg; i++) {
      var dict = genDict(getLetter(i+1), i);
      cols.push(dict);
    }
    var values = table.map(function(list) {
      return {c: list.map(function(item, index) {
        return {"v": index == 0 ? new Date(item): item};
      })};
    });
    return {cols: cols, rows: values};
  }
  
  function getLimits(table, column) {
    var col = table.map(function(l){return l[column]})
      .filter(function(i){return i != null});
    return [Math.min.apply(Math, col), Math.max.apply(Math, col)];
  }
  
  var tmp = ccdParam.lambda;
  var tmp2 = ccdParam.chiSquareProbability;
  var formatted = formatTable(table);
  var chart = ui.Chart(formatted, 'LineChart', {
        title: 'Pixel located at ' + lat.toFixed(3) + ', ' + lon.toFixed(3) + ' / Lambda ' + tmp + ' / ChiSqProb ' + tmp2,
        pointSize: 0,
        series: {
          0: { pointSize: 1.8, lineWidth: 0}
        },
        vAxis: {
          title: 'Surface reflectance (' + band + ')',
          viewWindowMode: 'explicit'
        },
        height: '90%',
        stretch: 'both'
  });
  return chart;
};

  // harmonic fitting
var harmonicFit = function(t, coef, dateFormat) {
  var PI2 = 2.0 * Math.PI;
  var OMEGAS = [PI2 / 365.25, PI2, PI2 / (1000 * 60 * 60 * 24 * 365.25)];
  var omega = OMEGAS[dateFormat];
  return coef.get([0])
    .add(coef.get([1]).multiply(t))
    .add(coef.get([2]).multiply(t.multiply(omega).cos()))
    .add(coef.get([3]).multiply(t.multiply(omega).sin()))
    .add(coef.get([4]).multiply(t.multiply(omega * 2).cos()))
    .add(coef.get([5]).multiply(t.multiply(omega * 2).sin()))
    .add(coef.get([6]).multiply(t.multiply(omega * 3).cos()))
    .add(coef.get([7]).multiply(t.multiply(omega * 3).sin()));
};

var getPeakSyntheticForYear = function(image, date, dateFormat, band, segs) {
  var tfit = date;
  var PI2 = 2.0 * Math.PI;
  var OMEGAS = [PI2 / 365.25, PI2, PI2 / (1000 * 60 * 60 * 24 * 365.25)];
  var omega = OMEGAS[dateFormat];
  var imageT = ee.Image.constant([1, tfit,
                                tfit.multiply(omega).cos(),
                                tfit.multiply(omega).sin(),
                                tfit.multiply(omega * 2).cos(),
                                tfit.multiply(omega * 2).sin(),
                                tfit.multiply(omega * 3).cos(),
                                tfit.multiply(omega * 3).sin()]).float();
  var COEFS = ["INTP", "SLP", "COS", "SIN", "COS2", "SIN2", "COS3", "SIN3"];
  var newParams = utils.getMultiCoefs(image, date, [band], COEFS, false, segs, 'after');
  return imageT.multiply(newParams).reduce('sum').rename(band);
};

var getAmplitudeForYear = function(image, date, dateFormat, band, segs) {
  var tfit = date;
  var imageT = ee.Image.constant([1, 1, 1, 1, 1, 1, 1, 1, 1]).float();
  var COEFS = ["INTP", "SLP", "COS", "SIN", "COS2", "SIN2", "COS3", "SIN3", "RMSE"];
  var newParams = utils.getMultiCoefs(image, date, [band], COEFS, false, segs, 'after');
  var test = imageT.multiply(newParams);
  var slope = test.select([1]);
  var cos1 = test.select([2]);
  var sin1 = test.select([3]);
  var cos2 = test.select([4]);
  var sin2 = test.select([5]);
  var cos3 = test.select([6]);
  var sin3 = test.select([7]);
  var Amp1 = cos1.pow(2).add(sin1.pow(2)).sqrt();
  var Amp2 = cos2.pow(2).add(sin2.pow(2)).sqrt();
  var Amp3 = cos3.pow(2).add(sin3.pow(2)).sqrt();
  var rmse = test.select([8]);
  
  return ee.Image.cat([slope, Amp1, Amp2, Amp3, rmse])
            .rename([band + '_SLP_LAST', band + '_AMP1_LAST', band + '_AMP2_LAST', band + '_AMP3_LAST', band + '_RMSE_LAST'])
};

var getAmplitudeMulti = function(image, date, dateFormat, bandList, segs){
  var retrieveAmplitude = function(band){
    return getAmplitudeForYear(image, date, dateFormat, band, segs);
  };
  return ee.Image.cat(bandList.map(retrieveAmplitude));
};


var getMeanSyntheticForYear = function(image, date, dateFormat, band, segs) {
  var tfit = date;
  var PI2 = 2.0 * Math.PI;
  var OMEGAS = [PI2 / 365.25, PI2, PI2 / (1000 * 60 * 60 * 24 * 365.25)];
  var omega = OMEGAS[dateFormat];
  var imageT = ee.Image.constant([1, tfit]).float();
  var COEFS = ["INTP", "SLP"];
  var newParams = utils.getMultiCoefs(image, date, [band], COEFS, false, segs, 'after');
  return imageT.multiply(newParams).reduce('sum').rename(band);
};

var getPeakMultiSynthetic = function(image, date, dateFormat, bandList, segs){
  var retrieveSynthetic = function(band){
    return getPeakSyntheticForYear(image, date, dateFormat, band, segs);
  };
  return ee.Image.cat(bandList.map(retrieveSynthetic));
};

var getMeanMultiSynthetic = function(image, date, dateFormat, bandList, segs){
  var retrieveSynthetic = function(band){
    return getMeanSyntheticForYear(image, date, dateFormat, band, segs);
  };
  return ee.Image.cat(bandList.map(retrieveSynthetic));
};

var runStableModel = function(col, period, bands, dateFormat) {
  var prepareData = function(col, band) {
    return ee.ImageCollection(col.map(function(img){
      return addDependents(img.select(band)).select(['INTP', 'SLP', 'COS', 'SIN', 'COS2', 'SIN2', 'COS3', 'SIN3', band])
              .updateMask(img.select(band).mask());
    }));
  };
  
  var addDependents = function(img){
    var t = ee.Number(utCommon.convertDateFormat(ee.Date(img.get('system:time_start')), 1));
    var PI2 = 2.0 * Math.PI;
    var OMEGAS = [PI2 / 365.25, PI2, PI2 / (1000 * 60 * 60 * 24 * 365.25)];
    var omega = OMEGAS[dateFormat];
    var dependents = ee.Image.constant([1, t, t.multiply(omega).cos(),
                                        t.multiply(omega).sin(),
                                        t.multiply(omega * 2).cos(),
                                        t.multiply(omega * 2).sin(),
                                        t.multiply(omega * 3).cos(),
                                        t.multiply(omega * 3).sin()]).float()
                                        .rename(['INTP', 'SLP', 'COS', 'SIN', 'COS2', 'SIN2', 'COS3', 'SIN3']);
    return img.addBands(dependents);
  };
  var tStart = ee.Image(ee.Array([utCommon.convertDateFormat(ee.Date(period.get('start')), 1)])).rename('tStart');
  var tEnd = ee.Image(ee.Array([utCommon.convertDateFormat(ee.Date(period.get('end')), 1)])).rename('tEnd');
  var tBreak = ee.Image(ee.Array([0])).rename('tBreak');
  var bandNames = ee.List(bands.map(function(x){return [x + '_coefs', x + '_rmse']})).flatten();
  return ee.ImageCollection(bands.map(function(band){
    var col2 = prepareData(col, band);
    var ccd = col2.reduce(ee.Reducer.robustLinearRegression(8, 1), 4).rename([band + '_coefs', band + '_rmse']);
    return ccd.select(band + '_coefs').arrayTranspose().addBands(ccd.select(band + '_rmse'));
  })).toBands().rename(bandNames).addBands(tStart).addBands(tEnd).addBands(tBreak);
};


// ---------------------------------------------------------------
// Exports
exports = {
  convertDateFormat: convertDateFormat,
  getDateList: getDateList,
  getLandsatImage: getLandsatImage,
  getLandsatTS: getLandsatTS,
  getLandsatTS_therm: getLandsatTS_therm,
  getLandsatTS_scaled4: getLandsatTS_scaled4,
  getLandsatTS_scaled3: getLandsatTS_scaled3,
  getLandsatTS_scaled2: getLandsatTS_scaled2,
  runCCD: runCCD,
  genCCDCImage: genCCDCImage,
  getTimeSeries: getTimeSeries,
  genSegList: genSegList,
  getCCDTable: getCCDTable,
  getCCDChart: getCCDChart,
  getPeakMultiSynthetic: getPeakMultiSynthetic,
  getMeanMultiSynthetic: getMeanMultiSynthetic,
  getAmplitudeMulti: getAmplitudeMulti,
  removeLayer: removeLayer,
  addPixel: addPixel,
  getTimeSeriesNoCCD: getTimeSeriesNoCCD,
  runStableModel: runStableModel
};
