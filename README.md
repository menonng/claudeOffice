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
  - 15초 넘게 고민하거나, 한 세션에서 셋 이상이 함께 고민하면 회의실로 모여서 고민합니다
- 자리는 방에 들어올 때 빈자리 중에서 무작위로 받고, 그 방에 있는 동안은 같은 자리를 지킵니다
- 서브에이전트는 Task를 맡길 때 쓴 타입·설명으로 이름이 붙습니다 (예: `범용 · T-013 부속 작업`, `탐색 · API 호출부 탐색`)
- 왼쪽 **층별 안내**: 프로젝트마다 한 층, 층 안에 최근 3일 세션 목록
- 오른쪽 **사무실 사람들**에서 직원을 누르면 카메라가 따라갑니다
- 오른쪽 아래 버튼으로 **사람 / 마스코트(Clawd)** 모드 전환 — 마스코트 모드에서 Claude와 서브에이전트는 Claude Code 마스코트 Clawd로 바뀌고(서브에이전트는 조금 작고 머리에 색 명찰), '나'는 사람 그대로
  - Clawd는 몸이 커서 의자에 앉지 않고, 가구·벽과 겹치지 않는 자리에 서서 일합니다(그 자리 의자는 치움)
  - 일할 땐 가구 쪽을, 고민할 땐 두리번, 막히면 이쪽을, 보고할 땐 나를, 라운지에선 서로를 봅니다
- 햇빛은 개발실 창문으로 들어와 그림자가 창문 반대쪽으로 집니다. 라운지·탕비실은 벽 없이 트여 있습니다
- 개발실은 넓은 책상 8개에 자리마다 다른 듀얼·트리플 모니터 구성(세로 모니터, 위아래 쌓기, 감싸는 배치, 백라이트)과 소품

## 조작

드래그로 이동, 휠·핀치로 확대/축소, ⌂ 버튼으로 처음 시점.

## Claude Code mod 로 자동 실행

이 저장소는 그대로 Claude Code mod `agent-office`이기도 합니다. 설치하면 Claude Code 세션을 시작할 때 이 3D 사무실(`office.py`)을 백그라운드로 띄우고 브라우저에 엽니다. 다른 세션이 이미 띄웠으면 그것을 같이 쓰고, 그 세션이 끝나 꺼지면 30초 안에 이어서 띄웁니다.

```
/plugin install agent-office --marketplace menonng/claudeoffice
```

- 채팅 옆 **Claude Office** 패널: 3D 사무실 주소와 상태, 지금 일하는 사람(방 · 하는 일), 최근 활동 4줄 (글자만)
- `/office`: 패널을 열고 3D 사무실을 브라우저에 다시 엶 (데스크톱 앱에서는 앱의 브라우저 창에 주소를 넣어 채팅 옆에 둘 수 있음)
- 파이썬(`python3` · `python` · `py` 중 있는 것)이 필요합니다. 내 컴퓨터에서 도는 세션(CLI · 데스크톱)에서만 볼 수 있고, 클라우드 세션은 서버가 클라우드에 떠서 보이지 않습니다
- 패널 안에 3D 를 그대로 넣지 않는 이유: mod 패널은 스크립트를 실행하지 않아 WebGL 을 그릴 수 없습니다

## 클라우드 세션도 보기 (선택)

claude.ai/code 의 클라우드 세션은 기록이 클라우드에 있어 그대로는 안 보입니다. 클라우드 세션의 mod 가 상태(누가 · 어느 방 · 무엇을, 짧은 한 줄)를 **Firebase 실시간 DB** 로 올리고, 내 컴퓨터의 `office.py` 가 그것을 실시간으로 받아 **☁ 층**으로 보여줍니다. 파일 내용은 보내지 않습니다.

1. **Firebase 실시간 DB 만들기 (무료)**
   - https://console.firebase.google.com → 프로젝트 추가
   - 빌드 → Realtime Database → 데이터베이스 만들기 → 위치(예: 싱가포르) → 잠금 모드로 시작
   - 규칙 탭에 아래를 붙여 넣고 게시: 24자 이상 비밀 키 아래만 읽고 쓸 수 있고, 맨 위 목록은 아무도 못 봄
     ```json
     { "rules": { "$key": { ".read": "$key.length >= 24", ".write": "$key.length >= 24" } } }
     ```
   - 데이터 탭 위의 DB 주소를 복사 (예: `https://내프로젝트-default-rtdb.asia-southeast1.firebasedatabase.app`)
2. **중계 주소 만들기**: `python office.py --new-relay-key` 로 비밀 키를 만들고, `DB 주소/비밀 키` 를 중계 주소로 씀
   (예: `https://내프로젝트-default-rtdb.asia-southeast1.firebasedatabase.app/Xq3...`)
3. **내 컴퓨터**: 환경 변수 `OFFICE_RELAY` 에 중계 주소를 넣고 Claude Code 를 다시 시작
   (Windows: `setx OFFICE_RELAY "중계 주소"` 후 새 창 · 앱 재시작. 또는 `python office.py --relay 중계 주소`)
4. **클라우드 환경** (claude.ai/code 세션 제목의 환경 메뉴 → 편집)
   - 환경 변수: `OFFICE_RELAY=중계 주소`
   - 네트워크: 허용 도메인에 DB 주소의 호스트 (예: `내프로젝트-default-rtdb.asia-southeast1.firebasedatabase.app`)
5. **클라우드 세션에서 mod 켜기**: 작업할 저장소의 `.claude/settings.json` 에 추가하고 커밋
   ```json
   {
     "extraKnownMarketplaces": { "office-mods": { "source": { "source": "github", "repo": "menonng/claudeOffice" } } },
     "enabledPlugins": { "agent-office@office-mods": true }
   }
   ```
   이 저장소가 비공개면 클라우드 세션이 받아오지 못하니, 공개로 바꾸거나 클라우드 환경이 이 저장소에 접근할 수 있어야 합니다.

클라우드 세션 패널 맨 위에 `☁ 클라우드 → 내 컴퓨터 3D 사무실 보내는 중` 이 뜨면 연결된 것입니다. 못 보내면 그 아래 줄에 이유가 나옵니다.

## 파일

```
office.py              서버 (tail + SSE, 클라우드 세션 중계 받기)
office.html            3D 화면
vendor/three.*.js      three.js r186 (MIT, vendor/three-LICENSE.txt)
.claude-plugin/        mod 매니페스트(plugin.json)와 마켓플레이스(marketplace.json)
hooks/register.tsx     mod: 3D 사무실 자동 실행, 세션 이벤트로 상태 패널
hooks/office.ts        mod: 도구 → 구역 매핑 (office.py 와 같은 규칙)
hooks/office.test.tsx  mod 테스트 (claude plugin test .)
types/index.d.ts       mod 의 $.state 계약
```
