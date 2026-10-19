/* Iron Nest Ballistics Calculator — vanilla JS
 *
 * Unofficial, independent implementation of the Iron Nest calculator.
 * Original design & ballistics model: the author of https://iron-nest.shiru.dog/
 * (originally built with Vite + preact-signals + lit-html). This version keeps
 * the same behaviour and formulas and drops those runtimes.
 *
 * Maintained by busybin — https://github.com/busybin
 *
 * Core formulas:
 *   elevation(deg) = 12 * distance_km / charges
 *   r = (charges-1)/5 ; smooth = 3r^2 - 2r^3
 *   tta(s) = distance_km / (shellSpeed * (0.3 + 0.7*smooth)), shellSpeed = 0.7
 *   minCharges = ceil(distance_km/5) ; >30km → INSUFFICIENT CHARGES
 */
'use strict';

const DIST = { totalDigits: 4, decimalPlaces: 2 }; // internal int = km*100
const BEAR = { totalDigits: 4, decimalPlaces: 1, maxValue: 3600 }; // internal int = deg*10, capped at 360.0
const TIME = { totalDigits: 4 }; // internal int = MMSS (3500 -> 35:00); 00:00 means unset
const KM_PER_CHARGE = 5;
const MAX_DIST = 30;
const SHELL_DEFAULTS = ['EMPT','AP','APHE','ATMC','CLMN','CYAN','DRIL','EQKE','FLCH','HCHE','HE','INCN','LE','PLCM','PHGN','PRPG','SMK','STAR','TEAR','THRM','WP'];
// In-game shell full names (for the dropdown; codes match the original abbreviations)
const SHELL_META = { EMPT:'Empty', AP:'Armour-Piercing', APHE:'AP High-Explosive', ATMC:'Atomic', CLMN:'Cluster', CYAN:'Cyanogen Gas', DRIL:'Drill / Practice', EQKE:'Earthquake', FLCH:'Flechette', HCHE:'High-Capacity HE', HE:'High-Explosive', INCN:'Incendiary', LE:'Low-Explosive', PLCM:'Parachute Cluster', PHGN:'Phosgene', PRPG:'Propaganda', SMK:'Smoke', STAR:'Illumination', TEAR:'Tear Gas', THRM:'Thermal Incendiary', WP:'White Phosphorus' };

const state = {
  distance: 0, // int
  bearing: 0,  // int
  chargesOverride: null, // 0-based user pick, null = auto minimum
  shells: SHELL_DEFAULTS.map(label => ({ label, shellSpeed: 0.7, timesUsed: 0 })),
  shellInput: 'EMPT',
  side: 'LEFT',
  impact: 0, // int MMSS (3500 = 35:00); 0 = unset
  impactArmedReset: false,
  queue: [],
  queueDimmed: new Set(),
  nextId: 0,
  distArmedReset: false,
  bearArmedReset: false,
  activeField: 'distance',
  digCount: { distance: 0, bearing: 0, impact: 0 }, // digits entered per field; auto-advances when full
  flashIds: new Set(), // card ids to animate in; cleared after render
};
// "." mode: the next decimalPlaces digits fill the fraction in place instead of shifting
let frac = { field: null, count: 0, val: 0 };
function fracReset() { frac = { field: null, count: 0, val: 0 }; }

function calcElevation(distKm, charges) {
  if (!(distKm > 0 && distKm <= MAX_DIST) || charges > 6 || charges < 1) return undefined;
  return (12 * distKm) / charges;
}
function calcTTA(distKm, charges, shellSpeed) {
  if (!(distKm > 0 && distKm <= MAX_DIST) || charges > 6 || charges < 1) return undefined;
  if (!shellSpeed || shellSpeed <= 0) shellSpeed = 0.7;
  const r = (charges - 1) / 5;
  const smooth = 3 * r * r - 2 * r * r * r;
  return distKm / (shellSpeed * (0.3 + 0.7 * smooth));
}
function minChargeIndex(distKm) {
  return Math.max(0, Math.ceil(distKm / KM_PER_CHARGE) - 1); // 0-based
}
function effectiveChargeIndex() {
  const min = minChargeIndex(state.distance / 100);
  if (state.chargesOverride !== null && state.chargesOverride >= min) return state.chargesOverride;
  return min;
}
const effectiveCharges = () => effectiveChargeIndex() + 1;

