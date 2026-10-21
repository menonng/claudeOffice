// 사무실 평면도 · 도구 → 구역 매핑 · SVG 그리기 (화면이 있는 데스크톱/모바일/에디터용)
import type { Office, Room, Worker } from '../types'

export const PAL = {
  red: '#FF0045', orange: '#FF7E00', yellow: '#FFCC11', green: '#55BB44',
  sky: '#39C5BB', blue: '#3355BB', purple: '#660099', pink: '#FFB4CC',
}
export const SUB_COLORS = [PAL.green, PAL.purple, PAL.sky, PAL.red, PAL.orange, PAL.pink, PAL.yellow]
export const CLAWD = '#D97757'
const EYE = '#1a1412'

type RoomDef = { x: number; y: number; w: number; d: number; name: string; color: string; floor: string; what: string }
export const ROOMS: Record<Room, RoomDef> = {
  meeting: { x: 0, y: 0, w: 7, d: 7, name: '회의실', color: PAL.green, floor: '#dbe7d3', what: '계획 · 할 일 · 스킬' },
  library: { x: 7, y: 0, w: 7, d: 7, name: '자료실', color: PAL.orange, floor: '#e9d5b4', what: '파일 읽기 · 검색' },
  dev: { x: 14, y: 0, w: 16, d: 10, name: '개발실', color: PAL.blue, floor: '#d9e0ee', what: '코드 작성 · 수정' },
  elevator: { x: 0, y: 7, w: 7, d: 3, name: '엘리베이터 홀', color: PAL.sky, floor: '#ecebe4', what: '서브에이전트 출퇴근' },
  lounge: { x: 0, y: 10, w: 7, d: 7, name: '라운지', color: PAL.pink, floor: '#f1dfd3', what: '휴식 · 다음 지시 대기' },
  mydesk: { x: 8.6, y: 10.4, w: 7, d: 3.9, name: '내 자리', color: PAL.yellow, floor: '#f6e7b4', what: '질문 · 에이전트 호출 · 보고' },
  server: { x: 22, y: 12, w: 8, d: 6, name: '서버실', color: PAL.purple, floor: '#cfcadf', what: '명령 실행 · git' },
  info: { x: 10, y: 15.5, w: 10, d: 6.5, name: '정보검색실', color: PAL.sky, floor: '#d5ece9', what: '웹 · 외부 도구' },
}
// 터미널 격자에 놓는 순서
export const ROOM_ORDER: Room[] = ['meeting', 'library', 'dev', 'server', 'lounge', 'mydesk', 'info', 'elevator']

const SLOTS: Record<Room, [number, number][]> = {
  meeting: [[2.3, 2.05], [3.6, 2.05], [4.9, 2.05], [2.3, 4.75], [3.6, 4.75], [4.9, 4.75]],
  library: [[8.9, 5.3], [10.3, 5.3], [11.7, 5.3], [8.3, 1.6], [10.5, 1.6], [12.7, 1.6]],
  dev: [0, 1, 2, 3, 4, 5, 6, 7, 8].flatMap(k => [[15.825 + k * 1.65, 3.6], [15.825 + k * 1.65, 7.2]] as [number, number][]),
  server: [[23.9, 14.0], [25.3, 14.0], [26.7, 14.0], [28.1, 14.0], [23.9, 17.0], [25.3, 17.0]],
  info: [[11.2, 16.9], [13, 16.9], [16.8, 16.9], [18.6, 16.9], [12, 20.15], [15, 20.15]],
  mydesk: [[12.5, 13.1], [11.0, 13.3], [14.0, 13.3], [9.8, 13.8], [15, 13.8]],
  lounge: [[2.4, 12.9], [3.7, 12.9], [1.25, 13.6], [4.0, 15.4], [5.2, 14.6]],
  elevator: [[1.6, 8.5], [2.6, 7.9], [2.6, 9.2]],
}

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

/** 같은 방 사람들에게 자리를 나눠 줌 */
export function seats(workers: Worker[]): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>()
  const count: Partial<Record<Room, number>> = {}
  for (const w of workers) {
    const i = count[w.room] ?? 0
    count[w.room] = i + 1
    const sl = SLOTS[w.room]
    const s = sl[i % sl.length] ?? [ROOMS[w.room].x + 1, ROOMS[w.room].y + 1]
    const lap = Math.floor(i / sl.length) * 0.4
    out.set(w.id, [s[0] + lap, s[1] + lap])
  }
  return out
}

// ───────── SVG (아이소메트릭 2D) ─────────

