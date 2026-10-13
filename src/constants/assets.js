// ── Eager: photos + filters (hero-critical, always visible) ──
const eagerModules = import.meta.glob(
  ['../../assets/photos/**/*.{png,jpg,jpeg,webp,svg}', '../../assets/filters/**/*.{png,jpg,jpeg,webp,svg}'],
  { eager: true, import: 'default' },
);

// Eagerly import custom template overlays so they resolve synchronously (avoid lazy placeholder 404)
import capturingMomentsOverlay from '../../assets/templates/capturing-moments.png';
import template2Overlay from '../../assets/templates/2.png';

// ── Lazy: stickers, templates, misc (~35MB total) — only loaded on demand ──
const lazyModules = import.meta.glob(
  ['../../assets/stickers/**/*.{png,jpg,jpeg,webp,svg}', '../../assets/templates/**/*.{png,jpg,jpeg,webp,svg}', '../../assets/misc/**/*.{png,jpg,jpeg,webp,svg}'],
  { eager: false, import: 'default' },
);

// ── Audio: eager URL resolution (files are small refs; actual download is gated by preload="none") ──
const audioModules = import.meta.glob(
  '../../assets/audio/**/*.{mp3,wav,ogg}',
  { eager: true, import: 'default' },
);

const assetMap = new Map();
const lazyLoaders = new Map();

