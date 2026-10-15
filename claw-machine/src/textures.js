import * as THREE from 'three';

// System UI face on Apple devices, Inter elsewhere.
export const UI_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat, srgb = true, anisotropy = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

// Large-format pale limestone tiles, 1.2 x 0.6 m. The texture covers 2.4 m.
export function stoneFloorTexture(size = 40) {
  const [c, ctx] = canvas(1024, 1024);
  const rnd = seeded(11);
  const tileW = 512;
  const tileH = 256;
  for (let row = 0; row < 4; row++) {
    const offset = row % 2 ? tileW / 2 : 0;
    for (let col = -1; col < 3; col++) {
      const x = col * tileW + offset;
      const y = row * tileH;
      const tone = 226 + Math.floor(rnd() * 8);
      ctx.fillStyle = `rgb(${tone + 2}, ${tone}, ${tone - 4})`;
      ctx.fillRect(x, y, tileW, tileH);
    }
  }
  // fossil speckle
  for (let i = 0; i < 9000; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.02 + rnd() * 0.04})`;
    ctx.fillRect(rnd() * 1024, rnd() * 1024, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  // hairline joints
  ctx.fillStyle = 'rgba(150, 140, 128, 0.35)';
  for (let row = 0; row < 4; row++) {
    ctx.fillRect(0, row * tileH, 1024, 2);
    const offset = row % 2 ? tileW / 2 : 0;
    for (let col = 0; col < 3; col++) ctx.fillRect(col * tileW + offset, row * tileH, 2, tileH);
  }
  return finish(c, { repeat: [size / 2.4, size / 2.4], anisotropy: 16 });
}

// Light white oak with a soft straight grain.
export function oakTexture() {
  const [c, ctx] = canvas(1024, 256);
  const rnd = seeded(5);
  ctx.fillStyle = '#d6b892';
  ctx.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 220; i++) {
    const y = rnd() * 256;
    const amp = 1 + rnd() * 3;
    const freq = 0.004 + rnd() * 0.01;
    const phase = rnd() * 10;
    ctx.strokeStyle = rnd() < 0.5 ? `rgba(150, 110, 70, ${0.05 + rnd() * 0.12})` : `rgba(255, 240, 215, ${0.05 + rnd() * 0.1})`;
    ctx.lineWidth = 0.5 + rnd() * 1.5;
    ctx.beginPath();
    for (let x = 0; x <= 1024; x += 16) ctx.lineTo(x, y + Math.sin(x * freq + phase) * amp);
    ctx.stroke();
  }
  return finish(c);
}

export function stripeTexture(a, b, stripes = 6) {
  const [c, ctx] = canvas(256, 128);
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? b : a;
    ctx.fillRect((i * 256) / stripes, 0, 256 / stripes + 1, 128);
  }
  return finish(c);
}

// Small soft shadow used under every object standing on the floor.
let blobTexture;
export function contactShadowTexture() {
  if (blobTexture) return blobTexture;
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(40, 32, 24, 0.55)');
  g.addColorStop(0.5, 'rgba(40, 32, 24, 0.22)');
  g.addColorStop(1, 'rgba(40, 32, 24, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  blobTexture = finish(c);
  return blobTexture;
}

// ------------------------------------------------------------ generated surfaces
const { smoothstep } = THREE.MathUtils;
const fract = (x) => x - Math.floor(x);

// Mipmapped, tileable texture from RGBA bytes (row 0 is v = 0).
function dataTexture(data, w, h, { srgb = false, repeat, mip = true } = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mip;
  t.anisotropy = 8;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}

// Tangent-space normal map of a tileable height field.
function normalTexture(height, w, h, strength, opts) {
  const at = (x, y) => height[((y + h) % h) * w + ((x + w) % w)];
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const ny = (at(x, y - 1) - at(x, y + 1)) * strength;
      const k = 1 / Math.hypot(nx, ny, 1);
      const i = (y * w + x) * 4;
      data[i] = (nx * k * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * k * 0.5 + 0.5) * 255;
      data[i + 2] = (k * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  return dataTexture(data, w, h, opts);
}

const grey = (data, i, v) => {
  data[i] = data[i + 1] = data[i + 2] = v * 255;
  data[i + 3] = 255;
};

// Perforated aluminium: small round holes on a staggered grid, `pitch` apart.
// Returns the sheet (dark holes), a bevel normal map and a glow for the holes.
export function grilleTextures(width, height, pitch = 0.013) {
  const w = 64;
  const h = 111; // two rows of holes: pitch * sqrt(3)
  const radius = 18;
  const rim = 2.5;
  const holes = [[w / 2, h / 4], [0, (3 * h) / 4], [w, (3 * h) / 4]];
  const repeat = [width / pitch, height / (pitch * Math.sqrt(3))];
  const rnd = seeded(3);
  const relief = new Float32Array(w * h);
  const sheet = new Uint8ClampedArray(w * h * 4);
  const glow = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.min(...holes.map(([hx, hy]) => Math.hypot(x + 0.5 - hx, y + 0.5 - hy)));
      const solid = smoothstep(d, radius - rim, radius + rim);
      const grain = rnd();
      const i = y * w + x;
      relief[i] = solid + (grain - 0.5) * 0.05;
      grey(sheet, i * 4, (0.06 + 0.9 * solid) * (0.97 + grain * 0.03));
      grey(glow, i * 4, Math.min(1, 1 - smoothstep(d, radius - rim * 2, radius) + 0.3 * (1 - smoothstep(d, radius, radius + 9))));
    }
  }
  return {
    map: dataTexture(sheet, w, h, { srgb: true, repeat }),
    normalMap: normalTexture(relief, w, h, 3, { repeat }),
    glowMap: dataTexture(glow, w, h, { srgb: true, repeat }),
  };
}

// Plain-weave fabric. One 128 px tile holds 8 x 8 threads and covers `tile`
// metres; UVs are in metres, so any flat mesh can use it.
export function fabricTextures(tile = 0.024) {
  const n = 128;
  const threads = 8;
  const repeat = [1 / tile, 1 / tile];
  const rnd = seeded(23);
  const warpTone = Array.from({ length: threads }, () => 0.985 + rnd() * 0.03);
  const weftTone = Array.from({ length: threads }, () => 0.985 + rnd() * 0.03);
  // a thread is a round ridge across its width and rises where it crosses over
  const ridge = (f) => Math.sin(Math.PI * f) ** 0.7;
  const relief = new Float32Array(n * n);
  const colour = new Uint8ClampedArray(n * n * 4);
  const rough = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = ((x + 0.5) / n) * threads;
      const v = ((y + 0.5) / n) * threads;
      const ix = Math.floor(u);
      const iy = Math.floor(v);
      const warp = ridge(fract(u)) * (0.5 + (ix % 2 ? -0.5 : 0.5) * Math.sin(Math.PI * v));
      const weft = ridge(fract(v)) * (0.5 + (iy % 2 ? 0.5 : -0.5) * Math.sin(Math.PI * u));
      const fibre = rnd();
      const top = Math.max(warp, weft);
      const i = y * n + x;
      relief[i] = top + (fibre - 0.5) * 0.03;
      const tone = (warp > weft ? warpTone[ix] : weftTone[iy]) * (0.9 + 0.1 * top);
      const j = i * 4;
      colour[j] = 158 * tone;
      colour[j + 1] = 153 * tone;
      colour[j + 2] = 146 * tone;
      colour[j + 3] = 255;
      rough[j] = rough[j + 2] = 0;
      rough[j + 1] = (0.78 + 0.22 * (1 - top)) * 255;
      rough[j + 3] = 255;
    }
  }
  return {
    map: dataTexture(colour, n, n, { srgb: true, repeat }),
    normalMap: normalTexture(relief, n, n, 1.3, { repeat }),
    roughnessMap: dataTexture(rough, n, n, { repeat }),
  };
}

// Recessed ceiling light: brightest in the middle, fading towards the frame.
// The gradient is dithered, so it does not band.
export function lightPanelTexture() {
  const n = 256;
  const rnd = seeded(41);
  const data = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2;
      const v = 0.5 + 0.5 * Math.exp(-((r * 1.25) ** 2));
      grey(data, (y * n + x) * 4, v + (rnd() - 0.5) / 255);
    }
  }
  return dataTexture(data, n, n, { srgb: true, mip: false });
}

// Fine fleece for the plush toys: short random fibres, as a normal map.
let fleece;
export function fleeceTexture() {
  if (fleece) return fleece;
  const n = 128;
  const [c, ctx] = canvas(n, n);
  const rnd = seeded(17);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, n, n);
  ctx.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = rnd() * n;
    const y = rnd() * n;
    const a = rnd() * Math.PI * 2;
    const len = 5 + rnd() * 7;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.12 + rnd() * 0.18})`;
    ctx.lineWidth = 1 + rnd();
    // wrapped copies keep the tile seamless
    for (const dx of [-n, 0, n]) {
      for (const dy of [-n, 0, n]) {
        ctx.beginPath();
        ctx.moveTo(x + dx, y + dy);
        ctx.lineTo(x + dx + Math.cos(a) * len, y + dy + Math.sin(a) * len);
        ctx.stroke();
      }
    }
  }
  const px = ctx.getImageData(0, 0, n, n).data;
  const relief = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) relief[i] = px[i * 4] / 255;
  fleece = normalTexture(relief, n, n, 2.5, { repeat: [3, 2] });
  return fleece;
}

