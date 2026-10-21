# agent-office

Claude Code 안에서 Claude가 지금 하는 일을 **Clawd가 일하는 사무실**로 채팅 옆 패널에 보여주는 mod입니다.
웹 대시보드(`office.py`)와 달리 따로 서버를 띄우지 않고, 세션의 도구 호출·턴 이벤트를 직접 받아 실시간으로 그립니다. 토큰은 쓰지 않습니다.

## 설치

Claude Code 프롬프트에서:

```
/plugin install agent-office --marketplace menonng/claudeoffice
```

마켓플레이스를 추가할지 물으면 `y`, 그다음 설치 범위를 고르면 됩니다. 세션을 시작하면 **Claude Office** 패널이 열리고, 닫았다면 `/office`로 다시 엽니다.

## 화면

- **데스크톱 · 모바일 · VS Code**: 3D 웹 대시보드에서 구워 낸 사무실 그림 위에 3D Clawd 스프라이트와 이름표·말풍선을 얹은 SVG. Clawd가 도구에 맞는 방으로 걸어가 일하고(일하는 동안 포즈가 번갈아 바뀜), 고민 중이면 눈이 위로 가며 💭, 도구가 실패하면 😣 막힘(빨간 풍선, 몸 떨림). 그림은 `tools/bake-mod-assets`로 다시 구울 수 있습니다.
- **CLI(터미널)**: 방마다 테두리 상자, 그 안에 터미널 Clawd 그림(`▐▛███▜▌`)과 이름·하는 일. 패널 폭에 따라 한 줄에 4 · 2 · 1개 방.
- 아래에 최근 활동 로그 6줄.

| 구역 | 도구 |
| --- | --- |
| 자료실 | Read · Glob · Grep · LS |
| 개발실 | Edit · Write · MultiEdit · NotebookEdit (그 밖의 도구) |
| 서버실 | Bash · BashOutput · KillShell · Monitor |
| 정보검색실 | WebSearch · WebFetch · ToolSearch · `mcp__*` |
| 회의실 | TodoWrite · Task* · 계획 모드 · Skill |
| 내 자리 | 지시 받기 · 보고 · AskUserQuestion · Agent |
| 라운지 | 응답이 끝나고 20초 뒤 휴식 |
| 엘리베이터 홀 | 서브에이전트 출근 · 퇴근 |

서브에이전트는 조금 작은 Clawd로, 머리에 색 명찰을 달고 Agent 호출 때 쓴 타입·설명으로 이름이 붙습니다(예: `탐색 · API 호출부 탐색`).

## 파일

```
.claude-plugin/plugin.json   매니페스트
hooks/register.tsx           이벤트 훅과 패널 그리기
hooks/office.ts              도구→구역 · 자리 · SVG 그리기
hooks/assets.ts              구워 둔 배경 · Clawd 스프라이트 · 자리 좌표 (자동 생성)
hooks/office.test.tsx        claude plugin test 로 돌리는 테스트
types/index.d.ts             $.state 계약
```
