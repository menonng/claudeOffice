import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { LogLine, Mood, Office, Room, Server, Worker } from '../types'
import { PAL, ROOMS, SUB_COLORS, short, toolDetail, toolRoom } from './office'

const PANE = 'agent-office'
const TITLE = 'Claude Office'
const MAIN = 'main'
const PORT = '8765' // office.py 의 기본 포트
const URL = `http://127.0.0.1:${PORT}`
const CHECK_EVERY = 30_000 // 서버가 살아 있는지 (다른 세션이 띄운 서버가 꺼지면 이어받음)
const DONE_TO_LOUNGE = 20_000 // 응답이 끝나고 라운지로 가기까지
const SUB_LEAVE = 4_000 // 서브에이전트가 일을 마치고 퇴근하기까지
const LOG_KEEP = 40
const THINK_TO_MEETING = 15_000 // 이만큼 넘게 고민하면 회의실로 (office.py 와 같은 규칙)
const MEETING_THINKERS = 3 // 이만큼 이상 함께 고민하면 다 같이 회의실로

const AGENT_TYPE_KO: Record<string, string> = {
  'general-purpose': '범용', Explore: '탐색', Plan: '설계', 'claude-code-guide': '가이드', 'statusline-setup': '설정',
}

const empty = (): Office => ({ workers: [], log: [], pending: [] })
const office = atom({ plugin: 'agent-office', key: 'office' } as const, empty())
const server = atom({ plugin: 'agent-office', key: 'server' } as const, { state: 'stopped', url: URL, note: '' } as Server)

// 이 세션이 띄운 office.py 와 그것을 띄운 파이썬 (모듈이 다시 읽히면 처음부터)
let child: AsyncGenerator<unknown, unknown> | null = null
let python = ''

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

async function setServer($: EngineInterface, state: Server['state'], note = '') {
  await update($, server, () => ({ state, url: URL, note }))
}

async function isUp($: EngineInterface): Promise<boolean> {
  try {
    return (await $.http.fetch(`${URL}/state`)).ok
  } catch {
    return false
  }
}

/**
 * 3D 사무실이 떠 있지 않으면 mod 폴더의 office.py 를 띄운다 (세션이 살아 있는 동안).
 * 다른 세션이 이미 띄웠으면 그것을 같이 쓴다. `open` 이면 띄우면서 브라우저도 연다.
 */
async function ensureServer($: EngineInterface, open: boolean) {
  if (await isUp($)) {
    if (!child) await setServer($, 'running', '다른 세션이 띄운 사무실을 같이 보는 중')
    return
  }
  if (child) return
  await setServer($, 'starting')
  const script = `${$.plugin.root}/office.py`
  // Windows 콘솔 인코딩에서 이모지 출력이 죽지 않게 UTF-8 로
  const env = { PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
  for (const py of python ? [python] : ['python3', 'python', 'py']) {
    const argv = [py, script, '--port', PORT, ...(open ? [] : ['--no-browser'])]
    const stream = $.process.spawn({ argv, cwd: $.plugin.root, env })
    let first: IteratorResult<unknown, unknown>
    try {
      first = await stream.next() // 실행할 수 없으면 여기서 실패
    } catch {
      continue
    }
    if (first.done) continue // 바로 끝남 (포트를 다른 프로그램이 쓰는 중 등)
    python = py
    child = stream
    await setServer($, 'running')
    void (async () => {
      try {
        for await (const piece of stream) void piece
      } catch {
        // 모듈이 다시 읽히거나 세션이 끝나면 여기로
      }
      if (child === stream) child = null
      await setServer($, (await isUp($)) ? 'running' : 'stopped', (await isUp($)) ? '다른 세션이 띄운 사무실을 같이 보는 중' : '')
    })()
    return
  }
  await setServer($, 'failed', '파이썬(python3 · python · py)을 찾지 못했어요')
}

async function openBrowser($: EngineInterface) {
  for (const py of python ? [python] : ['python3', 'python', 'py']) {
    try {
      const r = await $.process.run([py, '-m', 'webbrowser', '-t', URL])
      if (r.exitCode === 0) return true
    } catch {
      // 다음 파이썬으로
    }
  }
  return false
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'office', description: '3D 사무실을 브라우저에 열고 Claude Office 패널 보기' })
    await edit($, (o, now) => void mainOf(o, now))
    void $.ui.open({ id: PANE, title: TITLE })
    if (e.isInteractive) {
      void ensureServer($, true)
      $.clock.every(CHECK_EVERY, () => ensureServer($, false))
    }
    return next(e)
  })

  on('command.run', { command: 'office' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    await ensureServer($, false)
    const opened = await openBrowser($)
    return { text: opened ? `3D 사무실을 열었어요: ${URL}` : `브라우저를 열지 못했어요. 주소창에 ${URL} 를 넣어 주세요.` }
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
    // 오래 고민하면 회의실로 옮겨 보이게 다시 그림
    $.clock.after(THINK_TO_MEETING + 200, () => $.ui.invalidate('ui.render'))
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

  // 패널: 3D 사무실 주소와 상태, 지금 일하는 사람들, 최근 활동 (글자만)
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const o = await read($, office)
    const srv = await read($, server)
    const now = await $.clock.now()
    const thinkers = o.workers.filter(w => w.mood === 'think')
    const roomOf = (w: Worker): Room =>
      w.mood === 'think' && (thinkers.length >= MEETING_THINKERS || now - w.at > THINK_TO_MEETING) ? 'meeting' : w.room
    const mood = (w: Worker) =>
      w.mood === 'think' ? '💭 고민 중' : w.mood === 'stuck' ? w.detail : w.detail
    const stateText = { starting: '여는 중…', running: '열려 있음', stopped: '꺼짐', failed: '열지 못함' }[srv.state]
    const stateColor = { starting: PAL.orange, running: PAL.green, stopped: undefined, failed: PAL.red }[srv.state]
    return (
      <Box flexDirection="column" gap="sm">
        <Box flexDirection="row" gap="sm" alignItems="center">
          <Text color={stateColor} bold>● 3D 사무실 {stateText}</Text>
          <Text dimColor wrap="truncate">{srv.url}</Text>
          <Button key="open" label="브라우저에서 열기" onPress={async () => { await ensureServer($, false); await openBrowser($) }} />
        </Box>
        {srv.note ? <Text dimColor wrap="truncate">{srv.note}</Text> : null}
        <Box flexDirection="column">
          {o.workers.map(w => {
            const R = ROOMS[roomOf(w)]
            return (
              <Text wrap="truncate">
                <Text color={w.isSub ? w.color : PAL.blue}>● </Text>
                <Text bold>{w.name}</Text>
                <Text> · </Text>
                <Text color={R.color}>{R.name}</Text>
                <Text> · </Text>
                <Text color={w.mood === 'stuck' ? PAL.red : w.mood === 'think' ? PAL.purple : undefined} dimColor={w.mood === 'rest'}>{mood(w)}</Text>
              </Text>
            )
          })}
        </Box>
        <Box flexDirection="column">
          {o.log.slice(-4).reverse().map(l => (
            <Text wrap="truncate" dimColor={l.kind !== 'error'} color={l.kind === 'error' ? PAL.red : undefined}>
              {l.who} · {l.text}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })
}
