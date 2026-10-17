/**
 * The drawing behind the muscle map: a stylised front and back view, as point
 * lists in a 220 × 470 box with the body's centre line at x = 110.
 *
 * Pure data. Each shape is a closed loop of [x, y] points that body-map.js
 * smooths into curves, so a shape is tuned by moving points rather than by
 * editing path commands. `side` shapes are written for the right half of the
 * picture and mirrored across the centre line for the left; `centre` shapes
 * sit on the line and are drawn once.
 */

export const VIEW_BOX = { width: 220, height: 470 };
export const CENTRE_X = 110;

/**
 * One side of the body outline, from the top of the neck down the outside of
 * the arm and leg to the foot and back up the inside to the crotch. The other
 * side is this mirrored, joined at the neck and the crotch.
 */
const OUTLINE_SIDE = [
    [117, 44], [118, 60], [140, 64], [162, 63], [176, 68], [184, 80],
    // outside of the arm, down to the hand
    [187, 100], [190, 126], [194, 152], [198, 178], [200, 206], [199, 232],
    [203, 248], [200, 262], [193, 266], [188, 256], [187, 238],
    // inside of the arm, back up to the armpit
    [183, 210], [178, 182], [173, 156], [168, 130], [162, 112],
    // side of the torso, down to the hip
    [156, 128], [149, 150], [146, 166], [150, 186], [154, 200],
    // outside of the leg, down to the foot
    [157, 226], [156, 260], [153, 292], [151, 312], [150, 334], [150, 364], [146, 396], [143, 424],
    [148, 444], [146, 456], [134, 458], [122, 456], [120, 446],
    // inside of the leg, back up to the crotch
    [124, 424], [122, 396], [120, 364], [119, 336], [117, 312], [115, 290], [114, 262], [113, 236], [112, 216],
];

const HEAD = { cx: 110, cy: 28, r: 17 };

// Muscles seen from the front. Order is paint order: later shapes sit on top.
const FRONT_REGIONS = {
    shoulders: {
        side: [[150, 64], [162, 62], [174, 68], [180, 80], [180, 94], [176, 104], [168, 102], [160, 94], [154, 84], [150, 74]],
    },
    chest: {
        side: [[113, 76], [124, 72], [140, 72], [152, 78], [154, 90], [150, 104], [142, 114], [130, 118], [118, 116], [113, 108]],
    },
    biceps: {
        side: [[168, 108], [176, 106], [183, 114], [185, 128], [183, 142], [178, 152], [170, 152], [165, 142], [163, 126], [164, 114]],
    },
    forearms: {
        side: [[172, 158], [181, 156], [189, 164], [192, 182], [193, 202], [191, 224], [186, 232], [180, 228], [176, 214], [172, 192], [171, 170]],
    },
    abs: {
        centre: [[101, 122], [110, 120], [119, 122], [121, 140], [121, 160], [119, 180], [110, 186], [101, 180], [99, 160], [99, 140]],
        side: [[125, 126], [136, 132], [142, 148], [142, 168], [138, 184], [130, 186], [125, 176], [124, 150]],
    },
    quads: {
        side: [[114, 208], [125, 203], [139, 207], [148, 219], [152, 245], [151, 277], [146, 305], [138, 317], [128, 315], [120, 303], [116, 277], [114, 245], [113, 224]],
    },
    calves: {
        side: [[123, 336], [133, 330], [142, 334], [146, 348], [146, 374], [142, 400], [137, 418], [130, 420], [125, 414], [122, 396], [120, 368], [121, 348]],
    },
};

// ...and from behind.
const BACK_REGIONS = {
    lats: {
        side: [[121, 114], [132, 104], [146, 102], [154, 108], [154, 126], [150, 146], [144, 160], [134, 166], [127, 160], [122, 146], [119, 130]],
    },
    upperBack: {
        side: [[112, 60], [124, 62], [138, 66], [148, 72], [147, 84], [141, 96], [133, 106], [125, 118], [118, 130], [112, 142]],
    },
    rearDelts: {
        side: [[150, 66], [162, 62], [174, 68], [180, 80], [180, 94], [176, 104], [168, 100], [160, 92], [154, 82], [150, 74]],
    },
    triceps: {
        side: [[168, 108], [176, 106], [183, 114], [185, 128], [183, 142], [178, 152], [170, 152], [165, 142], [163, 126], [164, 114]],
    },
    forearms: {
        side: [[172, 158], [181, 156], [189, 164], [192, 182], [193, 202], [191, 224], [186, 232], [180, 228], [176, 214], [172, 192], [171, 170]],
    },
    lowerBack: {
        centre: [[102, 152], [110, 148], [118, 152], [121, 172], [123, 192], [110, 198], [97, 192], [99, 172]],
    },
    glutes: {
        side: [[113, 198], [124, 192], [140, 194], [152, 206], [154, 224], [148, 240], [136, 246], [122, 244], [114, 234], [112, 216]],
    },
    hamstrings: {
        side: [[115, 252], [126, 248], [142, 252], [150, 264], [151, 290], [147, 310], [138, 320], [128, 318], [121, 306], [117, 282], [114, 264]],
    },
    calves: {
        side: [[122, 330], [132, 326], [143, 331], [147, 346], [147, 372], [142, 398], [137, 412], [130, 414], [124, 408], [120, 390], [119, 364], [120, 344]],
    },
};

export const VIEWS = [
    { id: 'front', label: 'Front', regions: FRONT_REGIONS },
    { id: 'back', label: 'Back', regions: BACK_REGIONS },
];

export { OUTLINE_SIDE, HEAD };
