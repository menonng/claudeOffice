# bake-mod-assets

`plugins/agent-office/hooks/assets.ts`(mod 패널의 배경·Clawd 스프라이트·자리·가림 마스크)를 3D 웹 대시보드에서 다시 구워 내는 도구입니다.
`office.html`의 사무실이나 Clawd 모양을 바꿨을 때 실행하세요. Node + Playwright(Chromium), Python + Pillow가 필요합니다.

```bash
OUT=/tmp/office-bake; mkdir -p $OUT/empty
python office.py --root $OUT/empty --user 나 --no-browser --port 8770 &   # 사람 없는 사무실
python office.py --demo --no-browser --port 8771 &                         # Clawd 를 찍을 데모

PW=$(npm root -g)/playwright
PW=$PW URL=http://127.0.0.1:8770/ OUT=$OUT W=960 H=620 node tools/bake-mod-assets/bg.js
PW=$PW URL=http://127.0.0.1:8771/ OUT=$OUT node tools/bake-mod-assets/sprite.js
PW=$PW URL=http://127.0.0.1:8771/ OUT=$OUT node tools/bake-mod-assets/seats.js    # 2분쯤
python tools/bake-mod-assets/encode.py $OUT plugins/agent-office/hooks/assets.ts
```

- `bg.js`: 기본 시점의 빈 사무실(`bg.png`, 방 이름표 없이), 방 이름표와 '나' 이름표 자리(`scene.json`)
- `sprite.js`: 바닥을 숨기고 정면을 보는 Clawd를 포즈별로(`sp-*.png`, 투명 배경)
- `seats.js`: 방마다 Clawd가 설 자리를 고름. 3D 화면과 같은 크기로 카메라를 보고 선 Clawd가 **어떤 가구·벽과도 겹치지 않고**, 덜 가려지고(20% 이하, 서버실 30%) 방 가운데에 가까운 곳부터, 서로 1.6m 이상 떨어지게. 자리마다 그 Clawd 앞을 가리는 사무실 부분을 2배 해상도로 비교해 마스크로(`masks.json`)
- `encode.py`: 잘라서 WebP·PNG로 줄이고 `assets.ts` 작성. Svg 한 장이 131,072자를 넘지 않도록 배경은 약 60KB로 맞춤

패널은 배경 위에 Clawd를 뒤에서부터 그리고, 각 Clawd 바로 뒤에 그 자리의 마스크 모양대로 배경을 한 번 더 그려 앞 가구가 Clawd를 가리게 합니다.
