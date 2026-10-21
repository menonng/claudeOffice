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

test('도구 호출이 그 방에 Clawd 를 앉힘, 모든 화면에서', async ($, on) => {
  on('clock.now', () => ({ value: 1_000 }))
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/app.ts' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^자료실$/ }))?.text).toBe('자료실')
  expect((await ui.find({ type: 'Text', text: /Read · app\.ts/ }))).toBeDefined()
  await ui.unmount()

  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const pic = await ui.find({ type: 'Svg' })
    expect(pic).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Read · app\.ts/ })).toBeDefined()
    await ui.unmount()
  }
})
