import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { FLOOR_Y, CEIL_Y, PRIZE_COUNT, FINISHES, DIFFICULTY } from './config.js';
import { createWorld } from './physics.js';
import { buildCabinet, buildRoom } from './cabinet.js';
import { Claw } from './claw.js';
import { PrizeManager } from './prizes.js';
import { Game, store } from './game.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { CameraRig, placePipCamera } from './cameras.js';
import { createStudio } from './studio.js';

const STEP = 1 / 120;
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

async function fontsReady() {
  if (!document.fonts) return;
  const faces = ['500 30px Inter', '600 104px Inter', '600 84px Inter'];
  await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f))).catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
}

// Soft, high-key daylight: a bright sky dome, a gentle key light and a fill.
function addLights(scene) {
  scene.add(new THREE.HemisphereLight('#ffffff', '#d9d3ca', 1.1));

  const key = new THREE.DirectionalLight('#fffaf2', 1.5);
  key.position.set(2.5, 5, 3.5);
  const fill = new THREE.DirectionalLight('#eef3ff', 0.55);
  fill.position.set(-3, 3, -2);
  scene.add(key, fill);

  // the diffuser inside the lid casts the shadows of the claw and the toys
  const spot = new THREE.SpotLight('#ffffff', 1.5, 2, 1.1, 0.9, 1.2);
  spot.position.set(0, CEIL_Y - 0.03, 0.06);
  spot.target.position.set(0, FLOOR_Y, 0);
  spot.castShadow = true;
  spot.shadow.camera.near = 0.1;
  spot.shadow.camera.far = 1.5;
  spot.shadow.bias = -0.0003;
  spot.shadow.normalBias = 0.008;
  scene.add(spot, spot.target);
  return spot;
}

// Soft, sharp-enough shadows from a large map, or a cheap map for weak devices.
function setShadowQuality(spot, high) {
  const size = high ? 2048 : 1024;
  spot.shadow.radius = high ? 2 : 1.5;
  if (spot.shadow.mapSize.x === size) return;
  spot.shadow.mapSize.set(size, size);
  spot.shadow.dispose();
  spot.shadow.map = null;
}

// Glass and other see-through meshes would hide the toys from the AO pass, and
// thin light lines (e.g. on the chute guard) would only add noise.
class SolidAOPass extends GTAOPass {
  _overrideVisibility() {
    super._overrideVisibility();
    this.scene.traverse((o) => {
      if (o.isMesh && o.visible && (o.material.transparent || o.material.isMeshBasicMaterial)) {
        o.visible = false;
        this._visibilityCache.push(o);
      }
    });
  }
}

