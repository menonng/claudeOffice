# Claude Office

Claude Code가 지금 뭘 하고 있는지 **3D 사무실**로 실시간으로 보여주는 로컬 대시보드입니다.

- `~/.claude/projects/**/*.jsonl`(Claude Code 세션 기록)을 tail 해서 SSE(`/events`)로 브라우저에 보냅니다.
- Claude Code 자체는 건드리지 않고, **토큰을 전혀 쓰지 않습니다.**
- 서버는 파이썬 표준 라이브러리만 씁니다. 화면은 three.js(WebGL)이며 `vendor/`에 함께 들어 있어 인터넷 없이도 돌아갑니다.

## 실행

```bash
python office.py              # http://127.0.0.1:8765 자동으로 열림
python office.py --demo       # Claude Code 없이 가짜 세션으로 미리보기
python office.py --port 9000 --no-browser
python office.py --root D:/somewhere/.claude/projects --user VSM
```

환경 변수: `CLAUDE_PROJECTS`(세션 기록 폴더), `OFFICE_PORT`(포트)

## 어디서 무엇을 하나

| 구역 | 도구 | 의미 |
| --- | --- | --- |
| 자료실 | Read · Glob · Grep · LS | 파일 읽기 · 검색 |
| 개발실 | Edit · Write · MultiEdit · NotebookEdit | 코드 작성 · 수정 |
| 서버실 | Bash · BashOutput · KillShell | 명령 실행 · git |
| 정보검색실 | WebSearch · WebFetch · `mcp__*` | 웹 · 외부 도구 |
| 회의실 | TodoWrite · Task* · 계획 모드 · Skill | 계획 · 할 일 · 스킬 |
| 내 자리 | AskUserQuestion · Task/Agent · 답변 | 질문 · 에이전트 호출 · 보고 |
| 라운지 · 탕비실 | 응답 끝 · 한동안 조용함 | 휴식 · 다음 지시 대기 |
| 엘리베이터 홀 | — | 서브에이전트 출퇴근 |

- 도구 결과를 기다리거나 생각 중이면 그 자리에서 **💭 고민 중**(횟수 표시), 도구가 오류를 내면 **😣 막힘**
- 서브에이전트는 Task를 맡길 때 쓴 타입·설명으로 이름이 붙습니다 (예: `범용 · T-013 부속 작업`, `탐색 · API 호출부 탐색`)
- 왼쪽 **층별 안내**: 프로젝트마다 한 층, 층 안에 최근 3일 세션 목록
- 오른쪽 **사무실 사람들**에서 직원을 누르면 카메라가 따라갑니다
- 오른쪽 아래 버튼으로 **사람 / 마스코트(오리지널 캐릭터)** 모드 전환

## 조작

드래그로 이동, 휠·핀치로 확대/축소, ⌂ 버튼으로 처음 시점.

## 파일

```
office.py              서버 (tail + SSE)
office.html            3D 화면
vendor/three.*.js      three.js r186 (MIT, vendor/three-LICENSE.txt)
```
