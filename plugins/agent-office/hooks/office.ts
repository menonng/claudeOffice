// 사무실 구역 · 도구 → 구역 매핑 · SVG 그리기 (화면이 있는 데스크톱/모바일/에디터용)
import type { Office, Room, Worker } from '../types'
import { BG, BG_H, BG_W, DRAW_SCALE, LABELS, MASKS, ME, SEATS, SPRITES, SPRITE_ANCHOR, SPRITE_H, SPRITE_W } from './assets'
import type { Mask } from './assets'

export const PAL = {
  red: '#FF0045', orange: '#FF7E00', yellow: '#FFCC11', green: '#55BB44',
  sky: '#39C5BB', blue: '#3355BB', purple: '#660099', pink: '#FFB4CC',
}
export const SUB_COLORS = [PAL.green, PAL.purple, PAL.sky, PAL.red, PAL.orange, PAL.pink, PAL.yellow]
export const CLAWD = '#D97757'

type RoomDef = { name: string; color: string; what: string }
export const ROOMS: Record<Room, RoomDef> = {
  meeting: { name: '회의실', color: PAL.green, what: '계획 · 할 일 · 스킬' },
  library: { name: '자료실', color: PAL.orange, what: '파일 읽기 · 검색' },
  dev: { name: '개발실', color: PAL.blue, what: '코드 작성 · 수정' },
  elevator: { name: '엘리베이터 홀', color: PAL.sky, what: '서브에이전트 출퇴근' },
  lounge: { name: '라운지 · 탕비실', color: PAL.pink, what: '휴식 · 다음 지시 대기' },
  mydesk: { name: '내 자리', color: PAL.yellow, what: '질문 · 에이전트 호출 · 보고' },
  server: { name: '서버실', color: PAL.purple, what: '명령 실행 · git' },
  info: { name: '정보검색실', color: PAL.sky, what: '웹 · 외부 도구' },
}
// 터미널 격자에 놓는 순서
export const ROOM_ORDER: Room[] = ['meeting', 'library', 'dev', 'server', 'lounge', 'mydesk', 'info', 'elevator']

const LIBRARY_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead'])
const WEB_TOOLS = new Set(['WebFetch', 'WebSearch', 'ToolSearch', 'ListMcpResourcesTool', 'ReadMcpResourceTool'])
const SERVER_TOOLS = new Set(['Bash', 'BashOutput', 'KillShell', 'KillBash', 'Monitor', 'PowerShell'])
const CALL_TOOLS = new Set(['Task', 'Agent', 'AskUserQuestion', 'SendMessage'])
const MEETING_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet',
  'EnterPlanMode', 'ExitPlanMode', 'Skill', 'SlashCommand'])

export function toolRoom(name: string): Room {
  if (LIBRARY_TOOLS.has(name)) return 'library'
  if (WEB_TOOLS.has(name) || name.startsWith('mcp__')) return 'info'
  if (SERVER_TOOLS.has(name)) return 'server'
  if (CALL_TOOLS.has(name)) return 'mydesk'
  if (MEETING_TOOLS.has(name)) return 'meeting'
  return 'dev'
}