// Name engraved into the lid: barely darker than the metal around it.
export function wordmarkTexture(text) {
  const [c, ctx] = canvas(1024, 128);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 84px ${UI_FONT}`;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.fillText(text, 512, 68);
  return finish(c);
}

// Black glass readout on the control deck, styled like a watch face.
export function createDisplay() {
  const [c, ctx] = canvas(768, 240);
  const texture = finish(c);
  let last = '';
  function draw(coins, time, prizes, accent = '#0a84ff') {
    const key = `${coins}|${time}|${prizes}|${accent}`;
    if (key === last) return;
    last = key;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 768, 240);
    const cols = [
      ['Жетоны', coins, '#ffffff'],
      ['Время', time, accent],
      ['Призы', prizes, '#ffffff'],
    ];
    cols.forEach(([label, value, color], i) => {
      const x = 128 + i * 256;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8e8e93';
      ctx.font = `500 30px ${UI_FONT}`;
      ctx.fillText(label, x, 70);
      ctx.fillStyle = value === null ? '#48484a' : color;
      ctx.font = `600 104px ${UI_FONT}`;
      ctx.fillText(value === null ? '–' : String(value), x, 178);
    });
    texture.needsUpdate = true;
  }
  draw(0, null, 0);
  return { texture, draw };
}