function fmtInt(v, totalDigits, decimalPlaces) {
  const s = String(v).padStart(totalDigits, '0');
  const cut = totalDigits - decimalPlaces;
  return s.slice(0, cut) + '.' + s.slice(cut);
}
function fmtMMSS(v) {
  // same digit logic as ".": 4-digit int, MM then SS
  const s = String(v).padStart(4, '0');
  return s.slice(0, 2) + ':' + s.slice(2);
}
function impactToSec(v) {
  const s = String(v).padStart(4, '0');
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(2));
}
function fmtFire(sec) {
  // fire time MM:SS, fractional seconds dropped (2073.85 -> 34:33)
  const t = Math.floor(sec);
  const mm = Math.floor(t / 60);
  const ss = t - mm * 60;
  return String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}

function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1 - 3 * x2 + 1, bx = 3 * x2 - 6 * x1, ax = 3 * x1;
  const cy = 3 * y1 - 3 * y2 + 1, by = 3 * y2 - 6 * y1, ay = 3 * y1;
  const sx = t => ((cx * t + bx) * t + ax) * t;
  const sy = t => ((cy * t + by) * t + ay) * t;
  return p => {
    if (p === 0 || p === 1) return p;
    let t = p;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - p;
      if (Math.abs(err) < 1e-4) break;
      t -= err / ((3 * cx * t + 2 * bx) * t + ax);
    }
    return sy(t);
  };
}
function makeTween(el, format) {
  const ease = cubicBezier(0.1, 0.8, 0.4, 1);
  let raf = null, cur = 0, target = 0;
  function step(from, to, t0, now) {
    const p = Math.min((now - t0) / 1000, 1);
    cur = from + (to - from) * ease(p);
    el.textContent = format(cur);
    if (p < 1) raf = requestAnimationFrame(n => step(from, to, t0, n));
    else { cur = to; raf = null; }
  }
  return {
    tweenTo(v) {
      if (v === target) return;
      target = v;
      if (raf) cancelAnimationFrame(raf);
      const from = cur;
      raf = requestAnimationFrame(n => step(from, v, n, n));
    },
  };
}

// ---------- DOM ----------
const $ = s => document.querySelector(s);
const distInput = $('#distance'), bearInput = $('#bearing');
const distDisp = document.querySelector('.value-display[data-field="distance"]');
const bearDisp = document.querySelector('.value-display[data-field="bearing"]');
const shellDd = $('#shell-dd'), shellDdBtn = $('#shell-dd-btn'), shellDdList = $('#shell-dd-list');
let shellHl = -1;
const impactInput = $('#impact');
const impactDisp = document.querySelector('.value-display[data-field="impact"]');
const sideBtns = Array.from(document.querySelectorAll('.side-button'));
const chargeBtns = Array.from(document.querySelectorAll('.charge-button')).filter(b => !b.classList.contains('side-button'));
const errBox = document.querySelector('.result-error');
const elevEl = $('#elevation-value'), ttaEl = $('#tta-value'), ttaSuffix = $('#tta-suffix');
const queueEl = $('#queue');

const elevTween = makeTween(elevEl, v => v.toFixed(2).padStart(5, '0'));
let ttaFireMode = false;
const ttaTween = makeTween(ttaEl, v => ttaFireMode ? fmtFire(v) : v.toFixed(2).padStart(5, '0'));

