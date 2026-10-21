// 방마다 Clawd 가 설 자리를 고르고, 자리마다 "그 Clawd 앞을 가리는 사무실 부분" 마스크를 굽는다.
// 자리: 3D 화면과 같은 크기의 Clawd(카메라를 봄)가 어떤 가구·벽과도 겹치지 않는 바닥 중에서,
//       덜 가려지고 방 가운데에 가까운 곳부터, 서로 SPACING 이상 떨어지게.
// 마스크: 사무실과 함께 그린 Clawd(보이는 부분) vs Clawd 만 그린 것(실루엣) → 실루엣 − 보이는 부분
const { chromium } = require(process.env.PW);
const fs = require('fs');
const W = 960, H = 620, X = 2;   // 마스크는 2배로 그려 가장자리를 부드럽게
const STEP = 0.2, SPACING = 1.6, PER_ROOM = 6, MAX_HIDDEN = 0.2;
// office.html 의 ROOMS: 이름 → [x, y, w, d]
const ROOMS = { meeting: [0, 0, 7, 7], library: [7, 0, 7, 7], dev: [14, 0, 16, 10], elevator: [0, 7, 7, 3],
  lounge: [0, 10, 7, 7], mydesk: [8.6, 10.4, 7, 3.9], server: [22, 12, 8, 6], info: [10, 15.5, 10, 6.5] };
