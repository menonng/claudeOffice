#!/usr/bin/env python3
"""bg.js · sprite.js 가 찍은 PNG 를 WebP 로 줄여 plugins/agent-office/hooks/assets.ts 를 만든다 (Pillow 필요)."""
import base64, io, json, sys
from pathlib import Path
from PIL import Image

OUT = Path(sys.argv[1])           # bg.js · sprite.js 의 OUT 폴더
DEST = Path(sys.argv[2])          # .../plugins/agent-office/hooks/assets.ts
CROP = (14, 4, 946, 584)          # 960×620 스크린샷에서 사무실만
SPRITE_BOX = (178, 156, 423, 328) # 600×400 스프라이트 샷에서 Clawd 만
SPRITE_W = 96                     # 화면에는 이것의 0.62 배로 (고해상도 대비 2배)
POSES = {'idle': 'idle-0', 'think': 'think-0', 'stuck': 'stuck-0', 'type': 'type-0'}
# 방 이름표를 가리지 않게 자리 순서를 바꿈
ORDER = {'info': [2, 1, 3, 4, 5, 0], 'server': [2, 1, 3, 4, 5, 0],
         'dev': [8, 9, 6, 7, 10, 11, 4, 5, 12, 13, 2, 3, 14, 15, 0, 1, 16, 17]}


def b64(im, q):
    b = io.BytesIO()
    im.save(b, 'WEBP', quality=q, method=6)
    return base64.b64encode(b.getvalue()).decode()


bg = Image.open(OUT / 'bg.png').convert('RGB').crop(CROP)
ax, ay = json.loads((OUT / 'sprite-meta.json').read_text())['anchor']
k = SPRITE_W / (SPRITE_BOX[2] - SPRITE_BOX[0])
sprites = {}
for key, src in POSES.items():
    im = Image.open(OUT / f'sp-{src}.png').crop(SPRITE_BOX)
    sprites[key] = b64(im.resize((SPRITE_W, round(im.height * k)), Image.LANCZOS), 85)
seats = json.loads((OUT / 'seats.json').read_text())
meter = seats.pop('__meter')

L = ['// 3D 웹 대시보드(office.html)에서 구워 낸 그림. 손으로 고치지 말고 tools/bake-mod-assets 로 다시 구울 것',
     '// BG: 사람 없는 사무실 (기본 시점), SPRITES: 정면을 보는 Clawd 포즈, SEATS: 방별 자리의 화면 좌표(px)',
     f'export const BG_W = {bg.width}', f'export const BG_H = {bg.height}',
     f"export const BG = 'data:image/webp;base64,{b64(bg, 78)}'",
     f'export const SPRITE_W = {SPRITE_W}', f'export const SPRITE_H = {round((SPRITE_BOX[3] - SPRITE_BOX[1]) * k)}',
     '/** 스프라이트 안에서 발밑(바닥 중심)의 위치 */',
     f'export const SPRITE_ANCHOR: [number, number] = [{round((ax - SPRITE_BOX[0]) * k, 1)}, {round((ay - SPRITE_BOX[1]) * k, 1)}]',
     'export const SPRITES = {', *[f"  {n}: 'data:image/webp;base64,{v}'," for n, v in sprites.items()], '}',
     '/** 바닥 1m 가 배경에서 몇 px 인지 */', f'export const METER_PX = {meter}', 'export const SEATS = {']
for room, pts in seats.items():
    pts = [[round(x - CROP[0], 1), round(y - CROP[1], 1)] for x, y in pts]
    if room in ORDER:
        pts = [pts[i] for i in ORDER[room]]
    L.append(f'  {room}: {json.dumps(pts)} as [number, number][],')
L.append('}')
DEST.write_text('\n'.join(L) + '\n', encoding='utf-8')
print('wrote', DEST, DEST.stat().st_size, 'bytes')
