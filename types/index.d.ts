/** 사무실의 구역: 도구마다 일하러 가는 방 */
export type Room = 'meeting' | 'library' | 'dev' | 'server' | 'info' | 'mydesk' | 'lounge' | 'elevator'

/** 지금 상태: 일하는 중, 고민 중, 막힘, 보고, 지시 듣기, 휴식 */
export type Mood = 'work' | 'think' | 'stuck' | 'talk' | 'listen' | 'rest'

export type Worker = {
  /** 'main' 또는 서브에이전트의 agentId */
  id: string
  name: string
  isSub: boolean
  /** 서브에이전트 명찰 색 */
  color: string
  room: Room
  mood: Mood
  detail: string
  tools: number
  /** 마지막으로 바뀐 때 (ms) */
  at: number
}

export type LogLine = { at: number; who: string; text: string; kind: 'tool' | 'say' | 'prompt' | 'error' }

/** 서브에이전트에게 맡긴 일: Agent 도구 호출의 prompt · description · 타입 */
export type PendingTask = { prompt: string; description: string; type: string }

export type Office = { workers: Worker[]; log: LogLine[]; pending: PendingTask[] }

/** 3D 사무실(office.py) 서버: 이 세션이 띄웠거나, 다른 세션이 이미 띄운 것을 같이 씀 */
export type Server = {
  state: 'starting' | 'running' | 'stopped' | 'failed'
  url: string
  /** 실패 이유나 '다른 세션의 서버' 같은 한 줄 */
  note: string
}

declare module 'claude-code' {
  interface PluginState {
    'agent-office': { office: Office; server: Server }
  }
}
