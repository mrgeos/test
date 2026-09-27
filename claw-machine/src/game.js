import * as THREE from 'three';
import { CLAW, FLOOR_Y, ROUND_TIME, START_COINS, PRIZE_COUNT, DIFFICULTY } from './config.js';
import { HUB_PART } from './claw.js';

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`claw.${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`claw.${key}`, JSON.stringify(value));
    } catch {
      /* storage unavailable: settings just won't persist */
    }
  },
};

const HOLD_STATES = new Set(['ascend', 'top', 'return']);
const CALM_STATES = new Set(['settle', 'close', 'grip']);

const BULB_ON = new THREE.Color(4, 2.9, 1.3);
const BULB_OFF = new THREE.Color(0.32, 0.16, 0.08);
const RAINBOW = ['#ff4f9a', '#ffc940', '#37e6d2', '#b98bff', '#ffffff'].map((c) => new THREE.Color(c).multiplyScalar(3.2));

export class Game {
  constructor({ world, claw, prizes, cabinet, hud, sfx, input, rig }) {
    Object.assign(this, { world, claw, prizes, cabinet, hud, sfx, input, rig });
    this.time = 0;
    this.state = 'idle';
    this.stateTime = 0;
    this.coins = START_COINS;
    this.wins = 0;
    this.tries = 0;
    this.difficulty = DIFFICULTY[store.get('difficulty', 'fair')] ? store.get('difficulty', 'fair') : 'fair';
    this.lossStreak = 0;
    this.timer = 0;
    this.lastTick = 0;
    this.grabQueued = false;
    this.startQueued = false;
    this.held = [];
    this.touches = new Map();
    this.roundWins = 0;
    this.inRound = false;
    this.grip = DIFFICULTY.fair.roll(0);
    this.collection = new Map();
    this.supportTime = 0;
    this.relaxLeft = 0;
    this.warm = false;
    this.settleUntil = 0; // toys dropped in by a restock don't count as wins
    this.winFx = -10;
    this.buttonFx = 0;
    this.joyTilt = new THREE.Vector2();
    this.#promptIdle();
  }

  // ------------------------------------------------------------ player actions
  interact() {
    if (this.state === 'idle') this.startQueued = true;
  }

  requestGrab() {
    this.hud.pressGrab();
    this.buttonFx = 0.18;
    this.sfx.press();
    if (this.state === 'idle' || this.state === 'play') this.grabQueued = true;
  }

  addCoins(n) {
    this.coins = Math.min(99, this.coins + n);
    this.sfx.coin();
    if (this.state === 'idle') this.#promptIdle();
  }

  setDifficulty(key) {
    if (!DIFFICULTY[key]) return;
    this.difficulty = key;
    store.set('difficulty', key);
    this.hud.flash(`Режим «${DIFFICULTY[key].label}»: ${DIFFICULTY[key].hint.toLowerCase()}`, '', 2600);
  }

  restock() {
    if (this.state !== 'idle') {
      this.hud.flash('Дождитесь конца раунда', 'warn');
      return;
    }
    const missing = PRIZE_COUNT - this.prizes.activeCount();
    if (missing <= 0) {
      this.hud.flash('Автомат уже полон');
      return;
    }
    this.prizes.fill(missing, FLOOR_Y + 0.42);
    this.settleUntil = this.time + 3;
    this.hud.flash(`Добавлено игрушек: ${missing}`, 'good');
  }

  resetAll() {
    if (this.state !== 'idle') {
      this.hud.flash('Дождитесь конца раунда', 'warn');
      return false;
    }
    this.coins = START_COINS;
    this.wins = 0;
    this.tries = 0;
    this.lossStreak = 0;
    this.collection.clear();
    this.hud.renderCollection(this.collection);
    this.prizes.clear();
    this.prizes.fill(PRIZE_COUNT, FLOOR_Y + 0.12);
    this.settleUntil = this.time + 3;
    this.#promptIdle();
    return true;
  }

  // ------------------------------------------------------------ state machine
  setState(s) {
    this.state = s;
    this.stateTime = 0;
    if (s === 'idle') this.#promptIdle();
    else if (s === 'play') this.hud.prompt('Наведите клешню на игрушку и жмите «Хватай»');
    else if (s === 'open') this.hud.prompt('Опускаем клешню…');
    else if (s === 'ascend') this.hud.prompt(this.held.length ? 'Поднимаем…' : 'Кажется, пусто…');
    else if (s === 'return') this.hud.prompt(this.held.length ? 'Несём к окошку выдачи…' : 'Возвращаемся…');
    else if (s === 'release') this.hud.prompt('');
  }

  #promptIdle() {
    if (this.coins > 0) this.hud.prompt('Двигайте джойстик или жмите «Хватай», чтобы начать');
    else this.hud.prompt('Жетоны закончились — нажмите «+5»', 'warn');
  }

  #startRound() {
    if (this.coins <= 0) {
      this.hud.flash('Нет жетонов — нажмите «+5»', 'warn');
      this.sfx.lose();
      return;
    }
    this.coins--;
    this.tries++;
    this.grip = DIFFICULTY[this.difficulty].roll(this.lossStreak);
    this.timer = ROUND_TIME;
    this.lastTick = ROUND_TIME;
    this.roundWins = 0;
    this.inRound = true;
    this.sfx.start();
    this.setState('play');
  }

  #drop() {
    this.claw.beginClose();
    this.sfx.clack();
    this.setState('open');
  }

  #endRound() {
    this.inRound = false;
    if (this.roundWins > 0) this.lossStreak = 0;
    else {
      this.lossStreak++;
      this.hud.flash('Мимо! Ещё попытку?', 'warn', 2200);
      this.sfx.lose();
    }
    this.setState('idle');
  }

  #recordTouches() {
    for (const c of this.claw.contacts) {
      if (c.part === HUB_PART || c.prize.state !== 'active') continue;
      let parts = this.touches.get(c.prize);
      if (!parts) this.touches.set(c.prize, (parts = new Set()));
      parts.add(c.part);
    }
  }

  // Decides which prizes are actually held and how firmly. A centred prize
  // touched by all three prongs holds best; everything is scaled by the
  // grip strength rolled for this round.
  #evaluateGrab() {
    this.held = [];
    const hub = this.claw.hubPos;
    for (const [prize, parts] of this.touches) {
      if (prize.state !== 'active') continue;
      const fingers = parts.size;
      const p = prize.body.position;
      const radial = Math.hypot(p.x - hub.x, p.z - hub.z);
      const yRel = p.y - hub.y;
      if (radial > 0.075 || yRel > 0.02 || yRel < -0.2) continue;
      if (fingers < 2 && !(fingers === 1 && radial < 0.035)) continue;
      const quality = [0, 0.5, 0.8, 1][fingers] * (1 - 0.5 * Math.min(1, radial / 0.075)) * prize.type.grip;
      const assist = Math.max(this.grip.minAssist ?? 0, Math.min(1.3, this.grip.strength * quality * 1.15));
      this.held.push({ prize, assist, out: 0 });
    }
    this.touches.clear();
    if (this.held.length) this.hud.flash('Есть захват!', 'good', 1200);
  }

  // Soft "grip" forces: support against gravity plus a spring that keeps the
  // prize centred between the prongs. A weak grip lets physics win.
  #applyHold(h) {
    if (!this.held.length || !HOLD_STATES.has(this.state)) return;
    const hub = this.claw.hubPos;
    const v = this.claw.hubVel;
    for (const hd of this.held) {
      const b = hd.prize.body;
      const dx = b.position.x - hub.x;
      const dz = b.position.z - hub.z;
      const yRel = b.position.y - hub.y;
      if (Math.hypot(dx, dz) > 0.09 || yRel > 0.04 || yRel < -0.23) {
        hd.out += h;
        continue;
      }
      hd.out = 0;
      const a = hd.assist;
      const k = Math.min(1, a);
      const m = b.mass;
      b.force.x += -m * (50 * k * dx + 7 * k * (b.velocity.x - v.x));
      b.force.z += -m * (50 * k * dz + 7 * k * (b.velocity.z - v.z));
      b.force.y += m * 9.82 * a - m * 5 * k * (b.velocity.y - v.y);
      b.angularVelocity.scale(0.985, b.angularVelocity);
      if (b.sleepState !== 0) b.wakeUp();
    }
    const before = this.held.length;
    this.held = this.held.filter((hd) => hd.out < 0.15 && hd.prize.state === 'active');
    if (this.held.length < before && this.state !== 'return') {
      this.hud.flash('Ой! Выскользнул…', 'warn');
      this.sfx.slip();
    } else if (this.held.length < before) {
      this.hud.flash('Уронили по дороге…', 'warn');
      this.sfx.slip();
    }
  }

  #onWin(prize) {
    if (this.warm || this.time < this.settleUntil) {
      prize.state = 'lost';
      return;
    }
    this.wins++;
    if (this.inRound) this.roundWins++;
    const entry = this.collection.get(prize.name) ?? { count: 0, color: prize.color };
    entry.count++;
    this.collection.set(prize.name, entry);
    this.hud.renderCollection(this.collection);
    this.hud.showWin(prize.name, prize.color);
    this.hud.flash(`Приз: ${prize.name}!`, 'win', 2600);
    this.sfx.win();
    this.winFx = this.time;
  }

  // One fixed physics step.
  step(h) {
    this.time += h;
    this.stateTime += h;
    const c = this.claw;

    switch (this.state) {
      case 'idle':
        c.moveToward(CLAW.home.x, CLAW.home.z, CLAW.returnSpeed, 0.9, h);
        c.driveVertical(CLAW.liftSpeed, 1.2, h);
        c.swingFingers(CLAW.closedAngle, CLAW.openSpeed, h);
        if (this.startQueued || this.grabQueued) {
          this.startQueued = this.grabQueued = false;
          if (!this.warm) this.#startRound();
        }
        break;

      case 'play': {
        const move = this.input.move();
        let vx = 0;
        let vz = 0;
        if (move.len > 0.05) {
          const { right, fwd } = this.rig.basis();
          const dx = right.x * move.x + fwd.x * move.y;
          const dz = right.z * move.x + fwd.z * move.y;
          const l = Math.hypot(dx, dz) || 1;
          const s = CLAW.moveSpeed * move.len;
          vx = (dx / l) * s;
          vz = (dz / l) * s;
        }
        c.driveCarriage(vx, vz, CLAW.moveAccel, h);
        this.timer -= h;
        if (this.grabQueued || this.timer <= 0) {
          this.grabQueued = false;
          this.#drop();
        }
        break;
      }

      case 'open':
        c.driveCarriage(0, 0, CLAW.moveAccel, h);
        if (c.swingFingers(CLAW.openAngle, CLAW.openSpeed, h) && this.stateTime > 0.3) {
          this.supportTime = 0;
          this.setState('descend');
        }
        break;

      case 'descend': {
        c.driveCarriage(0, 0, CLAW.moveAccel, h);
        c.driveVertical(-CLAW.dropSpeed, 1.4, h);
        let support = false;
        for (const ct of c.contacts) {
          if (ct.ny < -0.55) {
            support = true;
            break;
          }
        }
        this.supportTime = support ? this.supportTime + h : Math.max(0, this.supportTime - h);
        if (
          this.supportTime > 0.05 ||
          c.lowestTipY() <= FLOOR_Y + 0.002 ||
          c.y <= CLAW.minY + 1e-4 ||
          c.touchesBlocker(this.cabinet.clawBlockers)
        ) {
          c.stopVertical();
          this.setState('settle');
        }
        break;
      }

      case 'settle':
        if (this.stateTime > 0.18) {
          c.beginClose();
          this.touches.clear();
          this.sfx.clack();
          this.setState('close');
        }
        break;

      case 'close': {
        const done = c.closeStep(h);
        this.#recordTouches();
        if ((done && this.stateTime > 0.15) || this.stateTime > 1.4) this.setState('grip');
        break;
      }

      case 'grip':
        this.#recordTouches();
        if (this.stateTime > 0.35) {
          this.#evaluateGrab();
          this.setState('ascend');
        }
        break;

      case 'ascend':
        if (c.driveVertical(CLAW.liftSpeed, 0.8, h)) {
          for (const hd of this.held) hd.assist *= this.grip.weaken;
          this.relaxLeft = this.grip.relax;
          this.setState('top');
        }
        break;

      case 'top':
        if (this.relaxLeft > 0) {
          const d = Math.min(this.relaxLeft, 0.6 * h);
          c.relax(d);
          this.relaxLeft -= d;
        }
        if (this.stateTime > 0.55) this.setState('return');
        break;

      case 'return':
        if (c.moveToward(CLAW.home.x, CLAW.home.z, CLAW.returnSpeed, 0.9, h) && this.stateTime > 0.2) {
          this.held = [];
          this.sfx.clack();
          this.setState('release');
        }
        break;

      case 'release':
        c.swingFingers(CLAW.releaseAngle, CLAW.openSpeed, h);
        if (this.stateTime > 1.3) this.setState('reset');
        break;

      case 'reset':
        if (c.swingFingers(CLAW.closedAngle, CLAW.openSpeed * 0.7, h) && this.stateTime > 0.6) this.#endRound();
        break;
    }

    c.swingDamping = CALM_STATES.has(this.state) ? 2 : this.state === 'descend' ? 0.5 : 0.12;
    c.preStep(h);
    this.#applyHold(h);
    if (c.y < FLOOR_Y + 0.5) {
      for (const p of this.prizes.nearby(c.hubPos, 0.28)) if (p.body.sleepState !== 0) p.body.wakeUp();
    }

    this.world.step(h);
    c.postStep(this.world);
    this.prizes.checkWins(this.time, (p) => this.#onWin(p));
  }

  // ------------------------------------------------------------ per frame
  frame(dt) {
    const t = this.time;
    const { cabinet, hud, claw } = this;
    this.prizes.update(t);

    // physical joystick and button on the control panel
    const target = new THREE.Vector2();
    if (this.state === 'play') {
      const m = this.input.move();
      if (m.len > 0.05) {
        const { right, fwd } = this.rig.basis();
        target.set(right.x * m.x + fwd.x * m.y, right.z * m.x + fwd.z * m.y);
      }
    }
    this.joyTilt.lerp(target, 1 - Math.exp(-dt * 18));
    cabinet.joystick.rotation.set(this.joyTilt.y * 0.35, 0, -this.joyTilt.x * 0.35);
    this.buttonFx = Math.max(0, this.buttonFx - dt);
    cabinet.button.position.y = cabinet.buttonRestY - (this.buttonFx > 0 ? 0.007 : 0);

    // prize door flap swings when a prize comes out
    const since = t - this.winFx;
    cabinet.flap.rotation.x = since > 0.35 && since < 1.6 ? -0.85 * Math.sin((Math.PI * (since - 0.35)) / 1.25) : 0;
    cabinet.topper.rotation.y = t * 0.8;
    this.#updateBulbs(t, since);

    const secs = this.state === 'play' ? Math.max(0, Math.ceil(this.timer)) : null;
    cabinet.led.draw(this.coins, secs, this.wins);
    hud.setStats({ coins: this.coins, wins: this.wins, tries: this.tries });
    hud.setTimer(secs);
    hud.setGrabIdle(this.state !== 'idle' && this.state !== 'play');
    if (secs !== null && secs !== this.lastTick) {
      if (secs <= 5 && secs > 0) this.sfx.tick();
      this.lastTick = secs;
    }

    const horizontal = Math.hypot(claw.vx, claw.vz) / CLAW.moveSpeed;
    const vertical = Math.abs(claw.vy) / CLAW.dropSpeed;
    this.sfx.motor(Math.max(horizontal, vertical), vertical > 0.1 ? 1.6 : 0.7);
  }

  #updateBulbs(t, sinceWin) {
    const bulbs = this.cabinet.bulbs;
    const n = bulbs.count;
    for (let i = 0; i < n; i++) {
      let color;
      if (sinceWin >= 0 && sinceWin < 3.5) color = RAINBOW[(i + Math.floor(t * 14)) % RAINBOW.length];
      else if (this.state === 'play') color = (i + Math.floor(t * 4)) % 2 ? BULB_ON : BULB_OFF;
      else if (this.state === 'idle') color = (i - Math.floor(t * 9)) % 6 === 0 || (i - Math.floor(t * 9) + 1) % 6 === 0 ? BULB_ON : BULB_OFF;
      else color = (i - Math.floor(t * 22)) % 4 === 0 ? BULB_ON : BULB_OFF;
      bulbs.setColorAt(i, color);
    }
    bulbs.instanceColor.needsUpdate = true;
  }
}
