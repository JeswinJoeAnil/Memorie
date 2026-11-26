// Vite resolves the URL table at build time. The browser fetches each file when used.
const modules = import.meta.glob('../../assets/{photos,filters,stickers,misc,audio}/**/*.{png,jpg,jpeg,webp,svg,mp3,wav,ogg}', {
  eager: true, import: 'default', query: '?url&no-inline',
});
import capturingMomentsOverlay from '../../assets/templates/capturing-moments.png';
import template2Overlay from '../../assets/templates/2.png';

// ── New template overlays ──
import ribbonOverlay from '../../assets/templates/1-photo-ribbon.png';
import cherryVinylOverlay from '../../assets/templates/2-photo-cherry-vinyl.png';
import feedbackOverlay from '../../assets/templates/2-photo-feedback.png';
import outOfOrbitOverlay from '../../assets/templates/2-photo-out-of-orbit.png';
import memorieOverlay from '../../assets/templates/phtotostrip 2.png';
import ginghamWaveOverlay from '../../assets/templates/3-photo-gingham-wave.png';
import onRepeatOverlay from '../../assets/templates/3-photo-on-repeat.png';
import flashbackOverlay from '../../assets/templates/4-photo-flashback.png';
import gardenBandOverlay from '../../assets/templates/4-photo-garden-band.png';
import prismOverlay from '../../assets/templates/4-photo-prism.png';
import indigoBelFourOverlay from '../../assets/templates/indigo-bel-four.png';

