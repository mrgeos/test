import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CHUTE, FLOOR_Y } from './config.js';
import { GROUP } from './physics.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { stripeTexture } from './textures.js';

// ------------------------------------------------------------ shared assets
const SPHERE = new THREE.SphereGeometry(1, 20, 14);
const SMALL = new THREE.SphereGeometry(1, 10, 8);
const CONE = new THREE.ConeGeometry(1, 1, 16);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const TOP_HALF = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
const BOTTOM_HALF = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
const RING = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
const SMILE = new THREE.TorusGeometry(1, 0.22, 6, 14, Math.PI);

const cache = new Map();
const cached = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};
const lighten = (hex, k) => new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k);

const plush = (hex) =>
  cached(`plush${hex}`, () =>
    new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: 0.92,
      sheen: 1,
      sheenRoughness: 0.45,
      sheenColor: lighten(hex, 0.55),
    }),
  );
const light = (hex, k = 0.55) => plush(`#${lighten(hex, k).getHexString()}`);
const gloss = (hex) => cached(`gloss${hex}`, () => new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1 }));
const EYE = new THREE.MeshStandardMaterial({ color: '#15101a', roughness: 0.15 });
const WHITE = gloss('#fbf7f2');
const PINK = plush('#ff9cbc');
const ORANGE = gloss('#ff9a2e');

