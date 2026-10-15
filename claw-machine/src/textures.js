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