async function main() {
  const hud = new Hud();
  const canvas = document.getElementById('scene');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  // neutral tone mapping keeps whites white and pastels true, like product shots
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // rendered once per frame (see render), not again for the AO pass and the side view
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f5f5f7');
  scene.fog = new THREE.Fog('#f5f5f7', 7, 17);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = createStudio();
  const envMap = pmrem.fromScene(studio, 0.04).texture;
  pmrem.dispose();
  studio.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  scene.environment = envMap;
  scene.environmentIntensity = 0.85;

  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 40);
  const pipCam = new THREE.PerspectiveCamera(34, 4 / 3, 0.05, 40);

  await fontsReady();

  const spot = addLights(scene);
  const room = buildRoom(scene);
  const { world, materials } = createWorld();
  const cabinet = buildCabinet(scene, world, materials);
  const claw = new Claw(scene, world, materials);
  const prizes = new PrizeManager(scene, world, materials);
  const rig = new CameraRig(camera, canvas);
  const input = new Input({ joystick: hud.el.joystick, knob: hud.el.knob });
  const sfx = new Sfx(store.get('muted', false));
  const game = new Game({ world, claw, prizes, cabinet, hud, sfx, input, rig });

  // Metal needs brighter reflections than the rest of the scene to read as
  // aluminium and polished steel (scene.environmentIntensity applies to all).
  scene.traverse((o) => {
    for (const m of [o.material].flat()) {
      if (m?.metalness >= 0.9 && !m.envMap) {
        m.envMap = envMap;
        m.envMapIntensity = m.userData.envBoost ?? 1.5;
      }
    }
  });

  // crisp image, no glow: multisampling, ambient occlusion and output
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  // sizes are in metres: the toys are about 10 cm
  const gtao = new SolidAOPass(
    scene,
    camera,
    1,
    1,
    undefined,
    { radius: 0.12, thickness: 0.15, distanceExponent: 1.5, scale: 1.2, samples: 16 },
    { radius: 9, samples: 24, lumaPhi: 14, depthPhi: 2, normalPhi: 3 },
  );
  composer.addPass(gtao);
  composer.addPass(new OutputPass());

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- UI wiring
  let pipOn = store.get('pip', window.innerWidth >= 900);
  const pipToggle = document.getElementById('opt-pip');
  const setPip = (on) => {
    pipOn = on;
    pipToggle.checked = on;
    hud.el.pip.hidden = !on;
    store.set('pip', on);
  };
  setPip(pipOn);

  // improved graphics: ambient occlusion and soft shadows; off by default on touch screens
  let slowTime = 0;
  const hqToggle = document.getElementById('opt-hq');
  const setHq = (on, persist = true) => {
    hqToggle.checked = on;
    gtao.enabled = on;
    setShadowQuality(spot, on);
    slowTime = 0;
    if (persist) store.set('hq', on);
  };
  setHq(store.get('hq', !window.matchMedia('(hover: none)').matches), false);
  hqToggle.addEventListener('change', () => setHq(hqToggle.checked));

  const setMuted = (m) => {
    sfx.setMuted(m);
    hud.setMuted(m);
    store.set('muted', m);
  };
  setMuted(sfx.muted);

  const turnView = (dir = 1) => rig.step(dir);

  input.on('interact', () => {
    sfx.unlock();
    game.interact();
  });
  input.on('grab', () => {
    sfx.unlock();
    game.requestGrab();
  });
  input.on('coin', () => {
    sfx.unlock();
    game.addCoins(5);
  });
  input.on('view', turnView);
  input.on('mute', () => setMuted(!sfx.muted));
  input.on('pip', () => setPip(!pipOn));

  const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
  on('btn-grab', () => {
    sfx.unlock();
    game.requestGrab();
  });
  on('btn-coin', () => {
    sfx.unlock();
    game.addCoins(5);
  });
  on('btn-view', () => turnView(1));
  on('btn-sound', () => {
    sfx.unlock();
    setMuted(!sfx.muted);
  });
  on('btn-settings', () => hud.toggleSettings());
  on('btn-settings-done', () => hud.toggleSettings(false));
  const soundToggle = document.getElementById('opt-sound');
  soundToggle.addEventListener('change', () => {
    sfx.unlock();
    setMuted(!soundToggle.checked);
  });
  on('btn-restock', () => {
    game.restock();
    hud.toggleSettings(false);
  });
  on('btn-reset', () => {
    if (game.resetAll()) hud.toggleSettings(false);
  });
  pipToggle.addEventListener('change', () => setPip(pipToggle.checked));
  const diffNote = document.getElementById('diff-note');
  diffNote.textContent = DIFFICULTY[game.difficulty].hint;
  for (const radio of document.querySelectorAll('input[name="difficulty"]')) {
    radio.checked = radio.value === game.difficulty;
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      game.setDifficulty(radio.value);
      diffNote.textContent = DIFFICULTY[radio.value].hint;
    });
  }

  // finishes: the metal, the claw and the interface accent change together
  const swatches = document.getElementById('swatches');
  const finishName = document.getElementById('finish-name');
  const setFinish = (key) => {
    const f = FINISHES[key] ?? FINISHES.silver;
    cabinet.setFinish(key);
    claw.setFinish(f.body);
    document.documentElement.style.setProperty('--accent', f.accent);
    finishName.textContent = f.label;
    store.set('finish', key);
  };
  const savedFinish = FINISHES[store.get('finish', 'silver')] ? store.get('finish', 'silver') : 'silver';
  for (const [key, f] of Object.entries(FINISHES)) {
    const label = document.createElement('label');
    label.title = f.label;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'finish';
    input.value = key;
    input.id = `finish-${key}`;
    input.checked = key === savedFinish;
    input.setAttribute('aria-label', f.label);
    input.addEventListener('change', () => input.checked && setFinish(key));
    const dot = document.createElement('span');
    dot.style.setProperty('--c', f.body);
    label.append(input, dot);
    swatches.append(label);
  }
  setFinish(savedFinish);
  canvas.addEventListener('pointerdown', () => {
    sfx.unlock();
    hud.toggleSettings(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') hud.toggleSettings(false);
  });
  // Space always means "grab"; never let it click a focused HUD button.
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') e.preventDefault();
  });

  if (new URLSearchParams(location.search).has('debug')) window.__claw = { game, claw, prizes, world, rig, renderer, THREE };

  // ---------------------------------------------------------------- warm-up
  // Drop the toys and let the pile settle before the player sees it.
  game.warm = true;
  prizes.fill(PRIZE_COUNT, FLOOR_Y + 0.12);
  for (let i = 0; i < 420; i += 30) {
    for (let k = 0; k < 30; k++) game.step(STEP);
    await nextFrame();
  }
  game.warm = false;
  prizes.update(game.time);
  hud.loaded();
  if (!store.get('rotateHintShown', false)) {
    const touch = window.matchMedia('(hover: none)').matches;
    setTimeout(() => hud.flash(touch ? 'Проведите пальцем по автомату, чтобы покрутить камеру' : 'Тяните мышью, чтобы покрутить камеру, колесо — приблизить', '', 3800), 700);
    store.set('rotateHintShown', true);
  }

  // ---------------------------------------------------------------- loop
  const pipEl = hud.el.pip;
  const render = () => {
    renderer.shadowMap.needsUpdate = true;
    composer.render();
    if (!pipOn) return;
    const r = pipEl.getBoundingClientRect();
    const b = 2;
    const w = r.width - b * 2;
    const h = r.height - b * 2;
    if (w < 10 || h < 10) return;
    pipCam.aspect = w / h;
    pipCam.updateProjectionMatrix();
    const label = placePipCamera(pipCam, rig.pipSide());
    if (hud.el.pipLabel.textContent !== label) hud.el.pipLabel.textContent = label;
    const x = r.left + b;
    const y = window.innerHeight - r.bottom + b;
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, w, h);
    renderer.setViewport(x, y, w, h);
    renderer.render(scene, pipCam);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  };

  // Adaptive quality: if frames stay slow, drop the improved graphics, then render fewer pixels.
  let avgDt = 1 / 60;
  const adaptQuality = (rawDt) => {
    avgDt += (rawDt - avgDt) * 0.05;
    slowTime = avgDt > 1 / 40 ? slowTime + rawDt : 0;
    if (slowTime < 2) return;
    if (gtao.enabled && pixelRatio <= 1.5) {
      setHq(false, false);
    } else if (pixelRatio > 1) {
      pixelRatio = Math.max(1, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
      composer.setPixelRatio(pixelRatio);
      resize();
    }
    slowTime = 0;
  };

  let acc = 0;
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const rawDt = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.05, rawDt);
    last = now;
    adaptQuality(Math.min(rawDt, 0.2));
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 8) {
      game.step(STEP);
      acc -= STEP;
      n++;
    }
    if (n === 8) acc = 0;
    game.frame(dt);
    room.update(game.time);
    rig.update(dt);
    hud.setView(rig.label);
    render();
  });
}

main().catch((err) => {
  console.error(err);
  const text = document.getElementById('loading-text');
  if (text) text.textContent = 'Не получилось запустить 3D. Проверьте, что браузер поддерживает WebGL.';
});