function part(geo, mat, r, pos, scale = [1, 1, 1], rot = null, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.scale.set(r * scale[0], r * scale[1], r * scale[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}
const sphere = (r, x = 0, y = 0, z = 0) => ({ kind: 'sphere', r, offset: [x, y, z] });

// ------------------------------------------------------------ prize models
// Each builder returns { group, shapes, mass } in model space.

function buildBear(c) {
  const g = new THREE.Group();
  const fur = plush(c);
  const pale = light(c);
  g.add(
    part(SPHERE, fur, 0.05, [0, 0, 0], [1, 0.95, 0.9]),
    part(SPHERE, pale, 0.032, [0, -0.004, 0.028], [1, 1.1, 0.55]),
    part(SPHERE, fur, 0.042, [0, 0.07, 0]),
    part(SPHERE, pale, 0.019, [0, 0.062, 0.034], [1, 0.78, 0.75]),
    part(SMALL, EYE, 0.0065, [0, 0.068, 0.05], [1, 0.8, 1], null, false),
  );
  for (const s of [-1, 1]) {
    g.add(
      part(SMALL, EYE, 0.0055, [s * 0.016, 0.081, 0.036], [1, 1, 1], null, false),
      part(SPHERE, fur, 0.017, [s * 0.031, 0.103, -0.004], [1, 1, 0.55]),
      part(SPHERE, pale, 0.0095, [s * 0.031, 0.103, 0.003], [1, 1, 0.35], null, false),
      part(SPHERE, fur, 0.017, [s * 0.046, 0.012, 0.012], [1, 1.5, 1], [0, 0, s * 0.5]),
      part(SPHERE, fur, 0.019, [s * 0.026, -0.034, 0.024], [1, 0.8, 1.35]),
    );
  }
  return { group: g, shapes: [sphere(0.05), sphere(0.042, 0, 0.07, 0)], mass: 0.26 };
}

function buildBunny(c) {
  const g = new THREE.Group();
  const fur = plush(c);
  g.add(
    part(SPHERE, fur, 0.047, [0, 0, 0], [1, 1, 0.9]),
    part(SPHERE, light(c, 0.7), 0.03, [0, -0.004, 0.026], [1, 1.1, 0.55]),
    part(SPHERE, fur, 0.04, [0, 0.068, 0]),
    part(SMALL, PINK, 0.006, [0, 0.066, 0.04], [1.2, 0.8, 1], null, false),
    part(SPHERE, plush('#ffffff'), 0.016, [0, -0.012, -0.046]),
  );
  for (const s of [-1, 1]) {
    g.add(
      part(SMALL, EYE, 0.0058, [s * 0.016, 0.078, 0.034], [1, 1.1, 1], null, false),
      part(SPHERE, fur, 0.012, [s * 0.016, 0.125, -0.004], [1, 3, 0.6], [0, 0, -s * 0.18]),
      part(SPHERE, PINK, 0.007, [s * 0.0165, 0.125, 0.002], [1, 2.6, 0.35], [0, 0, -s * 0.18], false),
      part(SPHERE, PINK, 0.008, [s * 0.026, 0.06, 0.03], [1, 0.6, 0.4], null, false),
      part(SPHERE, fur, 0.016, [s * 0.044, 0.01, 0.012], [1, 1.5, 1], [0, 0, s * 0.45]),
      part(SPHERE, fur, 0.018, [s * 0.024, -0.034, 0.024], [1, 0.8, 1.4]),
    );
  }
  return { group: g, shapes: [sphere(0.047), sphere(0.04, 0, 0.068, 0), sphere(0.018, 0, 0.125, 0)], mass: 0.24 };
}

function buildCat(c) {
  const g = new THREE.Group();
  const fur = plush(c);
  g.add(
    part(SPHERE, fur, 0.058, [0, 0, 0], [1.08, 0.9, 1]),
    part(SMALL, PINK, 0.0055, [0, -0.002, 0.058], [1.3, 0.8, 1], null, false),
  );
  for (const s of [-1, 1]) {
    g.add(
      part(CONE, fur, 1, [s * 0.036, 0.052, 0], [0.018, 0.034, 0.014], [0, 0, -s * 0.38]),
      part(CONE, PINK, 1, [s * 0.035, 0.05, 0.006], [0.01, 0.022, 0.006], [0, 0, -s * 0.38], false),
      part(SMALL, EYE, 0.0075, [s * 0.022, 0.012, 0.054], [1, 1.25, 0.6], null, false),
      part(SMALL, PINK, 0.009, [s * 0.037, -0.006, 0.046], [1, 0.6, 0.4], null, false),
      part(SPHERE, light(c, 0.6), 0.013, [s * 0.02, -0.046, 0.036], [1, 0.8, 1.2]),
    );
  }
  g.add(part(SPHERE, fur, 0.011, [0.05, -0.024, -0.04], [1, 1, 2.6], [0, 0.9, 0]));
  return { group: g, shapes: [sphere(0.053)], mass: 0.2 };
}

function buildDuck(c) {
  const g = new THREE.Group();
  const fur = plush(c);
  g.add(
    part(SPHERE, fur, 0.05, [0, 0, 0], [1, 0.82, 1.15]),
    part(SPHERE, fur, 0.02, [0, 0.022, -0.056], [1, 0.7, 1.3], [0.5, 0, 0]),
    part(SPHERE, fur, 0.034, [0, 0.056, 0.026]),
    part(SPHERE, ORANGE, 0.015, [0, 0.05, 0.058], [1.25, 0.45, 1.1]),
  );
  for (const s of [-1, 1]) {
    g.add(
      part(SMALL, EYE, 0.005, [s * 0.016, 0.064, 0.05], [1, 1.2, 1], null, false),
      part(SPHERE, plush('#f5c02e'), 0.022, [s * 0.047, 0.004, -0.004], [0.35, 0.8, 1.2]),
    );
  }
  return { group: g, shapes: [sphere(0.047), sphere(0.034, 0, 0.056, 0.026)], mass: 0.2 };
}

function buildPenguin(c) {
  const g = new THREE.Group();
  const fur = plush(c);
  g.add(
    part(SPHERE, fur, 0.046, [0, 0, 0], [1, 1.3, 0.95]),
    part(SPHERE, plush('#f6f3ee'), 0.037, [0, -0.008, 0.016], [1, 1.15, 0.8]),
    part(SPHERE, ORANGE, 0.01, [0, 0.02, 0.047], [1, 0.6, 1.4]),
  );
  for (const s of [-1, 1]) {
    g.add(
      part(SMALL, WHITE, 0.009, [s * 0.015, 0.035, 0.036], [1, 1, 0.6], null, false),
      part(SMALL, EYE, 0.005, [s * 0.015, 0.035, 0.042], [1, 1, 0.6], null, false),
      part(SPHERE, ORANGE, 0.013, [s * 0.018, -0.056, 0.022], [1, 0.4, 1.5]),
      part(SPHERE, fur, 0.02, [s * 0.046, -0.002, 0], [0.3, 1.1, 0.7], [0, 0, s * 0.25]),
      part(SMALL, PINK, 0.007, [s * 0.027, 0.022, 0.036], [1, 0.6, 0.4], null, false),
    );
  }
  return { group: g, shapes: [sphere(0.045, 0, -0.018, 0), sphere(0.04, 0, 0.028, 0)], mass: 0.24 };
}

const STAR_GEO = (() => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.062 : 0.03;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: true, bevelSize: 0.009, bevelThickness: 0.01, bevelSegments: 4, curveSegments: 4 });
  geo.center();
  return geo;
})();

