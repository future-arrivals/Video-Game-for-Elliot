// Build-time recipe for tools/rigparts.mjs (not imported by the game). Spook the ghost lives in
// Art/Demos/spook_animation_demo.html; the pivots are copied from its "parts" table (PARTS). The demo has one
// drawing and no folded form, so this is a single rig. #body-path is also a part here (the demo does not pose it,
// it re-draws its path every frame for the tail ripple, which a bitmap rig cannot do: ghost.js skews it instead).
export default {
  id: 'ghost',
  demo: 'Art/Demos/spook_animation_demo.html',
  root: '#rig',                 // the <g> the demo transforms as a whole
  scale: 2.3,                   // atlas px per character unit (the drawing is ~215 units tall)
  ids: true,
  parts: {},
  pivots: {
    'arm-l': [82, 104], 'arm-r': [203, 100], 'eye-a': [140, 50], 'eye-b': [183, 55], 'mouth': [146, 112], 'mouth-in': [148, 119], 'mouth-open': [146, 108],
    'body-path': [146, 20],     // not in the demo's table: top of the body, where the tail-sway skew is anchored (see ghost.js)
  },
  pivotRules: [['', 'center']],
};