export function short(text: unknown, n: number): string {
  if (typeof text !== 'string') return ''
  const s = text.split(/\s+/).filter(Boolean).join(' ')
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

const base = (p: string) => p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || p

export function toolDetail(name: string, input: Record<string, unknown>): string {
  const label = name.startsWith('mcp__') ? name.split('__').pop() || name : name
  for (const k of ['description', 'file_path', 'notebook_path', 'pattern', 'command', 'query', 'url', 'skill', 'subject', 'prompt', 'path']) {
    const v = input[k]
    if (typeof v === 'string' && v.trim()) {
      return `${label} · ${short(k.endsWith('path') ? base(v) : v, 40)}`
    }
  }
  const qs = input.questions
  if (Array.isArray(qs) && qs[0] && typeof qs[0] === 'object') {
    return `${label} · ${short((qs[0] as Record<string, unknown>).question, 40)}`
  }
  return label
}


export type Seat = { at: [number, number]; mask: Mask }

/** 같은 방 사람들에게 자리를 나눠 줌: 배경 그림의 px 좌표와, 그 자리 앞을 가리는 가구의 마스크 */
export function seats(workers: Worker[]): Map<string, Seat> {
  const out = new Map<string, Seat>()
  const count: Partial<Record<Room, number>> = {}
  for (const w of workers) {
    const i = count[w.room] ?? 0
    count[w.room] = i + 1
    const sl = SEATS[w.room]
    const n = i % sl.length
    const s = sl[n] ?? [BG_W / 2, BG_H / 2]
    // 자리가 모자라면 같은 자리 조금 옆에, 가리는 마스크도 같이 옮겨서
    const dx = Math.floor(i / sl.length) * 8, dy = dx / 2
    const m = MASKS[w.room][n] ?? null
    out.set(w.id, { at: [s[0] + dx, s[1] + dy], mask: m && [m[0] + dx, m[1] + dy, m[2], m[3], m[4]] })
  }
  return out
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1, 7), 16)
  const t = amt > 0 ? 255 : 0, a = Math.abs(amt)
  const ch = (v: number) => Math.round(v + (t - v) * a)
  return '#' + ((1 << 24) | (ch(n >> 16) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).slice(1)
}

// ───────── SVG: 구워 둔 3D 배경 + Clawd 스프라이트, 그 위에 이름표·말풍선 ─────────

const esc = (s: string) => s.replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m] as string)
const f = (n: number) => n.toFixed(1)
const FONT = 'Pretendard, Apple SD Gothic Neo, Malgun Gothic, Noto Sans KR, system-ui, sans-serif'
const INK = '#1d2033'
const textWidth = (s: string, px: number) => [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? px : px * 0.58), 0)

type Rect = { x: number; y: number; w: number; h: number }

function sprite(w: Worker, sx: number, sy: number, from: [number, number] | undefined): string {
  const k = DRAW_SCALE * (w.isSub ? 0.85 : 1)
  const [ax, ay] = SPRITE_ANCHOR
  const use = (id: string, anim = '') => {
    const open = `<use href="#clawd-${id}" transform="scale(${k}) translate(${-ax} ${-ay})"`
    return anim ? `${open}>${anim}</use>` : `${open}/>`
  }
  // 일하는 중: 두 포즈를 번갈아 (타자 치듯)
  const flip = (values: string) => `<animate attributeName="opacity" values="${values}" calcMode="discrete" dur="0.5s" repeatCount="indefinite"/>`
  const frames = w.mood === 'work'
    ? use('idle', flip('1;0')) + use('type', flip('0;1'))
    : use(w.mood === 'think' ? 'think' : w.mood === 'stuck' ? 'stuck' : 'idle')
  const motion = w.mood === 'stuck'
    ? '<animateTransform attributeName="transform" type="translate" values="-1.2 0;1.2 0;-1.2 0" dur="0.16s" repeatCount="indefinite"/>'
    : w.mood === 'think'
      ? '<animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="1.4s" repeatCount="indefinite"/>'
      : w.mood === 'work'
        ? '<animateTransform attributeName="transform" type="translate" values="0 0;0 -1.2;0 0" dur="0.5s" repeatCount="indefinite"/>'
        : ''
  const moved = from && Math.hypot(from[0] - sx, from[1] - sy) > 2
  const walk = moved
    ? `<animateTransform attributeName="transform" type="translate" from="${f(from[0] - sx)} ${f(from[1] - sy)}" to="0 0" dur="1.2s" fill="freeze"/>`
    : ''
  const hop = moved ? '<animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="0.3s" repeatCount="4"/>' : ''
  const top = -ay * k
  const badge = w.isSub ? `<rect x="-7" y="${f(top - 3)}" width="14" height="4.5" rx="1.2" fill="${w.color}" stroke="#fff" stroke-width="0.8"/>` : ''
  const shadow = `<ellipse cx="0" cy="1" rx="${f(SPRITE_W * k * 0.36)}" ry="${f(SPRITE_W * k * 0.11)}" fill="#14182c" opacity="0.18"/>`
  return `<g transform="translate(${f(sx)} ${f(sy)})"><g>${walk}${shadow}<g>${hop}<g>${motion}${frames}${badge}</g></g></g></g>`
}

