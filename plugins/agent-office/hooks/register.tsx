import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { LogLine, Mood, Office, Room, Worker } from '../types'
import { CLAWD, PAL, ROOMS, ROOM_ORDER, SUB_COLORS, officeSvg, short, toolDetail, toolRoom } from './office'

const PANE = 'agent-office'
const TITLE = 'Claude Office'
const MAIN = 'main'
const DONE_TO_LOUNGE = 20_000 // 응답이 끝나고 라운지로 가기까지
const SUB_LEAVE = 4_000 // 서브에이전트가 일을 마치고 퇴근하기까지
const LOG_KEEP = 40

const AGENT_TYPE_KO: Record<string, string> = {
  'general-purpose': '범용', Explore: '탐색', Plan: '설계', 'claude-code-guide': '가이드', 'statusline-setup': '설정',
}

const empty = (): Office => ({ workers: [], log: [], pending: [] })
const office = atom({ plugin: 'agent-office', key: 'office' } as const, empty())

// 지난번 그림에서의 위치: 방을 옮긴 Clawd 가 걸어오게
let prevSvg = new Map<string, [number, number]>()

/** 사무실 상태를 한 번에 고침 (복사본에 fn 적용) */
async function edit($: EngineInterface, fn: (o: Office, now: number) => void) {
  const now = await $.clock.now()
  await update($, office, o => {
    const next: Office = { workers: o.workers.map(w => ({ ...w })), log: [...o.log], pending: [...o.pending] }
    fn(next, now)
    next.log = next.log.slice(-LOG_KEEP)
    return next
  })
}

function mainOf(o: Office, now: number): Worker {
  let w = o.workers.find(x => x.id === MAIN)
  if (!w) {
    w = { id: MAIN, name: 'Claude', isSub: false, color: PAL.blue, room: 'mydesk', mood: 'rest', detail: '출근', tools: 0, at: now }
    o.workers.unshift(w)
  }
  return w
}

function workerOf(o: Office, agentId: string | undefined, now: number): Worker | undefined {
  return agentId === undefined ? mainOf(o, now) : o.workers.find(x => x.id === agentId)
}

function set(w: Worker, now: number, room: Room, mood: Mood, detail: string) {
  w.room = room
  w.mood = mood
  w.detail = detail
  w.at = now
}

function log(o: Office, now: number, w: Worker, text: string, kind: LogLine['kind']) {
  o.log.push({ at: now, who: w.name, text, kind })
}

