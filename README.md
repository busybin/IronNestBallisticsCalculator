# Iron Nest Ballistics Calculator

<p align="center">
  <a href="https://buymeacoffee.com/busybin"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="56"></a>
</p>

![Iron Nest Ballistics Calculator](./screenshot.png)

A static, single-page ballistics calculator for **Iron Nest**. Enter distance,
bearing, shell type and charge count to get the required elevation angle and
time-to-target, and keep a target queue. Everything runs in the browser —
no backend, no build step.

**Live:** https://busybin.github.io/IronNestBallisticsCalculator/

## Features

- Distance (0–30 km), bearing (0–360°), shell type (21 entries), charges (1–6)
- Elevation + time-to-target, with an animated readout
- Target queue with move up/down, delete and dim
- On-screen keypad (no soft keyboard needed)
- Retro CRT-green theme, scaled to fit the viewport

## Run locally

Just open `index.html`, or serve the folder:

```sh
npx serve .
```

## Deploy

GitHub Pages — source branch `main`, folder `/`.

## Visitor counter (optional)

The header can show `VISITORS` / `TODAY` via `counter.js`, backed by
[GoatCounter](https://www.goatcounter.com/) — free, open source, cookie-less.
GoatCounter counts *unique visits* (deduplicated on site ID + User-Agent + IP),
so these are unique visitors, not raw page loads.

**Nothing is tracked until you configure it**: with no site code set,
`counter.js` makes no request at all and the counter stays hidden.

This deployment is configured: `counter.js` in this repository sets
`CODE = 'busybin'`, so visits to the published site are counted there. Remove
that value if you host your own copy.

To enable:

1. Sign up at <https://www.goatcounter.com/signup>. The *account name* you pick
   becomes your site code (e.g. `ironnest` → `https://ironnest.goatcounter.com`).
   *Site domain* can be `busybin.github.io`. No e-mail confirmation step.
2. Open `https://<code>.goatcounter.com/settings` and tick
   **“Allow adding visitor counts on your website”** (off by default —
   without it the counter endpoint returns `403`).
3. Put `<code>` into `CODE` at the top of `counter.js`.

Notes:

- `counter.js` also **reports the pageview itself** (a `GET /count?p=…` via
  `navigator.sendBeacon`, same protocol as the official `count.js`), so no
  third-party script is loaded. It skips prerenders, iframes, `file://`,
  private/local addresses (so visiting the LAN copy doesn't pollute the stats),
  and anything with the `skipgc` "disable for this browser" flag.
- `VISITORS` = all-time total. `TODAY` = current UTC day: the counter endpoint
  only accepts UTC dates, and it caches responses for up to 4 hours, so today's
  number can lag a little.
- To keep your own visits out of the stats, click *disable for this browser*
  under *Settings → Tracking* (that is what sets `skipgc`; *Ignore IPs* may not
  match because GoatCounter compares it against `IP:port`).
- The raw endpoints are
  `https://<code>.goatcounter.com/count?p=<path>` (report) and
  `https://<code>.goatcounter.com/counter/TOTAL.json?start=YYYY-MM-DD&end=YYYY-MM-DD`
  (read; returns `{"count":"1,234"}`; both CORS-enabled).
- Ad blockers often block GoatCounter; when the request fails the counter just
  stays hidden.

## Credits

- **Original:** the Iron Nest calculator by the author of
  [iron-nest.shiru.dog](https://iron-nest.shiru.dog/). The visual design and the
  ballistics model are theirs; this repository is an **unofficial
  reimplementation** and is not affiliated with or endorsed by the original
  author.
- **Font:** [VT323](https://fonts.google.com/specimen/VT323) by Peter Hull
  (SIL Open Font License 1.1).

## Disclaimer

Unofficial fan project, provided "as is", for the game *Iron Nest*. No warranty.

## Author

busybin — https://github.com/busybin
