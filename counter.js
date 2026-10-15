/* Visitor counter — GoatCounter public counter (no backend of our own).
 *
 * 显示「累计独立访客」和「今日访客」。GoatCounter 的口径是 unique visits:
 * 以 (站点ID + User-Agent + 访问者 IP) 做会话去重(8 小时窗口),即按 IP 去重的
 * 独立访客数,和这里要的「按 IP 数量统计」一致。
 *
 * 启用三步(详见 README「访问统计」):
 *   1. 在 https://www.goatcounter.com/signup 注册,拿到站点码(形如 `ironnest`)
 *      → 面板地址 https://ironnest.goatcounter.com
 *   2. 站点设置里打开 "Allow adding visitor counts on your website"(默认关)
 *   3. 把下面 CODE 改成你的站点码
 *
 * 未填 CODE / 接口不可用时:整个计数块保持隐藏,绝不影响计算器本身。
 */
(function () {
  'use strict';

  var CODE = ''; // ← 在这里填 GoatCounter 站点码,例如 'ironnest'

  var el = document.getElementById('visitors');
  if (!el || !CODE) return; // 没配置就什么都不做(元素保持 hidden)

  var BASE = 'https://' + CODE + '.goatcounter.com/counter/TOTAL.json';

  function pad(n) { return String(n).padStart(2, '0'); }
  function utcDate(dayOffset) {
    // 接口的 start/end 是 UTC 日期(含 00:00 的那个小时桶),
    // 所以「今天」= [今天(UTC), 明天(UTC)] —— 未来的小时桶是空的,不会多算。
    var d = new Date(Date.now() + dayOffset * 86400000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function plain(s) { return String(s == null ? '' : s).replace(/[^0-9]/g, ''); }
  function withSeparators(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function count(query) {
    // 加 _= 时间戳绕开浏览器缓存;服务端最多 4 小时缓存,份额外的实时性拿不到。
    var url = BASE + '?' + (query ? query + '&' : '') + '_=' + Date.now();
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
    /* 接口挂了 / 站点没开计数:保持隐藏,静默失败 */
  });
})();