let errTimer = null;
function showError(msg) {
  if (errTimer) clearTimeout(errTimer);
  errBox.textContent = msg;
  errBox.classList.add('visible');
  errTimer = setTimeout(() => { errBox.classList.remove('visible'); errTimer = null; }, 5000);
}
function clearError() {
  if (errTimer) { clearTimeout(errTimer); errTimer = null; }
  errBox.classList.remove('visible');
}

function flap(el) {
  // force a reflow so the flip animation restarts on every change
  el.classList.remove('flap');
  void el.offsetWidth;
  el.classList.add('flap');
}
function setValText(disp, text) {
  if (disp.textContent !== text) {
    disp.textContent = text;
    flap(disp);
  }
}
function renderNum() {
  setValText(distDisp, fmtInt(state.distance, DIST.totalDigits, DIST.decimalPlaces));
  setValText(bearDisp, fmtInt(state.bearing, BEAR.totalDigits, BEAR.decimalPlaces));
  setValText(impactDisp, fmtMMSS(state.impact));
  distDisp.classList.toggle('is-empty', state.distance === 0);
  bearDisp.classList.toggle('is-empty', state.bearing === 0);
  impactDisp.classList.toggle('is-empty', state.impact === 0);
  renderCharges();
  renderSide();
}
function armResetAll() {
  state.distArmedReset = state.bearArmedReset = state.impactArmedReset = true;
  fracReset();
  distDisp.classList.add('is-armed-for-reset');
  bearDisp.classList.add('is-armed-for-reset');
  impactDisp.classList.add('is-armed-for-reset');
  distInput.focus();
}
// shared by the physical keyboard and the on-screen pad
function feedNumericKey(field, key) {
  const isDist = field === 'distance';
  const cfg = isDist ? DIST : BEAR;
  const disp = isDist ? distDisp : bearDisp;
  const armedKey = isDist ? 'distArmedReset' : 'bearArmedReset';
  const maxRaw = 10 ** cfg.totalDigits - 1;
  const get = () => isDist ? state.distance : state.bearing;
  const set = v => { if (isDist) state.distance = v; else state.bearing = v; renderNum(); };
  const disarm = () => {
    if (state[armedKey]) {
      state[armedKey] = false;
      disp.classList.remove('is-armed-for-reset');
      state.digCount[field] = 0;
      set(0);
    }
  };
  if (key >= '0' && key <= '9') {
    const d = Number(key);
    if (frac.field === field && frac.count < cfg.decimalPlaces) {
      // fraction digits fill in place, no shift
      frac.val = frac.val * 10 + d;
      frac.count++;
      const base = Math.floor(get() / 10 ** cfg.decimalPlaces) * 10 ** cfg.decimalPlaces;
      set(base + frac.val * 10 ** (cfg.decimalPlaces - frac.count));
      if (frac.count >= cfg.decimalPlaces) fracReset();
      return;
    }
    fracReset();
    disarm();
    let v = get() * 10 + d;
    if (v > maxRaw) return;
    const clamped = cfg.maxValue && v > cfg.maxValue;
    if (clamped) v = cfg.maxValue;
    set(v);
    state.digCount[field]++;
    if (!clamped && state.digCount[field] >= cfg.totalDigits) {
      // auto-advance when full; not when clamped, to avoid a phantom jump
      focusField(field === 'distance' ? 'bearing' : 'impact');
    }
  } else if (key === '.') {
    disarm();
    frac = { field, count: 0, val: 0 };
  } else if (key === 'Backspace') {
    if (frac.field === field && frac.count > 0) {
      frac.count--;
      frac.val = Math.floor(frac.val / 10);
      const base = Math.floor(get() / 10 ** cfg.decimalPlaces) * 10 ** cfg.decimalPlaces;
      set(base + frac.val * 10 ** (cfg.decimalPlaces - frac.count));
      return;
    }
    fracReset();
    state[armedKey] = false;
    disp.classList.remove('is-armed-for-reset');
    state.digCount[field] = Math.max(0, state.digCount[field] - 1);
    set(Math.floor(get() / 10));
  } else if (key === 'clear') {
    fracReset();
    disarm();
    state.digCount[field] = 0;
    set(0);
  }
}
function feedTimeKey(key) {
  // MM:SS with auto colon; "." is ignored
  const maxRaw = 10 ** TIME.totalDigits - 1;
  if (key >= '0' && key <= '9') {
    if (state.impactArmedReset) {
      state.impactArmedReset = false;
      impactDisp.classList.remove('is-armed-for-reset');
      state.impact = 0;
      state.digCount.impact = 0;
      renderNum();
    }
    const v = state.impact * 10 + Number(key);
    if (v > maxRaw) return;
    state.impact = v;
    renderNum();
    state.digCount.impact++;
    // impact is the last field: stay here for QUEUE instead of wrapping
  } else if (key === 'Backspace') {
    state.impactArmedReset = false;
    impactDisp.classList.remove('is-armed-for-reset');
    state.digCount.impact = Math.max(0, state.digCount.impact - 1);
    state.impact = Math.floor(state.impact / 10);
    renderNum();
  } else if (key === 'clear') {
    state.impactArmedReset = false;
    impactDisp.classList.remove('is-armed-for-reset');
    state.digCount.impact = 0;
    state.impact = 0;
    renderNum();
  }
}
function bindNumeric(input, disp, key) {
  input.addEventListener('focus', () => {
    disp.classList.add('is-focused');
    state.activeField = key;
    fracReset();
    syncPadKey();
  });
  input.addEventListener('blur', () => disp.classList.remove('is-focused'));
  input.addEventListener('keydown', e => {
    if ((e.key >= '0' && e.key <= '9') || e.key === '.') {
      e.preventDefault();
      feedNumericKey(key, e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      feedNumericKey(key, e.ctrlKey || e.metaKey ? 'clear' : 'Backspace');
    } else if (e.key === 'r' || e.key === 'Delete') {
      feedNumericKey(key, 'clear');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      fracReset();
      input.blur();
    } else if (e.key !== 'Tab' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); // swallow non-numeric keys
    }
  });
  input.addEventListener('input', () => { input.value = ''; });
}
function bindTime(input, disp) {
  input.addEventListener('focus', () => {
    disp.classList.add('is-focused');
    state.activeField = 'impact';
    fracReset();
    syncPadKey();
  });
  input.addEventListener('blur', () => disp.classList.remove('is-focused'));
  input.addEventListener('keydown', e => {
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      feedTimeKey(e.key);
    } else if (e.key === '.') {
      e.preventDefault(); // "." is meaningless in MM:SS
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      feedTimeKey(e.ctrlKey || e.metaKey ? 'clear' : 'Backspace');
    } else if (e.key === 'r' || e.key === 'Delete') {
      feedTimeKey('clear');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.blur();
    } else if (e.key !== 'Tab' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); // swallow non-numeric keys
    }
  });
  input.addEventListener('input', () => { input.value = ''; });
}