function buildStar(c) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(STAR_GEO, plush(c));
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  for (const s of [-1, 1]) {
    g.add(
      part(SMALL, EYE, 0.0055, [s * 0.012, 0.008, 0.021], [1, 1.2, 0.5], null, false),
      part(SMALL, PINK, 0.007, [s * 0.022, -0.004, 0.021], [1, 0.6, 0.3], null, false),
    );
  }
  g.add(part(SMILE, EYE, 0.007, [0, -0.002, 0.021], [1, 1, 1], [0, 0, Math.PI], false));
  const shapes = [sphere(0.026)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    shapes.push(sphere(0.019, Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0));
  }
  return { group: g, shapes, mass: 0.16 };
}

function buildBall([a, b]) {
  const g = new THREE.Group();
  const mat = cached(`ball${a}${b}`, () => new THREE.MeshPhysicalMaterial({ map: stripeTexture(a, b), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }));
  g.add(part(SPHERE, mat, 0.045, [0, 0, 0]));
  return { group: g, shapes: [sphere(0.045)], mass: 0.1 };
}

function buildGift([paper, ribbon]) {
  const g = new THREE.Group();
  const s = 0.084;
  const r = gloss(ribbon);
  g.add(
    part(BOX, gloss(paper), s, [0, 0, 0]),
    part(BOX, r, 1, [0, 0, 0], [s + 0.002, s + 0.002, 0.018]),
    part(BOX, r, 1, [0, 0, 0], [0.018, s + 0.002, s + 0.002]),
    part(SMALL, r, 0.008, [0, s / 2 + 0.004, 0]),
  );
  for (const k of [-1, 1]) g.add(part(SPHERE, r, 0.018, [k * 0.014, s / 2 + 0.008, 0], [1, 0.55, 0.45], [0, 0, -k * 0.5]));
  const half = s / 2;
  return { group: g, shapes: [{ kind: 'box', half: [half, half, half], offset: [0, 0, 0] }], mass: 0.18 };
}

