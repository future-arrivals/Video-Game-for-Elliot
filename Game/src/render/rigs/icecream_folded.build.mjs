// Build-time recipe for tools/rigparts.mjs (not imported by the game). Scoops, folded form (drawing #rigF) of
// Art/Demos/scoops_animation_demo.html: mkSub(regF, ...) lists and mkLimb with axis CXF = 190.
export default {
  id: 'icecream_folded',
  demo: 'Art/Demos/scoops_animation_demo.html',
  root: '#rigF',
  scale: 0.9,
  ids: true,
  parts: {
    e5L: { sel: '#f-scoop-5 > :nth-child(1) > :nth-child(2), #f-scoop-5 > :nth-child(1) > :nth-child(3)' },
    e5R: { sel: '#f-scoop-5 > :nth-child(1) > :nth-child(4), #f-scoop-5 > :nth-child(1) > :nth-child(5)' },
    b5L: { sel: '#f-scoop-5 > :nth-child(6)' },
    b5R: { sel: '#f-scoop-5 > :nth-child(5)' },
    m5: { sel: '#f-scoop-5 > :nth-child(8), #f-scoop-5 > :nth-child(9), #f-scoop-5 > :nth-child(10)' },
    chL: { sel: '#f-cherries > :nth-child(1) > :nth-child(1), #f-cherries > :nth-child(2)', pivot: [152, 56] },
    chR: { sel: '#f-cherries > :nth-child(1) > :nth-child(2), #f-cherries > :nth-child(3)', pivot: [200, 28] },
    stem: { sel: '#f-cherries > :nth-child(1) > :nth-child(3)', pivot: [176, 110] },
    lm0: { sel: '#f-fx > :nth-child(1)' },
    lm1: { sel: '#f-fx > :nth-child(2)' },
    lm2: { sel: '#f-fx > :nth-child(3)' },
    lm3: { sel: '#f-fx > :nth-child(4)' },
    lm4: { sel: '#f-fx > :nth-child(5)' },
    lm5: { sel: '#f-fx > :nth-child(6)' },
  },
  pivots: {},
  pivotRules: [['^lm', 'near:190'], ['', 'center']],
};