/** 발밑 이름표: 색 점 + 이름 */
function nameTag(label: string, dot: string, sx: number, sy: number): string {
  const name = short(label, 18)
  const width = textWidth(name, 9.5) + 21
  const x = sx - width / 2, y = sy + 5
  return `<g><rect x="${f(x)}" y="${f(y)}" width="${f(width)}" height="15" rx="7.5" fill="#fff" fill-opacity="0.96" stroke="#1e233c" stroke-opacity="0.12"/>` +
    `<circle cx="${f(x + 8)}" cy="${f(y + 7.5)}" r="2.9" fill="${dot}"/>` +
    `<text x="${f(x + 13.5)}" y="${f(y + 10.9)}" font-size="9.5" font-weight="700" fill="${INK}">${esc(name)}</text></g>`
}

function bubble(w: Worker, sx: number, sy: number, placed: Rect[]): string {
  const text = w.mood === 'think' ? '💭 고민 중…' : w.mood === 'stuck' ? '😣 막혔다… 다시 고민 중' : w.mood === 'rest' && w.room === 'lounge' ? '☕' : short(w.detail, 24)
  const sub = w.mood === 'stuck' ? short(w.detail.replace(/^😣 막힘 · /, ''), 34) : ''
  if (!text) return ''
  const width = Math.max(textWidth(text, 10), sub ? textWidth(sub, 8.5) : 0) + 16
  const h = sub ? 33 : 21
  const headTop = sy - SPRITE_ANCHOR[1] * DRAW_SCALE * (w.isSub ? 0.85 : 1)
  let x = sx - width / 2, y = headTop - h - 7
  for (let k = 0; k < 6; k++) {
    const hit = placed.find(r => x < r.x + r.w && x + width > r.x && y < r.y + r.h && y + h > r.y)
    if (!hit) break
    y = hit.y - h - 4
  }
  placed.push({ x, y, w: width, h })
  const border = w.mood === 'stuck' ? PAL.red : w.mood === 'think' ? '#b48be0' : '#1e233c'
  const bo = w.mood === 'stuck' || w.mood === 'think' ? '' : ' stroke-opacity="0.14"'
  const color = w.mood === 'stuck' ? PAL.red : w.mood === 'think' ? PAL.purple : INK
  const tail = `<path d="M${f(sx - 4.5)} ${f(y + h - 0.5)} L${f(sx)} ${f(Math.min(y + h + 6, headTop - 1))} L${f(sx + 4.5)} ${f(y + h - 0.5)}" fill="#fff"/>`
  return `<g filter="url(#lift)"><rect x="${f(x)}" y="${f(y)}" width="${f(width)}" height="${h}" rx="8" fill="#fff" stroke="${border}"${bo}/>${tail}` +
    `<text x="${f(x + 8)}" y="${f(y + 14.2)}" font-size="10" font-weight="${w.mood === 'talk' ? 600 : 700}" fill="${color}">${esc(text)}</text>` +
    (sub ? `<text x="${f(x + 8)}" y="${f(y + 26.8)}" font-size="8.5" font-weight="600" fill="#727795">${esc(sub)}</text>` : '') + '</g>'
}