// ---------- charges ----------
function renderCharges() {
  const min = minChargeIndex(state.distance / 100);
  const sel = effectiveChargeIndex();
  chargeBtns.forEach((b, i) => {
    const dis = i < min;
    b.classList.toggle('is-disabled', dis);
    b.classList.toggle('is-selected', i === sel);
    b.disabled = dis || i === sel;
  });
}
chargeBtns.forEach((b, i) => b.addEventListener('click', () => {
  if (i < minChargeIndex(state.distance / 100)) return;
  state.chargesOverride = i;
  renderCharges();
}));

// Custom dropdown: a native select's scrollbar can't be themed.
function sortedShells() {
  return [...state.shells].sort((a, b) => b.timesUsed - a.timesUsed);
}
function currentShell() {
  return state.shells.find(s => s.label === state.shellInput);
}
function persistShells() {
  try { localStorage.setItem('shells', JSON.stringify(state.shells)); } catch {}
}
function shellBtnLabel(label) {
  return label;
}
function refreshShellList() {
  const keep = currentShell() ? state.shellInput : 'EMPT';
  shellDdList.innerHTML = '';
  sortedShells().forEach(s => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.val = s.label;
    b.textContent = shellBtnLabel(s.label);
    if (SHELL_META[s.label]) b.title = SHELL_META[s.label]; // dropdown shows the code; the full name goes in the tooltip
    if (s.label === keep) {
      b.setAttribute('aria-selected', 'true');
      li.classList.add('is-cur');
    }
    b.addEventListener('click', () => chooseShell(s.label));
    li.appendChild(b);
    shellDdList.appendChild(li);
  });
  state.shellInput = keep;
  shellDdBtn.textContent = shellBtnLabel(keep);
}
function openShellDd() {
  refreshShellList();
  shellDdList.hidden = false;
  shellDdBtn.setAttribute('aria-expanded', 'true');
  const top = shellDdList.getBoundingClientRect().top;
  shellDdList.style.maxHeight = Math.max(96, window.innerHeight - top - 12) + 'px';
  shellHl = -1;
}
function closeShellDd() {
  shellDdList.hidden = true;
  shellDdBtn.setAttribute('aria-expanded', 'false');
}
function chooseShell(label) {
  state.shellInput = label;
  shellDdBtn.textContent = shellBtnLabel(label);
  flap(shellDdBtn);
  closeShellDd();
  shellDdBtn.focus({ preventScroll: true });
}
function moveShellHl(d) {
  const btns = [...shellDdList.querySelectorAll('li button')];
  if (!btns.length) return;
  shellHl = (shellHl + d + btns.length) % btns.length;
  btns.forEach((b, i) => b.classList.toggle('hl', i === shellHl));
  const b = btns[shellHl], list = shellDdList;
  if (b.offsetTop < list.scrollTop) list.scrollTop = b.offsetTop;
  else if (b.offsetTop + b.offsetHeight > list.scrollTop + list.clientHeight) {
    list.scrollTop = b.offsetTop + b.offsetHeight - list.clientHeight;
  }
}
function confirmShellHl() {
  const btns = [...shellDdList.querySelectorAll('li button')];
  if (shellHl >= 0 && btns[shellHl]) chooseShell(btns[shellHl].dataset.val);
  else closeShellDd();
}
function bumpShellUsage() {
  const cur = currentShell();
  if (!cur) return;
  const i = state.shells.findIndex(s => s.label === cur.label);
  const copy = [...state.shells];
  copy[i] = { ...copy[i], timesUsed: copy[i].timesUsed + 1 };
  state.shells = copy;
  persistShells();
  refreshShellList(); // re-sorts most-used first, keeps the current pick
}
function loadShells() {
  // Merge only timesUsed into the default list; swapping in a stale stored table would drop shells.
  const base = SHELL_DEFAULTS.map(label => ({ label, shellSpeed: 0.7, timesUsed: 0 }));
  try {
    const raw = localStorage.getItem('shells');
    if (!raw) return base;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return base;
    const used = new Map();
    for (const e of arr) {
      if (!e || typeof e.label !== 'string') continue;
      const n = Number(e.timesUsed);
      if (!Number.isFinite(n) || n < 0) continue;
      used.set(e.label, Math.floor(n));
    }
    return base.map(s => ({ ...s, timesUsed: used.get(s.label) ?? 0 }));
  } catch { return base; }
}
function bindShell() {
  state.shells = loadShells();
  if (!currentShell()) state.shellInput = 'EMPT';
  refreshShellList();
  shellDdBtn.addEventListener('click', () => {
    if (shellDdList.hidden) openShellDd();
    else closeShellDd();
  });
  document.addEventListener('click', e => {
    if (!shellDdList.hidden && !shellDd.contains(e.target)) closeShellDd();
  });
  shellDdBtn.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (shellDdList.hidden) openShellDd();
      moveShellHl(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter' && !shellDdList.hidden) {
      e.preventDefault();
      confirmShellHl();
    } else if (e.key === 'Escape') {
      closeShellDd();
    }
  });
  flap(shellDdBtn);
}

