// Build-time recipe for tools/rigparts.mjs (not imported by the game). Webster the spider-bat lives in
// Art/Demos/webster_animation_demo.html; every number below is copied from its "Webster: rig" section
// (CH.PIV and the LEGPIV table). The demo has one drawing and no folded form, so this is a single rig.
export default {
  id: 'spider',
  demo: 'Art/Demos/webster_animation_demo.html',
  root: '#rig',                 // the <g> the demo transforms as a whole (its child #rigInner is a harmless extra part)
  scale: 3,                     // atlas px per character unit (the drawing is ~130 units tall, ~260 wide)
  ids: true,                    // every element with an id under root is a part (wings, legs l1..r3c, head, brows, eyes, maw, jaw)
  parts: {},
  pivots: {
    'wing-l': [134, 93], 'wing-l2': [84, 76], 'wing-r': [181, 96], 'wing-r2': [218, 80], 'head': [158, 115],
    'brow-l': [158, 70], 'brow-r': [180, 68], 'eye-a': [153, 84], 'eye-b': [173, 87], 'maw': [158, 97], 'jaw': [158, 98],
    'l1': [131.0, 111.0], 'l1b': [125.36296296296297, 117.22222222222223], 'l1c': [117.63703703703703, 125.77777777777777],
    'l2': [136.0, 114.0], 'l2b': [132.74814814814815, 120.80740740740741], 'l2c': [128.25185185185185, 130.19259259259258],
    'l3': [143.0, 116.0], 'l3b': [143.0, 122.52592592592593], 'l3c': [143.0, 131.47407407407408],
    'r1': [164.0, 117.0], 'r1b': [166.66666666666666, 125.88888888888889], 'r1c': [170.33333333333331, 138.11111111111111],
    'r2': [172.0, 116.0], 'r2b': [175.25185185185185, 124.58518518518518], 'r2c': [179.74814814814812, 136.4148148148148],
    'r3': [178.0, 113.0], 'r3b': [183.9185185185185, 120.41481481481482], 'r3c': [192.08148148148146, 130.5851851851852],
  },
  pivotRules: [['', 'center']],
};
