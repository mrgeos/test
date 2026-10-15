import * as THREE from 'three';

// Backdrop brightness (linear RGB) from the floor up: a warm stone floor, calm
// neutral walls and a bright ceiling, so metal gets a soft gradient to reflect.
const BACKDROP = [
  [-1, [0.3, 0.28, 0.25]],
  [-0.15, [0.4, 0.39, 0.38]],
  [0.1, [0.5, 0.51, 0.53]],
  [0.6, [0.8, 0.82, 0.86]],
  [1, [1.05, 1.08, 1.14]],
];

// [width, height, intensity, position]: large softboxes, each facing the machine
const SOFTBOXES = [
  [14, 9, 7, [9, 8, 12]], // key, front right and high
  [5, 14, 3.2, [-14, 5, 5]], // wide strip on the left
  [16, 16, 4.5, [0, 16, 1]], // overhead
  [2, 16, 9, [11, 6, -12]], // rim strips behind
  [2, 16, 9, [-11, 6, -12]],
  [18, 3, 1.6, [0, 1.5, 15]], // low front bounce
];

// A small photo studio that only lights reflections; it is never shown.
// The machine stands at the origin.
export function createStudio() {
  const studio = new THREE.Scene();

  const dome = new THREE.SphereGeometry(40, 32, 24);
  const position = dome.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i) / 40;
    let k = 1;
    while (k < BACKDROP.length - 1 && y > BACKDROP[k][0]) k++;
    const [y0, a] = BACKDROP[k - 1];
    const [y1, b] = BACKDROP[k];
    const t = THREE.MathUtils.smoothstep(y, y0, y1);
    c.setRGB(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t).toArray(colors, i * 3);
  }
  dome.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  studio.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  for (const [w, h, k, at] of SOFTBOXES) {
    const box = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    box.position.set(...at);
    box.lookAt(0, 1, 0);
    studio.add(box);
  }
  return studio;
}