/** 방 이름표 (3D 화면의 것과 같은 모양) */
function roomLabel(l: (typeof LABELS)[number]): string {
  const text = l.name + (l.en ? '  ·  ' + l.en : '')
  const width = textWidth(text, 9.5) + 13
  const [x, y] = l.at
  return `<g><rect x="${f(x - width / 2)}" y="${f(y - 8)}" width="${f(width)}" height="16" rx="8" fill="#fff" fill-opacity="0.9" stroke="${shade(l.color, 0.4)}"/>` +
    `<text x="${f(x - width / 2 + 6.5)}" y="${f(y + 3.4)}" font-size="9.5" font-weight="700" fill="${shade(l.color, -0.3)}">${esc(text)}</text></g>`
}

/** 사무실 한 장. `prev`: 지난번에 그린 위치, 다른 방으로 옮긴 사람은 거기서 걸어옴 */
export function officeSvg(o: Office, prev: Map<string, [number, number]>): { svg: string; drawn: Map<string, [number, number]> } {
  const pos = seats(o.workers)
  const people = o.workers.flatMap(w => {
    const seat = pos.get(w.id)
    return seat ? [{ w, seat, p: seat.at }] : []
  }).sort((a, b) => a.p[1] - b.p[1])
  // 그 자리 앞의 가구: 배경을 마스크 모양대로 한 번 더 그려 Clawd 를 가림
  const masks = people.map(({ seat }, i) => seat.mask
    ? `<mask id="m${i}" maskUnits="userSpaceOnUse" x="${seat.mask[0]}" y="${seat.mask[1]}" width="${seat.mask[2]}" height="${seat.mask[3]}">` +
      `<image href="${seat.mask[4]}" x="${seat.mask[0]}" y="${seat.mask[1]}" width="${seat.mask[2]}" height="${seat.mask[3]}"/></mask>`
    : '')
  const defs = '<defs>' +
    `<image id="bg" href="${BG}" width="${BG_W}" height="${BG_H}"/>` + masks.join('') +
    '<clipPath id="frame"><rect width="' + BG_W + '" height="' + BG_H + '" rx="14"/></clipPath>' +
    '<filter id="lift" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#141832" flood-opacity="0.14"/></filter>' +
    Object.entries(SPRITES).map(([id, href]) => `<image id="clawd-${id}" href="${href}" width="${SPRITE_W}" height="${SPRITE_H}"/>`).join('') +
    '</defs>'
  const drawn = new Map<string, [number, number]>()
  const parts: string[] = ['<use href="#bg"/>']
  people.forEach(({ w, p, seat }, i) => {
    drawn.set(w.id, p)
    parts.push(sprite(w, p[0], p[1], prev.get(w.id)))
    if (seat.mask) parts.push(`<use href="#bg" mask="url(#m${i})"/>`)
  })
  parts.push(...LABELS.map(roomLabel), nameTag('나', PAL.sky, ME[0], ME[1]))
  for (const { w, p } of people) parts.push(nameTag(w.name, w.isSub ? w.color : PAL.blue, p[0], p[1]))
  // 말풍선은 다른 Clawd 와 이름표를 덮지 않게 그 위로 비켜 감
  const placed: Rect[] = people.flatMap(({ w, p }) => {
    const k = DRAW_SCALE * (w.isSub ? 0.85 : 1), tag = textWidth(short(w.name, 18), 9.5) + 21
    return [{ x: p[0] - SPRITE_W * k / 2, y: p[1] - SPRITE_ANCHOR[1] * k, w: SPRITE_W * k, h: SPRITE_H * k },
      { x: p[0] - tag / 2, y: p[1] + 5, w: tag, h: 15 }]
  })
  for (const { w, p } of [...people].reverse()) parts.push(bubble(w, p[0], p[1], placed))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BG_W} ${BG_H}" width="${BG_W}" height="${BG_H}" font-family="${FONT}">` +
    `${defs}<g clip-path="url(#frame)"><rect width="${BG_W}" height="${BG_H}" fill="#eef0f6"/>${parts.join('')}</g></svg>`
  return { svg, drawn }
}
