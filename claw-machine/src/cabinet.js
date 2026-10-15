import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CAB, FLOOR_Y, CEIL_Y, CHUTE, GANTRY_Y, FINISHES } from './config.js';
import { addStaticBox } from './physics.js';
import { displayModel } from './prizes.js';
import { stoneFloorTexture, oakTexture, contactShadowTexture, wordmarkTexture, createDisplay } from './textures.js';

const CORNER = 0.035; // corner radius of the unibody, in plan
const LID = 0.075; // lid thickness
const PASTELS = ['#9ec5ff', '#ffb8d1', '#c9b8ff', '#ffd59e', '#a8e6c9'].map((c) => new THREE.Color(c));
const WHITE = new THREE.Color('#ffffff');

const lightMat = (hex = '#ffffff', k = 1.4) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });

function makeMaterials() {
  return {
    // bead-blasted anodised aluminium, tinted by the chosen finish
    body: new THREE.MeshPhysicalMaterial({ color: FINISHES.silver.body, metalness: 1, roughness: 0.36, userData: { envBoost: 2.3 } }),
    steel: new THREE.MeshPhysicalMaterial({ color: '#f2f2f4', metalness: 1, roughness: 0.08 }),
    spaceGray: new THREE.MeshStandardMaterial({ color: '#3a3a3c', metalness: 0.6, roughness: 0.5 }),
    interior: new THREE.MeshStandardMaterial({ color: '#2c2c2e', roughness: 0.7 }),
    blackGlass: new THREE.MeshPhysicalMaterial({ color: '#050506', roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 }),
    ceramic: new THREE.MeshPhysicalMaterial({ color: '#fbfbfd', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04 }),
    // one outward-facing layer per pane; only a faint sheen shows it is there
    glass: new THREE.MeshPhysicalMaterial({
      color: '#f4fbff',
      roughness: 0.05,
      specularIntensity: 0.6,
      transparent: true,
      opacity: 0.035,
      depthWrite: false,
    }),
    glassEdge: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.1, transparent: true, opacity: 0.5, depthWrite: false }),
    frosted: new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      roughness: 0.4,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    felt: new THREE.MeshStandardMaterial({ color: '#e3e3e8', roughness: 0.95 }),
    lightbox: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.42, roughness: 0.9 }),
    diffuser: lightMat('#ffffff', 1.5),
    whiteLine: lightMat('#ffffff', 1.2),
    statusLine: lightMat('#ffffff', 1.2),
    buttonGlow: lightMat('#ffffff', 1.2),
  };
}

function box(w, h, d, material, x, y, z, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// Box given by its min/max corners.
function span(material, [x0, x1], [y0, y1], [z0, z1], opts) {
  return box(x1 - x0, y1 - y0, z1 - z0, material, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, opts);
}

function rounded(w, h, d, r, material, x, y, z) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function staticSpan(world, material, [x0, x1], [y0, y1], [z0, z1]) {
  return addStaticBox(
    world,
    material,
    [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2],
  );
}

// ------------------------------------------------------------ unibody helpers
// Plan outlines are lists of [x, z, cornerRadius]. Shapes live in the XY plane
// with y = -z, then get extruded upwards.
function outline(points, path = new THREE.Shape()) {
  const n = points.length;
  points.forEach(([x, z, r], i) => {
    const [px, pz] = points[(i - 1 + n) % n];
    const [nx, nz] = points[(i + 1) % n];
    const inLen = Math.hypot(x - px, z - pz);
    const outLen = Math.hypot(nx - x, nz - z);
    const ax = x + ((px - x) / inLen) * r;
    const az = z + ((pz - z) / inLen) * r;
    const bx = x + ((nx - x) / outLen) * r;
    const bz = z + ((nz - z) / outLen) * r;
    if (i === 0) path.moveTo(ax, -az);
    else path.lineTo(ax, -az);
    if (r > 0) path.quadraticCurveTo(x, -z, bx, -bz);
  });
  path.closePath();
  return path;
}

const rect = (x0, x1, z0, z1, r) => [
  [x0, z0, r],
  [x1, z0, r],
  [x1, z1, r],
  [x0, z1, r],
];

function extrude(shape, y0, y1, material) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 10 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// A thin tube along a plan outline: polished chamfers and light lines.
function edgeLine(points, y, radius, material) {
  const pts = outline(points).getPoints(12).map((p) => new THREE.Vector3(p.x, y, -p.y));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  return new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 2, radius, 6, true), material);
}