function buildCapsule(c) {
  const g = new THREE.Group();
  const shell = cached(`shell${c}`, () =>
    new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  const r = 0.042;
  const top = part(TOP_HALF, shell, r, [0, 0, 0], [1, 1, 1], null, false);
  top.renderOrder = 2;
  g.add(
    top,
    part(BOTTOM_HALF, WHITE, r, [0, 0, 0]),
    part(RING, gloss(c), 1, [0, 0, 0], [r + 0.0008, 0.007, r + 0.0008]),
    part(SPHERE, plush(c === '#ffc940' ? '#ff4f9a' : '#ffc940'), 0.017, [0, 0.012, 0]),
  );
  return { group: g, shapes: [sphere(r)], mass: 0.09 };
}

export const PRIZE_TYPES = [
  { key: 'bear', name: 'Мишка', weight: 5, grip: 0.92, colors: ['#c98b55', '#f29bb5', '#eadbc4', '#8ec5f0', '#9be0b4'], build: buildBear },
  { key: 'bunny', name: 'Зайка', weight: 4, grip: 0.92, colors: ['#f7f3f0', '#f7b6d0', '#c9b6f2'], build: buildBunny },
  { key: 'cat', name: 'Котик', weight: 4, grip: 0.95, colors: ['#9aa0ae', '#f2a255', '#f4efe6', '#4a4452'], build: buildCat },
  { key: 'duck', name: 'Утёнок', weight: 4, grip: 1, colors: ['#ffd84a'], build: buildDuck },
  { key: 'penguin', name: 'Пингвин', weight: 3, grip: 0.95, colors: ['#26304f', '#3b4b7d'], build: buildPenguin },
  { key: 'star', name: 'Звёздочка', weight: 3, grip: 0.85, colors: ['#ffc940', '#ff8fc8', '#7fe8ff'], build: buildStar },
  { key: 'ball', name: 'Мячик', weight: 3, grip: 0.7, colors: [['#ff4f6d', '#ffe066'], ['#37e6d2', '#5b6cff'], ['#9bff6a', '#ff7ad9']], build: buildBall },
  { key: 'gift', name: 'Подарок', weight: 3, grip: 0.8, colors: [['#5b6cff', '#ffc940'], ['#ff4f9a', '#ffffff'], ['#23c483', '#ff4f6d']], build: buildGift },
  { key: 'capsule', name: 'Капсула', weight: 4, grip: 0.8, colors: ['#ff4f6d', '#37e6d2', '#ffc940', '#b98bff'], build: buildCapsule },
];

const swatch = (color) => (Array.isArray(color) ? color[0] : color);

// Bakes a prize model into one mesh per material (a handful of draw calls
// instead of a dozen) and caches it per type + colour.
function mergedModel(type, color) {
  return cached(`model:${type.key}:${swatch(color)}:${Array.isArray(color) ? color[1] : ''}`, () => {
    const { group, shapes, mass } = type.build(color);
    group.updateMatrixWorld(true);
    const byMaterial = new Map();
    group.traverse((o) => {
      if (!o.isMesh) return;
      let entry = byMaterial.get(o.material);
      if (!entry) byMaterial.set(o.material, (entry = { geos: [], cast: false, order: 0 }));
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.clearGroups();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      g.applyMatrix4(o.matrixWorld);
      entry.geos.push(g);
      entry.cast ||= o.castShadow;
      entry.order = Math.max(entry.order, o.renderOrder);
    });
    const meshes = [];
    for (const [material, { geos, cast, order }] of byMaterial) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), material);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.renderOrder = order;
      meshes.push(mesh);
    }
    return { meshes, shapes, mass };
  });
}

function pickType() {
  const total = PRIZE_TYPES.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of PRIZE_TYPES) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return PRIZE_TYPES[0];
}

// ------------------------------------------------------------ manager
export class PrizeManager {
  constructor(scene, world, physMaterials) {
    this.scene = scene;
    this.world = world;
    this.material = physMaterials.prize;
    this.list = [];
    this.nextId = 1;
  }