function renderSide() {
  sideBtns.forEach(b => {
    const sel = b.dataset.side === state.side;
    b.classList.toggle('is-selected', sel);
    b.disabled = sel;
  });
}
function bindSide() {
  sideBtns.forEach(b => b.addEventListener('click', () => {
    state.side = b.dataset.side;
    renderSide();
  }));
  renderSide();
}

// ---------- queue ----------
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function renderQueue() {
  if (state.queue.length === 0) {
    queueEl.innerHTML = '<span id="no-queue">No targets queued</span>';
    return;
  }
  queueEl.innerHTML = '<section class="target-queue"><div class="hr"></div><button id="btn-clear-queue" class="bounding-box" type="button">CLEAR QUEUE</button>' + state.queue.map((t, idx) => {
    const extra = Array.from({ length: Math.max(0, t.charges - 1) },
      () => '<svg viewBox="0 0 15 20"><path fill="none" stroke="currentColor" stroke-width="1" d="M 3 0 H 15 Q 12 10 15 20 H 3 Q 0 10 3 0"/></svg>').join('');
    const title = '&gt; ' + esc(t.side) + (t.impactSet ? ' · HIT ' + esc(t.impactStr) : '');
    const etaCell = t.impactSet
      ? '<div><span>' + esc(fmtFire(t.fire)) + '</span><span>[FIRE]</span></div>'
      : '<div><span>' + t.tta.toFixed(2).padStart(5, '0') + '</span><span>[ETA]</span></div>';
    return '<div class="bounding-box-outer"><p>' + title + '</p>' +
      '<article class="bounding-box queue-card' + (state.queueDimmed.has(t.id) ? ' is-dimmed' : '') + (state.flashIds.has(t.id) ? ' flap-in' : '') + '">' +
      '<div class="t-content-inner"><header>' +
      '<div class="queue-shell-wrap"><svg class="queue-shell" viewBox="0 0 60 20"><path fill="none" stroke="currentColor" stroke-width="1" d="M 35 0 H 60 Q 57 10, 60 20 H 35 C 8 20, 9 16, 0 10 C 9 4, 8 0, 35 0 Z"/></svg>' +
      '<span class="queue-shell-text">' + esc(t.shellType) + '</span></div>' + extra +
      '<svg viewBox="0 0 15 20"><path fill="none" stroke="currentColor" stroke-width="1" d="M 3 0 H 15 V 20 H 3 Q 0 10 3 0"/></svg>' +
      '</header><div class="t-body-numbers">' +
      '<div><span>' + t.elevation.toFixed(2).padStart(5, '0') + '°</span><span>[ELVN]</span></div>' +
      '<div><span>' + t.bearing.toFixed(1).padStart(5, '0') + '°</span><span>[BRNG]</span></div>' +
      etaCell +
      '</div></div><div class="card-actions">' +
      '<button data-act="up" data-id="' + t.id + '"' + (idx === 0 ? ' disabled' : '') + '><svg viewBox="0 0 7 4" shape-rendering="crispEdges"><rect fill="currentColor" x="0" y="3" width="1" height="1"/><rect fill="currentColor" x="1" y="2" width="1" height="1"/><rect fill="currentColor" x="2" y="1" width="1" height="1"/><rect fill="currentColor" x="3" y="0" width="1" height="1"/><rect fill="currentColor" x="4" y="1" width="1" height="1"/><rect fill="currentColor" x="5" y="2" width="1" height="1"/><rect fill="currentColor" x="6" y="3" width="1" height="1"/></svg></button>' +
      '<button data-act="down" data-id="' + t.id + '"' + (idx === state.queue.length - 1 ? ' disabled' : '') + '><svg viewBox="0 0 7 4" shape-rendering="crispEdges"><rect fill="currentColor" x="0" y="0" width="1" height="1"/><rect fill="currentColor" x="1" y="1" width="1" height="1"/><rect fill="currentColor" x="2" y="2" width="1" height="1"/><rect fill="currentColor" x="3" y="3" width="1" height="1"/><rect fill="currentColor" x="4" y="2" width="1" height="1"/><rect fill="currentColor" x="5" y="1" width="1" height="1"/><rect fill="currentColor" x="6" y="0" width="1" height="1"/></svg></button>' +
      '<button data-act="del" data-id="' + t.id + '"><svg viewBox="0 0 9 9" shape-rendering="crispEdges"><rect fill="currentColor" x="2" y="0" width="5" height="1"/><rect fill="currentColor" x="0" y="1" width="9" height="1"/><rect fill="currentColor" x="1" y="2" width="1" height="6"/><rect fill="currentColor" x="7" y="2" width="1" height="6"/><rect fill="currentColor" x="3" y="3" width="1" height="4"/><rect fill="currentColor" x="5" y="3" width="1" height="4"/><rect fill="currentColor" x="2" y="8" width="5" height="1"/></svg></button>' +
      '<button data-act="dim" data-id="' + t.id + '"><svg viewBox="0 0 7 5" shape-rendering="crispEdges"><rect x="0" y="2" width="1" height="1"/><rect x="1" y="3" width="1" height="1"/><rect x="2" y="4" width="1" height="1"/><rect x="3" y="3" width="1" height="1"/><rect x="4" y="2" width="1" height="1"/><rect x="5" y="1" width="1" height="1"/><rect x="6" y="0" width="1" height="1"/></svg></button>' +
      '</div></article></div>';
  }).join('') + '</section>';
  state.flashIds.clear(); // play the entry animation once, not on every re-render
  if (window.__ironFit) window.__ironFit(); // queue height changed, re-fit the viewport
}
// One delegated listener survives full re-renders without duplicate bindings.
function bindQueue() {
  queueEl.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn || !queueEl.contains(btn)) return;
    if (btn.id === 'btn-clear-queue') {
      state.queue = [];
      state.queueDimmed.clear();
      renderQueue();
      return;
    }
    const id = Number(btn.dataset.id), act = btn.dataset.act;
    const i = state.queue.findIndex(t => t.id === id);
    if (i === -1) return;
    if (act === 'del') {
      // animate in the cards following the deleted one
      state.flashIds = new Set(state.queue.slice(i + 1).map(t => t.id));
      state.queue = state.queue.filter(t => t.id !== id);
    } else if (act === 'dim') {
      if (state.queueDimmed.has(id)) state.queueDimmed.delete(id);
      else state.queueDimmed.add(id);
    } else if (act === 'up' && i > 0) {
      const a = [...state.queue]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; state.queue = a;
    } else if (act === 'down' && i < state.queue.length - 1) {
      const a = [...state.queue]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; state.queue = a;
    } else {
      return;
    }
    renderQueue();
  });
}

