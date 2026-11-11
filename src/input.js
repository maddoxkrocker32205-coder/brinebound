// Keyboard, mouse, touch and standard-layout gamepads (including DualSense).
const KEY_ACTIONS = {
  KeyF: 'use', KeyE: 'e', KeyQ: 'q', KeyR: 'repair', KeyM: 'map', KeyC: 'slide', KeyX: 'mat', Tab: 'craft',
  Space: 'jump', KeyG: 'emote', Escape: 'esc', KeyJ: 'quests', KeyI: 'bag', KeyB: 'bag', KeyV: 'view', KeyP: 'menu', KeyT: 'chat', Enter: 'chat',
};

export class Input {
  constructor(game) {
    this.g = game;
    this.keys = new Set(); this.pressed = new Set(); this.btnHeld = new Set();
    this.move = { x: 0, y: 0 }; this.lookDX = 0; this.lookDY = 0;
    this.sprint = false; this.jumpHeld = false; this.primaryHeld = false;
    this.mouseL = false; this.rightMouseHeld = false; this.gamepadAim = false; this.gamepadSprint = false;
    this.gamepadHeld = new Set(); this.gamepadButtons = new Set(); this.gamepadIndex = -1; this.gamepadId = null;
    this.gamepadNavT = 0; this.gamepadToastPending = false;
    this.locked = false; this.fallback = false; this.everLocked = false; this.drag = null;
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.lookT = { id: null, x: 0, y: 0 };
    this.bind();
  }
  get canvas() { return this.g.renderer.domElement; }
  bind() {
    addEventListener('keydown', (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      const a = KEY_ACTIONS[e.code];
      if (a) this.pressed.add(a);
      if (/^Digit[1-9]$/.test(e.code)) this.pressed.add('slot' + e.code.slice(5));
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseL = false; this.rightMouseHeld = false; this.rightHeld = false; this.btnHeld.clear(); this.gamepadHeld.clear(); this.gamepadAim = false; this.gamepadSprint = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) this.everLocked = true;
      this.g.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => this.lockFailed());
    const cv = this.canvas;
    cv.addEventListener('mousedown', (e) => {
      if (this.g.state !== 'play') return;
      if (!this.locked && !this.fallback && !this.g.isTouch) { this.requestLock(); return; }
      if (e.button === 0) {
        if (this.fallback && !this.locked) this.drag = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
        else this.mouseL = true;
      }
      if (e.button === 2) { this.pressed.add('place'); this.rightMouseHeld = true; }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) { this.mouseL = false; this.drag = null; } if (e.button === 2) this.rightMouseHeld = false; });
    addEventListener('mousemove', (e) => {
      if (this.locked) { this.lookDX += e.movementX || 0; this.lookDY += e.movementY || 0; return; }
      if (this.drag) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        this.drag.x = e.clientX; this.drag.y = e.clientY; this.drag.moved += Math.abs(dx) + Math.abs(dy);
        if (this.drag.moved > 6) { this.lookDX += dx * 1.4; this.lookDY += dy * 1.4; this.mouseL = false; }
      }
    });
    cv.addEventListener('wheel', (e) => { if (this.g.state === 'play') this.pressed.add(e.deltaY > 0 ? 'next' : 'prev'); }, { passive: true });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('touchstart', (e) => this.touchStart(e), { passive: false });
    cv.addEventListener('touchmove', (e) => this.touchMove(e), { passive: false });
    cv.addEventListener('touchend', (e) => this.touchEnd(e));
    cv.addEventListener('touchcancel', (e) => this.touchEnd(e));
    // Safari ignores user-scalable=no: stop two-finger pinches from zooming the page while playing
    for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => { if (this.g.state === 'play') e.preventDefault(); }, { passive: false });
  }
  requestLock() {
    if (this.fallback || this.g.isTouch || this.locked) return;
    const ua = navigator.userActivation;
    if (ua && !ua.isActive) return;          // no click yet: wait for one on the canvas
    try {
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => this.lockFailed());
    } catch (err) { this.lockFailed(); }
  }
  // A lock that has never worked means this frame cannot capture the mouse: switch to drag-to-look.
  // After it has worked once, a failure is temporary (for example just after Esc) and a click retries.
  lockFailed() {
    if (this.everLocked || this.fallback) return;
    this.fallback = true;
    this.g.onLockChange(false);
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }
  touchStart(e) {
    e.preventDefault();
    this.g.enableTouch();
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.45 && this.joy.id === null) {
        this.joy.id = t.identifier; this.joy.ox = t.clientX; this.joy.oy = t.clientY; this.joy.x = 0; this.joy.y = 0;
        this.g.ui.showJoy(t.clientX, t.clientY);
      } else if (this.lookT.id === null) {
        this.lookT.id = t.identifier; this.lookT.x = t.clientX; this.lookT.y = t.clientY;
      }
    }
  }
  touchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.joy.id) {
        const R = 54;
        let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
        const l = Math.hypot(dx, dy);
        if (l > R) { dx *= R / l; dy *= R / l; }
        this.joy.x = dx / R; this.joy.y = -dy / R;
        this.g.ui.moveJoy(dx, dy);
      } else if (t.identifier === this.lookT.id) {
        const dx = t.clientX - this.lookT.x, dy = t.clientY - this.lookT.y;
        this.lookT.x = t.clientX; this.lookT.y = t.clientY;
        this.lookDX += dx * 2.3; this.lookDY += dy * 2.3;
      }
    }
  }
  touchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.joy.id) { this.joy.id = null; this.joy.x = 0; this.joy.y = 0; this.g.ui.hideJoy(); }
      if (t.identifier === this.lookT.id) this.lookT.id = null;
    }
  }
  press(a) { this.pressed.add(a); }
  hold(a, on) { if (on) this.btnHeld.add(a); else this.btnHeld.delete(a); }
  setGamepadHold(a, on) { if (on) this.gamepadHeld.add(a); else this.gamepadHeld.delete(a); }
  promptControl(action) {
    if (this.gamepadId !== null) {
      return { use: '□', jump: '×', crouch: '○', view: '△', attack: 'R2', place: 'L2', menu: 'Options' }[action] || '×';
    }
    if (this.g.isTouch) return 'Tap';
    return { use: 'F', jump: 'Space', crouch: 'C', view: 'V', attack: 'Left click', place: 'Right click', menu: 'P' }[action] || 'F';
  }
  deadzone(value, zone = 0.16) {
    const magnitude = Math.abs(value);
    if (magnitude <= zone) return 0;
    return Math.sign(value) * Math.pow((magnitude - zone) / (1 - zone), 1.25);
  }
  gamepad() {
    if (typeof navigator.getGamepads !== 'function') return null;
    const pads = navigator.getGamepads();
    let pad = this.gamepadIndex >= 0 ? pads[this.gamepadIndex] : null;
    if (!pad || !pad.connected) {
      pad = null;
      for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
    }
    if (!pad) {
      this.gamepadToastPending = false;
      if (this.gamepadId !== null) {
        const was = this.gamepadId;
        this.gamepadIndex = -1; this.gamepadId = null; this.gamepadButtons.clear();
        this.gamepadHeld.clear(); this.gamepadAim = false; this.gamepadSprint = false;
        if (this.g.state === 'play' && this.g.ui) this.g.ui.toast('Controller disconnected', `${was} is no longer available.`);
      }
      return null;
    }
    const id = pad.id || 'Game controller';
    if (this.gamepadIndex !== pad.index || this.gamepadId !== id) {
      this.gamepadIndex = pad.index; this.gamepadId = id;
      this.gamepadButtons.clear(); this.gamepadHeld.clear();
      this.gamepadToastPending = true;
    }
    return pad;
  }
  focusables() {
    const root = this.g.state === 'title' ? document.getElementById('title')
      : this.g.state === 'sheet' ? document.getElementById('sheet') : null;
    if (!root) return [];
    return [...root.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  }
  moveFocus(dx, dy) {
    const items = this.focusables();
    if (!items.length) return;
    const active = document.activeElement;
    if (!items.includes(active)) { items[0].focus(); return; }
    const a = active.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    const candidates = items.filter((el) => el !== active).map((el) => {
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2 - ax, y = r.top + r.height / 2 - ay;
      const along = x * dx + y * dy, across = Math.abs(x * dy - y * dx);
      return { el, along, across, score: along + across * 2.2 };
    });
    const ahead = candidates.filter((c) => c.along > 2);
    const pool = ahead.length ? ahead : candidates;
    pool.sort((a, b) => ahead.length ? a.score - b.score : b.along - a.along || a.across - b.across);
    if (pool[0]) pool[0].el.focus();
  }
  activateFocused() {
    const items = this.focusables();
    if (!items.length) return;
    const active = items.includes(document.activeElement) ? document.activeElement : items[0];
    active.focus();
    if (active.matches('button, a[href], input[type="checkbox"], input[type="radio"]')) active.click();
  }
  updateGamepad(dt) {
    const pad = this.gamepad();
    const previous = this.gamepadButtons, down = new Set();
    if (pad) {
      for (let i = 0; i < pad.buttons.length; i++) {
        const b = pad.buttons[i];
        if (b && (b.pressed || b.value > (i === 6 || i === 7 ? 0.35 : 0.5))) down.add(i);
      }
    }
    const justPressed = (i) => down.has(i) && !previous.has(i);
    this.gamepadButtons = down;
    const play = this.g.state === 'play';
    const axis = (i) => pad && Number.isFinite(pad.axes[i]) ? pad.axes[i] : 0;
    const lx = pad ? this.deadzone(axis(0)) : 0;
    const ly = pad ? this.deadzone(-axis(1)) : 0;
    const rx = pad ? this.deadzone(axis(2)) : 0;
    const ry = pad ? this.deadzone(axis(3)) : 0;

    this.setGamepadHold('jump', play && down.has(0));
    this.setGamepadHold('hit', play && down.has(7));
    this.gamepadAim = play && down.has(6);
    this.gamepadSprint = play && down.has(10);

    if (this.gamepadToastPending && play && this.g.ui) {
      this.g.ui.toast('Controller connected', 'Left stick move · L3 sprint · right stick aim · × jump · ○ crouch · □ use · △ view · R2 attack · L2 place/aim · Options menu.');
      this.gamepadToastPending = false;
    }
    if (play) {
      const step = this.g.hints && this.g.hints.tutorialStep;
      const guide = Number.isInteger(step) && step >= 0 && step < 6;
      if (justPressed(1)) this.press('crouch');
      if (justPressed(2)) this.press('use');
      if (justPressed(3)) this.press('view');
      if (justPressed(4) || justPressed(14)) this.press('prev');
      if (justPressed(5)) this.press('next');
      if (justPressed(15)) { if (guide) this.g.advanceTutorial(); else this.press('next'); }
      if (justPressed(6)) this.press(this.g.player && this.g.player.mode === 'helm' ? 'port' : 'place');
      if (justPressed(7) && this.g.player && this.g.player.mode === 'helm') this.press('star');
      if (justPressed(8) || justPressed(12)) this.press('map');
      if (justPressed(13)) { if (guide) this.g.skipTutorial(); else this.press('quests'); }
      if (justPressed(9)) this.press('menu');
      if (justPressed(11)) this.press('emote');
      this.lookDX += rx * 1200 * dt;
      this.lookDY += ry * 1200 * dt;
    } else if (this.g.state === 'title' || this.g.state === 'sheet') {
      this.gamepadNavT = Math.max(0, this.gamepadNavT - dt);
      const nav = down.has(12) ? [0, -1] : down.has(13) ? [0, 1] : down.has(14) ? [-1, 0] : down.has(15) ? [1, 0]
        : Math.abs(axis(0)) > 0.55 ? [Math.sign(axis(0)), 0]
          : Math.abs(axis(1)) > 0.55 ? [0, Math.sign(axis(1))] : null;
      if (nav && this.gamepadNavT <= 0) {
        const active = document.activeElement;
        if (nav[0] && active instanceof HTMLInputElement && active.type === 'range') {
          const before = active.value;
          if (nav[0] < 0) active.stepDown(); else active.stepUp();
          if (active.value !== before) active.dispatchEvent(new Event('input', { bubbles: true }));
        } else this.moveFocus(nav[0], nav[1]);
        this.gamepadNavT = 0.22;
      }
      if (justPressed(0)) this.activateFocused();
      if (justPressed(1) || justPressed(9)) this.press('esc');
    }
    return { x: lx, y: ly };
  }
  update(dt = 1 / 60) {
    dt = Math.min(0.05, dt);
    const padMove = this.updateGamepad(dt);
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (this.joy.id !== null) {
      const jx = Math.abs(this.joy.x) < 0.12 ? 0 : this.joy.x, jy = Math.abs(this.joy.y) < 0.12 ? 0 : this.joy.y;
      x += jx; y += jy;
    }
    x += padMove.x; y += padMove.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.move.x = x; this.move.y = y;
    this.sprint = k.has('ShiftLeft') || k.has('ShiftRight') || this.gamepadSprint || (this.joy.id !== null && Math.hypot(this.joy.x, this.joy.y) > 0.94);
    this.jumpHeld = k.has('Space') || this.btnHeld.has('jump') || this.gamepadHeld.has('jump');
    this.rightHeld = this.rightMouseHeld || this.gamepadAim;
    if (this.drag && !this.mouseL && this.drag.moved <= 6 && performance.now() - this.drag.t > 160) this.mouseL = true;
    this.primaryHeld = this.mouseL || this.btnHeld.has('hit') || this.gamepadHeld.has('hit');
  }
  take(a) { if (this.pressed.has(a)) { this.pressed.delete(a); return true; } return false; }
  endFrame() { this.lookDX = 0; this.lookDY = 0; this.pressed.clear(); }
}
