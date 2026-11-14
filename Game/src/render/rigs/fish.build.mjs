// Build-time recipe for tools/rigparts.mjs (not imported by the game). Heartfin's art lives in
// Art/Demos/heartfin_animation_demo.html; every number below is copied from its section "tag the parts"
// (the reg(...) calls). The demo's own script wraps the sub-parts (eyeL, armL, heartL...) and splits the tail
// into tailB-o (rides the accordion, clip clipB) and tailA-o > part-tail (V and legs on the ground, clip clipA).
export default {
  id: 'fish',
  demo: 'Art/Demos/heartfin_animation_demo.html',
  root: '#rig',                 // the <g> the demo transforms as a whole
  scale: 0.52,                  // atlas px per character unit (the unfolded drawing is ~972 units tall -> ~505 px)
  ids: true,                    // every element with an id under root is a part (after the demo's own tagging ran)
  parts: {},
  // demo: reg('head',[281,170]) reg('finL',[110,700]) reg('finR',[392,610]); segs [262, bbox centre y];
  // arms nearEnd(281), whiskers nearEnd(270), legs startPt (first path, getPointAtLength(0)); the rest bbox centre.
  pivots: {
    'part-head': [281, 170], 'part-fin-left': [110, 700], 'part-fin-right': [392, 610],
    'part-seg-1': [262, 215.04037475585938], 'part-seg-2': [262, 317.99999237060547], 'part-seg-3': [262, 428.5988464355469],
    'part-seg-4': [262, 522.8795623779297], 'part-seg-5': [262, 639.7191162109375],
  },
  pivotRules: [['^arm[LR]$', 'near:281'], ['^whisk[LR]$', 'near:270'], ['^leg', 'pt0'], ['', 'center']],
};
