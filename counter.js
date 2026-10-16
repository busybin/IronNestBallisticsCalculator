/* Visitor counter — GoatCounter public counter (no backend of our own).
 *
 * 显示「累计独立访客」和「今日访客」。GoatCounter 的口径是 unique visits:
 * 以 (站点ID + User-Agent + 访问者 IP) 做会话去重(8 小时窗口),即按 IP 去重的
 * 独立访客数,和这里要的「按 IP 数量统计」一致。
 *
 * 本文件做两件事,都不用第三方 JS:
 *   1. 上报一次 pageview —— 照官方 count.js 的协议,GET /count?p=…&t=…&s=…&rnd=…,
 *      优先 navigator.sendBeacon(不阻塞、不弹预检);失败退化成 1×1 图片。
 *      (官方脚本用 GET+查询串、服务端 formam 解 r.URL.Query(),这里与之一致。)
 *   2. 读回计数 —— GET /counter/TOTAL.json?start=YYY-MM-DD&end=YYY-MM-DD
 *
 * 启用三步(详见 README「Visitor counter (optional)」):
 *   1. 在 https://www.goatcounter.com/signup 注册,account name 就是站点码
 *      → 面板地址 https://<code>.goatcounter.com
 *   2. 站点设置里勾选 "Allow adding visitor counts on your website"(默认关),否则读数 403
 *   3. 把下面 CODE 改成站点码
 *
 * 未填 CODE:一个请求都不发、计数块保持隐藏,绝不影响计算器本身。
 */
(function () {
  'use strict';

  var CODE = 'busybin'; // GoatCounter 站点码 → https://busybin.goatcounter.com

  var el = document.getElementById('visitors');
  if (!CODE) return; // 没配置就什么都不做(元素保持 hidden)

  var BASE = 'https://' + CODE + '.goatcounter.com';
  var LOCAL = /(localhost$|^127\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^192\.168\.|^0\.0\.0\.0$)/;

  // ---- 1. 上报 pageview ----------------------------------------------------
  function track() {
    if (document.visibilityState === 'prerender') return; // 预渲染不算
    if (location !== parent.location) return;              // 被 iframe 嵌不算
    if (location.protocol === 'file:') return;             // 本地打开不算
    if (LOCAL.test(location.hostname)) return;             // 内网/本机不算
    if (localStorage.getItem('skipgc') === 't') return;    // 站点设置里的「disable for this browser」
    var d = {
      p: location.pathname + location.search, // 路径(不含域名)
      r: document.referrer,
      t: document.title,
      s: window.screen.width,
      q: location.search,
      b: navigator.webdriver ? 153 : 0,        // 无头/自动化:交给服务端一起过滤
      rnd: Math.random().toString(36).slice(2, 7), // 浏览器对缓存头不总是听话
    };
    var qs = Object.keys(d)
      .filter(function (k) { return d[k] !== '' && d[k] !== null && d[k] !== undefined && d[k] !== false; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(d[k]); })
      .join('&');
    var url = BASE + '/count?' + qs;
    if (navigator.sendBeacon && navigator.sendBeacon(url)) return;
    var img = new Image();
    img.src = url; // 兜底:服务端对 /count 一律回 1×1 gif
  }

  // ---- 2. 读回计数 ---------------------------------------------------------
  function pad(n) { return String(n).padStart(2, '0'); }
  function utcDate(dayOffset) {
    // 接口的 start/end 是 UTC 日期(服务端按 UTC 小时桶比较),
    // 所以「今天」= [今天(UTC), 明天(UTC)] —— 未来的桶是空的,不会多算。
    var d = new Date(Date.now() + dayOffset * 86400000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function plain(s) { return String(s === null || s === undefined ? '' : s).replace(/[^0-9]/g, ''); }
  function withSeparators(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function count(query) {
    // 加 _= 绕开浏览器缓存;服务端最多 4 小时缓存,额外的实时性拿不到。
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

  try { track(); } catch (e) { /* 统计永不影响页面 */ }

  if (!el) return; // 没有展示位(理论上不会)就只上报
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
    /* 接口挂了 / 站点没开计数 / 被广告拦截器挡了:保持隐藏,静默失败 */
  });
})();
