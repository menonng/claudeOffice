const { chromium } = require(process.env.PW);
const fs = require('fs');
const W = +process.env.W, H = +process.env.H;
// office.html 의 ROOMS: [x, y, 이름, 영문, 색]
const ROOMS = [[0, 0, '회의실', 'MEETING', '#55BB44'], [7, 0, '자료실', 'LIBRARY', '#FF7E00'], [14, 0, '개발실', 'DEV', '#3355BB'],
  [0, 7, '엘리베이터 홀', '', '#39C5BB'], [0, 10, '라운지 · 탕비실', '', '#FFB4CC'], [0, 17, '복사실', '', '#FFCC11'],
  [8.6, 10.4, '내 자리', 'MY DESK', '#FFCC11'], [22, 12, '서버실', 'SERVER', '#660099'], [10, 15.5, '정보검색실', 'SEARCH', '#39C5BB']];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await p.goto(process.env.URL);
  await p.addStyleTag({ content: `.app{display:block!important;padding:0!important;height:100vh} aside{display:none!important}
    .stage{height:100vh!important;border:0!important;border-radius:0!important} .top,.live,.ctrl,.mode,.empty,#ov{display:none!important}` });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { document.getElementById('zfit').click(); });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: process.env.OUT + '/bg.png' });
  const seats = await p.evaluate(({ ROOMS }) => {
    const o = window.__office, cam = o.camera, V = cam.position.constructor, el = document.getElementById('gl');
    const w = el.clientWidth, h = el.clientHeight;
    const pr = (x, y) => { const v = new V(x, 0, y).project(cam); return [+((v.x + 1) / 2 * w).toFixed(1), +((1 - v.y) / 2 * h).toFixed(1)]; };
    const out = {};
    // 방 이름표: 3D 화면처럼 카메라에서 먼 모서리. '나' 이름표: 내 자리 의자
    out.__labels = ROOMS.map(([x, y, name, en, color]) => { const v = new V(x + 0.35, 0.05, y + 0.35).project(cam);
      return { name, en, color, at: [+((v.x + 1) / 2 * w).toFixed(1), +((1 - v.y) / 2 * h).toFixed(1)] }; });
    out.__me = pr(12.5, 10.7);
    const a = pr(15, 11), c = pr(16, 11);
    out.__meter = +Math.hypot(c[0] - a[0], c[1] - a[1]).toFixed(2);
    return out;
  }, { ROOMS });
  fs.writeFileSync(process.env.OUT + '/scene.json', JSON.stringify(seats));
  await b.close();
})();
