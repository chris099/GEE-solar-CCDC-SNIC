// ---------------------------------------------------------------
// Accuracy Assessment (Confusion Matrix) for MA Solar Change Map
// Author: Kangjoon Cho
//
// What this script does:
// 1) Loads interpreted reference samples (FeatureCollection)
// 2) Harmonizes labels into:
//    - change_ref : reference (human-interpreted) class
//    - change_map : mapped (RF) class collapsed to match reference scheme
// 3) Computes confusion matrix + standard accuracy metrics
//
// Notes:
// - Reference labels come from the interpreter field: 'change' (string)
// - Map labels come from the RF output field: 'classification' (numeric)
// - If you want the confusion matrix to reflect the harmonized map scheme,
//   use errorMatrix('change_ref','change_map') instead of 'classification'.
// ---------------------------------------------------------------


// ---------------------------------------------------------------
// 0) Inputs
// ---------------------------------------------------------------

// Area ID
var areaID = 'MA';

// Load interpreted reference samples (must include properties: change, classification)
var final = ee.FeatureCollection('projects/kangjoon/assets/MA_Solar/Reference/' + areaID + '_done');


// ---------------------------------------------------------------
// 1) Build harmonized labels: change_ref (reference) and change_map (mapped)
// ---------------------------------------------------------------

var updated = final.map(function(feat) {

  var change = feat.get('change');               // interpreter label (string)
  var classification = feat.get('classification'); // map label (numeric)

  // -------------------------------------------------------------
  // change_ref (reference scheme)
  // - "NA"                         -> 1  (No solar change)
  // - "SolarPanel + Defo"           -> 2  (Solar with deforestation)
  // - "Defo + Solar associated"     -> 2  (treated as class 2 in this scheme)
  // - "SolarPanel + Other changes"  -> 3  (Other solar installation)
  // - else                          -> 0  (unrecognized / default)
  // -------------------------------------------------------------
  var change_ref = ee.Algorithms.If(
    ee.String(change).equals('Defo + Solar associated'), 2,
    ee.Algorithms.If(
      ee.String(change).equals('NA'), 1,
      ee.Algorithms.If(
        ee.String(change).equals('SolarPanel + Defo'), 2,
        ee.Algorithms.If(
          ee.String(change).equals('SolarPanel + Other changes'), 3,
          0
        )
      )
    )
  );

  // -------------------------------------------------------------
  // change_map (mapped scheme collapsed to match change_ref)
  // - If classification is 1,2,3 -> keep as-is (1/2/3)
  // - If classification is 4 or 5 -> collapse to 1 (No solar change)
  // - else -> 0
  // -------------------------------------------------------------
  var change_map = ee.Algorithms.If(
    ee.List([1, 2, 3]).contains(classification), classification,
    ee.Algorithms.If(
      ee.List([4, 5]).contains(classification), 1,
      0
    )
  );

  return feat.set({
    'change_ref': change_ref,
    'change_map': change_map
  });
});

print('Updated FeatureCollection with change_ref and change_map:', updated);


// ---------------------------------------------------------------
// 2) Confusion matrix + accuracy metrics
// ---------------------------------------------------------------

// IMPORTANT:
// Your current line uses 'classification' (original map labels).
// If your intent is to evaluate the harmonized mapping scheme,
// replace 'classification' with 'change_map'.
var confMatrix = updated.errorMatrix('change_ref', 'classification');
// Recommended for harmonized evaluation:
// var confMatrix = updated.errorMatrix('change_ref', 'change_map');

print('Confusion Matrix', confMatrix);
print('Overall Accuracy', confMatrix.accuracy());
print('Producer\'s Accuracy', confMatrix.producersAccuracy());
print('User\'s Accuracy', confMatrix.consumersAccuracy());


// ---------------------------------------------------------------
// 3) Optional: quick checks to ensure labels are populated as expected
// ---------------------------------------------------------------

// Frequency table of reference labels
print('Reference label counts (change_ref):',
  updated.aggregate_histogram('change_ref')
);

// Frequency table of mapped labels (raw and harmonized)
print('Map label counts (classification):',
  updated.aggregate_histogram('classification')
);
print('Map label counts (change_map):',
  updated.aggregate_histogram('change_map')
);
