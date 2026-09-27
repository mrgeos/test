import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CAB, CLAW, CARRIAGE_Y, GANTRY_Y } from './config.js';
import { createKinematic, driveKinematic, snapKinematic, placeKinematic } from './physics.js';

const UP = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
export const HUB_PART = 3;

// The claw: gantry bridge + carriage + cable + hub with three hinged prongs.
// Everything is kinematic; its pose is driven by the game state machine.
export class Claw {
  constructor(scene, world, physMaterials) {
    this.x = CLAW.home.x;
    this.z = CLAW.home.z;
    this.vx = 0;
    this.vz = 0;
    this.ax = 0;
    this.az = 0;
    this.y = CLAW.restY;
    this.vy = 0;
    this.swing = new THREE.Vector2();
    this.swingV = new THREE.Vector2();
    this.swingDamping = 0.12;
    this.angles = [CLAW.closedAngle, CLAW.closedAngle, CLAW.closedAngle];
    this.stalled = [false, false, false];
    this.squeezeTime = [0, 0, 0];
    this.contacts = [];
    this.hubPos = new THREE.Vector3();
    this.hubVel = new THREE.Vector3();
    this.dirs = CLAW.fingerDirs.map((a) => new THREE.Vector2(Math.cos(a), Math.sin(a)));

    this.#buildMeshes(scene);
    this.#buildBodies(world, physMaterials);
    this.pose();
    this.#placeBodies();
  }

  #buildMeshes(scene) {
    const chrome = new THREE.MeshStandardMaterial({ color: '#e8ebf2', metalness: 1, roughness: 0.14 });
    const dark = new THREE.MeshStandardMaterial({ color: '#2b2540', metalness: 0.6, roughness: 0.4 });
    const gold = new THREE.MeshStandardMaterial({ color: '#ffc940', metalness: 0.9, roughness: 0.25 });
    const rubber = new THREE.MeshStandardMaterial({ color: '#3a3346', roughness: 0.7 });
    const led = new THREE.MeshBasicMaterial({ color: new THREE.Color('#37e6d2').multiplyScalar(2.4), toneMapped: false });
    const shadow = (m) => {
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };

    // bridge spanning X, travels along Z on the rails
    const railX = CAB.inner - 0.016;
    this.bridge = new THREE.Group();
    this.bridge.add(shadow(new THREE.Mesh(new THREE.BoxGeometry(railX * 2, 0.016, 0.028), dark)));
    for (const sx of [-1, 1]) {
      const shoe = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.05), dark));
      shoe.position.set(sx * railX, 0.012, 0);
      this.bridge.add(shoe);
    }
    this.bridge.position.y = GANTRY_Y - 0.02;
    scene.add(this.bridge);

    // carriage with winch drum
    this.carriage = new THREE.Group();
    this.carriage.add(shadow(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.036, 0.06), chrome)));
    const drum = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 16), dark));
    drum.rotation.z = Math.PI / 2;
    drum.position.y = -0.024;
    this.carriage.add(drum);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.004), led);
    lamp.position.set(0, 0.005, 0.031);
    this.carriage.add(lamp);
    scene.add(this.carriage);

    // cable: unit-length cylinder hanging down from its origin
    const cableGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 1, 6);
    cableGeo.translate(0, -0.5, 0);
    this.cable = shadow(new THREE.Mesh(cableGeo, dark));
    scene.add(this.cable);

    // hub
    this.hub = new THREE.Group();
    const r = CLAW.hubRadius;
    const body = shadow(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, 0.046, 32), chrome));
    const cap = shadow(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r, 0.02, 32), chrome));
    cap.position.y = 0.033;
    const coil = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.024, 16), dark));
    coil.position.y = 0.054;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.001, r + 0.001, 0.007, 32), gold);
    band.position.y = 0.006;
    const base = shadow(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.7, 0.01, 32), dark));
    base.position.y = CLAW.hingeY - 0.002;
    this.hub.add(body, cap, coil, band, base);
    scene.add(this.hub);

    // prongs
    const path = CLAW.fingerPath.map(([x, y]) => new THREE.Vector3(x, y, 0));
    this.fingerCurve = new THREE.CatmullRomCurve3(path);
    const prongGeo = new THREE.TubeGeometry(this.fingerCurve, 40, 0.0058, 10, false);
    const knuckleGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.02, 16);
    knuckleGeo.rotateX(Math.PI / 2);
    const tipGeo = new THREE.SphereGeometry(0.0092, 16, 12);
    const bracketGeo = new THREE.BoxGeometry(0.018, 0.014, 0.024);

    this.pivots = [];
    this.tipLocal = path[path.length - 1].clone();
    CLAW.fingerDirs.forEach((phi) => {
      const mount = new THREE.Group();
      mount.position.set(Math.cos(phi) * CLAW.hingeRadius, CLAW.hingeY, Math.sin(phi) * CLAW.hingeRadius);
      mount.rotation.y = -phi;
      const bracket = shadow(new THREE.Mesh(bracketGeo, dark));
      bracket.position.set(-0.004, 0.004, 0);
      mount.add(bracket);
      const pivot = new THREE.Group();
      pivot.add(shadow(new THREE.Mesh(prongGeo, chrome)));
      pivot.add(shadow(new THREE.Mesh(knuckleGeo, chrome)));
      const tip = shadow(new THREE.Mesh(tipGeo, rubber));
      tip.position.copy(this.tipLocal);
      pivot.add(tip);
      mount.add(pivot);
      this.hub.add(mount);
      this.pivots.push(pivot);
    });
  }

  #buildBodies(world, physMaterials) {
    this.hubBody = createKinematic(world, physMaterials.claw);
    this.hubBody.addShape(new CANNON.Sphere(CLAW.hubRadius));
    this.hubBody.addShape(new CANNON.Sphere(0.022), new CANNON.Vec3(0, -0.03, 0));
    this.hubBody.clawPart = HUB_PART;

    this.fingerBodies = this.pivots.map((_, i) => {
      const b = createKinematic(world, physMaterials.claw);
      for (const t of [0.14, 0.28, 0.42, 0.56, 0.7, 0.82, 0.92, 1]) {
        const p = this.fingerCurve.getPoint(t);
        const radius = t === 1 ? CLAW.fingerRadius + 0.0015 : CLAW.fingerRadius;
        b.addShape(new CANNON.Sphere(radius), new CANNON.Vec3(p.x, p.y, 0));
      }
      b.clawPart = i;
      return b;
    });
  }

  #placeBodies() {
    this.hub.getWorldPosition(_p);
    this.hub.getWorldQuaternion(_q);
    placeKinematic(this.hubBody, _p, _q);
    this.pivots.forEach((pivot, i) => {
      pivot.getWorldPosition(_p);
      pivot.getWorldQuaternion(_q);
      placeKinematic(this.fingerBodies[i], _p, _q);
    });
  }

  // ------------------------------------------------------------- movement
  driveCarriage(targetVx, targetVz, accel, h) {
    const dvx = targetVx - this.vx;
    const dvz = targetVz - this.vz;
    const dv = Math.hypot(dvx, dvz);
    const maxDv = accel * h;
    const k = dv > maxDv ? maxDv / dv : 1;
    this.vx += dvx * k;
    this.vz += dvz * k;
    this.ax = (dvx * k) / h;
    this.az = (dvz * k) / h;
    this.x += this.vx * h;
    this.z += this.vz * h;
    const T = CLAW.travel;
    if (this.x > T || this.x < -T) {
      this.x = Math.max(-T, Math.min(T, this.x));
      this.vx = 0;
    }
    if (this.z > T || this.z < -T) {
      this.z = Math.max(-T, Math.min(T, this.z));
      this.vz = 0;
    }
  }

  // Moves the carriage towards a point with an accelerate / cruise / brake profile.
  moveToward(tx, tz, maxSpeed, accel, h) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.0015 && Math.hypot(this.vx, this.vz) < 0.02) {
      this.x = tx;
      this.z = tz;
      this.vx = this.vz = this.ax = this.az = 0;
      return true;
    }
    const speed = Math.min(maxSpeed, Math.sqrt(2 * accel * 0.8 * dist));
    this.driveCarriage((dx / dist) * speed, (dz / dist) * speed, accel, h);
    return false;
  }

  driveVertical(targetVy, accel, h) {
    const dv = targetVy - this.vy;
    const maxDv = accel * h;
    this.vy += Math.max(-maxDv, Math.min(maxDv, dv));
    this.y += this.vy * h;
    if (this.y > CLAW.restY) {
      this.y = CLAW.restY;
      this.vy = 0;
      return true;
    }
    if (this.y < CLAW.minY) {
      this.y = CLAW.minY;
      this.vy = 0;
    }
    return false;
  }

  stopVertical() {
    this.vy = 0;
  }

  // Opens / closes all prongs towards an angle; returns true when reached.
  swingFingers(target, speed, h) {
    let done = true;
    for (let i = 0; i < 3; i++) {
      const a = this.angles[i];
      const step = speed * h;
      if (Math.abs(target - a) <= step) this.angles[i] = target;
      else {
        this.angles[i] = a + Math.sign(target - a) * step;
        done = false;
      }
    }
    return done;
  }

  beginClose() {
    this.stalled = [false, false, false];
    this.squeezeTime = [0, 0, 0];
  }

  // Closes the prongs; each prong stalls when it squeezes a prize that does not
  // give way (like a real claw coil hitting its force limit).
  closeStep(h) {
    let done = true;
    for (let i = 0; i < 3; i++) {
      if (this.stalled[i]) continue;
      let squeezing = false;
      for (const c of this.contacts) {
        if (c.part === i && c.inward > 0.2 && c.pen < -0.0012) {
          squeezing = true;
          break;
        }
      }
      if (squeezing) this.squeezeTime[i] += h;
      if (this.squeezeTime[i] > 0.05 || this.angles[i] <= CLAW.closedAngle) {
        this.stalled[i] = true;
        continue;
      }
      this.angles[i] = Math.max(CLAW.closedAngle, this.angles[i] - CLAW.closeSpeed * h * (squeezing ? 0.25 : 1));
      done = false;
    }
    return done;
  }

  relax(amount) {
    for (let i = 0; i < 3; i++) this.angles[i] = Math.min(CLAW.openAngle, this.angles[i] + amount);
  }

  updateSwing(h) {
    const w0 = Math.sqrt(9.82 / CLAW.swingLength);
    const damp = 2 * this.swingDamping * w0;
    const acc = [this.ax, this.az];
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? this.swing.x : this.swing.y;
      let sv = k === 0 ? this.swingV.x : this.swingV.y;
      sv += (-w0 * w0 * s - damp * sv - 0.45 * acc[k]) * h;
      let ns = s + sv * h;
      if (Math.abs(ns) > CLAW.swingMax) {
        ns = Math.sign(ns) * CLAW.swingMax;
        sv *= -0.3;
      }
      if (k === 0) {
        this.swing.x = ns;
        this.swingV.x = sv;
      } else {
        this.swing.y = ns;
        this.swingV.y = sv;
      }
    }
  }

  // Updates every Three.js object of the claw from the current state.
  pose() {
    const hx = this.x + this.swing.x;
    const hz = this.z + this.swing.y;
    this.bridge.position.z = this.z;
    this.carriage.position.set(this.x, CARRIAGE_Y, this.z);

    this.hub.position.set(hx, this.y, hz);
    // the hub hangs on the cable, so it tilts towards the carriage when swinging
    const anchor = _v.set(this.x, CARRIAGE_Y - 0.03, this.z);
    _dir.set(hx, this.y + 0.066, hz);
    _dir.subVectors(anchor, _dir);
    const len = _dir.length();
    _dir.divideScalar(len);
    this.hub.quaternion.setFromUnitVectors(UP, _dir);
    for (let i = 0; i < 3; i++) this.pivots[i].rotation.z = this.angles[i];
    this.hub.updateMatrixWorld(true);

    // the cable geometry hangs down from its origin
    this.cable.position.copy(anchor);
    this.cable.quaternion.setFromUnitVectors(UP, _dir);
    this.cable.scale.set(1, len, 1);

    this.hubPos.set(hx, this.y, hz);
    this.hubVel.set(this.vx + this.swingV.x, this.vy, this.vz + this.swingV.y);
  }

  preStep(h) {
    this.updateSwing(h);
    this.pose();
    this.hub.getWorldPosition(_p);
    this.hub.getWorldQuaternion(_q);
    driveKinematic(this.hubBody, _p, _q, h);
    for (let i = 0; i < 3; i++) {
      this.pivots[i].getWorldPosition(_p);
      this.pivots[i].getWorldQuaternion(_q);
      driveKinematic(this.fingerBodies[i], _p, _q, h);
    }
  }

  postStep(world) {
    snapKinematic(this.hubBody);
    for (const b of this.fingerBodies) snapKinematic(b);
    this.#collectContacts(world);
  }

  #collectContacts(world) {
    const out = this.contacts;
    out.length = 0;
    for (const c of world.contacts) {
      let part;
      let prizeBody;
      let sign;
      if (c.bi.clawPart !== undefined && c.bj.prize) {
        part = c.bi.clawPart;
        prizeBody = c.bj;
        sign = 1;
      } else if (c.bj.clawPart !== undefined && c.bi.prize) {
        part = c.bj.clawPart;
        prizeBody = c.bi;
        sign = -1;
      } else continue;
      const n = c.ni;
      const nx = n.x * sign;
      const ny = n.y * sign;
      const nz = n.z * sign;
      // separation along the normal (negative = overlapping)
      const pen =
        (c.bj.position.x + c.rj.x - c.bi.position.x - c.ri.x) * n.x +
        (c.bj.position.y + c.rj.y - c.bi.position.y - c.ri.y) * n.y +
        (c.bj.position.z + c.rj.z - c.bi.position.z - c.ri.z) * n.z;
      const inward = part === HUB_PART ? 0 : -(nx * this.dirs[part].x + nz * this.dirs[part].y);
      out.push({ part, prize: prizeBody.prize, nx, ny, nz, pen, inward });
    }
  }

  lowestTipY() {
    let min = Infinity;
    for (const pivot of this.pivots) {
      _p.copy(this.tipLocal);
      pivot.localToWorld(_p);
      min = Math.min(min, _p.y - CLAW.fingerRadius - 0.0015);
    }
    return min;
  }

  // True when a prong tip would dig into a static obstacle (the chute guard).
  touchesBlocker(blockers) {
    const r = CLAW.fingerRadius + 0.002;
    for (const pivot of this.pivots) {
      for (const t of [0.8, 1]) {
        _p.copy(this.fingerCurve.getPoint(t));
        pivot.localToWorld(_p);
        for (const b of blockers) {
          if (
            _p.x > b.min.x - r && _p.x < b.max.x + r &&
            _p.z > b.min.z - r && _p.z < b.max.z + r &&
            _p.y < b.max.y + r && _p.y > b.min.y
          ) return true;
        }
      }
    }
    return false;
  }
}