function contactShadow(w, d, x, z, opacity = 1) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, opacity }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.002, z);
  return m;
}

// ------------------------------------------------------------ machine
export function buildCabinet(scene, world, physMaterials) {
  const M = makeMaterials();
  const root = new THREE.Group();
  root.name = 'cabinet';
  scene.add(root);
  const add = (...objs) => objs.forEach((o) => root.add(o));
  const H = CAB.half;
  const I = CAB.inner;
  const top = FLOOR_Y - 0.002;
  const full = rect(-H, H, -H, H, CORNER);

  // ---------------------------------------------------------------- unibody
  // Three stacked extrusions share one outline, so the walls read as a single
  // block while the prize shaft (front-left) stays hollow.
  add(extrude(outline(full), 0.035, CHUTE.doorBottom, M.body));
  add(
    extrude(
      outline([
        [-H, -H, CORNER],
        [H, -H, CORNER],
        [H, H, CORNER],
        [CHUTE.maxX, H, 0],
        [CHUTE.maxX, CHUTE.minZ, 0],
        [CHUTE.minX, CHUTE.minZ, 0],
        [CHUTE.minX, H, 0],
        [-H, H, CORNER],
      ]),
      CHUTE.doorBottom,
      CHUTE.doorTop,
      M.body,
    ),
  );
  const withShaft = outline(full);
  withShaft.holes.push(outline(rect(CHUTE.minX, CHUTE.maxX, CHUTE.minZ, CHUTE.maxZ, 0), new THREE.Path()));
  add(extrude(withShaft, CHUTE.doorTop, top, M.body));
  // recessed plinth: the machine seems to float
  add(extrude(outline(rect(-H + 0.03, H - 0.03, -H + 0.03, H - 0.03, CORNER)), 0, 0.036, M.spaceGray));
  // diamond-cut chamfer along the top edge
  add(edgeLine(rect(-H - 0.0004, H + 0.0004, -H - 0.0004, H + 0.0004, CORNER), top, 0.0022, M.steel));

  // ------------------------------------------------------------ prize shaft
  const d = 0.004;
  add(
    span(M.interior, [CHUTE.maxX - d, CHUTE.maxX], [CHUTE.doorBottom, FLOOR_Y], [CHUTE.minZ, CHUTE.maxZ + 0.04], { cast: false }),
    span(M.interior, [CHUTE.minX, CHUTE.minX + d], [CHUTE.doorBottom, FLOOR_Y], [CHUTE.minZ, CHUTE.maxZ + 0.04], { cast: false }),
    span(M.interior, [CHUTE.minX, CHUTE.maxX], [CHUTE.doorBottom, FLOOR_Y], [CHUTE.minZ, CHUTE.minZ + d], { cast: false }),
    span(M.interior, [CHUTE.minX, CHUTE.maxX], [CHUTE.doorTop, FLOOR_Y], [CHUTE.maxZ - d, CHUTE.maxZ], { cast: false }),
  );
  staticSpan(world, physMaterials.static, [CHUTE.maxX, CHUTE.maxX + 0.04], [0.3, FLOOR_Y], [CHUTE.minZ - 0.04, H]);
  staticSpan(world, physMaterials.static, [-H - 0.02, CHUTE.minX], [0.3, FLOOR_Y], [CHUTE.minZ - 0.04, H + 0.15]);
  staticSpan(world, physMaterials.static, [-H, CHUTE.maxX + 0.04], [0.3, FLOOR_Y], [CHUTE.minZ - 0.04, CHUTE.minZ]);
  staticSpan(world, physMaterials.static, [-H, CHUTE.maxX + 0.04], [CHUTE.doorTop, FLOOR_Y], [CHUTE.maxZ, H]);

  // ramp: slopes from the back of the shaft down to the prize door
  {
    const z0 = CHUTE.minZ;
    const z1 = H + 0.02;
    const y0 = CHUTE.rampBackY;
    const y1 = CHUTE.doorBottom;
    const len = Math.hypot(z1 - z0, y0 - y1);
    const angle = Math.atan2(y0 - y1, z1 - z0);
    const thick = 0.04;
    const n = new THREE.Vector3(0, Math.cos(angle), Math.sin(angle));
    const mid = new THREE.Vector3(CHUTE.cx, (y0 + y1) / 2, (z0 + z1) / 2).addScaledVector(n, -thick / 2);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
    const ramp = box(CHUTE.maxX - CHUTE.minX, thick, len, M.interior, mid.x, mid.y, mid.z, { cast: false });
    ramp.quaternion.copy(q);
    add(ramp);
    addStaticBox(world, physMaterials.static, [mid.x, mid.y, mid.z], [(CHUTE.maxX - CHUTE.minX) / 2 + 0.02, thick / 2, len / 2], new CANNON.Quaternion(q.x, q.y, q.z, q.w));
  }

  // prize tray outside the door, machined from the same metal
  const trayZ1 = H + 0.13;
  const trayW = CHUTE.maxX - CHUTE.minX + 0.02;
  add(
    rounded(trayW, 0.02, trayZ1 - H + 0.01, 0.006, M.body, CHUTE.cx, CHUTE.doorBottom - 0.01, (H + trayZ1) / 2),
    rounded(trayW, 0.06, 0.012, 0.005, M.body, CHUTE.cx, CHUTE.doorBottom + 0.01, trayZ1 + 0.004),
    rounded(0.012, 0.09, trayZ1 - H + 0.012, 0.005, M.body, CHUTE.minX - 0.016, CHUTE.doorBottom + 0.025, (H + trayZ1) / 2),
    rounded(0.012, 0.09, trayZ1 - H + 0.012, 0.005, M.body, CHUTE.maxX + 0.016, CHUTE.doorBottom + 0.025, (H + trayZ1) / 2),
  );
  staticSpan(world, physMaterials.static, [CHUTE.minX - 0.02, CHUTE.maxX + 0.02], [CHUTE.doorBottom - 0.06, CHUTE.doorBottom], [H - 0.02, trayZ1]);
  staticSpan(world, physMaterials.static, [CHUTE.minX - 0.02, CHUTE.maxX + 0.02], [CHUTE.doorBottom - 0.06, CHUTE.doorBottom + 0.05], [trayZ1, trayZ1 + 0.03]);
  staticSpan(world, physMaterials.static, [CHUTE.minX - 0.05, CHUTE.minX - 0.01], [CHUTE.doorBottom - 0.06, CHUTE.doorBottom + 0.1], [H, trayZ1 + 0.03]);
  staticSpan(world, physMaterials.static, [CHUTE.maxX + 0.01, CHUTE.maxX + 0.05], [CHUTE.doorBottom - 0.06, CHUTE.doorBottom + 0.1], [H, trayZ1 + 0.03]);

  // smoked-glass flap, hinged at the top of the door
  const doorW = CHUTE.maxX - CHUTE.minX;
  const doorH = CHUTE.doorTop - CHUTE.doorBottom;
  const flap = new THREE.Group();
  flap.position.set(CHUTE.cx, CHUTE.doorTop, H + 0.0015);
  // outline() maps plan z to -y, so this pane hangs straight down from the hinge
  const flapShape = outline(rect(-doorW / 2 + 0.004, doorW / 2 - 0.004, 0.004, doorH - 0.004, 0.014));
  const flapPane = new THREE.Mesh(
    new THREE.ShapeGeometry(flapShape, 8),
    new THREE.MeshPhysicalMaterial({ color: '#1d1d1f', roughness: 0.12, transparent: true, opacity: 0.62, side: THREE.DoubleSide }),
  );
  flap.add(flapPane);
  add(flap);

  // ------------------------------------------------------------ play floor
  add(
    span(M.felt, [-I, I], [FLOOR_Y - 0.012, FLOOR_Y], [-I, CHUTE.minZ - 0.001], { cast: false }),
    span(M.felt, [CHUTE.maxX + 0.001, I], [FLOOR_Y - 0.012, FLOOR_Y], [CHUTE.minZ - 0.001, I], { cast: false }),
  );
  staticSpan(world, physMaterials.static, [-H, H], [FLOOR_Y - 0.1, FLOOR_Y], [-H, CHUTE.minZ]);
  staticSpan(world, physMaterials.static, [CHUTE.maxX, H], [FLOOR_Y - 0.1, FLOOR_Y], [CHUTE.minZ, H]);

  // glass walls (physics: thick boxes just outside the play area)
  const wallH = [FLOOR_Y - 0.1, CEIL_Y + 0.1];
  staticSpan(world, physMaterials.static, [-I - 0.1, -I], wallH, [-H - 0.1, H + 0.1]);
  staticSpan(world, physMaterials.static, [I, I + 0.1], wallH, [-H - 0.1, H + 0.1]);
  staticSpan(world, physMaterials.static, [-H - 0.1, H + 0.1], wallH, [-I - 0.1, -I]);
  staticSpan(world, physMaterials.static, [-H - 0.1, H + 0.1], wallH, [I, I + 0.1]);
  staticSpan(world, physMaterials.static, [-H, H], [CEIL_Y, CEIL_Y + 0.1], [-H, H]);

  // chute guard: frosted glass with a hairline of light on top
  const t = CHUTE.guardThickness;
  const gTop = FLOOR_Y + CHUTE.guardHeight;
  const guardX = { x: [CHUTE.maxX, CHUTE.maxX + t], z: [CHUTE.minZ - t, CHUTE.maxZ] };
  const guardZ = { x: [CHUTE.minX, CHUTE.maxX + t], z: [CHUTE.minZ - t, CHUTE.minZ] };
  for (const g of [guardX, guardZ]) {
    add(span(M.frosted, g.x, [FLOOR_Y, gTop], g.z, { cast: false, receive: false }));
    add(span(M.whiteLine, g.x, [gTop, gTop + 0.003], g.z, { cast: false }));
    staticSpan(world, physMaterials.static, g.x, [FLOOR_Y - 0.02, gTop], g.z);
  }
  // the claw may not pass through the guard: exposed as blockers
  const clawBlockers = [guardX, guardZ].map((g) => ({
    min: new THREE.Vector3(g.x[0], FLOOR_Y, g.z[0]),
    max: new THREE.Vector3(g.x[1], gTop + 0.006, g.z[1]),
  }));

  // ------------------------------------------------------ frameless glass
  const g = H - CAB.post; // pane plane
  const paneH = CEIL_Y - FLOOR_Y;
  const paneY = (FLOOR_Y + CEIL_Y) / 2;
  const pane = (x, z, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(g * 2, paneH), M.glass);
    m.position.set(x, paneY, z);
    m.rotation.y = rotY;
    m.renderOrder = 1;
    return m;
  };
  add(pane(0, g, 0), pane(-g, 0, -Math.PI / 2), pane(g, 0, Math.PI / 2), pane(0, -g, Math.PI));
  // polished glass edges where the panes meet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.0026, paneH, 0.0026, M.glassEdge, sx * g, paneY, sz * g, { cast: false, receive: false }));

  // the back is a lightbox: an evenly lit white field behind the toys.
  // It faces the player only, so the machine stays see-through from behind.
  const back = new THREE.Mesh(new THREE.PlaneGeometry(I * 2, paneH), M.lightbox);
  back.position.set(0, paneY, -I - 0.002);
  add(back);

  // ------------------------------------------------------------ lid
  add(extrude(outline(full), CEIL_Y, CEIL_Y + LID, M.body));
  add(edgeLine(rect(-H - 0.0004, H + 0.0004, -H - 0.0004, H + 0.0004, CORNER), CEIL_Y + LID, 0.0022, M.steel));
  // status light: a single line of light under the lid
  add(edgeLine(rect(-H + 0.009, H - 0.009, -H + 0.009, H - 0.009, CORNER - 0.009), CEIL_Y - 0.0035, 0.0024, M.statusLine));
  // diffuser across the whole ceiling
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(g * 2, g * 2), M.diffuser);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, CEIL_Y - 0.002, 0);
  add(ceiling);
  // the name, engraved
  const wordmark = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.0325),
    new THREE.MeshBasicMaterial({ map: wordmarkTexture('Хватайка'), transparent: true, depthWrite: false }),
  );
  wordmark.position.set(0, CEIL_Y + LID / 2, H + 0.0008);
  add(wordmark);

  // gantry rails (the moving bridge belongs to the claw)
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, I * 2, 16), M.steel);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(sx * (I - 0.016), GANTRY_Y, 0);
    rail.castShadow = true;
    add(rail);
    add(span(M.body, [sx * (I - 0.004) - 0.004, sx * (I - 0.004) + 0.004], [GANTRY_Y - 0.008, CEIL_Y], [-I, I]));
  }

  // --------------------------------------------------------- control deck
  const deck = new THREE.Group();
  deck.position.set(0, 0.8, H + 0.075);
  deck.rotation.x = 0.1;
  add(deck);
  deck.add(rounded(H * 2 - 0.03, 0.03, 0.16, 0.012, M.body, 0, 0, 0));
  const surface = 0.015;

  const joyBase = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 48), M.steel);
  joyBase.position.set(-0.2, surface + 0.002, 0.01);
  deck.add(joyBase);
  const joystick = new THREE.Group();
  joystick.position.set(-0.2, surface + 0.004, 0.01);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.052, 16), M.steel);
  shaft.position.y = 0.026;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.017, 32, 24), M.ceramic);
  knob.position.y = 0.056;
  shaft.castShadow = knob.castShadow = true;
  joystick.add(shaft, knob);
  deck.add(joystick);

  // the button: black glass in a polished steel ring
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.006, 64), M.steel);
  ring.position.set(0.2, surface + 0.003, 0.01);
  deck.add(ring);
  const button = new THREE.Group();
  button.position.set(0.2, surface + 0.005, 0.01);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.0305, 0.0305, 0.006, 64), M.blackGlass);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.0332, 0.0013, 8, 64), M.buttonGlow);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.0032;
  button.add(disc, halo);
  deck.add(button);

  const display = createDisplay();
  deck.add(rounded(0.25, 0.006, 0.08, 0.003, M.blackGlass, 0, surface + 0.001, 0));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.236, 0.074), new THREE.MeshBasicMaterial({ map: display.texture, toneMapped: false }));
  screen.rotation.x = -Math.PI / 2;
  screen.position.set(0, surface + 0.0042, 0);
  deck.add(screen);

  // ---------------------------------------------------------- finish & light
  let accent = new THREE.Color(FINISHES.silver.accent);
  let accentHex = FINISHES.silver.accent;
  const tmp = new THREE.Color();

  function setFinish(key) {
    const f = FINISHES[key] ?? FINISHES.silver;
    M.body.color.set(f.body);
    accent = new THREE.Color(f.accent);
    accentHex = f.accent;
  }

  // The status line breathes when idle, glows in the accent colour while you
  // play, and drifts through soft colours after a win.
  function updateLights(state, t, sinceWin) {
    if (sinceWin >= 0 && sinceWin < 3.5) {
      const f = (t * 0.9) % PASTELS.length;
      tmp.copy(PASTELS[Math.floor(f)]).lerp(PASTELS[(Math.floor(f) + 1) % PASTELS.length], f % 1).multiplyScalar(1.15);
    } else if (state === 'idle') tmp.copy(WHITE).multiplyScalar(0.8 + 0.2 * Math.sin(t * 1.6));
    else if (state === 'play') tmp.copy(accent).multiplyScalar(1.15);
    else tmp.copy(accent).multiplyScalar(0.85 + 0.3 * Math.sin(t * 6));
    M.statusLine.color.copy(tmp);
    if (state === 'idle' || state === 'play') M.buttonGlow.color.copy(accent).multiplyScalar(state === 'play' ? 1.2 : 0.7 + 0.3 * Math.sin(t * 1.6));
    else M.buttonGlow.color.setScalar(0.15);
  }

  return {
    root,
    joystick,
    button,
    buttonRestY: button.position.y,
    led: { draw: (coins, time, prizes) => display.draw(coins, time, prizes, accentHex) },
    flap,
    clawBlockers,
    setFinish,
    updateLights,
  };
}