function calculate() {
  armResetAll();
  const distKm = state.distance / 100;
  if (state.distance === 0) { showError('ENTER DISTANCE'); return [-1, -1]; }
  if (distKm > MAX_DIST) { showError('INSUFFICIENT CHARGES'); return [-1, -1]; }
  const ch = effectiveCharges();
  const e = calcElevation(distKm, ch);
  const t = calcTTA(distKm, ch, currentShell()?.shellSpeed);
  if (e === undefined || t === undefined) { showError('INSUFFICIENT CHARGES'); return [-1, -1]; }
  // optional impact time -> fire time = impact - ETA
  let fire = null;
  if (state.impact !== 0) {
    const ss = state.impact % 100;
    if (ss >= 60) { showError('BAD TIME'); return [-1, -1]; }
    fire = impactToSec(state.impact) - t;
    if (fire < 0) { showError('TOO LATE'); return [-1, -1]; }
  }
  bumpShellUsage(); // only a successful calculation counts towards "most used"
  clearError();
  elevTween.tweenTo(e);
  ttaFireMode = fire !== null;
  ttaSuffix.textContent = fire !== null ? ' to fire' : ' to arrive';
  ttaTween.tweenTo(fire !== null ? fire : t);
  return [e, t, fire];
}
function calculateAndQueue() {
  const [e, t, fire] = calculate();
  if (e !== -1 && t !== -1) {
    state.queue = [...state.queue, {
      id: state.nextId++,
      charges: effectiveCharges(),
      bearing: state.bearing / 10,
      distance: state.distance / 100,
      elevation: e, tta: t,
      shellType: currentShell()?.label ?? 'EMPT',
      side: state.side,
      impactSet: fire !== null && fire !== undefined,
      impactStr: fmtMMSS(state.impact),
      fire: fire ?? 0,
    }];
    state.flashIds = new Set([state.queue[state.queue.length - 1].id]);
    renderQueue();
  }
}