const S = 13, C = 0.866
const iso = (x: number, y: number, z = 0): [number, number] => [(x - y) * C * S, (x + y) * 0.5 * S - z * S * 0.82]
const pts = (list: [number, number][]) => list.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')
const esc = (s: string) => s.replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m] as string)

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1, 7), 16)
  const t = amt > 0 ? 255 : 0, a = Math.abs(amt)
  const ch = (v: number) => Math.round(v + (t - v) * a)
  return '#' + ((1 << 24) | (ch(n >> 16) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).slice(1)
}

/** 높이 h의 상자: 윗면 + 앞쪽 두 면 (+y, +x) */
function isoBox(x: number, y: number, w: number, d: number, h: number, color: string): string {
  const top = pts([iso(x, y, h), iso(x + w, y, h), iso(x + w, y + d, h), iso(x, y + d, h)])
  const left = pts([iso(x, y + d, h), iso(x + w, y + d, h), iso(x + w, y + d, 0), iso(x, y + d, 0)])
  const right = pts([iso(x + w, y, h), iso(x + w, y + d, h), iso(x + w, y + d, 0), iso(x + w, y, 0)])
  return `<polygon points="${left}" fill="${shade(color, -0.12)}"/><polygon points="${right}" fill="${shade(color, -0.25)}"/><polygon points="${top}" fill="${color}"/>`
}

type Thing = { depth: number; svg: string }


function furniture(): Thing[] {
  const out: Thing[] = []
  const b = (x: number, y: number, w: number, d: number, h: number, c: string) => out.push({ depth: x + w + y + d, svg: isoBox(x, y, w, d, h, c) })
  b(1.6, 2.6, 4, 1.6, 0.75, '#d4bb93')
  for (let i = 0; i < 3; i++) b(7.3 + i * 2.2, 0.1, 2, 0.6, 2.2, '#7f5232')
  b(8.2, 3.6, 4, 1.1, 0.75, '#c9a06c')
  for (const row of [2.0, 5.6]) {
    b(15, row, 14.6, 1, 0.75, '#eef0f6')
    b(15, row, 14.6, 0.08, 1.25, '#6f8fe0')
    for (let k = 0; k < 9; k++) b(15.5 + k * 1.65, row + 0.25, 0.65, 0.06, 0.4 + 0.75, '#20232f')
  }
  for (const row of [12.6, 15.4]) for (let i = 0; i < 5; i++) b(23.4 + i * 1.4, row, 1, 0.9, 2.2, '#1c2233')
  b(10.4, 11.25, 4.3, 0.95, 0.78, '#2c3a6b')
  b(14.7, 10.2, 0.95, 2, 0.78, '#2c3a6b')
  b(2.9, 15.8, 2.6, 0.85, 0.6, '#8a5a3c')
  b(3.8, 10.08, 1, 0.75, 1.9, PAL.red)
  b(3.3, 14.6, 1.6, 0.8, 0.42, '#c9a06c')
  for (const x of [10.9, 12.7, 16.5, 18.3]) b(x, 15.9, 0.6, 0.5, 1.75, PAL.purple)
  for (const x of [11.2, 14.2, 17.2]) b(x, 18.9, 1.6, 0.8, 0.75, '#f2f3f8')
  b(0.2, 17.4, 1.2, 0.8, 0.7, '#e4e6ec')
  return out
}

/** 터미널 그림(▐▛███▜▌ / ▝▜█████▛▘ / ▘▘ ▝▝)을 칸 단위 사각형으로 옮긴 Clawd. 칸 0~18, 줄 0~5 */
const CLAWD_PIXELS: [number, number, number, number][] = [[3, 0, 12, 4], [1, 2, 2, 1], [15, 2, 2, 1], [4, 4, 1, 1], [6, 4, 1, 1], [11, 4, 1, 1], [13, 4, 1, 1]]