// ------------------------------------------------------------ the store
const SCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Slow, soft colour fields, like a wallpaper on a large display.
const SCREEN_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform vec3 uBase;
varying vec2 vUv;
float field(vec2 p, vec2 c, float k) { vec2 d = p - c; return exp(-dot(d, d) * k); }
void main() {
  vec2 p = vUv * vec2(2.37, 1.0);
  float t = uTime * 0.06;
  vec2 c1 = vec2(0.6 + 0.45 * sin(t * 1.3), 0.45 + 0.3 * cos(t * 1.1));
  vec2 c2 = vec2(1.7 + 0.5 * cos(t * 0.9), 0.5 + 0.35 * sin(t * 1.7));
  vec2 c3 = vec2(1.2 + 0.6 * sin(t * 0.7 + 1.0), 0.6 + 0.3 * sin(t * 1.2 + 2.0));
  vec3 col = uBase;
  col = mix(col, uA, field(p, c1, 2.0));
  col = mix(col, uB, field(p, c2, 1.8));
  col = mix(col, uC, field(p, c3, 2.4));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function oakTable(oak, x, z, rotY, products) {
  const table = new THREE.Group();
  table.position.set(x, 0, z);
  table.rotation.y = rotY;
  const len = 2.4;
  const width = 0.9;
  const topY = 0.86;
  const slab = new THREE.Mesh(new RoundedBoxGeometry(len, 0.06, width, 3, 0.012), oak);
  slab.position.y = topY - 0.03;
  table.add(slab);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, topY - 0.06, 0.07), oak);
      leg.position.set(sx * (len / 2 - 0.16), (topY - 0.06) / 2, sz * (width / 2 - 0.12));
      table.add(leg);
    }
  }
  table.add(contactShadow(len + 0.5, width + 0.4, 0, 0, 0.8));
  // products laid out with even spacing, like a store display
  products.forEach(([key, colorIndex], i) => {
    const item = displayModel(key, colorIndex);
    const px = -len / 2 + 0.3 + i * ((len - 0.6) / (products.length - 1));
    item.position.set(px, topY, 0.05);
    item.rotation.y = -rotY + (i % 2 ? 0.25 : -0.25);
    table.add(item);
    const r = item.userData.radius;
    const s = contactShadow(r * 3.2, r * 3.2, px, 0.05, 0.9);
    s.position.y = topY + 0.001;
    table.add(s);
  });
  return table;
}