const PAD_FIELDS = ['distance', 'bearing', 'impact'];
function syncPadKey() {
  const nk = document.getElementById('num-next');
  if (nk) nk.textContent = state.activeField === 'impact' ? 'QUEUE' : 'NEXT';
}
function focusField(f) {
  state.activeField = f;
  fracReset();
  syncPadKey();
  const el = document.getElementById(f);
  if (el) el.focus({ preventScroll: true });
}
function feedPad(k) {
  if (k === 'next') {
    if (state.activeField === 'impact') {
      calculateAndQueue();
      focusField('distance');
      return;
    }
    const i = PAD_FIELDS.indexOf(state.activeField);
    focusField(PAD_FIELDS[(i + 1 + PAD_FIELDS.length) % PAD_FIELDS.length]);
    return;
  }
  const f = PAD_FIELDS.includes(state.activeField) ? state.activeField : 'distance';
  if (f === 'impact') {
    feedTimeKey(k);
  } else {
    feedNumericKey(f, k);
  }
  // keep the pad on this field unless auto-advance already moved it
  if (state.activeField !== f) return;
  const el = document.getElementById(f);
  if (el && document.activeElement !== el) el.focus({ preventScroll: true });
}
function bindNumpad() {
  document.querySelectorAll('.num-key').forEach(b => {
    b.addEventListener('click', () => feedPad(b.dataset.key));
  });
}

