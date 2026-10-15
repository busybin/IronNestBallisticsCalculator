/* Fit-to-viewport scaling.
 * Scales the whole .inner-wrapper so the calculator + controls always fit the
 * screen without page scrolling; the queue column keeps its own scrollbar.
 * Driven by window size + content size; re-run on resize/font-load/queue change.
 */
(function () {
  'use strict';

  var PAD = 8;            // px breathing room on each side
  var MIN_SCALE = 0.05;
  var MAX_SCALE = 3;      // allow filling wide screens so the queue hits the right edge
  var QUEUE_MIN = 64;     // px of on-screen queue height to always keep

  var stage, header, calc, queue;

  function collect() {
    stage = document.querySelector('.inner-wrapper');
    header = document.querySelector('.inner-wrapper .header');
    calc = document.getElementById('calculator');
    queue = document.getElementById('queue');
    return stage && header && calc && queue;
  }

  function fit() {
    if (!stage) return;

    // Apply the no-scroll layout first so measurements exclude the page scrollbar.
    document.body.classList.add('fit-ready');

    var vw = document.documentElement.clientWidth || window.innerWidth;
    var vh = document.documentElement.clientHeight || window.innerHeight;
    var availW = Math.max(160, vw - PAD * 2);
    var availH = Math.max(160, vh - PAD * 2);

    // Measure at natural size (undo any previous scale/cap).
    stage.style.transform = 'none';
    queue.style.maxHeight = 'none';

    var w = stage.offsetWidth || 1;
    var headerH = header.offsetHeight;
    var calcH = calc.offsetHeight;

    // Layout is pinned to two columns (queue on the far right, beside the
    // calculator), so only the header sits above the queue vertically.
    // Fill the width when possible (queue hits the screen's right edge), but
    // never overflow the height.
    var s = Math.min(availW / w, availH / (headerH + calcH));
    s = Math.min(Math.max(s, MIN_SCALE), MAX_SCALE);

    // Queue fills the leftover height on its side and scrolls internally.
    var queueOnScreen = Math.max(QUEUE_MIN, availH - headerH * s);
    queue.style.maxHeight = (queueOnScreen / s) + 'px';

    stage.style.transformOrigin = 'top center';
    stage.style.transform = 'scale(' + s + ')';
  }

  var raf = null;
  function schedule() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () { raf = null; fit(); });
  }

  function boot() {
    if (!collect()) return;
    schedule();
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('orientationchange', schedule, { passive: true });
    // 手机地址栏收放 / 软键盘弹起只改 visualViewport,不改 window 尺寸
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', schedule, { passive: true });
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(schedule).catch(function () {});
    }
    // app.js calls this after (re)rendering the queue, whose height changes fit.
    window.__ironFit = schedule;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