function clawd(w: Worker, sx: number, sy: number, from: [number, number] | undefined): string {
  const scale = w.isSub ? 0.85 : 1
  const pw = 2.8 * scale, ph = 4.2 * scale
  const ox = -9 * pw, oy = -5 * ph // 발끝 가운데가 (sx, sy)
  const r = (c: number, row: number, cw: number, rh: number, fill: string, extra = '') =>
    `<rect x="${(ox + c * pw).toFixed(1)}" y="${(oy + row * ph).toFixed(1)}" width="${(cw * pw).toFixed(1)}" height="${(rh * ph).toFixed(1)}" fill="${fill}"${extra}/>`
  const body = CLAWD_PIXELS.map(([c, row, cw, rh]) => r(c, row, cw, rh, CLAWD)).join('')
  const shadeSide = r(13.6, 0, 1.4, 4, shade(CLAWD, -0.18))
  const eyeH = (ph * (w.mood === 'stuck' ? 0.4 : 1)).toFixed(1)
  const eyeY = oy + ph * (w.mood === 'stuck' ? 1.4 : w.mood === 'think' ? 0.75 : 1)
  const blink = w.mood === 'stuck' ? '' : `<animate attributeName="height" values="${eyeH};${eyeH};0.5;${eyeH}" keyTimes="0;0.93;0.96;1" dur="4.2s" repeatCount="indefinite"/>`
  const eyes = [5, 12].map(c => `<rect x="${(ox + c * pw).toFixed(1)}" y="${eyeY.toFixed(1)}" width="${pw.toFixed(1)}" height="${eyeH}" fill="${EYE}">${blink}</rect>`).join('')
  const badge = w.isSub ? r(7.5, -0.7, 3, 0.7, w.color) : ''
  const motion = w.mood === 'stuck'
    ? `<animateTransform attributeName="transform" type="translate" values="-1 0;1 0;-1 0" dur="0.18s" repeatCount="indefinite"/>`
    : w.mood === 'work' || w.mood === 'think'
      ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -${w.mood === 'work' ? 2 : 1.2};0 0" dur="${w.mood === 'work' ? 0.45 : 1.4}s" repeatCount="indefinite"/>`
      : ''
  const walk = from && (Math.abs(from[0] - sx) > 0.5 || Math.abs(from[1] - sy) > 0.5)
    ? `<animateTransform attributeName="transform" type="translate" from="${(from[0] - sx).toFixed(1)} ${(from[1] - sy).toFixed(1)}" to="0 0" dur="1.1s" fill="freeze"/>`
    : ''
  const shadow = `<ellipse cx="0" cy="0" rx="${(8 * pw).toFixed(1)}" ry="${(1.6 * ph * 0.6).toFixed(1)}" fill="#1d2033" opacity="0.16"/>`
  return `<g transform="translate(${sx.toFixed(1)} ${sy.toFixed(1)})"><g>${walk}${shadow}<g>${motion}${body}${shadeSide}${eyes}${badge}</g></g></g>`
}

type Rect = { x: number; y: number; w: number; h: number }

/** 말풍선: 이미 놓인 풍선과 겹치면 위로 올림 */
function bubble(w: Worker, sx: number, sy: number, placed: Rect[]): string {
  const text = w.mood === 'think' ? '💭 고민 중…' : w.mood === 'stuck' ? '😣 ' + short(w.detail.replace(/^😣 막힘 · /, ''), 16) : short(w.detail, 18)
  if (!text) return ''
  const width = Math.min(150, 14 + [...text].length * 7.2)
  let top = sy - (w.isSub ? 30 : 34)
  for (let k = 0; k < 6; k++) {
    const hit = placed.find(r => sx - width / 2 < r.x + r.w && sx + width / 2 > r.x && top - 17 < r.y + r.h && top > r.y)
    if (!hit) break
    top = hit.y - 3
  }
  placed.push({ x: sx - width / 2, y: top - 17, w: width, h: 17 })
  const border = w.mood === 'stuck' ? PAL.red : w.mood === 'think' ? shade(PAL.purple, 0.35) : '#d6d9e4'
  const color = w.mood === 'stuck' ? PAL.red : w.mood === 'think' ? PAL.purple : '#1d2033'
  return `<g><rect x="${(sx - width / 2).toFixed(1)}" y="${(top - 17).toFixed(1)}" width="${width.toFixed(1)}" height="17" rx="8.5" fill="#fff" stroke="${border}"/>` +
    `<path d="M${(sx - 4).toFixed(1)} ${top.toFixed(1)} L${sx.toFixed(1)} ${(top + 5).toFixed(1)} L${(sx + 4).toFixed(1)} ${top.toFixed(1)}" fill="#fff" stroke="${border}"/>` +
    `<rect x="${(sx - 5).toFixed(1)}" y="${(top - 1.5).toFixed(1)}" width="10" height="2" fill="#fff"/>` +
    `<text x="${sx.toFixed(1)}" y="${(top - 5.2).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${color}">${esc(text)}</text></g>`
}

function nameTag(w: Worker, sx: number, sy: number): string {
  const name = short(w.name, 16)
  const width = 18 + [...name].length * 6.6
  return `<g><rect x="${(sx - width / 2).toFixed(1)}" y="${(sy + 3).toFixed(1)}" width="${width.toFixed(1)}" height="13" rx="6.5" fill="#fff" stroke="#e3e5ee"/>` +
    `<circle cx="${(sx - width / 2 + 7).toFixed(1)}" cy="${(sy + 9.5).toFixed(1)}" r="2.6" fill="${w.isSub ? w.color : PAL.blue}"/>` +
    `<text x="${(sx - width / 2 + 12).toFixed(1)}" y="${(sy + 12.6).toFixed(1)}" font-size="8.5" font-weight="700" fill="#1d2033">${esc(name)}</text></g>`
}

