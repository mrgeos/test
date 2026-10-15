// Keyboard + on-screen joystick. `move()` returns a screen-space vector:
// x = right, y = away from the player (up on the screen).
export class Input {
  constructor({ joystick, knob }) {
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.listeners = {};
    this.joystickEl = joystick;
    this.knobEl = knob;

    window.addEventListener('keydown', (e) => this.#onKey(e, true));
    window.addEventListener('keyup', (e) => this.#onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());
    this.#bindJoystick();
  }

  on(name, fn) {
    (this.listeners[name] ??= []).push(fn);
  }

  emit(name, ...args) {
    for (const fn of this.listeners[name] ?? []) fn(...args);
  }

  #onKey(e, down) {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const code = e.code;
    const moveKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
    if (moveKeys.includes(code)) {
      e.preventDefault();
      if (down) this.keys.add(code);
      else this.keys.delete(code);
      if (down && !e.repeat) this.emit('interact');
      return;
    }
    if (!down || e.repeat) return;
    if (code === 'Space' || code === 'Enter') {
      if (tag === 'BUTTON' && code === 'Enter') return;
      e.preventDefault();
      this.emit('grab');
    } else if (code === 'KeyV' || code === 'KeyE') this.emit('view', 1);
    else if (code === 'KeyQ') this.emit('view', -1);
    else if (code === 'KeyC') this.emit('coin');
    else if (code === 'KeyM') this.emit('mute');
    else if (code === 'KeyP') this.emit('pip');
  }

  #bindJoystick() {
    const el = this.joystickEl;
    let pointerId = null;
    const update = (e) => {
      const r = el.getBoundingClientRect();
      const radius = r.width * 0.36;
      let dx = (e.clientX - (r.left + r.width / 2)) / radius;
      let dy = (e.clientY - (r.top + r.height / 2)) / radius;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      this.joy.x = dx;
      this.joy.y = -dy;
      this.knobEl.style.transform = `translate(${dx * radius}px, ${dy * radius}px)`;
    };
    const release = () => {
      if (pointerId === null) return;
      pointerId = null;
      this.joy.x = this.joy.y = 0;
      this.knobEl.style.transform = '';
      el.classList.remove('active');
    };
    el.addEventListener('pointerdown', (e) => {
      pointerId = e.pointerId;
      try {
        el.setPointerCapture(pointerId);
      } catch {
        /* the window listeners below work without capture */
      }
      el.classList.add('active');
      update(e);
      this.emit('interact');
      e.preventDefault();
    });
    // Moves and releases are heard on the whole window: the stick keeps working
    // when the pointer slides over the scene, and it can never stay stuck
    // if a browser or the embedding frame swallows the release.
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      if (e.pointerType === 'mouse' && e.buttons === 0) release(); // the button went up unseen
      else update(e);
    });
    const end = (e) => e.pointerId === pointerId && release();
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', () => document.hidden && release());
  }


  move() {
    const k = this.keys;
    let x = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    let y = (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0);
    x += this.joy.x;
    y += this.joy.y;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y, len: Math.min(1, len) };
  }
}