export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'office', description: 'Claude Office 사무실 패널 열기' })
    await edit($, (o, now) => void mainOf(o, now))
    void $.ui.open({ id: PANE, title: TITLE })
    return next(e)
  })

  on('command.run', { command: 'office' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Claude Office 패널을 열었어요.' }
  })

  // 턴 시작: 메인은 지시를 듣고, 서브에이전트는 엘리베이터에서 출근
  on('turn.start', async ($, e, next) => {
    const agentId = e.agentId
    await edit($, (o, now) => {
      if (agentId === undefined) {
        const w = mainOf(o, now)
        if (e.text.trim()) {
          set(w, now, 'mydesk', 'listen', '📝 ' + short(e.text, 40))
          log(o, now, w, '📝 ' + short(e.text, 90), 'prompt')
        } else {
          set(w, now, w.room, 'think', w.detail)
        }
        return
      }
      if (o.workers.some(x => x.id === agentId)) return
      const head = e.text.trim().slice(0, 120)
      let i = o.pending.findIndex(p => p.prompt && (p.prompt.trim().slice(0, 120) === head || head.startsWith(p.prompt.trim().slice(0, 60))))
      if (i < 0 && o.pending.length) i = 0
      const task = i >= 0 ? o.pending.splice(i, 1)[0] : undefined
      const name = task
        ? `${AGENT_TYPE_KO[task.type] ?? task.type} · ${short(task.description || task.prompt, 18)}`
        : '서브에이전트'
      const color = SUB_COLORS[o.workers.filter(x => x.isSub).length % SUB_COLORS.length] ?? PAL.green
      const w: Worker = { id: agentId, name, isSub: true, color, room: 'elevator', mood: 'listen', detail: '📋 ' + short(e.text, 30), tools: 0, at: now }
      o.workers.push(w)
      log(o, now, w, '📋 ' + short(e.text, 90), 'prompt')
    })
    return next(e)
  })

  // 모델에 요청을 보내는 동안: 고민 중
  on('turn.step', async function* ($, e, next) {
    const agentId = e.agentId
    await edit($, (o, now) => {
      const w = workerOf(o, agentId, now)
      if (w && w.mood !== 'stuck') set(w, now, w.room, 'think', w.detail)
    })
    return yield* next(e)
  })

  // 도구 호출: 그 도구의 방으로 가서 일함. 오류가 나면 막힘
  on('tool.call', async ($, e, next) => {
    const agentId = e.agentId
    const name = String(e.tool)
    const input = e as unknown as Record<string, unknown>
    const detail = toolDetail(name, input)
    await edit($, (o, now) => {
      const w = workerOf(o, agentId, now)
      if (!w) return
      set(w, now, toolRoom(name), 'work', detail)
      w.tools += 1
      log(o, now, w, detail, 'tool')
      if (name === 'Agent' || name === 'Task') {
        o.pending.push({
          prompt: typeof input.prompt === 'string' ? input.prompt.slice(0, 300) : '',
          description: typeof input.description === 'string' ? input.description : '',
          type: typeof input.subagent_type === 'string' ? input.subagent_type : 'general-purpose',
        })
        o.pending = o.pending.slice(-20)
      }
    })
    const ran = await next(e)
    if (ran.isError || ran.deny !== undefined) {
      const why = short(ran.deny ?? ran.text ?? '', 40)
      await edit($, (o, now) => {
        const w = workerOf(o, agentId, now)
        if (!w) return
        set(w, now, w.room, 'stuck', '😣 막힘 · ' + why)
        log(o, now, w, '😣 막힘 · ' + why, 'error')
      })
    }
    return ran
  }).catch(($, e, next) => next(e)) // 이 훅이 실패해도 도구 호출은 그대로 (이미 실행됐으면 그 결과를 다시 씀)

  // 턴 끝: 메인은 내 자리에서 보고하고 잠시 뒤 라운지로, 서브에이전트는 퇴근
  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    const said = short(e.answer, 60)
    let stamp = 0
    await edit($, (o, now) => {
      stamp = now
      const w = workerOf(o, agentId, now)
      if (!w) return
      if (e.isAborted) {
        set(w, now, w.room, 'rest', '⏹ 중단됨')
        log(o, now, w, '⏹ 중단됨', 'error')
      } else if (agentId === undefined) {
        set(w, now, 'mydesk', 'talk', said ? '💬 ' + said : '💬 보고')
        if (said) log(o, now, w, short(e.answer, 110), 'say')
      } else {
        set(w, now, 'elevator', 'rest', '👋 퇴근')
        if (said) log(o, now, w, short(e.answer, 110), 'say')
      }
    })
    if (agentId === undefined) {
      $.clock.after(DONE_TO_LOUNGE, () => edit($, (o, now) => {
        const w = o.workers.find(x => x.id === MAIN)
        if (w && w.at === stamp) set(w, now, 'lounge', 'rest', '☕ 다음 지시 기다리는 중')
      }))
    } else {
      $.clock.after(SUB_LEAVE, () => edit($, o => {
        o.workers = o.workers.filter(x => x.id !== agentId || x.at !== stamp)
      }))
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const o = await read($, office)
    const { Box, Text } = els
    const cols = e.props.bodyColumns
    const logs = o.log.slice(-6).reverse()
    const logList = (
      <Box flexDirection="column">
        {logs.map(l => (
          <Text wrap="truncate" color={l.kind === 'error' ? PAL.red : undefined} dimColor={l.kind === 'tool'}>
            {l.who} · {l.text}
          </Text>
        ))}
      </Box>
    )

    if (e.surface !== 'terminal') {
      const { Svg } = $.ui.resolve({ ...e, surface: e.surface })
      const { svg, drawn } = officeSvg(o, prevSvg)
      prevSvg = drawn
      const alt = o.workers.map(w => `${w.name}: ${ROOMS[w.room].name} · ${w.detail}`).join(', ') || '사무실이 비어 있어요'
      return (
        <Box flexDirection="column" gap="sm">
          <Svg source={svg} alt={alt} isInteractive />
          {logList}
        </Box>
      )
    }

    // 터미널: 방마다 테두리 상자, 그 안에 Clawd 픽셀 그림
    const perRow = cols >= 96 ? 4 : cols >= 48 ? 2 : 1
    const width = Math.max(14, Math.floor(cols / perRow))
    const rows: Room[][] = []
    for (let i = 0; i < ROOM_ORDER.length; i += perRow) rows.push(ROOM_ORDER.slice(i, i + perRow))
    const moodText = (w: Worker) =>
      w.mood === 'think' ? '💭 고민 중' : w.mood === 'stuck' ? '😣 ' + w.detail.replace(/^😣 막힘 · /, '') : w.detail
    return (
      <Box flexDirection="column">
        {rows.map(row => (
          <Box flexDirection="row">
            {row.map(room => {
              const R = ROOMS[room]
              const here = o.workers.filter(w => w.room === room)
              return (
                <Box flexDirection="column" borderStyle="round" borderColor={R.color} width={width} paddingX={1}>
                  <Text color={R.color} bold wrap="truncate">{R.name}</Text>
                  {here.length === 0 && <Text dimColor wrap="truncate">{R.what}</Text>}
                  {here.map(w => (
                    <Box flexDirection="column">
                      <Text color={CLAWD}>{w.isSub ? ' ▐▛█▜▌' : ' ▐▛███▜▌'}</Text>
                      <Text color={CLAWD}>{w.isSub ? '▝▜███▛▘' : '▝▜█████▛▘'}</Text>
                      <Text color={CLAWD}>{w.isSub ? '  ▘ ▝' : '  ▘▘ ▝▝'}</Text>
                      <Text wrap="truncate">
                        <Text color={w.isSub ? w.color : PAL.blue}>● </Text>
                        <Text bold>{w.name}</Text>
                      </Text>
                      <Text wrap="truncate" color={w.mood === 'stuck' ? PAL.red : w.mood === 'think' ? PAL.purple : undefined} dimColor={w.mood === 'rest'}>
                        {moodText(w)}
                      </Text>
                    </Box>
                  ))}
                </Box>
              )
            })}
          </Box>
        ))}
        {logList}
      </Box>
    )
  })
}