const FONT = 'Pretendard, Apple SD Gothic Neo, Malgun Gothic, Noto Sans KR, sans-serif'

/** 사무실 한 장. `prev`: 지난번에 그린 화면 위치, 다른 방으로 옮긴 사람은 거기서 걸어옴 */
export function officeSvg(o: Office, prev: Map<string, [number, number]>): { svg: string; drawn: Map<string, [number, number]> } {
  const GW = 30, GH = 22
  const parts: string[] = []
  // 바닥판과 뒷벽
  parts.push(isoBox(-0.25, -0.25, GW + 0.5, GH + 0.5, 0.3, '#d3d6e1'))
  parts.push(`<polygon points="${pts([iso(0, 0, 0.3), iso(GW, 0, 0.3), iso(GW, GH, 0.3), iso(0, GH, 0.3)])}" fill="#eceef3"/>`)
  parts.push(`<polygon points="${pts([iso(0, 0, 0.3), iso(GW, 0, 0.3), iso(GW, 0, 3.2), iso(0, 0, 3.2)])}" fill="#f4f5f9" stroke="#d9dce6"/>`)
  parts.push(`<polygon points="${pts([iso(0, 0, 0.3), iso(0, GH, 0.3), iso(0, GH, 3.2), iso(0, 0, 3.2)])}" fill="#e7e9f0" stroke="#d9dce6"/>`)
  for (let i = 0; i < 6; i++) {
    const x = 15 + i * 2.45
    parts.push(`<polygon points="${pts([iso(x, 0, 1.0), iso(x + 2, 0, 1.0), iso(x + 2, 0, 2.6), iso(x, 0, 2.6)])}" fill="#cfe9fb" stroke="#aab4c8"/>`)
  }
  parts.push(`<polygon points="${pts([iso(0, 7.5, 0.3), iso(0, 9.5, 0.3), iso(0, 9.5, 2.5), iso(0, 7.5, 2.5)])}" fill="#9aa3b8" stroke="#7b8199"/>`)
  for (const R of Object.values(ROOMS)) {
    parts.push(`<polygon points="${pts([iso(R.x, R.y, 0.3), iso(R.x + R.w, R.y, 0.3), iso(R.x + R.w, R.y + R.d, 0.3), iso(R.x, R.y + R.d, 0.3)])}" fill="${R.floor}" stroke="${shade(R.color, 0.25)}" stroke-width="1.2"/>`)
  }
  // 가구 (앞에 있는 것일수록 나중에)
  const things = furniture()
  things.sort((a, b) => a.depth - b.depth)
  parts.push(...things.map(t => t.svg))
  // 방 이름 (방의 가장 안쪽 모서리, 직원보다 아래)
  for (const R of Object.values(ROOMS)) {
    const [lx, ly] = iso(R.x + 0.5, R.y + 0.5, 0.3)
    const width = 12 + [...R.name].length * 8.4
    parts.push(`<g opacity="0.92"><rect x="${(lx - width / 2).toFixed(1)}" y="${(ly - 2).toFixed(1)}" width="${width.toFixed(1)}" height="14" rx="7" fill="#ffffff" stroke="${shade(R.color, 0.4)}"/>` +
      `<text x="${lx.toFixed(1)}" y="${(ly + 8.4).toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="800" fill="${shade(R.color, -0.3)}">${esc(R.name)}</text></g>`)
  }
  // 직원은 가구에 가리지 않게 맨 위에, 뒤에 있는 사람부터
  const pos = seats(o.workers)
  const drawn = new Map<string, [number, number]>()
  const people = o.workers.flatMap(w => {
    const p = pos.get(w.id)
    return p ? [{ w, p, at: iso(p[0], p[1], 0.3) }] : []
  }).sort((a, b) => a.p[0] + a.p[1] - (b.p[0] + b.p[1]))
  for (const { w, at: [sx, sy] } of people) {
    drawn.set(w.id, [sx, sy])
    parts.push(clawd(w, sx, sy, prev.get(w.id)))
  }
  for (const { w, at: [sx, sy] } of people) parts.push(nameTag(w, sx, sy))
  const placed: Rect[] = []
  for (const { w, at: [sx, sy] } of [...people].reverse()) parts.push(bubble(w, sx, sy, placed))
  const [x0] = iso(0, GH), [x1] = iso(GW, 0), [, y1] = iso(GW, GH)
  const vb = `${(x0 - 16).toFixed(0)} ${(-3.2 * S * 0.82 - 40).toFixed(0)} ${(x1 - x0 + 32).toFixed(0)} ${(y1 + 3.2 * S * 0.82 + 52).toFixed(0)}`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="680" font-family="${FONT}">${parts.join('')}</svg>`
  return { svg, drawn }
}
