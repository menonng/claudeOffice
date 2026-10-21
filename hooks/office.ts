// 사무실 구역 · 도구 → 구역 매핑 (office.py 와 같은 규칙)
import type { Room } from '../types'

export const PAL = {
  red: '#FF0045', orange: '#FF7E00', yellow: '#FFCC11', green: '#55BB44',
  sky: '#39C5BB', blue: '#3355BB', purple: '#660099', pink: '#FFB4CC',
}
export const SUB_COLORS = [PAL.green, PAL.purple, PAL.sky, PAL.red, PAL.orange, PAL.pink, PAL.yellow]

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

