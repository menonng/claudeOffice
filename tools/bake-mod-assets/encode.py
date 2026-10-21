#!/usr/bin/env python3
"""bg.js · sprite.js · seats.js 가 만든 것을 줄여 plugins/agent-office/hooks/assets.ts 를 만든다 (Pillow 필요)."""
import base64, io, json, sys
from pathlib import Path
from PIL import Image

OUT = Path(sys.argv[1])           # bg.js · sprite.js 의 OUT 폴더
DEST = Path(sys.argv[2])          # .../plugins/agent-office/hooks/assets.ts
CROP = (14, 4, 946, 584)          # 960×620 스크린샷에서 사무실만
SPRITE_BOX = (178, 156, 423, 328) # 600×400 스프라이트 샷에서 Clawd 만
SPRITE_W = 96                     # 고해상도 화면 대비 약 2배로 굽고, 3D 화면 크기(DRAW_SCALE)로 줄여 그림
POSES = {'idle': 'idle-0', 'think': 'think-0', 'stuck': 'stuck-0', 'type': 'type-0'}


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
scene = json.loads((OUT / 'scene.json').read_text())
meter, labels, me = scene['__meter'], scene['__labels'], scene['__me']
baked = json.loads((OUT / 'masks.json').read_text())
masks = baked['rooms']
seats = {room: [m['at'] for m in ms] for room, ms in masks.items()}
idle = Image.open(OUT / 'sp-idle-0.png').split()[-1].getbbox()
draw_scale = baked['width'] / ((idle[2] - idle[0]) * k)  # 3D 화면의 Clawd 너비 / 스프라이트 속 Clawd 너비


def mask_png(m):
    """가려진 정도(0~4)를 회색 PNG 로. SVG mask 는 밝은 곳만 배경을 다시 그림"""
    if not m['levels']:
        return 'null'
    im = Image.new('L', (m['w'], m['h']))
    im.putdata([min(255, int(c) * 64) for c in m['levels']])
    b = io.BytesIO()
    im.save(b, 'PNG', optimize=True)
    x, y = m['x'] - CROP[0], m['y'] - CROP[1]
    return f"[{x}, {y}, {m['w']}, {m['h']}, 'data:image/png;base64,{base64.b64encode(b.getvalue()).decode()}']"

L = ['// 3D 웹 대시보드(office.html)에서 구워 낸 그림. 손으로 고치지 말고 tools/bake-mod-assets 로 다시 구울 것',
     '// BG: 사람 없는 사무실 (기본 시점), SPRITES: 정면을 보는 Clawd 포즈, SEATS: 방별 자리의 화면 좌표(px)',
     f'export const BG_W = {bg.width}', f'export const BG_H = {bg.height}',
     f"export const BG = 'data:image/webp;base64,{b64(bg, 78)}'",
     f'export const SPRITE_W = {SPRITE_W}', '/** 스프라이트를 3D 화면과 같은 크기로 그리는 배율 */', f'export const DRAW_SCALE = {draw_scale:.3f}', f'export const SPRITE_H = {round((SPRITE_BOX[3] - SPRITE_BOX[1]) * k)}',
     '/** 스프라이트 안에서 발밑(바닥 중심)의 위치 */',
     f'export const SPRITE_ANCHOR: [number, number] = [{round((ax - SPRITE_BOX[0]) * k, 1)}, {round((ay - SPRITE_BOX[1]) * k, 1)}]',
     'export const SPRITES = {', *[f"  {n}: 'data:image/webp;base64,{v}'," for n, v in sprites.items()], '}',
     '/** 바닥 1m 가 배경에서 몇 px 인지 */', f'export const METER_PX = {meter}',
     '/** 방별 자리의 발밑 (seats.js 가 가구·벽과 겹치지 않고 덜 가려지는 곳을 고름) */', 'export const SEATS = {']
for room, pts in seats.items():
    pts = [[round(x - CROP[0], 1), round(y - CROP[1], 1)] for x, y in pts]
    L.append(f'  {room}: {json.dumps(pts)} as [number, number][],')
L.append('}')
L.append('/** 자리마다 그 자리의 Clawd 앞을 가리는 사무실 부분: [x, y, w, h, 마스크 PNG], 가리는 것이 없으면 null */')
L.append('export type Mask = [number, number, number, number, string] | null')
L.append('export const MASKS = {')
for room, ms in masks.items():
    L.append(f"  {room}: [{', '.join(mask_png(m) for m in ms)}] as Mask[],")
L.append('}')
L.append('/** 방 이름표 자리 (3D 화면처럼 카메라에서 먼 모서리) */')
L.append('export const LABELS: { name: string; en: string; color: string; at: [number, number] }[] = [')
for l in labels:
    L.append(f"  {{ name: {json.dumps(l['name'], ensure_ascii=False)}, en: '{l['en']}', color: '{l['color']}', at: [{round(l['at'][0] - CROP[0], 1)}, {round(l['at'][1] - CROP[1], 1)}] }},")
L.append(']')
L.append("/** '나' 이름표 자리 (내 자리 의자) */")
L.append(f'export const ME: [number, number] = [{round(me[0] - CROP[0], 1)}, {round(me[1] - CROP[1], 1)}]')
DEST.write_text('\n'.join(L) + '\n', encoding='utf-8')
print('wrote', DEST, DEST.stat().st_size, 'bytes')
