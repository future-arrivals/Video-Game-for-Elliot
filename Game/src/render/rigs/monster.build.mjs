// Build-time recipe for tools/rigparts.mjs (not imported by the game). Which demo page holds Munch's art,
// which elements are animated parts and where each part's pivot is. Every number is copied from
// Art/Demos/munch_animation_demo.html, section "tag the parts".
export default {
  id: 'monster',
  demo: 'Art/Demos/munch_animation_demo.html',
  root: '#rig',                 // the <g> whose user space is "character units" (the demo transforms it as a whole)
  scale: 0.8,                   // atlas px per character unit (the full unfolded drawing is ~642 units tall -> ~514 px)
  ids: true,                    // every element with an id under root is a part (after the demo's own tagging ran)
  parts: {},                    // extra parts by CSS selector: { name: { sel: '...', pivot: [x, y] | 'center' | 'start' } }
  // demo: `FIX` table, then /^(eye|food)/ -> bbox centre, else the first path's M point, else bbox centre
  pivots: {
    'part-top': [222, 152], 'part-bottom': [222, 506], 'fringe-top': [222, 160], 'fringe-bottom': [225, 500], 'pin-left': [191, 57], 'pin-right': [236, 57],
    'boot-toe': [425, 154], 'boot-foot': [431, 498], 'fur-left': [134, 524], 'fur-right': [328, 516], 'jaw-bottom': [229, 506], 'brow-left': [168, 97], 'brow-right': [261, 86],
  },
  pivotRules: [['^(eye|food)', 'center'], ['', 'start']],
};