const COUNT = { dev: 8, elevator: 3, mydesk: 5 };
const ROOM_SPACING = { server: 1.4 }; // 랙 앞 통로가 좁음
const ROOM_HIDDEN = { server: 0.3 };  // 랙 앞 통로는 앞 유리벽 기둥에 조금 가림
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await p.goto(process.env.URL);
  await p.evaluate(() => localStorage.setItem('office-mode', 'mascot')); await p.reload();
  await p.addStyleTag({ content: `.app{display:block!important;padding:0!important;height:100vh} aside{display:none!important}
    .stage{height:100vh!important;border:0!important;border-radius:0!important} .top,.live,.ctrl,.mode,.empty{display:none!important}` });
  for (let i = 0; i < 40; i++) { if (await p.evaluate(() => window.__office.chars.size)) break; await p.waitForTimeout(500); }
  await p.evaluate(() => document.getElementById('zfit').click());
  await p.waitForTimeout(2000);
  const out = await p.evaluate(async ({ W, H, X, STEP, SPACING, PER_ROOM, MAX_HIDDEN, ROOMS, COUNT, ROOM_SPACING, ROOM_HIDDEN }) => {
    const THREE = await import('three');
    const o = window.__office, scene = o.scene, cam = o.camera;
    const r = new THREE.WebGLRenderer({ antialias: false });
    r.setPixelRatio(1);
    const groups = scene.children.filter(c => c.isGroup);
    const world = [...groups].sort((a, c) => c.children.length - a.children.length)[0];
    // 재는 Clawd: 메인(서브에이전트는 크기가 다르고 도중에 퇴근함), 앉거나 팔을 든 자세는 풀어 서 있는 기본자세로
    const who = [...o.chars.values()].find(c => !c.data.sub) ?? [...o.chars.values()][0];
    const md = who.model, root = md.root;
    md.torso.position.set(0, 0, 0); md.torso.rotation.set(0, 0, 0);
    md.arms.forEach(A => A.rotation.set(0, 0, 0));
    md.legs.forEach(L => { L.position.y = L.userData.y; });
    md.eyes.forEach(e => { e.position.y = e.userData.y; });
    if (md.prop) { md.prop.parent.remove(md.prop); md.prop = null; md.propPose = ''; }
    // 부딪힐 것: 발목 위·머리 아래에 걸치는 가구와 벽 (바닥·깔개·천장 배선은 빼고), 유리벽 포함. 그리고 내 자리의 '나'
    const obstacles = [];
    world.traverse(m => { if (!m.isMesh || m.isInstancedMesh) return; const bx = new THREE.Box3().setFromObject(m);
      if (bx.max.y < 0.06 || bx.min.y > 1.2) return; obstacles.push(bx); });
    obstacles.push(new THREE.Box3(new THREE.Vector3(12.1, 0, 10.3), new THREE.Vector3(12.9, 1.5, 11.1)));
    const place = (x, y) => { root.position.set(x, 0.02, y); root.rotation.set(0, Math.PI / 4, 0); root.updateMatrixWorld(true); };
    // Clawd 몸(y축으로 돌아간 상자들)과 장애물 상자(축 정렬)가 겹치는지: 높이 구간 + 바닥 평면에서의 분리축 검사
    obstacles.forEach(ob => ob.expandByScalar(0.01));
    const parts = []; root.traverse(m => { if (m.isMesh) parts.push(m); });
    const UNIT = []; for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) UNIT.push(new THREE.Vector3(x, y, z));
    const proj = (pts, ax) => { let lo = Infinity, hi = -Infinity; for (const q of pts) { const d = q[0] * ax[0] + q[1] * ax[1]; lo = Math.min(lo, d); hi = Math.max(hi, d); } return [lo, hi]; };
    const hits = (m, ob) => {
      const c = UNIT.map(v => v.clone().applyMatrix4(m.matrixWorld));
      const ylo = Math.min(...c.map(q => q.y)), yhi = Math.max(...c.map(q => q.y));
      if (yhi < ob.min.y || ob.max.y < ylo) return false;
      const P = c.map(q => [q.x, q.z]), Q = [[ob.min.x, ob.min.z], [ob.max.x, ob.min.z], [ob.max.x, ob.max.z], [ob.min.x, ob.max.z]];
      const ax = new THREE.Vector3(1, 0, 0).transformDirection(m.matrixWorld), az = new THREE.Vector3(0, 0, 1).transformDirection(m.matrixWorld);
      for (const axis of [[1, 0], [0, 1], [ax.x, ax.z], [az.x, az.z]]) {
        if (Math.hypot(axis[0], axis[1]) < 1e-6) continue;
        const [a0, a1] = proj(P, axis), [b0, b1] = proj(Q, axis);
        if (a1 < b0 || b1 < a0) return false;
      }
      return true;
    };
    const collides = () => {
      const all = new THREE.Box3().setFromObject(root);
      const near = obstacles.filter(ob => ob.intersectsBox(all));
      return near.length > 0 && parts.some(m => near.some(ob => hits(m, ob)));
    };
    // 화면 영역: Clawd 상자의 꼭짓점을 투영
    const region = (k) => { const bx = new THREE.Box3().setFromObject(root); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const xx of [bx.min.x, bx.max.x]) for (const yy of [bx.min.y, bx.max.y]) for (const zz of [bx.min.z, bx.max.z]) {
        const v = new THREE.Vector3(xx, yy, zz).project(cam); const sx = (v.x + 1) / 2 * W * k, sy = (1 - v.y) / 2 * H * k;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
      x0 = Math.max(0, Math.floor(x0) - 2); y0 = Math.max(0, Math.floor(y0) - 2);
      return [x0, y0, Math.min(W * k, Math.ceil(x1) + 2) - x0, Math.min(H * k, Math.ceil(y1) + 2) - y0]; };
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff }), black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const saved = [];
    world.traverse(m => { if (m.isMesh) { saved.push([m, m.material, m.visible]);
      const see = m.material.transparent && m.material.opacity < 1; m.material = black; if (see) m.visible = false; } }); // 유리는 가리지 않음
    root.traverse(m => { if (m.isMesh) { saved.push([m, m.material, m.visible]); m.material = white; } });
    // 다른 직원은 데모 도중에도 들어오니 그릴 때마다 숨김
    const hideOthers = () => scene.children.forEach(g => { if (g.isGroup && g !== world && g !== root) g.visible = false; });
    const targets = {};
    const shot = (k, [rx, ry, rw, rh]) => {
      const key = k; if (!targets[key]) { targets[key] = new THREE.WebGLRenderTarget(W * k, H * k); }
      const rt = targets[key]; hideOthers(); r.setSize(W * k, H * k, false); r.setRenderTarget(rt); r.render(scene, cam);
      const buf = new Uint8Array(rw * rh * 4); r.readRenderTargetPixels(rt, rx, H * k - ry - rh, rw, rh, buf); r.setRenderTarget(null);
      const m = new Uint8Array(rw * rh); for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) m[y * rw + x] = buf[((rh - 1 - y) * rw + x) * 4] > 127 ? 1 : 0;
      return m; };
    const hiddenShare = (k) => { const rg = region(k); world.visible = true; const seen = shot(k, rg); world.visible = false; const sil = shot(k, rg);
      let s = 0, h = 0; for (let i = 0; i < sil.length; i++) if (sil[i]) { s++; if (!seen[i]) h++; } return { rg, seen, sil, share: s ? h / s : 1 }; };
    const res = { rooms: {}, seats: {} };
    world.visible = false; place(18, 12.6); { const rg = region(1); const sil = shot(1, rg); let x0 = 1e9, x1 = -1; sil.forEach((v, i) => { if (v) { const x = i % rg[2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); } }); res.width = x1 - x0 + 1; }
    for (const [room, [rx, ry, rw, rd]] of Object.entries(ROOMS)) {
      const cands = [];
      for (let y = ry + 0.45; y <= ry + rd - 0.45; y += STEP) for (let x = rx + 0.45; x <= rx + rw - 0.45; x += STEP) {
        place(x, y); if (collides()) continue;
        const share = hiddenShare(1).share; if (share > (ROOM_HIDDEN[room] ?? MAX_HIDDEN)) continue;
        const dc = Math.hypot((x - (rx + rw / 2)) / rw, (y - (ry + rd / 2)) / rd);
        cands.push({ x, y, score: (1 - share) - dc * 0.6 });
      }
      cands.sort((a, c) => c.score - a.score);
      const pick = [];
      for (const c of cands) { if (pick.length >= (COUNT[room] ?? PER_ROOM)) break; if (pick.every(q => Math.hypot(q.x - c.x, q.y - c.y) >= (ROOM_SPACING[room] ?? SPACING))) pick.push(c); }
      res.seats[room] = pick.map(c => [+c.x.toFixed(2), +c.y.toFixed(2)]);
      // 고른 자리: 화면 좌표와 2배 마스크
      res.rooms[room] = pick.map(c => {
        place(c.x, c.y);
        const v = new THREE.Vector3(c.x, 0, c.y).project(cam);
        const at = [+((v.x + 1) / 2 * W).toFixed(1), +((1 - v.y) / 2 * H).toFixed(1)];
        const { rg, seen, sil } = hiddenShare(X);
        const [gx, gy, gw, gh] = rg;
        const x0 = Math.floor(gx / X) - 1, y0 = Math.floor(gy / X) - 1, x1 = Math.ceil((gx + gw) / X) + 1, y1 = Math.ceil((gy + gh) / X) + 1;
        const w = x1 - x0, h = y1 - y0;
        const occ = (xx, yy) => { let n = 0; for (let dy = 0; dy < X; dy++) for (let dx = 0; dx < X; dx++) {
          const px = xx * X + dx - gx, py = yy * X + dy - gy; if (px < 0 || py < 0 || px >= gw || py >= gh) continue; const i = py * gw + px; n += sil[i] && !seen[i] ? 1 : 0; } return n; };
        const lv = []; for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) lv.push(occ(xx, yy));
        // 가장자리에 Clawd 색이 남지 않게 이웃 1칸까지 완전히 덮음
        const grow = []; let any = false;
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { let val = lv[yy * w + xx];
          if (val < 4) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = xx + dx, ny = yy + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && lv[ny * w + nx] > 0) val = 4; }
          grow.push(val); any ||= val > 0; }
        return { at, x: x0, y: y0, w, h, levels: any ? grow.join('') : '' };
      });
    }
    for (const [m, mt, v] of saved) { m.material = mt; m.visible = v; }
    scene.children.forEach(g => { if (g.isGroup) g.visible = true; });
    r.dispose(); Object.values(targets).forEach(t => t.dispose());
    return res;
  }, { W, H, X, STEP, SPACING, PER_ROOM, MAX_HIDDEN, ROOMS, COUNT, ROOM_SPACING, ROOM_HIDDEN });
  fs.writeFileSync(process.env.OUT + '/masks.json', JSON.stringify(out));
  console.log('width', out.width, Object.entries(out.seats).map(([k, l]) => `${k}:${l.length}`).join(' '));
  console.log(JSON.stringify(out.seats));
  await b.close();
})();
