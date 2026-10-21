const { chromium } = require(process.env.PW);
const fs = require('fs');
const POSES = [['idle', { pose: 'idle', busy: false, stuck: false }], ['think', { pose: 'idle', busy: true, stuck: false }],
  ['stuck', { pose: 'idle', busy: false, stuck: true }], ['raise', { pose: 'rack', busy: false, stuck: false }],
  ['type', { pose: 'type', busy: false, stuck: false }]];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 600, height: 400 }, deviceScaleFactor: 1 });
  await p.goto(process.env.URL);
  await p.evaluate(() => localStorage.setItem('office-mode', 'mascot')); await p.reload();
  await p.addStyleTag({ content: `html,body{background:transparent!important}.app{display:block!important;padding:0!important;height:100vh}
    aside{display:none!important}.stage{height:100vh!important;border:0!important;background:transparent!important}
    #ov,.top,.live,.ctrl,.mode,.empty{display:none!important}` });
  for (let i = 0; i < 30; i++) { if (await p.evaluate(() => window.__office.chars.size)) break; await p.waitForTimeout(500); }
  await p.evaluate(() => {
    const o = window.__office;
    const world = [...o.scene.children].filter(c => c.isGroup).sort((a, b) => b.children.length - a.children.length)[0];
    world.scale.set(1e-4, 1e-4, 1e-4);
    window.__pose = { pose: 'idle', busy: false, stuck: false };
    setInterval(() => { let k = 0; for (const c of o.chars.values()) {
      c.path = []; c.sit = false; c.leaving = false; c.alpha = 1; c.faceTarget = c.face = Math.PI / 4;
      if (k === 0) { c.x = 18; c.y = 12.6; c.data = { ...c.data, ...window.__pose, sub: false }; window.__id = c.id; } else { c.x = 200; c.y = 200; }
      k++; } }, 10);
  });
  await p.waitForTimeout(500);
  await p.evaluate(() => { const o = window.__office; o.focusOn(window.__id); for (let i = 0; i < 12; i++) document.getElementById('zin').click(); });
  await p.waitForTimeout(2500);
  const anchor = await p.evaluate(() => { const o = window.__office, cam = o.camera, V = cam.position.constructor, el = document.getElementById('gl');
    const v = new V(18, 0, 12.6).project(cam); return [(v.x + 1) / 2 * el.clientWidth, (1 - v.y) / 2 * el.clientHeight]; });
  const meta = { anchor };
  for (const [name, st] of POSES) {
    await p.evaluate(st => { window.__pose = st; }, st);
    await p.waitForTimeout(1200);
    for (let k = 0; k < 2; k++) {
      await p.locator('#gl').screenshot({ path: `${process.env.OUT}/sp-${name}-${k}.png`, omitBackground: true });
      await p.waitForTimeout(170);
    }
  }
  fs.writeFileSync(process.env.OUT + '/sprite-meta.json', JSON.stringify(meta));
  await b.close();
})();
