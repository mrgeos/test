import * as CANNON from 'cannon-es';

export const GROUP = { STATIC: 1, PRIZE: 2, CLAW: 4 };

export function createWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 14;
  world.defaultContactMaterial.friction = 0.4;
  world.defaultContactMaterial.restitution = 0.05;

  const materials = {
    static: new CANNON.Material('static'),
    prize: new CANNON.Material('prize'),
    claw: new CANNON.Material('claw'),
  };
  const pair = (a, b, friction, restitution) =>
    world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution }));
  pair(materials.prize, materials.prize, 0.55, 0.04);
  pair(materials.prize, materials.static, 0.5, 0.1);
  pair(materials.prize, materials.claw, 0.9, 0);

  return { world, materials };
}

export function addStaticBox(world, material, center, half, quaternion) {
  const body = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.STATIC,
    material,
    collisionFilterGroup: GROUP.STATIC,
    collisionFilterMask: GROUP.PRIZE,
  });
  body.addShape(new CANNON.Box(new CANNON.Vec3(half[0], half[1], half[2])));
  body.position.set(center[0], center[1], center[2]);
  if (quaternion) body.quaternion.copy(quaternion);
  world.addBody(body);
  return body;
}

export function createKinematic(world, material) {
  const body = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.KINEMATIC,
    material,
    collisionFilterGroup: GROUP.CLAW,
    collisionFilterMask: GROUP.PRIZE,
    allowSleep: false,
  });
  body.targetPosition = new CANNON.Vec3();
  body.targetQuaternion = new CANNON.Quaternion();
  world.addBody(body);
  return body;
}

const qTarget = new CANNON.Quaternion();
const qInv = new CANNON.Quaternion();
const qDelta = new CANNON.Quaternion();

// Kinematic bodies are moved by velocity so that contacts get proper relative
// motion (friction, pushing). After the step we snap them onto the target.
export function driveKinematic(body, position, quaternion, h) {
  body.targetPosition.set(position.x, position.y, position.z);
  body.targetQuaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);

  body.velocity.set(
    (position.x - body.position.x) / h,
    (position.y - body.position.y) / h,
    (position.z - body.position.z) / h,
  );

  qTarget.copy(body.targetQuaternion);
  body.quaternion.conjugate(qInv);
  qTarget.mult(qInv, qDelta);
  if (qDelta.w < 0) {
    qDelta.x = -qDelta.x;
    qDelta.y = -qDelta.y;
    qDelta.z = -qDelta.z;
    qDelta.w = -qDelta.w;
  }
  const w = Math.min(1, qDelta.w);
  const s = Math.sqrt(1 - w * w);
  if (s < 1e-6) {
    body.angularVelocity.set(0, 0, 0);
  } else {
    const k = (2 * Math.acos(w)) / s / h;
    body.angularVelocity.set(qDelta.x * k, qDelta.y * k, qDelta.z * k);
  }
}

export function snapKinematic(body) {
  body.position.copy(body.targetPosition);
  body.quaternion.copy(body.targetQuaternion);
}

export function placeKinematic(body, position, quaternion) {
  body.position.set(position.x, position.y, position.z);
  body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  body.targetPosition.copy(body.position);
  body.targetQuaternion.copy(body.quaternion);
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
}
