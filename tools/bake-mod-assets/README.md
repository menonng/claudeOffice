# bake-mod-assets

`plugins/agent-office/hooks/assets.ts`(mod 패널의 배경·Clawd 스프라이트·자리 좌표)를 3D 웹 대시보드에서 다시 구워 내는 도구입니다.
`office.html`의 사무실이나 Clawd 모양을 바꿨을 때 실행하세요. Node + Playwright(Chromium), Python + Pillow가 필요합니다.

```bash
OUT=/tmp/office-bake; mkdir -p $OUT/empty
python office.py --root $OUT/empty --user 나 --no-browser --port 8770 &   # 사람 없는 사무실
python office.py --demo --no-browser --port 8771 &                         # Clawd 를 찍을 데모

PW=$(npm root -g)/playwright
PW=$PW URL=http://127.0.0.1:8770/ OUT=$OUT W=960 H=620 node tools/bake-mod-assets/bg.js
PW=$PW URL=http://127.0.0.1:8771/ OUT=$OUT node tools/bake-mod-assets/sprite.js
python tools/bake-mod-assets/encode.py $OUT plugins/agent-office/hooks/assets.ts
```

- `bg.js`: 기본 시점의 빈 사무실(`bg.png`)과, 방마다 자리의 화면 좌표(`seats.json`)
- `sprite.js`: 바닥을 숨기고 정면을 보는 Clawd를 포즈별로(`sp-*.png`, 투명 배경)
- `encode.py`: 잘라서 WebP로 줄이고 `assets.ts` 작성. Svg 한 장이 131,072자를 넘지 않도록 배경은 약 60KB로 맞춤