function tree(x, z, seed) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const planter = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.6, 0.46, 64), new THREE.MeshStandardMaterial({ color: '#dcd8d1', roughness: 0.8 }));
  planter.position.y = 0.23;
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.02, 48), new THREE.MeshStandardMaterial({ color: '#4a3f36', roughness: 1 }));
  soil.position.y = 0.45;
  const bark = new THREE.MeshStandardMaterial({ color: '#8a7058', roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 2.2, 12), bark);
  trunk.position.y = 1.5;
  g.add(planter, soil, trunk);
  const leaves = [new THREE.MeshStandardMaterial({ color: '#7f9c6c', roughness: 1 }), new THREE.MeshStandardMaterial({ color: '#6d8b5d', roughness: 1 })];
  const blob = new THREE.SphereGeometry(1, 20, 14);
  for (let i = 0; i < 11; i++) {
    const m = new THREE.Mesh(blob, leaves[i % 2]);
    const r = 0.3 + rnd() * 0.22;
    m.scale.setScalar(r);
    m.position.set((rnd() - 0.5) * 1.0, 2.35 + (rnd() - 0.3) * 0.8, (rnd() - 0.5) * 1.0);
    g.add(m);
  }
  g.add(contactShadow(1.7, 1.7, 0, 0, 0.9));
  return g;
}

