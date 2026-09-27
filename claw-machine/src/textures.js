import * as THREE from 'three';

const DISPLAY_FONT = '"Unbounded", "Rubik", "Arial Black", sans-serif';
const BODY_FONT = '"Rubik", "Segoe UI", Arial, sans-serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat, srgb = true, anisotropy = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function star(ctx, x, y, r, points = 5, inset = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inset;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s, y - s * 0.3, x - s * 0.45, y - s, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.45, y - s, x + s, y - s * 0.3, x, y + s * 0.35);
  ctx.closePath();
}

// Neon marquee on the front of the header.
export function marqueeTexture(title, subtitle, { glow = '#ff4f9a', ink = '#fff6fb', accent = '#37e6d2' } = {}) {
  const [c, ctx] = canvas(1024, 224);
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#2a0f45');
  g.addColorStop(1, '#130826');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);

  // faint sunburst
  ctx.save();
  ctx.translate(c.width / 2, c.height * 1.1);
  for (let i = 0; i < 24; i++) {
    ctx.rotate((Math.PI * 2) / 24);
    ctx.fillStyle = i % 2 ? 'rgba(255,79,154,0.07)' : 'rgba(55,230,210,0.05)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-40, -700);
    ctx.lineTo(40, -700);
    ctx.fill();
  }
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 104px ${DISPLAY_FONT}`;
  ctx.lineJoin = 'round';
  for (const blur of [38, 18]) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = blur;
    ctx.strokeStyle = glow;
    ctx.lineWidth = 10;
    ctx.strokeText(title, c.width / 2, 98);
  }
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#ffffff';
  ctx.fillStyle = ink;
  ctx.fillText(title, c.width / 2, 98);

  ctx.shadowColor = accent;
  ctx.shadowBlur = 14;
  ctx.fillStyle = accent;
  ctx.font = `600 30px ${DISPLAY_FONT}`;
  ctx.fillText(subtitle, c.width / 2, 184);
  return finish(c);
}

// Printed back panel inside the machine.
export function backPanelTexture() {
  const [c, ctx] = canvas(512, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#5b2a8c');
  g.addColorStop(0.55, '#c23f8f');
  g.addColorStop(1, '#ff8fb8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);

  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const s = 6 + rnd() * 16;
    ctx.fillStyle = ['rgba(255,255,255,0.55)', 'rgba(255,214,90,0.7)', 'rgba(120,255,235,0.55)'][i % 3];
    if (i % 4 === 0) heart(ctx, x, y, s);
    else star(ctx, x, y, s);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.font = `800 54px ${DISPLAY_FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.shadowColor = 'rgba(80,0,60,0.6)';
  ctx.shadowBlur = 12;
  ctx.fillText('ЛОВИ', 256, 150);
  ctx.fillText('УДАЧУ!', 256, 215);
  return finish(c);
}

export function playFloorTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#2b1648';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 ? 'rgba(255,79,154,0.35)' : 'rgba(55,230,210,0.25)';
      ctx.beginPath();
      ctx.arc(x * 32 + 16, y * 32 + 16, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish(c, { repeat: [3, 3] });
}

export function roomFloorTexture() {
  const [c, ctx] = canvas(256, 256);
  const cell = 128;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#1a1030' : '#2a1b47';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 256, 256);
  ctx.beginPath();
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 256);
  ctx.moveTo(0, 128);
  ctx.lineTo(256, 128);
  ctx.stroke();
  return finish(c, { repeat: [16, 16], anisotropy: 8 });
}

// Stripes wrapping a ball (equirectangular UVs of SphereGeometry).
export function stripeTexture(a, b, stripes = 6) {
  const [c, ctx] = canvas(256, 128);
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? b : a;
    ctx.fillRect((i * 256) / stripes, 0, 256 / stripes + 1, 128);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 56, 256, 16);
  return finish(c);
}

export function labelTexture(text, { w = 256, h = 96, bg = '#130826', ink = '#ffc940', glow = '#ffc940', size = 46 } = {}) {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${size}px ${DISPLAY_FONT}`;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 16;
  ctx.fillStyle = ink;
  ctx.fillText(text, w / 2, h / 2 + 2);
  return finish(c);
}

// Seven-segment LED readout on the control panel.
const SEGMENTS = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd',
  6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '',
};

function drawDigit(ctx, ch, x, y, w, h, on, off) {
  const t = w * 0.2; // segment thickness
  const lit = SEGMENTS[ch] ?? '';
  const seg = (id, sx, sy, horizontal) => {
    ctx.fillStyle = lit.includes(id) ? on : off;
    ctx.beginPath();
    if (horizontal) {
      const l = w - t;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + t / 2, sy - t / 2);
      ctx.lineTo(sx + l - t / 2, sy - t / 2);
      ctx.lineTo(sx + l, sy);
      ctx.lineTo(sx + l - t / 2, sy + t / 2);
      ctx.lineTo(sx + t / 2, sy + t / 2);
    } else {
      const l = h / 2 - t / 2;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + t / 2, sy + t / 2);
      ctx.lineTo(sx + t / 2, sy + l - t / 2);
      ctx.lineTo(sx, sy + l);
      ctx.lineTo(sx - t / 2, sy + l - t / 2);
      ctx.lineTo(sx - t / 2, sy + t / 2);
    }
    ctx.closePath();
    ctx.fill();
  };
  const x0 = x + t / 2;
  const x1 = x + w - t / 2;
  seg('a', x0, y, true);
  seg('g', x0, y + h / 2, true);
  seg('d', x0, y + h, true);
  seg('f', x0, y + t / 4, false);
  seg('b', x1, y + t / 4, false);
  seg('e', x0, y + h / 2 + t / 4, false);
  seg('c', x1, y + h / 2 + t / 4, false);
}

export function createLedDisplay() {
  const [c, ctx] = canvas(512, 160);
  const texture = finish(c);
  let last = '';
  function draw(coins, time, prizes) {
    const key = `${coins}|${time}|${prizes}`;
    if (key === last) return;
    last = key;
    ctx.fillStyle = '#120404';
    ctx.fillRect(0, 0, 512, 160);
    const groups = [
      ['ЖЕТОНЫ', coins, 24],
      ['ВРЕМЯ', time, 192],
      ['ПРИЗЫ', prizes, 360],
    ];
    for (const [label, value, x] of groups) {
      ctx.fillStyle = '#ff9d7a';
      ctx.font = `600 22px ${BODY_FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 4, 32);
      const text = value === null ? '--' : String(Math.max(0, Math.min(99, value))).padStart(2, '0');
      ctx.shadowColor = '#ff3b1f';
      ctx.shadowBlur = 12;
      for (let i = 0; i < 2; i++) {
        drawDigit(ctx, text[i], x + i * 64, 50, 48, 90, '#ff4a26', 'rgba(255,60,30,0.08)');
      }
      ctx.shadowBlur = 0;
    }
    texture.needsUpdate = true;
  }
  draw(0, null, 0);
  return { texture, draw };
}