// Register eager assets
for (const [rawPath, url] of Object.entries({ ...eagerModules, ...audioModules })) {
  const cleanPath = rawPath.replace(/^(\.\.\/)+assets\//, '');
  assetMap.set(cleanPath, url);
  const basename = cleanPath.split('/').pop();
  if (!assetMap.has(basename)) {
    assetMap.set(basename, url);
  }
}

// Register custom template overlays eagerly (so asset() returns hashed URL synchronously)
assetMap.set('templates/capturing-moments.png', capturingMomentsOverlay);
assetMap.set('capturing-moments.png', capturingMomentsOverlay);
assetMap.set('templates/2.png', template2Overlay);
assetMap.set('2.png', template2Overlay);
// Keep legacy aliases for backwards-compat
assetMap.set('templates/memorie-dark.png', template2Overlay);
assetMap.set('memorie-dark.png', template2Overlay);
assetMap.set('templates/template with 3 image slots.png', capturingMomentsOverlay);
assetMap.set('template with 3 image slots.png', capturingMomentsOverlay);
assetMap.set('templates/2nd temp with 3 img slots.png', template2Overlay);
assetMap.set('2nd temp with 3 img slots.png', template2Overlay);

// Register lazy sticker loaders
for (const [rawPath, loader] of Object.entries(lazyModules)) {
  const cleanPath = rawPath.replace(/^(\.\.\/)+assets\//, '');
  lazyLoaders.set(cleanPath, loader);
  const basename = cleanPath.split('/').pop();
  if (!lazyLoaders.has(basename)) {
    lazyLoaders.set(basename, loader);
  }
}

/**
 * Resolve a lazy sticker asset. Returns a promise that resolves to the URL.
 * Caches the result so subsequent calls return the already-resolved URL.
 */
export const loadAsset = async (name) => resolveAssetAsync(name);

export const resolveAssetAsync = async (name) => {
  if (!name) return '';
  if (assetMap.has(name)) return assetMap.get(name);
  const normalized = name.replace(/^(\.\.\/)+assets\//, '');
  if (assetMap.has(normalized)) return assetMap.get(normalized);
  const base = name.split('/').pop();
  if (assetMap.has(base)) return assetMap.get(base);
  const loader = lazyLoaders.get(name) || lazyLoaders.get(normalized) || lazyLoaders.get(base);
  if (!loader) return '';
  const url = await loader();
  assetMap.set(name, url);
  if (normalized !== name) assetMap.set(normalized, url);
  if (base !== name && base !== normalized) assetMap.set(base, url);
  return url;
};

export const asset = (name) => {
  if (!name) return '';
  if (assetMap.has(name)) return assetMap.get(name);
  const normalized = name.replace(/^(\.\.\/)+assets\//, '');
  if (assetMap.has(normalized)) return assetMap.get(normalized);
  const base = name.split('/').pop();
  if (assetMap.has(base)) return assetMap.get(base);

  // Check lazy sticker loaders — resolve and cache on first hit
  const loader = lazyLoaders.get(name) || lazyLoaders.get(normalized) || lazyLoaders.get(base);
  if (loader) {
    // Start loading in background and cache when done
    loader().then((url) => {
      assetMap.set(name, url);
      if (normalized !== name) assetMap.set(normalized, url);
      if (base !== name && base !== normalized) assetMap.set(base, url);
    });
    // Dev server can serve raw files; prod hashes break this placeholder, so
    // return '' in prod and let callers resolve async via resolveAssetAsync().
    if (import.meta.env?.DEV) {
      const placeholderPath = normalized.includes('/') ? normalized : `stickers/${base}`;
      return new URL(`../../assets/${placeholderPath}`, import.meta.url).href;
    }
    return '';
  }

  if (import.meta.env?.DEV) {
    return new URL(`../../assets/${name}`, import.meta.url).href;
  }
  return '';
};

export const ASSETS = {
  scrapbook: asset('photos/XLuTGjgtwjWtugfWBkwiLVHNF71_iX5xma4L6mxdq-VImioPV2fqq4TAkvueyEqg1IiNDI35_HvKV8KjpR__xK8UhB74W3ut-1GHsNKK_jjzet8cIi0KKKpYMK6JwdUllaTIG5MwrWg6y-XIFC-9moOd-NQkY-OGnp_zsu63kdSsIdoJ7u7KZ_dzygamVTPX.jpg'),
  collage: asset('photos/1FDV7eh_AR8YMK0FX-wk3cZewoeM_NZTtyX5a6Fu90SGrBSujtYzJtiOF5tJlZa7Ag6RJX8RVqJzMuBST-25aAliIT_40cFFlN9uFVp_F1chjnlFseI2SbuUyO6zbdwCObOqTPZsctXxjejoiXh6QTXTSAuR3KLhXb-m5CUxzzri1Jwj6D4VkIS3a1onqHp3.jpg'),
  cameraWide: asset('photos/54f49c9c7633a07bbc183dc5d7ab7d12.jpg'),
  cameraPoster: asset('photos/5d0962c9a39f4963242a24778a4b332c.jpg'),
  cameraTop: asset('photos/OIP.jpg'),
  y2kGreen: asset('photos/Pecn3dmLyNRtp0rgwH9MRdIph5qeSW5-djVPZtQkxI4cso7bVMImh0gggyyT4MkZwGskMCCUsIWDKsR7AHQT25Kc9OBiHBhWV_XuwJJZIKRUijSXejM30HY9Az5tpp6xiNf5KcHTRunrB_CILdS_yLJRp-p8kZNINCwEiHlDLRp4A8WxyWkTFyjx3cuG5Kx0.jpg'),
  cuteSnaps: asset('photos/Screenshot 2026-05-09 025853.png'),
  doodleStrip: asset('photos/Screenshot 2026-05-09 025918.png'),
  previewDigicam: asset('filters/retro cam.jpg'),
  previewVhs: asset('filters/vhs.jpg'),
  previewGrain: asset('filters/film grain.jpg'),
  previewBloom: asset('filters/dreamy bloom.jpg'),
  previewFlash: asset('filters/soft flash.jpg'),
  previewCrt: asset('filters/crt distory.jpg'),
  previewWarm: asset('filters/warm vintag3.jpg'),
  previewSilver: asset('filters/cool silver.jpg'),
  previewPolaroid: asset('filters/faded polaroid.jpg'),
  playlist: [
    asset('audio/cassette-pastel-nights.mp3'),
    asset('audio/vhs-heartbeat.mp3'),
    asset('audio/polaroids-in-a-shoebox.mp3'),
  ],
  shutter: 'https://www.soundjay.com/mechanical/camera-shutter-click-01.mp3',
};

export const assetPhotos = [
  ASSETS.y2kGreen,
  ASSETS.scrapbook,
  ASSETS.collage,
  ASSETS.cameraWide,
  ASSETS.cameraPoster,
  ASSETS.cameraTop,
  ASSETS.cuteSnaps,
  ASSETS.doodleStrip,
];

/**
 * Dramatic photobooth filter presets.
 *
 * pixel supports:
 *   curve                [[in,out],…] — RGB tone curve (0–255)
 *   duotone.shadow/high  [r,g,b] — full color remap (overrides splitTone)
 *   splitTone            {shadows,highlights,balance,amount} — color split
 *   tint                 {color:[r,g,b], strength} — overall wash
 *   chromaticAberration  px — RGB split
 *   glitch               0–1 — block displacement + channel swap intensity
 *   scanlines            {opacity, rgbShift:px} — CRT scanlines
 *   grain                0–0.5 — film noise
 *   lightLeak            {count, opacity, color:[r,g,b]} — colored streaks
 *   dust                 0–1 — white specks + scratches
 *   letterbox            0–1 — cinematic black bars (fraction of height)
 *   vignette             0–1 — dark corners
 */
export const filters = [
  // ── No filter (pure camera image) ──
  { id: 'normal', name: 'Clean', css: 'none', preview: ASSETS.previewDigicam },

  // ── Original CSS-only filters ──
  {
    id: 'portra400',
    name: 'Portra 400',
    css: 'contrast(0.96) saturate(1.12) brightness(1.04) sepia(0.08)',
    preview: ASSETS.previewWarm,
    pixel: {
      curve: [[0, 8], [32, 42], [64, 76], [128, 134], [192, 204], [255, 250]],
      splitTone: { shadows: [118, 132, 126], highlights: [255, 226, 196], balance: 0.58, amount: 0.14 },
      grain: 0.045,
      vignette: 0.1,
    },
  },
  {
    id: 'polaroid600',
    name: 'Polaroid 600',
    css: 'contrast(0.82) saturate(0.78) brightness(1.16) sepia(0.14)',
    preview: ASSETS.previewPolaroid,
    pixel: {
      curve: [[0, 24], [32, 54], [64, 84], [128, 136], [192, 196], [255, 240]],
      splitTone: { shadows: [165, 190, 205], highlights: [255, 218, 202], balance: 0.5, amount: 0.16 },
      grain: 0.06,
      lightLeak: { count: 1, opacity: 0.08, color: [255, 190, 170] },
    },
  },

  // ── Premium film looks (vibrant, not desaturated) ──
  {
    id: 'gold200',
    name: 'Gold 200',
    css: 'contrast(1.05) saturate(1.18) brightness(1.08) sepia(0.16)',
    preview: ASSETS.previewGrain,
    pixel: {
      curve: [[0, 5], [32, 38], [64, 74], [128, 136], [192, 210], [255, 252]],
      splitTone: { shadows: [118, 94, 70], highlights: [255, 226, 158], balance: 0.45, amount: 0.13 },
      grain: 0.055,
    },
  },
  {
    id: 'fuji400h',
    name: 'Fuji 400H',
    css: 'contrast(0.92) saturate(0.98) brightness(1.08) hue-rotate(4deg)',
    preview: ASSETS.previewBloom,
    pixel: {
      curve: [[0, 12], [32, 46], [64, 82], [128, 136], [192, 202], [255, 246]],
      splitTone: { shadows: [112, 150, 142], highlights: [246, 232, 210], balance: 0.54, amount: 0.12 },
      grain: 0.035,
    },
  },
  {
    id: 'cinestill800t',
    name: '800T Glow',
    css: 'contrast(1.12) saturate(1.2) brightness(1.02) hue-rotate(-8deg)',
    preview: ASSETS.previewCrt,
    pixel: {
      curve: [[0, 4], [32, 36], [64, 70], [128, 135], [192, 214], [255, 255]],
      splitTone: { shadows: [42, 84, 118], highlights: [255, 112, 86], balance: 0.48, amount: 0.18 },
      lightLeak: { count: 1, opacity: 0.1, color: [255, 92, 72] },
      grain: 0.065,
    },
  },
  {
    id: 'disposableflash',
    name: 'Disposable Flash',
    css: 'contrast(1.08) saturate(1.05) brightness(1.18) sepia(0.05)',
    preview: ASSETS.previewFlash,
    pixel: {
      curve: [[0, 10], [32, 42], [64, 78], [128, 140], [192, 218], [255, 255]],
      splitTone: { shadows: [142, 150, 160], highlights: [255, 238, 214], balance: 0.62, amount: 0.1 },
      grain: 0.08,
      dust: 0.14,
      vignette: 0.18,
    },
  },
  {
    id: 'hp5',
    name: 'HP5 Mono',
    css: 'grayscale(1) contrast(1.35) brightness(1.03)',
    preview: ASSETS.previewSilver,
    pixel: {
      curve: [[0, 2], [32, 30], [64, 66], [128, 136], [192, 214], [255, 255]],
      tint: { color: [218, 216, 206], strength: 0.1 },
      grain: 0.075,
      vignette: 0.16,
    },
  },
  {
    id: 'vhsdate',
    name: 'VHS Date',
    css: 'contrast(1.12) saturate(0.72) brightness(1.05) hue-rotate(-16deg) blur(0.25px)',
    preview: ASSETS.previewVhs,
    pixel: {
      chromaticAberration: 3,
      glitch: 0.22,
      scanlines: { opacity: 0.16, rgbShift: 1.4 },
      grain: 0.05,
    },
  },
];

export const frames = [
  { id: 'korean', name: 'Korean Day', tone: 'rose', description: 'Tall strip, glossy pink edge, tiny chrome charms.' },
  { id: 'scrap', name: 'Scrapbook', tone: 'paper', description: 'Layered tape, notes, paper texture, dreamy margin.' },
  { id: 'magazine', name: 'Magazine', tone: 'editorial', description: 'Fashion editorial blocks, masthead, date stamp.' },
  { id: 'doodle', name: 'Doodle Strip', tone: 'ink', description: 'Hand-drawn marks and sticker-heavy nostalgia.' },
];

/**
 * Custom PNG overlay templates.
 * Each template has a fixed number of photo slots and a PNG overlay image.
 * Photos are drawn at the defined slot positions, then the PNG overlay is drawn on top.
 * Slot coordinates are normalized (0–1) relative to the template image dimensions.
 */
export const customTemplates = [
  {
    id: 'custom-capturing-moments',
    name: 'Capturing Moments',
    type: 'custom',
    slots: 3,
    image: capturingMomentsOverlay,
    // Keep raw path as fallback for asset() lookups (e.g. tests)
    imagePath: 'templates/capturing-moments.png',
    // Template image aspect ratio (793 x 1983) — measured via sharp
    aspectRatio: 793 / 1983,
    photoSlots: [
      { x: 0.1727, y: 0.2239, w: 0.6507, h: 0.1719 },
      { x: 0.1803, y: 0.4236, w: 0.6406, h: 0.1729 },
      { x: 0.1677, y: 0.6157, w: 0.6519, h: 0.1487 },
    ],
  },
  {
    id: 'custom-memorie-dark',
    name: 'Memorie+ Dark',
    type: 'custom',
    slots: 3,
    image: template2Overlay,
    imagePath: 'templates/2.png',
    // Template image aspect ratio (941 x 1672) — measured via sharp
    aspectRatio: 941 / 1672,
    photoSlots: [
      {
        id: 'slot-1',
        x: 0.3395,
        y: 0.0649,
        w: 0.4410,
        h: 0.2482,
        rot: 5.0,
        borderRadius: '14px',
        corners: {
          topLeft: { x: 0.3698, y: 0.0718 },
          topRight: { x: 0.7885, y: 0.0921 },
          bottomRight: { x: 0.7503, y: 0.3062 },
          bottomLeft: { x: 0.3316, y: 0.2859 },
        },
      },
      {
        id: 'slot-2',
        x: 0.2885,
        y: 0.3364,
        w: 0.4410,
        h: 0.2482,
        rot: 5.0,
        borderRadius: '14px',
        corners: {
          topLeft: { x: 0.3188, y: 0.3379 },
          topRight: { x: 0.7375, y: 0.3589 },
          bottomRight: { x: 0.6993, y: 0.5742 },
          bottomLeft: { x: 0.2806, y: 0.5532 },
        },
      },
      {
        id: 'slot-3',
        x: 0.2375,
        y: 0.6080,
        w: 0.4410,
        h: 0.2482,
        rot: 5.0,
        borderRadius: '14px',
        corners: {
          topLeft: { x: 0.2678, y: 0.6041 },
          topRight: { x: 0.6865, y: 0.6250 },
          bottomRight: { x: 0.6482, y: 0.8403 },
          bottomLeft: { x: 0.2295, y: 0.8194 },
        },
      },
    ],
  },
];

export const stickerCategories = [
  {
    id: 'caption-tags',
    name: 'Caption Tags',
    vibe: 'Quick text stamps',
    items: ['good vibes', 'Y2K', '2004', 'no bad days', 'xoxo', 'iconic', 'lovely day', 'PM 04:23'],
  },
  {
    id: 'y2k-pop',
    name: 'Y2K Pop',
    vibe: 'Bright throwback PNGs',
    items: ['sticker1.png', ...Array.from({ length: 20 }, (_, i) => `sticker2_${i + 1}.png`)],
  },
  {
    id: 'cute-cutouts',
    name: 'Cute Cutouts',
    vibe: 'Soft scrapbook bits',
    items: Array.from({ length: 20 }, (_, i) => `sticker2_${i + 21}.png`),
  },
  {
    id: 'aesthetic-mix',
    name: 'Aesthetic Mix',
    vibe: 'Collage-friendly accents',
    items: Array.from({ length: 24 }, (_, i) => `stickers3_${i + 1}.png`),
  },
  {
    id: 'retro-booth',
    name: 'Retro Booth',
    vibe: 'Film strip extras',
    items: [
      ...Array.from({ length: 36 }, (_, i) => `stickers3_${i + 25}.png`),
      ...Array.from({ length: 19 }, (_, i) => `sticker4_${i + 1}.png`),
    ],
  },
  {
    id: 'premium-web',
    name: 'Premium Web PNGs',
    vibe: 'Cute glossy stickers',
    items: [
      'premium_sparkles.png',
      'premium_bow.png',
      'premium_flower.png',
      'premium_cherries.png',
      'premium_camera_flash.png',
      'premium_heart_decoration.png',
      'premium_love_letter.png',
      'premium_cd.png',
      'premium_glowing_star.png',
      'premium_hearts.png',
      'premium_rainbow.png',
      'premium_videocassette.png',
    ],
  },
].map(category => ({
  ...category,
  items: category.items.filter(item => {
    // If it's a text sticker (no image extension), keep it
    if (!item.match(/\.(png|jpg|jpeg|webp|svg)$/)) return true;
    // For images, ensure it exists in our resolved lazyLoaders or assetMap
    return lazyLoaders.has(item) || assetMap.has(item);
  })
}));

const definedStickers = new Set(stickerCategories.flatMap(c => c.items));
const customStickers = [];

// Find any stickers that were added to the folder but aren't in the predefined lists
for (const rawPath of Object.keys(lazyModules)) {
  if (rawPath.includes('/stickers/')) {
    const basename = rawPath.split('/').pop();
    if (!definedStickers.has(basename)) {
      customStickers.push(basename);
    }
  }
}

if (customStickers.length > 0) {
  stickerCategories.push({
    id: 'custom',
    name: 'Custom',
    vibe: 'Added stickers',
    items: customStickers,
  });
}

export const stickers = stickerCategories.flatMap((category) => category.items);

/** Strip background presets (solid colors + gradients). */
export const BACKGROUNDS = [
  { id: 'cream', type: 'solid', label: 'Cream', value: '#f7eee6' },
  { id: 'white', type: 'solid', label: 'White', value: '#ffffff' },
  { id: 'pink', type: 'solid', label: 'Pink', value: '#ffd1dc' },
  { id: 'blue', type: 'solid', label: 'Sky Blue', value: '#d4e8ff' },
  { id: 'mint', type: 'solid', label: 'Mint', value: '#d4f5e2' },
  { id: 'lavender', type: 'solid', label: 'Lavender', value: '#e8d4f5' },
  { id: 'peach', type: 'solid', label: 'Peach', value: '#ffddd4' },
  { id: 'yellow', type: 'solid', label: 'Lemon', value: '#fff5d4' },
  { id: 'black', type: 'solid', label: 'Black', value: '#111111' },
  { id: 'hotpink', type: 'solid', label: 'Hot Pink', value: '#ff5aaf' },
  { id: 'sunset', type: 'gradient', label: 'Sunset', from: '#ff9a9e', to: '#fad0c4' },
  { id: 'ocean', type: 'gradient', label: 'Ocean', from: '#a1c4fd', to: '#c2e9fb' },
  { id: 'lilac', type: 'gradient', label: 'Lilac', from: '#c471ed', to: '#f64f59' },
  { id: 'aurora', type: 'gradient', label: 'Aurora', from: '#fccb90', to: '#d57eeb' },
  { id: 'rose', type: 'gradient', label: 'Rose', from: '#fddb92', to: '#d1fdff' },
];

/** URLs worth warming on startup (hero-critical). */
export const PRELOAD_IMAGE_URLS = [
  ASSETS.y2kGreen,
  ASSETS.scrapbook,
  ASSETS.previewDigicam,
];