export function buildRoom(scene) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: stoneFloorTexture(40), roughness: 0.72 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(contactShadow(1.6, 1.75, 0, 0.06, 1));

  // the forum: a wall with a large display and a long oak bench
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshStandardMaterial({ color: '#ebe8e3', roughness: 0.95 }));
  wall.position.set(0, 3, -4.8);
  scene.add(wall);
  const bezel = new THREE.Mesh(new THREE.PlaneGeometry(6.48, 2.78), new THREE.MeshStandardMaterial({ color: '#111113', roughness: 0.3 }));
  bezel.position.set(0, 2.35, -4.79);
  scene.add(bezel);
  const uniforms = {
    uTime: { value: 0 },
    uA: { value: new THREE.Color('#9ec5ff') },
    uB: { value: new THREE.Color('#ffb8d1') },
    uC: { value: new THREE.Color('#c9b8ff') },
    uBase: { value: new THREE.Color('#ffe2c4') },
  };
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.7), new THREE.ShaderMaterial({ uniforms, vertexShader: SCREEN_VERT, fragmentShader: SCREEN_FRAG }));
  screen.position.set(0, 2.35, -4.78);
  scene.add(screen);

  const oak = new THREE.MeshStandardMaterial({ map: oakTexture(), roughness: 0.55 });
  const bench = new THREE.Mesh(new RoundedBoxGeometry(6.4, 0.44, 0.5, 3, 0.02), oak);
  bench.position.set(0, 0.22, -4.2);
  scene.add(bench, contactShadow(7, 1.1, 0, -4.2, 0.8));

  scene.add(
    oakTable(oak, -2.3, -0.8, Math.PI / 2, [['bear', 0], ['bunny', 1], ['cat', 1], ['duck', 0], ['penguin', 0]]),
    oakTable(oak, 2.3, -0.8, Math.PI / 2, [['star', 0], ['gift', 0], ['bear', 3], ['capsule', 1], ['bunny', 2]]),
    tree(-3.7, -3.3, 7),
    tree(3.8, -3.1, 19),
  );

  return {
    update(t) {
      uniforms.uTime.value = t;
    },
  };
}
