// Asset keys and loader. Dev: loads PNGs by path relative to Game/index.html (serve the project root).
// Build: tools/build.mjs puts data URIs in window.__ASSETS__ and the same keys are read from there.

/** key -> dev path. `maxH` is the largest on-screen height (logical px) the build downscales for. */
export const ASSET_LIST = {
  monster_folded: { path: '../Art/Characters/png/monster_folded.png', maxH: 120 },
  monster_unfolded: { path: '../Art/Characters/png/monster_unfolded.png', maxH: 250 },
  fish_folded: { path: '../Art/Characters/png/fish_folded.png', maxH: 120 },
  fish_unfolded: { path: '../Art/Characters/png/fish_unfolded.png', maxH: 300 },
  icecream_folded: { path: '../Art/Characters/png/icecream_folded.png', maxH: 120 },
  icecream_unfolded: { path: '../Art/Characters/png/icecream_unfolded.png', maxH: 230 },
  // hinge panels rasterized from the SVGs by tools/parts.mjs (same frame as the *_unfolded PNG)
  monster_inside: { path: 'assets/parts/monster_inside.png', maxH: 250 },
  monster_bottom: { path: 'assets/parts/monster_bottom.png', maxH: 250 },
  monster_top: { path: 'assets/parts/monster_top.png', maxH: 250 },
  fish_mid: { path: 'assets/parts/fish_mid.png', maxH: 300 },
  fish_head: { path: 'assets/parts/fish_head.png', maxH: 300 },
  fish_tail: { path: 'assets/parts/fish_tail.png', maxH: 300 },
  bat: { path: '../Art/Characters/png/bat.png', maxH: 130 },
  spider: { path: '../Art/Characters/png/spider.png', maxH: 130 },
  ghost: { path: '../Art/Characters/png/ghost.png', maxH: 130 },
  candy: { path: '../Art/Characters/png/candy.png', maxH: 40 },
  lollipop: { path: '../Art/Characters/png/lollipop.png', maxH: 40 },
};

function load(key, src) {
  return new Promise((ok, fail) => {
    const im = new Image();
    im.onload = () => ok([key, im]);
    im.onerror = () => fail(new Error('could not load image ' + key));
    im.src = src;
  });
}

/** -> { img: {key: HTMLImageElement}, cache: {} }  (cache holds sprites the render modules bake) */
export async function loadAssets() {
  const embedded = typeof window !== 'undefined' && window.__ASSETS__;
  const pairs = await Promise.all(Object.entries(ASSET_LIST).map(([k, a]) => load(k, embedded ? embedded[k] : a.path)));
  return { img: Object.fromEntries(pairs), cache: {} };
}
