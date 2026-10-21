const { chromium } = require(process.env.PW);
const fs = require('fs');
const W = +process.env.W, H = +process.env.H;
const SLOTS = {
  meeting: [[2.3, 2.05], [3.6, 2.05], [4.9, 2.05], [2.3, 4.75], [3.6, 4.75], [4.9, 4.75]],
  library: [[8.9, 5.3], [10.3, 5.3], [11.7, 5.3], [8.3, 1.6], [10.5, 1.6], [12.7, 1.6]],
  dev: [0,1,2,3,4,5,6,7,8].flatMap(k => [[15.825 + k * 1.65, 3.6], [15.825 + k * 1.65, 7.2]]),
  server: [[23.9, 14.0], [25.3, 14.0], [26.7, 14.0], [28.1, 14.0], [23.9, 17.0], [25.3, 17.0]],
  info: [[11.2, 16.9], [13, 16.9], [16.8, 16.9], [18.6, 16.9], [12, 20.15], [15, 20.15]],
  mydesk: [[12.5, 13.1], [11.0, 13.3], [14.0, 13.3], [9.8, 13.8], [15, 13.8]],
  lounge: [[2.4, 12.9], [3.7, 12.9], [1.25, 13.6], [4.0, 15.4], [5.2, 14.6]],
  elevator: [[1.6, 8.5], [2.6, 7.9], [2.6, 9.2]],
};
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await p.goto(process.env.URL);
  await p.addStyleTag({ content: `.app{display:block!important;padding:0!important;height:100vh} aside{display:none!important}
    .stage{height:100vh!important;border:0!important;border-radius:0!important} .top,.live,.ctrl,.mode,.empty{display:none!important}` });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { document.getElementById('zfit').click(); });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: process.env.OUT + '/bg.png' });
  const seats = await p.evaluate((SLOTS) => {
    const o = window.__office, cam = o.camera, V = cam.position.constructor, el = document.getElementById('gl');
    const w = el.clientWidth, h = el.clientHeight;
    const pr = (x, y) => { const v = new V(x, 0, y).project(cam); return [+((v.x + 1) / 2 * w).toFixed(1), +((1 - v.y) / 2 * h).toFixed(1)]; };
    const out = {}; for (const [k, l] of Object.entries(SLOTS)) out[k] = l.map(([x, y]) => pr(x, y));
    // 1m 가 화면에서 몇 px 인지 (Clawd 크기 맞추기)
    const a = pr(15, 11), c = pr(16, 11);
    out.__meter = +Math.hypot(c[0] - a[0], c[1] - a[1]).toFixed(2);
    return out;
  }, SLOTS);
  fs.writeFileSync(process.env.OUT + '/seats.json', JSON.stringify(seats));
  await b.close();
})();