  spawn(type, color, position, quaternion) {
    const model = mergedModel(type, color);
    const { shapes, mass } = model;
    const group = new THREE.Group();
    for (const m of model.meshes) group.add(m.clone());

    // Move the body origin to the (volume weighted) centroid of the collision shapes.
    let vol = 0;
    const c = new THREE.Vector3();
    for (const s of shapes) {
      const v = s.kind === 'sphere' ? s.r ** 3 * 4.19 : 8 * s.half[0] * s.half[1] * s.half[2];
      c.x += s.offset[0] * v;
      c.y += s.offset[1] * v;
      c.z += s.offset[2] * v;
      vol += v;
    }
    c.divideScalar(vol);
    group.position.copy(c).negate();
    const mesh = new THREE.Group();
    mesh.add(group);
    this.scene.add(mesh);

    const body = new CANNON.Body({
      mass,
      material: this.material,
      linearDamping: 0.08,
      angularDamping: 0.3,
      collisionFilterGroup: GROUP.PRIZE,
      collisionFilterMask: GROUP.STATIC | GROUP.PRIZE | GROUP.CLAW,
      sleepSpeedLimit: 0.06,
      sleepTimeLimit: 0.5,
    });
    for (const s of shapes) {
      const offset = new CANNON.Vec3(s.offset[0] - c.x, s.offset[1] - c.y, s.offset[2] - c.z);
      const shape = s.kind === 'sphere' ? new CANNON.Sphere(s.r) : new CANNON.Box(new CANNON.Vec3(...s.half));
      body.addShape(shape, offset);
    }
    body.position.set(position.x, position.y, position.z);
    if (quaternion) body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    this.world.addBody(body);

    const prize = { id: this.nextId++, type, color: swatch(color), name: type.name, mesh, body, state: 'active', wonAt: 0 };
    body.prize = prize;
    this.list.push(prize);
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    return prize;
  }

  activeCount() {
    return this.list.filter((p) => p.state === 'active').length;
  }

  // Drops `count` random prizes from above, avoiding the chute.
  fill(count, baseY = FLOOR_Y + 0.1) {
    const cells = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = -0.33 + (i / (n - 1)) * 0.66;
        const z = -0.33 + (j / (n - 1)) * 0.66;
        if (x < CHUTE.maxX + 0.08 && z > CHUTE.minZ - 0.08) continue;
        cells.push([x, z]);
      }
    }
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let k = 0; k < count; k++) {
      if (k % cells.length === 0) cells.sort(() => Math.random() - 0.5);
      const [x, z] = cells[k % cells.length];
      const layer = Math.floor(k / cells.length);
      const type = pickType();
      const color = type.colors[Math.floor(Math.random() * type.colors.length)];
      e.set((Math.random() - 0.5) * 0.8, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.8);
      q.setFromEuler(e);
      this.spawn(
        type,
        color,
        new THREE.Vector3(x + (Math.random() - 0.5) * 0.03, baseY + layer * 0.14 + Math.random() * 0.04, z + (Math.random() - 0.5) * 0.03),
        q,
      );
    }
  }

  remove(prize) {
    prize.state = 'gone';
    this.world.removeBody(prize.body);
    this.scene.remove(prize.mesh);
    this.list = this.list.filter((p) => p !== prize);
  }

  clear() {
    for (const p of [...this.list]) this.remove(p);
  }

  // Called every physics step. A prize that drops below the play floor inside
  // the chute is a win.
  checkWins(time, onWin) {
    for (const p of this.list) {
      if (p.state !== 'active') continue;
      const pos = p.body.position;
      if (pos.y < -1) {
        p.state = 'lost';
        continue;
      }
      if (pos.y < FLOOR_Y - 0.04 && pos.x < CHUTE.maxX + 0.01 && pos.z > CHUTE.minZ - 0.01) {
        p.state = 'won';
        p.wonAt = time;
        onWin?.(p);
      }
    }
  }

  // Syncs meshes with bodies and retires prizes lying in the tray.
  update(time) {
    for (const p of [...this.list]) {
      if (p.state === 'lost') {
        this.remove(p);
        continue;
      }
      p.mesh.position.copy(p.body.position);
      p.mesh.quaternion.copy(p.body.quaternion);
      if (p.state === 'won') {
        const age = time - p.wonAt;
        if (age > 4) {
          const k = Math.max(0, 1 - (age - 4) / 0.5);
          p.mesh.scale.setScalar(k);
          if (k === 0) this.remove(p);
        }
      }
    }
  }

  nearby(point, radius) {
    const r2 = radius * radius;
    return this.list.filter((p) => {
      const b = p.body.position;
      return p.state === 'active' && (b.x - point.x) ** 2 + (b.y - point.y) ** 2 + (b.z - point.z) ** 2 < r2;
    });
  }
}
