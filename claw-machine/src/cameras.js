import * as THREE from 'three';

const TARGET = new THREE.Vector3(0, 1.04, 0.06);
const QUARTER = Math.PI / 2;
const TAU = Math.PI * 2;
const SIDES = ['Спереди', 'Справа', 'Сзади', 'Слева'];
const HOME_EL = 0.22;
const EL_MIN = -0.05;
const EL_MAX = 0.95;
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 1.4;
const FLICK = 2.5; // rad/s: a faster swipe jumps to the next side of the machine
const SNAP = THREE.MathUtils.degToRad(12);

const clamp = THREE.MathUtils.clamp;
const quarterIndex = (az) => (((Math.round(az / QUARTER) % 4) + 4) % 4);

// Camera distance that keeps the whole machine in frame for a given heading.
function fitDistance(aspect, fov, az) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const s = Math.abs(Math.sin(az));
  const fitW = 1.08 + 0.12 * s + 0.25 * Math.abs(Math.sin(2 * az)); // wider on the diagonals
  return Math.max(1.72 / 2 / tanV, fitW / 2 / (tanV * aspect)) + 0.3;
}

function orbit(camera, az, el, dist, target = TARGET) {
  camera.position.set(
    target.x + Math.sin(az) * Math.cos(el) * dist,
    target.y + Math.sin(el) * dist,
    target.z + Math.cos(az) * Math.cos(el) * dist,
  );
  camera.lookAt(target);
}

// Orbit camera around the machine: drag to rotate, flick to jump to the next
// side, wheel / pinch to zoom, double tap to return to the front.
export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.az = 0; // 0 = in front of the machine, PI/2 = on its right
    this.el = HOME_EL;
    this.zoom = 1;
    this.azVel = 0;
    this.goal = null;
    this.drag = null;
    this.pinch = null;
    this.pointers = new Map();
    this.lastTap = 0;
    this.#bind();
    this.update(0);
  }

  get label() {
    const off = Math.abs(this.az - Math.round(this.az / QUARTER) * QUARTER);
    return off < SNAP ? SIDES[quarterIndex(this.az)] : 'Свободный';
  }

  // Rotates to the next (dir = 1) or previous (dir = -1) side of the machine.
  step(dir = 1) {
    const base = Math.round(this.az / QUARTER);
    this.#goTo((base + dir) * QUARTER, HOME_EL, 1);
  }

  front() {
    this.#goTo(Math.round(this.az / TAU) * TAU, HOME_EL, 1);
  }

  #goTo(az, el = this.el, zoom = this.zoom) {
    this.azVel = 0;
    this.goal = { az, el, zoom };
  }

  #bind() {
    const el = this.dom;
    el.addEventListener('pointerdown', (e) => {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety; dragging still works without it */
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.goal = null;
      this.azVel = 0;
      if (this.pointers.size === 1) {
        this.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, samples: [{ t: e.timeStamp, az: this.az }] };
      } else if (this.pointers.size === 2) {
        this.drag = null;
        this.pinch = { dist: this.#pinchDistance(), zoom: this.zoom };
      }
    });

    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pinch && this.pointers.size >= 2) {
        this.zoom = clamp((this.pinch.zoom * this.pinch.dist) / Math.max(1, this.#pinchDistance()), ZOOM_MIN, ZOOM_MAX);
        return;
      }
      const d = this.drag;
      if (!d) return;
      const k = Math.PI / el.clientHeight; // a full-height drag turns half way round
      this.az -= (e.clientX - d.x) * k;
      this.el = clamp(this.el + (e.clientY - d.y) * k, EL_MIN, EL_MAX);
      d.x = e.clientX;
      d.y = e.clientY;
      if (Math.hypot(d.x - d.sx, d.y - d.sy) > 6) d.moved = true;
      // event timestamps, not processing time: stays right even when frames are slow
      d.samples.push({ t: e.timeStamp, az: this.az });
      while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > 90) d.samples.shift();
    });

    const release = (e) => {
      if (!this.pointers.delete(e.pointerId)) return;
      if (this.pinch) {
        if (this.pointers.size < 2) this.pinch = null;
        return;
      }
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      if (!d.moved) {
        if (e.timeStamp - this.lastTap < 320) this.front();
        this.lastTap = e.timeStamp;
        return;
      }
      const first = d.samples[0];
      const last = d.samples[d.samples.length - 1];
      const dt = (last.t - first.t) / 1000;
      const v = dt > 0.008 ? (last.az - first.az) / dt : 0;
      if (Math.abs(v) > FLICK && e.timeStamp - last.t < 60) {
        const next = v > 0 ? Math.floor(this.az / QUARTER + 1e-3) + 1 : Math.ceil(this.az / QUARTER - 1e-3) - 1;
        this.#goTo(next * QUARTER);
      } else {
        this.azVel = clamp(v, -FLICK, FLICK);
      }
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.goal = null;
        const speed = e.ctrlKey ? 0.01 : 0.0012; // ctrl + wheel = trackpad pinch
        this.zoom = clamp(this.zoom * Math.exp(e.deltaY * speed), ZOOM_MIN, ZOOM_MAX);
      },
      { passive: false },
    );
  }

  #pinchDistance() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  update(dt) {
    if (!this.drag && !this.pinch) {
      if (this.goal) {
        const k = 1 - Math.exp(-dt * 7);
        const g = this.goal;
        this.az += (g.az - this.az) * k;
        this.el += (g.el - this.el) * k;
        this.zoom += (g.zoom - this.zoom) * k;
        if (Math.abs(g.az - this.az) < 0.002 && Math.abs(g.el - this.el) < 0.002) {
          this.az = g.az;
          this.el = g.el;
          this.goal = null;
        }
      } else if (this.azVel !== 0) {
        this.az += this.azVel * dt;
        this.azVel *= Math.exp(-dt * 5);
        if (Math.abs(this.azVel) < 0.35) {
          this.azVel = 0;
          const nearest = Math.round(this.az / QUARTER) * QUARTER;
          if (Math.abs(nearest - this.az) < SNAP) this.#goTo(nearest);
        }
      }
    }
    const cam = this.camera;
    orbit(cam, this.az, this.el, fitDistance(cam.aspect, cam.fov, this.az) * this.zoom);
  }

  // World-space axes for "right" and "away" on screen, so the joystick always
  // matches what the player sees.
  basis() {
    const f = this.camera.getWorldDirection(new THREE.Vector3());
    f.y = 0;
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    return { fwd: f, right: new THREE.Vector3(-f.z, 0, f.x) };
  }

  // The picture-in-picture looks across the main view to show depth:
  // from the right when the player faces the front or back, else from the front.
  pipSide() {
    return quarterIndex(this.az) % 2 === 0 ? 1 : 0;
  }
}

export function placePipCamera(pipCam, side) {
  const az = side * QUARTER;
  const target = new THREE.Vector3(0, 1.08, 0);
  orbit(pipCam, az, HOME_EL, fitDistance(pipCam.aspect, pipCam.fov, az) * 0.72, target);
  return SIDES[side];
}
