import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CAB, FLOOR_Y, CEIL_Y, HEADER_TOP, CHUTE, GANTRY_Y } from './config.js';
import { addStaticBox } from './physics.js';
import {
  marqueeTexture,
  backPanelTexture,
  playFloorTexture,
  roomFloorTexture,
  labelTexture,
  createLedDisplay,
} from './textures.js';

const glow = (hex, k = 2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });

export const PALETTE = {
  candy: '#ff4f9a',
  aqua: '#37e6d2',
  gold: '#ffc940',
  night: '#120a24',
};

function makeMaterials() {
  return {
    body: new THREE.MeshPhysicalMaterial({
      color: PALETTE.candy,
      roughness: 0.34,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    }),
    bodyDark: new THREE.MeshPhysicalMaterial({ color: '#3a1a5c', roughness: 0.4, clearcoat: 0.6 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#e4e7ef', metalness: 1, roughness: 0.16 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: '#2a2438', metalness: 0.7, roughness: 0.45 }),
    lining: new THREE.MeshStandardMaterial({ color: '#140d22', roughness: 0.9 }),
    panel: new THREE.MeshStandardMaterial({ color: '#221843', roughness: 0.45, metalness: 0.25 }),
    panelTop: new THREE.MeshPhysicalMaterial({ color: '#2d1f58', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.3 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      roughness: 0.12,
      specularIntensity: 0.25,
      metalness: 0,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      envMapIntensity: 0.8,
      side: THREE.DoubleSide,
    }),
    acrylic: new THREE.MeshPhysicalMaterial({
      color: '#8ffff2',
      roughness: 0.08,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    aquaLed: glow(PALETTE.aqua, 2.2),
    goldLed: glow(PALETTE.gold, 2.2),
    pinkLed: glow(PALETTE.candy, 2),
    ceilingLight: glow('#fff4e8', 2.4),
    redButton: new THREE.MeshPhysicalMaterial({
      color: '#ff2a1f',
      emissive: '#ff1a0d',
      emissiveIntensity: 0.9,
      roughness: 0.2,
      clearcoat: 1,
    }),
    ballTop: new THREE.MeshPhysicalMaterial({ color: '#ff2a55', roughness: 0.18, clearcoat: 1 }),
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

function staticSpan(world, material, [x0, x1], [y0, y1], [z0, z1]) {
  return addStaticBox(
    world,
    material,
    [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2],
  );
}

export function buildCabinet(scene, world, physMaterials) {
  const M = makeMaterials();
  const root = new THREE.Group();
  root.name = 'cabinet';
  scene.add(root);
  const add = (...objs) => objs.forEach((o) => root.add(o));
  const H = CAB.half;
  const I = CAB.inner;
  const top = FLOOR_Y - 0.002;

  // ---------------------------------------------------------------- base shell
  // Built from blocks so the prize shaft (front-left) stays hollow.
  add(
    span(M.body, [-H, H], [0.06, top], [-H, CHUTE.minZ]),
    span(M.body, [CHUTE.maxX, H], [0.06, top], [CHUTE.minZ, H]),
    span(M.body, [-H, CHUTE.maxX], [0.06, CHUTE.doorBottom], [CHUTE.minZ, H]),
    span(M.body, [-H, CHUTE.minX], [CHUTE.doorBottom, top], [CHUTE.minZ, H]),
    span(M.body, [CHUTE.minX, CHUTE.maxX], [CHUTE.doorTop, top], [CHUTE.maxZ, H]),
    // kick plate
    span(M.darkMetal, [-H + 0.01, H - 0.01], [0, 0.06], [-H + 0.01, H - 0.01]),
  );
  // chrome edge trims on the base
  for (const sx of [-1, 1]) {
    add(span(M.chrome, [sx * H - 0.006, sx * H + 0.006], [0.06, top], [H - 0.006, H + 0.006]));
  }
  add(span(M.aquaLed, [CHUTE.maxX + 0.02, H - 0.02], [0.1, 0.108], [H, H + 0.004], { cast: false }));

  // decorative stripes on the front of the base
  const stripe = labelTexture('ИГРАЙ  ·  ХВАТАЙ  ·  ВЫИГРЫВАЙ', { w: 1024, h: 64, size: 30, ink: '#fff2f8', glow: PALETTE.candy, bg: '#3a1a5c' });
  const stripeMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.0375), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.5 }));
  stripeMesh.position.set((CHUTE.maxX + H) / 2, 0.2, H + 0.002);
  add(stripeMesh);

  // coin slot
  const coinPlate = span(M.chrome, [0.24, 0.36], [0.44, 0.62], [H, H + 0.01]);
  const coinSlot = span(M.goldLed, [0.295, 0.305], [0.5, 0.58], [H + 0.01, H + 0.013], { cast: false });
  const coinLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.1, 0.0375),
    new THREE.MeshBasicMaterial({ map: labelTexture('ЖЕТОН', { size: 44 }), toneMapped: false }),
  );
  coinLabel.position.set(0.3, 0.465, H + 0.0115);
  add(coinPlate, coinSlot, coinLabel);

  // ------------------------------------------------------------ prize shaft
  const d = 0.004;
  add(
    span(M.lining, [CHUTE.maxX - d, CHUTE.maxX], [CHUTE.doorBottom, FLOOR_Y], [CHUTE.minZ, CHUTE.maxZ + 0.04], { cast: false }),
    span(M.lining, [CHUTE.minX, CHUTE.minX + d], [CHUTE.doorBottom, FLOOR_Y], [CHUTE.minZ, CHUTE.maxZ + 0.04], { cast: false }),
    span(M.lining, [CHUTE.minX, CHUTE.maxX], [CHUTE.doorBottom, FLOOR_Y], [CHUTE.minZ, CHUTE.minZ + d], { cast: false }),
    span(M.lining, [CHUTE.minX, CHUTE.maxX], [CHUTE.doorTop, FLOOR_Y], [CHUTE.maxZ - d, CHUTE.maxZ], { cast: false }),
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
    const ramp = box(CHUTE.maxX - CHUTE.minX, thick, len, M.lining, mid.x, mid.y, mid.z, { cast: false });
    ramp.quaternion.copy(q);
    add(ramp);
    addStaticBox(world, physMaterials.static, [mid.x, mid.y, mid.z], [(CHUTE.maxX - CHUTE.minX) / 2 + 0.02, thick / 2, len / 2], new CANNON.Quaternion(q.x, q.y, q.z, q.w));
  }

  // prize tray outside the door
  const trayZ1 = H + 0.13;
  add(
    span(M.darkMetal, [CHUTE.minX - 0.01, CHUTE.maxX + 0.01], [CHUTE.doorBottom - 0.02, CHUTE.doorBottom], [H, trayZ1]),
    span(M.chrome, [CHUTE.minX - 0.01, CHUTE.maxX + 0.01], [CHUTE.doorBottom - 0.02, CHUTE.doorBottom + 0.05], [trayZ1, trayZ1 + 0.01]),
    span(M.chrome, [CHUTE.minX - 0.02, CHUTE.minX - 0.01], [CHUTE.doorBottom - 0.02, CHUTE.doorBottom + 0.07], [H, trayZ1 + 0.01]),
    span(M.chrome, [CHUTE.maxX + 0.01, CHUTE.maxX + 0.02], [CHUTE.doorBottom - 0.02, CHUTE.doorBottom + 0.07], [H, trayZ1 + 0.01]),
  );
  staticSpan(world, physMaterials.static, [CHUTE.minX - 0.02, CHUTE.maxX + 0.02], [CHUTE.doorBottom - 0.06, CHUTE.doorBottom], [H - 0.02, trayZ1]);
  staticSpan(world, physMaterials.static, [CHUTE.minX - 0.02, CHUTE.maxX + 0.02], [CHUTE.doorBottom - 0.06, CHUTE.doorBottom + 0.05], [trayZ1, trayZ1 + 0.03]);
  staticSpan(world, physMaterials.static, [CHUTE.minX - 0.05, CHUTE.minX - 0.01], [CHUTE.doorBottom - 0.06, CHUTE.doorBottom + 0.1], [H, trayZ1 + 0.03]);
  staticSpan(world, physMaterials.static, [CHUTE.maxX + 0.01, CHUTE.maxX + 0.05], [CHUTE.doorBottom - 0.06, CHUTE.doorBottom + 0.1], [H, trayZ1 + 0.03]);

  // door frame + swinging flap
  add(
    span(M.chrome, [CHUTE.minX - 0.012, CHUTE.maxX + 0.012], [CHUTE.doorTop, CHUTE.doorTop + 0.012], [H, H + 0.008]),
    span(M.chrome, [CHUTE.minX - 0.012, CHUTE.minX], [CHUTE.doorBottom, CHUTE.doorTop], [H, H + 0.008]),
    span(M.chrome, [CHUTE.maxX, CHUTE.maxX + 0.012], [CHUTE.doorBottom, CHUTE.doorTop], [H, H + 0.008]),
  );
  const flap = new THREE.Group();
  flap.position.set(CHUTE.cx, CHUTE.doorTop, H + 0.012);
  const flapPane = new THREE.Mesh(
    new THREE.PlaneGeometry(CHUTE.maxX - CHUTE.minX, CHUTE.doorTop - CHUTE.doorBottom),
    new THREE.MeshPhysicalMaterial({ color: '#2a1a40', roughness: 0.15, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  flapPane.position.y = -(CHUTE.doorTop - CHUTE.doorBottom) / 2;
  flap.add(flapPane);
  const flapLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.14, 0.05),
    new THREE.MeshBasicMaterial({ map: labelTexture('ПРИЗ', { size: 52, bg: '#1a0f2e' }), toneMapped: false }),
  );
  flapLabel.position.set(0, -0.06, 0.001);
  flap.add(flapLabel);
  add(flap);

  // ------------------------------------------------------------ play floor
  const floorMat = new THREE.MeshStandardMaterial({ map: playFloorTexture(), roughness: 0.85 });
  add(
    span(floorMat, [-I, I], [FLOOR_Y - 0.1, FLOOR_Y], [-I, CHUTE.minZ], { cast: false }),
    span(floorMat, [CHUTE.maxX, I], [FLOOR_Y - 0.1, FLOOR_Y], [CHUTE.minZ, I], { cast: false }),
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

  // chute guard (acrylic) with a glowing rim
  const t = CHUTE.guardThickness;
  const gTop = FLOOR_Y + CHUTE.guardHeight;
  const guardX = { x: [CHUTE.maxX, CHUTE.maxX + t], z: [CHUTE.minZ - t, CHUTE.maxZ] };
  const guardZ = { x: [CHUTE.minX, CHUTE.maxX + t], z: [CHUTE.minZ - t, CHUTE.minZ] };
  for (const g of [guardX, guardZ]) {
    add(span(M.acrylic, g.x, [FLOOR_Y, gTop], g.z, { cast: false, receive: false }));
    add(span(M.goldLed, g.x, [gTop, gTop + 0.006], g.z, { cast: false }));
    staticSpan(world, physMaterials.static, g.x, [FLOOR_Y - 0.02, gTop], g.z);
  }
  const prizeSticker = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.06),
    new THREE.MeshBasicMaterial({ map: labelTexture('ПРИЗ', { size: 56, bg: '#241036' }), toneMapped: false, transparent: true, opacity: 0.9 }),
  );
  prizeSticker.position.set(CHUTE.cx, FLOOR_Y + 0.062, CHUTE.minZ + 0.001);
  add(prizeSticker);
  // the claw may not pass through the guard: exposed as blockers
  const clawBlockers = [guardX, guardZ].map((g) => ({
    min: new THREE.Vector3(g.x[0], FLOOR_Y, g.z[0]),
    max: new THREE.Vector3(g.x[1], gTop + 0.006, g.z[1]),
  }));

  // ------------------------------------------------------ posts, glass, header
  const p = CAB.post;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      add(box(p * 2, CEIL_Y - FLOOR_Y, p * 2, M.body, sx * (H - p), (FLOOR_Y + CEIL_Y) / 2, sz * (H - p)));
    }
    // LED strips on the front posts
    add(box(0.006, CEIL_Y - FLOOR_Y - 0.02, 0.006, M.aquaLed, sx * (I - 0.001), (FLOOR_Y + CEIL_Y) / 2, H - 0.001, { cast: false }));
  }
  const paneH = CEIL_Y - FLOOR_Y;
  const paneY = (FLOOR_Y + CEIL_Y) / 2;
  const gl = (w, dd, x, z) => box(w, paneH, dd, M.glass, x, paneY, z, { cast: false, receive: false });
  add(gl(I * 2, 0.004, 0, H - p), gl(0.004, I * 2, -(H - p), 0), gl(0.004, I * 2, H - p, 0));
  const back = new THREE.Mesh(new THREE.PlaneGeometry(I * 2, paneH), new THREE.MeshStandardMaterial({ map: backPanelTexture(), roughness: 0.55 }));
  back.position.set(0, paneY, -I - 0.002);
  back.receiveShadow = true;
  add(back);
  // glass bottom rails
  add(
    span(M.chrome, [-I, I], [FLOOR_Y, FLOOR_Y + 0.015], [I, H - p]),
    span(M.chrome, [-H + p, -I], [FLOOR_Y, FLOOR_Y + 0.015], [-I, I]),
    span(M.chrome, [I, H - p], [FLOOR_Y, FLOOR_Y + 0.015], [-I, I]),
  );

  // header box
  add(span(M.body, [-H, H], [CEIL_Y, HEADER_TOP], [-H, H]));
  add(span(M.chrome, [-H - 0.004, H + 0.004], [CEIL_Y - 0.006, CEIL_Y + 0.008], [-H - 0.004, H + 0.004]));
  add(span(M.chrome, [-H - 0.004, H + 0.004], [HEADER_TOP - 0.008, HEADER_TOP + 0.006], [-H - 0.004, H + 0.004]));
  // light panel in the ceiling
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(I * 1.7, I * 1.7), M.ceilingLight);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, CEIL_Y - 0.003, 0);
  add(ceiling);

  const marquee = new THREE.Mesh(
    new THREE.PlaneGeometry(0.74, 0.162),
    new THREE.MeshBasicMaterial({ map: marqueeTexture('ХВАТАЙКА', 'АВТОМАТ С ИГРУШКАМИ'), toneMapped: false }),
  );
  marquee.material.color.setScalar(1.25);
  marquee.position.set(0, (CEIL_Y + HEADER_TOP) / 2, H + 0.003);
  add(marquee);

  // chasing bulbs around the marquee
  const bulbPositions = [];
  const bx = 0.405;
  const by = 0.094;
  const cy = (CEIL_Y + HEADER_TOP) / 2;
  const cols = 19;
  for (let i = 0; i < cols; i++) bulbPositions.push([-bx + (i / (cols - 1)) * bx * 2, cy + by]);
  for (let i = 1; i < 4; i++) bulbPositions.push([bx, cy + by - (i / 4) * by * 2]);
  for (let i = cols - 1; i >= 0; i--) bulbPositions.push([-bx + (i / (cols - 1)) * bx * 2, cy - by]);
  for (let i = 3; i >= 1; i--) bulbPositions.push([-bx, cy + by - (i / 4) * by * 2]);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0072, 12, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbPositions.length);
  const mtx = new THREE.Matrix4();
  bulbPositions.forEach(([x, y], i) => {
    mtx.makeTranslation(x, y, H + 0.006);
    bulbs.setMatrixAt(i, mtx);
    bulbs.setColorAt(i, new THREE.Color(0, 0, 0));
  });
  add(bulbs);

  // star topper
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.075 : 0.034;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const topper = new THREE.Mesh(
    new THREE.ExtrudeGeometry(starShape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3 }),
    new THREE.MeshPhysicalMaterial({ color: PALETTE.gold, emissive: '#ffae00', emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.25, clearcoat: 1 }),
  );
  topper.geometry.center();
  topper.position.set(0, HEADER_TOP + 0.09, 0.2);
  topper.castShadow = true;
  const topperStand = box(0.012, 0.03, 0.012, M.chrome, 0, HEADER_TOP + 0.015, 0.2);
  add(topper, topperStand);

  // gantry rails (the moving bridge belongs to the claw)
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, I * 2, 12), M.chrome);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(sx * (I - 0.016), GANTRY_Y, 0);
    rail.castShadow = true;
    add(rail);
    add(span(M.darkMetal, [sx * (I - 0.004) - 0.004, sx * (I - 0.004) + 0.004], [GANTRY_Y - 0.01, CEIL_Y], [-I, I]));
  }

  // --------------------------------------------------------- control panel
  const panel = new THREE.Group();
  panel.position.set(0, 0.795, H + 0.075);
  panel.rotation.x = 0.13;
  add(panel);
  const pbox = box(H * 2 + 0.02, 0.08, 0.16, M.panel, 0, 0, 0);
  panel.add(pbox);
  panel.add(box(H * 2 + 0.024, 0.012, 0.012, M.aquaLed, 0, 0.02, 0.082, { cast: false }));
  panel.add(box(H * 2 + 0.03, 0.01, 0.17, M.panelTop, 0, 0.042, 0));
  panel.add(box(H * 2 + 0.034, 0.006, 0.006, M.chrome, 0, 0.044, 0.085));

  const joyBase = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.008, 24), M.darkMetal);
  joyBase.position.set(-0.19, 0.049, 0.01);
  panel.add(joyBase);
  const joystick = new THREE.Group();
  joystick.position.set(-0.19, 0.052, 0.01);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.07, 12), M.chrome);
  shaft.position.y = 0.035;
  const ballTop = new THREE.Mesh(new THREE.SphereGeometry(0.019, 24, 16), M.ballTop);
  ballTop.position.y = 0.074;
  shaft.castShadow = ballTop.castShadow = true;
  joystick.add(shaft, ballTop);
  panel.add(joystick);

  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.01, 32), M.chrome);
  ring.position.set(0.19, 0.051, 0.01);
  panel.add(ring);
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.032, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.redButton);
  button.scale.y = 0.5;
  button.position.set(0.19, 0.055, 0.01);
  panel.add(button);

  const led = createLedDisplay();
  const ledMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.06875), new THREE.MeshBasicMaterial({ map: led.texture, toneMapped: false }));
  ledMesh.material.color.setScalar(1.4);
  ledMesh.rotation.x = -Math.PI / 2;
  ledMesh.position.set(0, 0.049, 0.0);
  panel.add(ledMesh);
  panel.add(box(0.235, 0.004, 0.082, M.darkMetal, 0, 0.0465, 0.0, { cast: false }));

  return {
    root,
    joystick,
    button,
    buttonRestY: button.position.y,
    led,
    flap,
    topper,
    bulbs,
    clawBlockers,
  };
}

