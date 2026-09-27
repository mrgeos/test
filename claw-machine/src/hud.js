const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      coins: $('stat-coins'),
      wins: $('stat-wins'),
      tries: $('stat-tries'),
      collection: $('collection'),
      timer: $('timer'),
      timerValue: $('timer-value'),
      message: $('message'),
      winCard: $('win-card'),
      winName: $('win-name'),
      winSwatch: $('win-swatch'),
      viewLabel: $('view-label'),
      sound: $('btn-sound'),
      settings: $('settings'),
      settingsBtn: $('btn-settings'),
      pip: $('pip'),
      pipLabel: $('pip-label'),
      grab: $('btn-grab'),
      loading: $('loading'),
      loadingText: $('loading-text'),
      confetti: $('confetti'),
      joystick: $('joystick'),
      knob: $('joy-knob'),
    };
    this.persistent = { text: '', tone: '' };
    this.flashTimer = 0;
    this.winTimer = 0;
    this.stats = {};
  }

  setStats({ coins, wins, tries }) {
    const set = (key, v) => {
      if (this.stats[key] === v) return;
      const el = this.el[key];
      el.textContent = v;
      if (this.stats[key] !== undefined) {
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      }
      this.stats[key] = v;
    };
    set('coins', coins);
    set('wins', wins);
    set('tries', tries);
  }

  setTimer(seconds) {
    const t = this.el.timer;
    if (seconds === null) {
      t.hidden = true;
      return;
    }
    t.hidden = false;
    this.el.timerValue.textContent = seconds;
    t.classList.toggle('urgent', seconds <= 5);
  }

  #show(text, tone) {
    const m = this.el.message;
    m.textContent = text;
    m.className = `message ${tone}`;
    m.hidden = !text;
  }

  // Prompt tied to the current game state.
  prompt(text, tone = '') {
    this.persistent = { text, tone };
    if (!this.flashTimer) this.#show(text, tone);
  }

  // Short-lived event message; falls back to the prompt afterwards.
  flash(text, tone = '', ms = 1800) {
    clearTimeout(this.flashTimer);
    this.#show(text, tone);
    this.flashTimer = setTimeout(() => {
      this.flashTimer = 0;
      this.#show(this.persistent.text, this.persistent.tone);
    }, ms);
  }

  showWin(name, color) {
    const { winCard, winName, winSwatch } = this.el;
    winName.textContent = name;
    winSwatch.style.setProperty('--c', color);
    winCard.hidden = true;
    void winCard.offsetWidth;
    winCard.hidden = false;
    clearTimeout(this.winTimer);
    this.winTimer = setTimeout(() => (winCard.hidden = true), 2600);
    this.confetti();
  }

  renderCollection(collection) {
    const frag = document.createDocumentFragment();
    for (const [name, { count, color }] of collection) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.style.setProperty('--c', color);
      chip.innerHTML = '<i></i>';
      chip.append(name);
      if (count > 1) {
        const b = document.createElement('b');
        b.textContent = `×${count}`;
        chip.append(b);
      }
      frag.append(chip);
    }
    this.el.collection.replaceChildren(frag);
  }

  confetti() {
    const colors = ['#ff4f9a', '#37e6d2', '#ffc940', '#ffffff', '#b98bff'];
    const box = this.el.confetti;
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('i');
      p.style.left = `${Math.random() * 100}%`;
      p.style.setProperty('--c', colors[i % colors.length]);
      p.style.setProperty('--d', `${1.6 + Math.random() * 1.4}s`);
      p.style.setProperty('--dx', `${(Math.random() - 0.5) * 200}px`);
      p.style.setProperty('--r', `${(Math.random() - 0.5) * 1440}deg`);
      p.style.animationDelay = `${Math.random() * 0.3}s`;
      box.append(p);
    }
    setTimeout(() => box.replaceChildren(), 3400);
  }

  setView(label) {
    if (this.el.viewLabel.textContent !== label) this.el.viewLabel.textContent = label;
  }

  setMuted(muted) {
    this.el.sound.setAttribute('aria-pressed', String(!muted));
  }

  toggleSettings(open = this.el.settings.hidden) {
    this.el.settings.hidden = !open;
    this.el.settingsBtn.setAttribute('aria-expanded', String(open));
  }

  setGrabIdle(idle) {
    this.el.grab.classList.toggle('idle', idle);
  }

  pressGrab() {
    const b = this.el.grab;
    b.classList.add('pressed');
    setTimeout(() => b.classList.remove('pressed'), 160);
  }

  loaded() {
    this.el.loading.classList.add('done');
    setTimeout(() => (this.el.loading.hidden = true), 700);
  }
}
