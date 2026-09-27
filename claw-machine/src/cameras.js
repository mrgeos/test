import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const VIEWS = {
  front: { label: 'Спереди', dir: new THREE.Vector3(0, 0, 1), elev: 0.22, target: new THREE.Vector3(0, 1.04, 0.05), fitW: 1.08, fitH: 1.72 },
  side: { label: 'Сбоку', dir: new THREE.Vector3(1, 0, 0), elev: 0.22, target: new THREE.Vector3(0, 1.04, 0.08), fitW: 1.2, fitH: 1.72 },
  free: { label: 'Свободный' },
};
export const VIEW_ORDER = ['front', 'side', 'free'];

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function viewPreset(name, aspect, fov) {
  const v = VIEWS[name];
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const dist = Math.max(v.fitH / 2 / tanV, v.fitW / 2 / (tanV * aspect)) + 0.3;
  const pos = v.dir.clone().multiplyScalar(Math.cos(v.elev) * dist);
  pos.y = Math.sin(v.elev) * dist;
  pos.add(v.target);
  return { pos, target: v.target.clone() };
}

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, dom);
    Object.assign(this.controls, {
      enabled: false,
      enableDamping: true,
      enablePan: false,
      minDistance: 0.6,
      maxDistance: 5,
      maxPolarAngle: 1.52,
    });
    this.view = 'front';
    this.target = new THREE.Vector3();
    this.transition = null;
    const p = viewPreset('front', camera.aspect, camera.fov);
    camera.position.copy(p.pos);
    this.target.copy(p.target);
    camera.lookAt(this.target);
  }

  get label() {
    return VIEWS[this.view].label;
  }

  cycle() {
    const i = VIEW_ORDER.indexOf(this.view);
    this.setView(VIEW_ORDER[(i + 1) % VIEW_ORDER.length]);
  }

  setView(name) {
    this.view = name;
    if (name === 'free') {
      this.transition = null;
      this.controls.target.copy(this.target);
      this.controls.enabled = true;
      return;
    }
    this.controls.enabled = false;
    this.transition = {
      t: 0,
      fromPos: this.camera.position.clone(),
      fromTarget: this.target.clone(),
    };
  }

  update(dt) {
    const cam = this.camera;
    if (this.view === 'free') {
      this.controls.update();
      this.target.copy(this.controls.target);
      return;
    }
    const p = viewPreset(this.view, cam.aspect, cam.fov);
    if (this.transition) {
      const tr = this.transition;
      tr.t = Math.min(1, tr.t + dt / 0.7);
      const k = ease(tr.t);
      cam.position.lerpVectors(tr.fromPos, p.pos, k);
      this.target.lerpVectors(tr.fromTarget, p.target, k);
      if (tr.t >= 1) this.transition = null;
    } else {
      cam.position.copy(p.pos);
      this.target.copy(p.target);
    }
    cam.lookAt(this.target);
  }

  // World-space axes for "right" and "away" on screen, snapped to the machine
  // axes so that the joystick always matches what the player sees.
  basis() {
    const f = this.camera.getWorldDirection(new THREE.Vector3());
    f.y = 0;
    if (Math.abs(f.x) > Math.abs(f.z)) f.set(Math.sign(f.x), 0, 0);
    else f.set(0, 0, Math.sign(f.z) || -1);
    return { fwd: f, right: new THREE.Vector3(-f.z, 0, f.x) };
  }
}

// Small secondary camera that shows the machine from the side (or from the
// front when the main camera already looks from the side).
export function placePipCamera(pipCam, mainView) {
  const name = mainView === 'side' ? 'front' : 'side';
  const p = viewPreset(name, pipCam.aspect, pipCam.fov);
  // zoom in on the play area
  const target = new THREE.Vector3(0, 1.08, 0);
  pipCam.position.copy(p.pos).sub(p.target).multiplyScalar(0.72).add(target);
  pipCam.lookAt(target);
  return VIEWS[name].label;
}
