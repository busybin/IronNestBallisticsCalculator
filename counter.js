/* Visitor counter — GoatCounter public counter (no backend of our own).
 *
 * Counts unique visits: GoatCounter dedups on site ID + User-Agent + IP over an
 * 8h window, matching the "by IP" visitor count wanted here.
 *
 * No third-party JS: it reports one pageview via GET /count?p=…&t=…&s=…&rnd=…
 * (sendBeacon first, 1x1 image as fallback) and reads the counts back from
 * GET /counter/TOTAL.json?start=YYYY-MM-DD&end=YYYY-MM-DD.
 *
 * To enable, set CODE to the GoatCounter site code (sign up at
 * https://www.goatcounter.com/signup) and tick "Allow adding visitor counts on
 * your website" in the site settings — off by default, the read endpoint 403s
 * otherwise. With no CODE nothing is requested and the counter stays hidden.
 */
(function () {
  'use strict';

  var CODE = 'busybin'; // GoatCounter site code

  var el = document.getElementById('visitors');
  if (!CODE) return; // not configured: send nothing, element stays hidden

  var BASE = 'https://' + CODE + '.goatcounter.com';
  var LOCAL = /(localhost$|^127\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^192\.168\.|^0\.0\.0\.0$)/;

  function track() {
    if (document.visibilityState === 'prerender') return; // not a real visit
    if (location !== parent.location) return;              // not top-level
    if (location.protocol === 'file:') return;             // file:// has no host
    if (LOCAL.test(location.hostname)) return;             // LAN/localhost doesn't count
    if (localStorage.getItem('skipgc') === 't') return;    // set by GoatCounter's "disable for this browser"
    var d = {
      p: location.pathname + location.search, // path only
      r: document.referrer,
      t: document.title,
      s: window.screen.width,
      q: location.search,
      b: navigator.webdriver ? 153 : 0,        // webdriver flag, filtered server-side
      rnd: Math.random().toString(36).slice(2, 7), // cache-buster
    };
    var qs = Object.keys(d)
      .filter(function (k) { return d[k] !== '' && d[k] !== null && d[k] !== undefined && d[k] !== false; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(d[k]); })
      .join('&');
    var url = BASE + '/count?' + qs;
    if (navigator.sendBeacon && navigator.sendBeacon(url)) return;
    var img = new Image();
    img.src = url; // fallback: /count always answers a 1x1 gif
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function utcDate(dayOffset) {
    // start/end are UTC dates compared as UTC hour buckets, so "today" = [today(UTC), tomorrow(UTC)].
    var d = new Date(Date.now() + dayOffset * 86400000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function plain(s) { return String(s === null || s === undefined ? '' : s).replace(/[^0-9]/g, ''); }
  function withSeparators(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function count(query) {
    // _= bypasses the browser cache; the server itself caches for up to 4h
    var url = BASE + '/counter/TOTAL.json?' + (query ? query + '&' : '') + '_=' + Date.now();
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var n = plain(j.count);
      if (n === '') throw new Error('empty count');
      return n;
    });
  }

  function put(id, text) {
    var node = document.getElementById(id);
    if (node) node.textContent = text;
  }

  try { track(); } catch (e) { /* stats must never break the page */ }

  if (!el) return; // no counter element to fill: report only
  Promise.all([
    count(''),
    count('start=' + utcDate(0) + '&end=' + utcDate(1)),
  ]).then(function (v) {
    put('visitors-total', withSeparators(v[0]));
    put('visitors-today', withSeparators(v[1]));
    el.title = 'Unique visitors, counted by GoatCounter (deduplicated by IP). '
      + 'Today is a UTC day and may lag by up to 4 hours.';
    el.hidden = false;
  }).catch(function () {
    /* endpoint down, counting off or blocked: stay hidden, fail silently */
  });
})();