bindNumeric(distInput, distDisp, 'distance');
bindNumeric(bearInput, bearDisp, 'bearing');
bindTime(impactInput, impactDisp);
bindShell();
bindSide();
bindNumpad();
bindQueue();
syncPadKey();
$('#btn-clear-impact').addEventListener('click', () => {
  // reset every input (shell/side too) but keep the queue
  state.distance = 0;
  state.bearing = 0;
  state.impact = 0;
  state.chargesOverride = null;
  state.shellInput = 'EMPT';
  state.side = 'LEFT';
  state.digCount = { distance: 0, bearing: 0, impact: 0 };
  state.distArmedReset = state.bearArmedReset = state.impactArmedReset = false;
  clearError();
  ttaFireMode = false;
  ttaSuffix.textContent = ' to arrive';
  elevTween.tweenTo(0);
  ttaTween.tweenTo(0);
  refreshShellList();
  renderNum();
  focusField('distance');
});
$('#calculator').addEventListener('submit', e => { e.preventDefault(); calculateAndQueue(); });
document.querySelectorAll('#calculator input').forEach(el =>
  el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); calculateAndQueue(); } }));
$('#btn-calculate').addEventListener('click', e => { e.preventDefault(); calculate(); });
$('#btn-calculate-and-queue').addEventListener('click', e => { e.preventDefault(); calculateAndQueue(); });
renderNum();
renderQueue();
