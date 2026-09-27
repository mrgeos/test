import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { FLOOR_Y, CEIL_Y, PRIZE_COUNT } from './config.js';
import { createWorld } from './physics.js';
import { buildCabinet, buildRoom } from './cabinet.js';
import { Claw } from './claw.js';
import { PrizeManager } from './prizes.js';
import { Game, store } from './game.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { CameraRig, placePipCamera } from './cameras.js';

const STEP = 1 / 120;
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

async function fontsReady() {
  if (!document.fonts) return;
  const faces = ['800 64px Unbounded', '600 32px Unbounded', '500 20px Rubik', '700 20px Rubik'];
  await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f))).catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight('#9a8cff', '#1a0f2e', 0.45));

  const key = new THREE.DirectionalLight('#ffe9f4', 1.1);
  key.position.set(1.8, 3.5, 3);
  scene.add(key);

  const pink = new THREE.PointLight('#ff4f9a', 4, 7, 1.6);
  pink.position.set(-1.7, 1.7, 1.3);
  const aqua = new THREE.PointLight('#37e6d2', 3.5, 7, 1.6);
  aqua.position.set(1.8, 1.4, 1.1);
  scene.add(pink, aqua);

  // light panel inside the machine, casts the shadows of the claw and the toys
  const spot = new THREE.SpotLight('#fff1e2', 1.3, 2, 1.05, 0.75, 1.2);
  spot.position.set(0, CEIL_Y - 0.03, 0.06);
  spot.target.position.set(0, FLOOR_Y, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 0.1;
  spot.shadow.camera.far = 1.5;
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.01;
  scene.add(spot, spot.target);
}

async function main() {
  const hud = new Hud();
  const canvas = document.getElementById('scene');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d0720');
  scene.fog = new THREE.Fog('#0d0720', 5, 13);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;

  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 40);
  const pipCam = new THREE.PerspectiveCamera(34, 4 / 3, 0.05, 40);

  await fontsReady();

  addLights(scene);
  buildRoom(scene);
  const { world, materials } = createWorld();
  const cabinet = buildCabinet(scene, world, materials);
  const claw = new Claw(scene, world, materials);
  const prizes = new PrizeManager(scene, world, materials);
  const rig = new CameraRig(camera, canvas);
  const input = new Input({ joystick: hud.el.joystick, knob: hud.el.knob });
  const sfx = new Sfx(store.get('muted', false));
  const game = new Game({ world, claw, prizes, cabinet, hud, sfx, input, rig });

  // post-processing: bloom makes the LEDs and bulbs glow
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.4, 1.25);
  composer.addPass(bloom);
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
  on('btn-restock', () => {
    game.restock();
    hud.toggleSettings(false);
  });
  on('btn-reset', () => {
    if (game.resetAll()) hud.toggleSettings(false);
  });
  pipToggle.addEventListener('change', () => setPip(pipToggle.checked));
  for (const radio of document.querySelectorAll('input[name="difficulty"]')) {
    radio.checked = radio.value === game.difficulty;
    radio.addEventListener('change', () => radio.checked && game.setDifficulty(radio.value));
  }
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

  // Adaptive resolution: if frames stay slow, render fewer pixels.
  let slowTime = 0;
  let avgDt = 1 / 60;
  const adaptQuality = (rawDt) => {
    avgDt += (rawDt - avgDt) * 0.05;
    slowTime = avgDt > 1 / 40 ? slowTime + rawDt : 0;
    if (slowTime > 2 && pixelRatio > 1) {
      pixelRatio = Math.max(1, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
      composer.setPixelRatio(pixelRatio);
      resize();
      slowTime = 0;
    }
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
