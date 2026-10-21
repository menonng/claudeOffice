import { expect, test } from 'claude-code/testing'

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