const assetMap = new Map();
for (const [path, url] of Object.entries(modules)) {
  const name = path.slice('../../assets/'.length);
  assetMap.set(name, url);
  const basename = name.split('/').pop();
  if (!assetMap.has(basename)) assetMap.set(basename, url);
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

// ── Register new template overlays ──
assetMap.set('templates/1-photo-ribbon.png', ribbonOverlay);
assetMap.set('1-photo-ribbon.png', ribbonOverlay);
assetMap.set('templates/2-photo-cherry-vinyl.png', cherryVinylOverlay);
assetMap.set('2-photo-cherry-vinyl.png', cherryVinylOverlay);
assetMap.set('templates/2-photo-feedback.png', feedbackOverlay);
assetMap.set('2-photo-feedback.png', feedbackOverlay);
assetMap.set('templates/2-photo-out-of-orbit.png', outOfOrbitOverlay);
assetMap.set('2-photo-out-of-orbit.png', outOfOrbitOverlay);
assetMap.set('templates/phtotostrip 2.png', memorieOverlay);
assetMap.set('phtotostrip 2.png', memorieOverlay);
assetMap.set('templates/3-photo-gingham-wave.png', ginghamWaveOverlay);
assetMap.set('3-photo-gingham-wave.png', ginghamWaveOverlay);
assetMap.set('templates/3-photo-on-repeat.png', onRepeatOverlay);
assetMap.set('3-photo-on-repeat.png', onRepeatOverlay);
assetMap.set('templates/4-photo-flashback.png', flashbackOverlay);
assetMap.set('4-photo-flashback.png', flashbackOverlay);
assetMap.set('templates/4-photo-garden-band.png', gardenBandOverlay);
assetMap.set('4-photo-garden-band.png', gardenBandOverlay);
assetMap.set('templates/4-photo-prism.png', prismOverlay);
assetMap.set('4-photo-prism.png', prismOverlay);
assetMap.set('templates/indigo-bel-four.png', indigoBelFourOverlay);
assetMap.set('indigo-bel-four.png', indigoBelFourOverlay);

export function asset(name) {
  if (!name) return '';
  return assetMap.get(name) || assetMap.get(name.split('/').pop()) || '';
}

export const resolveAssetAsync = async name => asset(name);
export const loadAsset = resolveAssetAsync;

export const ASSETS = {
  scrapbook: asset('photos/scrapbook.webp'),
  collage: asset('photos/collage.webp'),
  cameraWide: asset('photos/camera-wide.webp'),
  cameraPoster: asset('photos/camera-poster.webp'),
  cameraTop: asset('photos/camera-top.webp'),
  y2kGreen: asset('photos/y2k-green.webp'),
  cuteSnaps: asset('photos/cute-snaps.webp'),
  doodleStrip: asset('photos/doodle-strip.webp'),
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
  shutter: asset('audio/shutter.wav'),
};

export const photoDimensions = new Map([
  [ASSETS.scrapbook, { width: 1200, height: 1200, srcSet: `${asset('photos/scrapbook-small.webp')} 320w, ${ASSETS.scrapbook} 1200w` }],
  [ASSETS.collage, { width: 1199, height: 1200, srcSet: `${asset('photos/collage-small.webp')} 320w, ${ASSETS.collage} 1199w` }],
  [ASSETS.cameraWide, { width: 1200, height: 675, srcSet: `${asset('photos/camera-wide-small.webp')} 320w, ${ASSETS.cameraWide} 1200w` }],
  [ASSETS.cameraPoster, { width: 800, height: 1200, srcSet: `${asset('photos/camera-poster-small.webp')} 213w, ${ASSETS.cameraPoster} 800w` }],
  [ASSETS.cameraTop, { width: 474, height: 379, srcSet: `${asset('photos/camera-top-small.webp')} 320w, ${ASSETS.cameraTop} 474w` }],
  [ASSETS.y2kGreen, { width: 1200, height: 800, srcSet: `${asset('photos/y2k-green-small.webp')} 320w, ${ASSETS.y2kGreen} 1200w` }],
  [ASSETS.cuteSnaps, { width: 651, height: 392, srcSet: `${asset('photos/cute-snaps-small.webp')} 320w, ${ASSETS.cuteSnaps} 651w` }],
  [ASSETS.doodleStrip, { width: 177, height: 189, srcSet: `${asset('photos/doodle-strip-small.webp')} 177w, ${ASSETS.doodleStrip} 177w` }],
]);

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
 * Bounds include a small bleed under the painted edge of each opening.
 * Slot coordinates are normalized (0–1) relative to the template image dimensions.
 */
export const customTemplates = [
  // ── Existing templates ──
  {
    id: 'custom-capturing-moments',
    name: 'Capturing Moments',
    type: 'custom',
    slots: 3,
    image: capturingMomentsOverlay,
    imagePath: 'templates/capturing-moments.png',
    aspectRatio: 793 / 1983,
    photoSlots: [
      { x: 0.166674, y: 0.222390, w: 0.662864, h: 0.175492 },
      { x: 0.174250, y: 0.422088, w: 0.651501, h: 0.177005 },
      { x: 0.162886, y: 0.614221, w: 0.662864, h: 0.152799 },
    ],
  },
  {
    id: 'custom-memorie-dark',
    name: 'Memorie+ Dark',
    type: 'custom',
    slots: 3,
    image: template2Overlay,
    imagePath: 'templates/2.png',
    aspectRatio: 941 / 1672,
    photoSlots: [
      { x: 0.342829, y: 0.065525, w: 0.431892, h: 0.240892, rot: 5.46 },
      { x: 0.290928, y: 0.335376, w: 0.438670, h: 0.256504, rot: 6.19 },
      { x: 0.242563, y: 0.620152, w: 0.441403, h: 0.231803, rot: 6.35 },
    ],
  },

  // ── 1-photo templates ──
  {
    id: 'custom-ribbon',
    name: 'Ribbon',
    type: 'custom',
    slots: 1,
    image: ribbonOverlay,
    imagePath: 'templates/1-photo-ribbon.png',
    // 1536 x 2304
    aspectRatio: 1536 / 2304,
    photoSlots: [
      { x: 0.116674, y: 0.254528, w: 0.777059, h: 0.470975, rot: -7.04 },
    ],
  },

  // ── 2-photo templates ──
  {
    id: 'custom-memorie-plus',
    name: 'Memorie+',
    type: 'custom',
    slots: 2,
    image: memorieOverlay,
    imagePath: 'templates/phtotostrip 2.png',
    // 600 x 1464
    aspectRatio: 600 / 1464,
    photoSlots: [
      { x: 0.050000, y: 0.020492, w: 0.900000, h: 0.454918 },
      { x: 0.050000, y: 0.475410, w: 0.900000, h: 0.454918 },
    ],
  },
  {
    id: 'custom-out-of-orbit',
    name: 'Out of Orbit',
    type: 'custom',
    slots: 2,
    image: outOfOrbitOverlay,
    imagePath: 'templates/2-photo-out-of-orbit.png',
    // 600 x 1083
    aspectRatio: 600 / 1083,
    photoSlots: [
      { x: 0.075000, y: 0.138504, w: 0.850000, h: 0.354571 },
      { x: 0.075000, y: 0.509695, w: 0.850000, h: 0.354571 },
    ],
  },
  {
    id: 'custom-cherry-vinyl',
    name: 'Cherry Vinyl',
    type: 'custom',
    slots: 2,
    image: cherryVinylOverlay,
    imagePath: 'templates/2-photo-cherry-vinyl.png',
    // 1536 x 2304
    aspectRatio: 1536 / 2304,
    photoSlots: [
      { x: 0.112184, y: 0.165573, w: 0.635655, h: 0.286465, rot: -11.04 },
      { x: 0.379975, y: 0.547094, w: 0.514184, h: 0.283859, rot: 9.98 },
    ],
  },
  {
    id: 'custom-feedback',
    name: 'Feedback',
    type: 'custom',
    slots: 2,
    image: feedbackOverlay,
    imagePath: 'templates/2-photo-feedback.png',
    // 1536 x 2304
    aspectRatio: 1536 / 2304,
    photoSlots: [
      { x: 0.076418, y: 0.145452, w: 0.687012, h: 0.278974, rot: -10.03 },
      { x: 0.264156, y: 0.553606, w: 0.641596, h: 0.309021, rot: 8.01 },
    ],
  },

  // ── 3-photo templates ──
  {
    id: 'custom-on-repeat',
    name: 'On Repeat',
    type: 'custom',
    slots: 3,
    image: onRepeatOverlay,
    imagePath: 'templates/3-photo-on-repeat.png',
    // 600 x 1485
    aspectRatio: 600 / 1485,
    photoSlots: [
      { x: 0.075000, y: 0.101010, w: 0.850000, h: 0.258586 },
      { x: 0.075000, y: 0.371717, w: 0.850000, h: 0.258586 },
      { x: 0.075000, y: 0.642424, w: 0.850000, h: 0.258586 },
    ],
  },
  {
    id: 'custom-gingham-wave',
    name: 'Gingham Wave',
    type: 'custom',
    slots: 3,
    image: ginghamWaveOverlay,
    imagePath: 'templates/3-photo-gingham-wave.png',
    // 1536 x 2304
    aspectRatio: 1536 / 2304,
    photoSlots: [
      { x: 0.094081, y: 0.068199, w: 0.621803, h: 0.223840, rot: -6.01 },
      { x: 0.354004, y: 0.373214, w: 0.562022, h: 0.243608, rot: 7.00 },
      { x: 0.083761, y: 0.697906, w: 0.632599, h: 0.232242, rot: -5.01 },
    ],
  },

  // ── 4-photo templates ──
  {
    id: 'custom-flashback',
    name: 'Flashback',
    type: 'custom',
    slots: 4,
    image: flashbackOverlay,
    imagePath: 'templates/4-photo-flashback.png',
    // 600 x 1887
    aspectRatio: 600 / 1887,
    photoSlots: [
      { x: 0.075000, y: 0.079491, w: 0.850000, h: 0.203498 },
      { x: 0.075000, y: 0.292528, w: 0.850000, h: 0.203498 },
      { x: 0.075000, y: 0.505564, w: 0.850000, h: 0.203498 },
      { x: 0.075000, y: 0.718601, w: 0.850000, h: 0.203498 },
    ],
  },
  {
    id: 'custom-prism',
    name: 'Prism',
    type: 'custom',
    slots: 4,
    image: prismOverlay,
    imagePath: 'templates/4-photo-prism.png',
    // 1024 x 1536
    aspectRatio: 1024 / 1536,
    photoSlots: [
      { x: 0.045692, y: 0.043140, w: 0.467383, h: 0.214990, rot: -6.22 },
      { x: 0.484455, y: 0.267245, w: 0.478426, h: 0.217781, rot: 6.40 },
      { x: 0.034517, y: 0.478729, w: 0.443892, h: 0.214386, rot: -8.36 },
      { x: 0.436405, y: 0.726121, w: 0.503340, h: 0.224702, rot: 4.50 },
    ],
  },
  {
    id: 'custom-garden-band',
    name: 'Garden Band',
    type: 'custom',
    slots: 4,
    image: gardenBandOverlay,
    imagePath: 'templates/4-photo-garden-band.png',
    // 1024 x 1536
    aspectRatio: 1024 / 1536,
    photoSlots: [
      { x: 0.061469, y: 0.075349, w: 0.453695, h: 0.211761, rot: -9.08 },
      { x: 0.470236, y: 0.297044, w: 0.469208, h: 0.212747, rot: 8.12 },
      { x: 0.041539, y: 0.496142, w: 0.424123, h: 0.202406, rot: -7.94 },
      { x: 0.398376, y: 0.706922, w: 0.505478, h: 0.221772, rot: 6.11 },
    ],
  },
  {
    id: 'custom-indigo-bel',
    name: 'Indigo Bel',
    type: 'custom',
    slots: 4,
    image: indigoBelFourOverlay,
    imagePath: 'templates/indigo-bel-four.png',
    // 1200 x 3600
    aspectRatio: 1200 / 3600,
    photoSlots: [
      { x: 0.090000, y: 0.026667, w: 0.820000, h: 0.207500 },
      { x: 0.090000, y: 0.249167, w: 0.820000, h: 0.208333 },
      { x: 0.090000, y: 0.472500, w: 0.820000, h: 0.207500 },
      { x: 0.090000, y: 0.695833, w: 0.820000, h: 0.207500 },
    ],
  },
];

const stickerFiles = [...assetMap.keys()].filter(path => path.startsWith('stickers/')).map(path => path.slice(9));
function numberedStickers(prefix, first, last) {
  return stickerFiles.filter(name => {
    if (!name.startsWith(prefix)) return false;
    const number = Number(name.slice(prefix.length, -4));
    return Number.isInteger(number) && number >= first && number <= last;
  }).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

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
    items: numberedStickers('sticker2_', 1, 20),
  },
  {
    id: 'cute-cutouts',
    name: 'Cute Cutouts',
    vibe: 'Soft scrapbook bits',
    items: numberedStickers('sticker2_', 21, 40),
  },
  {
    id: 'aesthetic-mix',
    name: 'Aesthetic Mix',
    vibe: 'Collage-friendly accents',
    items: numberedStickers('stickers3_', 1, 24),
  },
  {
    id: 'retro-booth',
    name: 'Retro Booth',
    vibe: 'Film strip extras',
    items: [
      ...numberedStickers('stickers3_', 25, 60),
      ...numberedStickers('sticker4_', 1, 19),
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
];

const definedStickers = new Set(stickerCategories.flatMap(category => category.items));
const customStickers = stickerFiles.filter(name => !definedStickers.has(name));

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
  asset('photos/y2k-green-small.webp'),
  asset('photos/scrapbook-small.webp'),
  ASSETS.previewDigicam,
];