// Room around the machine: tiled floor, back wall with neon, soft contact shadow.
export function buildRoom(scene) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ map: roomFloorTexture(), roughness: 0.3, metalness: 0.15 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // contact shadow under the cabinet
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.8)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.7),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.002;
  scene.add(blob);

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 8), new THREE.MeshStandardMaterial({ color: '#1c1033', roughness: 0.9 }));
  wall.position.set(0, 4, -3.2);
  scene.add(wall);

  // neon tubes on the wall
  const tube = (points, color) => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, -3.15)));
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.018, 8, false), glow(color, 2.6));
    scene.add(m);
  };
  const wave = [];
  for (let i = 0; i <= 24; i++) wave.push([-5 + i * 0.42, 2.9 + Math.sin(i * 0.9) * 0.12]);
  tube(wave, PALETTE.candy);
  const wave2 = [];
  for (let i = 0; i <= 24; i++) wave2.push([-5 + i * 0.42, 2.55 + Math.sin(i * 0.9 + 1.4) * 0.1]);
  tube(wave2, PALETTE.aqua);
  const zig = [];
  for (let i = 0; i <= 6; i++) zig.push([2.6 + i * 0.28, 1.6 + (i % 2) * 0.3]);
  tube(zig, PALETTE.gold);
  const circle = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    circle.push([-2.9 + Math.cos(a) * 0.45, 1.8 + Math.sin(a) * 0.45]);
  }
  tube(circle, PALETTE.aqua);
}
