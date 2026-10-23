import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-office',
  component: 'Pane',
  requestId: 'agent-office',
  props: {
    title: 'Claude Office',
    isFocused: false,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('도구 호출이 그 방에서 일하는 것으로 보이고, 이미 떠 있는 사무실을 같이 씀', async ($, on) => {
  on('clock.now', () => ({ value: 1_000 }))
  on('clock.every', () => ({ value: undefined }))
  mock.env(on, {}) // 내 컴퓨터 세션
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  // 다른 세션이 띄운 office.py 가 이미 응답함 → 새로 띄우지 않음
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: '{}' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/app.ts' })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /3D 사무실 열려 있음/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /자료실/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Read · app\.ts/ })).toBeDefined()
    await ui.unmount()
  }
})

test('클라우드 세션은 office.py 를 띄우지 않고 상태를 중계로 올림', async ($, on) => {
  const clock = mock.clock(on)
  mock.env(on, {
    CLAUDE_CODE_REMOTE: 'true',
    CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_test',
    OFFICE_RELAY: 'https://example-rtdb.firebasedatabase.app/KEY_abcdefghijklmnopqrstuvwxyz/',
  })
  const sent: { url: string; method?: string; body?: string }[] = []
  on('http.fetch', (_, e) => {
    sent.push({ url: e.url, method: e.init?.method, body: e.init?.body })
    return { value: { status: 200, ok: true, headers: {}, text: '{}' } }
  })
  let spawned = 0
  on('process.spawn', async function* () { spawned += 1; return { value: { code: 0, signal: null } } })
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/work/citiesCraftlines', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: '테스트 실행' })
  await clock.advance(1_500)

  expect(spawned).toBe(0)
  const put = sent.filter(s => s.method === 'PUT').at(-1)
  expect(put?.url).toBe('https://example-rtdb.firebasedatabase.app/KEY_abcdefghijklmnopqrstuvwxyz/sessions/cse_test.json')
  const body = JSON.parse(put?.body ?? '{}')
  expect(body.project).toBe('citiesCraftlines')
  expect(body.workers[0].room).toBe('server')
  expect(body.workers[0].detail).toBe('Bash · 테스트 실행')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /클라우드 → 내 컴퓨터 3D 사무실 보내는 중/ })).toBeDefined()
  await ui.unmount()
})
