#!/usr/bin/env python3
"""
Claude Office v4 — Claude Code가 지금 뭘 하는지 3D 사무실로 보여주는 로컬 대시보드.

동작 방식
  ~/.claude/projects/**/*.jsonl (Claude Code 세션 기록)을 tail 하면서
  세션·서브에이전트 상태를 SSE(/events)로 브라우저에 실시간 전송한다.
  Claude Code 자체는 건드리지 않고, 토큰도 전혀 쓰지 않는다. 파이썬 표준 라이브러리만 사용.

파일 구성
  office.py, office.html, vendor/three.module.js, vendor/three.core.js (같은 폴더)

실행
  python office.py            # http://127.0.0.1:8765 자동으로 열림
  python office.py --demo     # Claude Code 없이 가짜 세션으로 미리보기
  python office.py --no-browser --port 9000 --root D:/somewhere/.claude/projects

구역 매핑 (어디서 무엇을 하나)
  자료실      Read · Glob · Grep · LS                 파일 읽기 · 검색
  개발실      Edit · Write · MultiEdit · NotebookEdit  코드 작성 · 수정
  서버실      Bash · BashOutput · KillShell            명령 실행 · git
  정보검색실  WebSearch · WebFetch · mcp__*            웹 · 외부 도구
  회의실      TodoWrite · Task* · 계획 모드 · Skill    계획 · 할 일 · 스킬
  내 자리     AskUserQuestion · Task/Agent · 답변      질문 · 에이전트 호출 · 보고
  라운지      응답 끝 · 한동안 조용함                  휴식
  엘리베이터  서브에이전트 출퇴근
"""
import argparse
import collections
import getpass
import hashlib
import json
import os
import random
import secrets
import sys
import tempfile
import threading
import time
import urllib.request
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
HTML_FILE = HERE / "office.html"
THREE_VERSION = "0.186.1"      # vendor/ 에 함께 넣은 three.js 버전

LIST_WINDOW = 3 * 24 * 3600   # 사이드바(층별 안내)에 올릴 세션: 최근 3일
MAX_SESSIONS = 40             # 그중 최신 N개만
RECENT_WINDOW = 30 * 60       # 서브에이전트 파일은 최근 30분 것만
TAIL_BYTES = 512 * 1024       # 최근 파일을 처음 열 때 끝에서부터 읽을 양
TAIL_BYTES_OLD = 64 * 1024    # 오래된 파일은 제목만 얻을 정도로
DONE_TO_LOUNGE = 20           # 응답이 끝난 뒤 라운지로 가기까지(초)
QUIET_TO_LOUNGE = 120         # 진행 중인 도구 없이 조용하면 라운지로(초)
SUB_LEAVE_AFTER = 6           # 서브에이전트 일 끝나고 퇴근까지(초)
SUB_QUIET_LEAVE = 240         # 서브에이전트가 이만큼 조용하면 퇴근(초)
GONE_AFTER = 30 * 60          # 메인 세션이 이만큼 조용하면 사무실 비움(초)
THINK_TO_MEETING = 15         # 이만큼 넘게 고민하면 회의실로 가서 고민(초)
MEETING_THINKERS = 3          # 한 세션에서 이만큼 이상 함께 고민하면 다 같이 회의실로
RELAY_RETRY = 5               # 클라우드 중계(Firebase)가 끊기면 다시 붙기까지(초)

# 클라우드 세션의 mod 가 보낸 기분(mood) → 방별 자세
ROOM_POSE = {"library": "read", "dev": "type", "server": "rack", "info": "browse",
             "meeting": "meet", "mydesk": "ask", "lounge": "coffee", "elevator": "idle"}
RESCAN_EVERY = 3.0
POLL_EVERY = 0.4
LOG_KEEP = 60

AGENT_TYPE_KO = {"general-purpose": "범용", "Explore": "탐색", "Plan": "설계",
                 "claude-code-guide": "가이드", "statusline-setup": "설정"}

# ───────────────────────── 도구 → 구역/자세 ─────────────────────────

LIBRARY_TOOLS = {"Read", "Glob", "Grep", "LS", "NotebookRead"}
WEB_TOOLS = {"WebFetch", "WebSearch", "ToolSearch", "ListMcpResourcesTool", "ReadMcpResourceTool"}
SERVER_TOOLS = {"Bash", "BashOutput", "KillShell", "KillBash", "Monitor", "PowerShell"}
DEV_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
CALL_TOOLS = {"Task", "Agent", "AskUserQuestion", "SendMessage"}
MEETING_TOOLS = {"TodoWrite", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet",
                 "EnterPlanMode", "ExitPlanMode", "Skill", "SlashCommand"}


def tool_place(name):
    n = name or ""
    if n in LIBRARY_TOOLS:
        return "library", "read"
    if n in WEB_TOOLS or n.startswith("mcp__"):
        return "info", "browse"
    if n in SERVER_TOOLS:
        return "server", "rack"
    if n in DEV_TOOLS:
        return "dev", "type"
    if n in CALL_TOOLS:
        return "mydesk", "ask"
    if n in MEETING_TOOLS:
        return "meeting", "meet"
    return "dev", "type"


def short(text, n=60):
    if not isinstance(text, str):
        return ""
    s = " ".join(text.split())
    return s if len(s) <= n else s[: n - 1] + "…"


def tool_detail(name, inp):
    label = name.split("__")[-1] if name.startswith("mcp__") else name
    if isinstance(inp, dict):
        for k in ("description", "file_path", "notebook_path", "pattern", "command",
                  "query", "url", "skill", "subject", "question", "prompt", "path"):
            v = inp.get(k)
            if isinstance(v, str) and v.strip():
                if k in ("file_path", "notebook_path", "path"):
                    v = os.path.basename(v.rstrip("/\\")) or v
                return f"{label} · {short(v, 50)}"
        qs = inp.get("questions")
        if isinstance(qs, list) and qs and isinstance(qs[0], dict):
            return f"{label} · {short(qs[0].get('question', ''), 50)}"
    return label or "도구"


def result_text(item):
    c = item.get("content")
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return " ".join(x.get("text", "") for x in c if isinstance(x, dict))
    return ""


def parse_ts(ts):
    if not isinstance(ts, str):
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def project_from_dir(name):
    parts = [p for p in name.split("-") if p]
    return parts[-1] if parts else name


# ───────────────────────── 세션 상태 ─────────────────────────

class Agent:
    def __init__(self, key, is_sub, session, parent_session, project):
        self.key = key
        self.id = hashlib.md5(key.encode("utf-8")).hexdigest()[:10]
        self.is_sub = is_sub
        self.session = session
        self.parent_session = parent_session
        self.project = project
        self.cwd = ""
        self.title = ""
        self.first_prompt = ""
        self.label = ""
        self.room = "mydesk"
        self.pose = "idle"
        self.detail = "출근"
        self.say = ""
        self.last = 0.0
        self.done = False
        self.stuck = False
        self.busy = False
        self.busy_since = 0.0     # 고민(모델 응답 기다림)을 시작한 때
        self.thinks = 0
        self.pending = {}
        self.tasks = []           # 메인 에이전트가 맡긴 Task: (prompt, 설명, 타입)
        self.tools = 0
        self.first_seen = time.time()

    def name(self):
        if self.is_sub:
            return self.label or "서브에이전트"
        return "Claude"


class Watcher:
    def __init__(self, root):
        self.root = Path(root)
        self.offsets = {}
        self.agents = {}
        self.logs = collections.defaultdict(lambda: collections.deque(maxlen=LOG_KEEP))
        self.cond = threading.Condition()
        self.version = 0
        self.snapshot = "{}"
        self._last_scan = 0.0
        self._known = []
        self.remote = {}          # 클라우드 세션 id → mod 가 올린 상태 (Relay 스레드가 채움)
        self.remote_lock = threading.Lock()

    # ── 파일 찾기/읽기 ──
    def _list_files(self):
        now = time.time()
        if now - self._last_scan < RESCAN_EVERY:
            return self._known
        self._last_scan = now
        if not self.root.exists():
            self._known = []
            return self._known
        mains, subs = [], []
        try:
            for p in self.root.rglob("*.jsonl"):
                try:
                    m = p.stat().st_mtime
                except OSError:
                    continue
                if "subagents" in p.parts:
                    if now - m < RECENT_WINDOW or p in self.offsets:
                        subs.append(p)
                elif now - m < LIST_WINDOW:
                    mains.append((m, p))
        except OSError:
            return self._known
        mains.sort(reverse=True)
        self._known = [p for _, p in mains[:MAX_SESSIONS]] + subs
        return self._known

    def _read(self, path):
        try:
            st = path.stat()
        except OSError:
            return
        off = self.offsets.get(path)
        drop_first = False
        if off is None:
            tail = TAIL_BYTES if time.time() - st.st_mtime < RECENT_WINDOW else TAIL_BYTES_OLD
            off = max(0, st.st_size - tail)
            drop_first = off > 0
        if st.st_size < off:
            off, drop_first = 0, False
        if st.st_size == off:
            self.offsets[path] = off
            return
        try:
            with open(path, "rb") as f:
                f.seek(off)
                data = f.read()
        except OSError:
            return
        nl = data.rfind(b"\n")
        if nl < 0:
            self.offsets[path] = off
            return
        self.offsets[path] = off + nl + 1
        lines = data[: nl + 1].split(b"\n")
        if drop_first:
            lines = lines[1:]
        for raw in lines:
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except ValueError:
                continue
            if isinstance(obj, dict):
                self._handle(path, obj, st.st_mtime)

    # ── 한 줄 해석 ──
    def _main_of(self, a):
        if not a.is_sub:
            return a
        for b in self.agents.values():
            if not b.is_sub and b.session == a.parent_session:
                return b
        return None

    def _agent_for(self, path, obj):
        session = obj.get("sessionId") or path.stem
        if "subagents" in path.parts:
            # <프로젝트>/<세션>/subagents/[하위 폴더/…]agent-<id>.jsonl — 하위 폴더가 있을 수 있음
            key, is_sub = str(path), True
            i = len(path.parts) - 1 - path.parts[::-1].index("subagents")
            parent = path.parts[i - 1]
            proj_dir = path.parts[i - 2]
        elif obj.get("isSidechain"):
            key, is_sub = f"{path}#{obj.get('agentId', 'side')}", True
            parent, proj_dir = session, path.parent.name
        else:
            key, is_sub, parent, proj_dir = str(path), False, None, path.parent.name
        a = self.agents.get(key)
        if a is None:
            a = Agent(key, is_sub, session if not is_sub else f"{parent}:{path.stem}",
                      parent, project_from_dir(proj_dir))
            if not is_sub:
                a.session = path.stem
            self.agents[key] = a
        cwd = obj.get("cwd")
        if isinstance(cwd, str) and cwd and not is_sub:
            a.cwd = cwd
            a.project = os.path.basename(cwd.rstrip("/\\")) or a.project
        return a

    def _log(self, a, ts, text, kind="tool"):
        m = self._main_of(a)
        if m is None:
            return
        self.logs[m.id].append({"t": round(ts, 1), "who": a.name(), "sub": a.is_sub,
                                "text": text, "kind": kind})

    def _handle(self, path, obj, fallback_ts):
        kind = obj.get("type")
        if kind in ("summary", "custom-title", "ai-title"):
            title = obj.get("customTitle") or obj.get("aiTitle") or obj.get("summary") or obj.get("title")
            if isinstance(title, str) and title.strip() and "subagents" not in path.parts:
                a = self._agent_for(path, obj)
                if kind == "custom-title" or not a.title or kind == "ai-title":
                    a.title = short(title, 40)
            return
        if kind not in ("user", "assistant"):
            return
        a = self._agent_for(path, obj)
        ts = parse_ts(obj.get("timestamp")) or fallback_ts
        a.last = max(a.last, ts)
        msg = obj.get("message") or {}
        content = msg.get("content")

        if kind == "assistant":
            items = content if isinstance(content, list) else []
            used_tool = False
            for it in items:
                if not isinstance(it, dict):
                    continue
                t = it.get("type")
                if t == "tool_use":
                    name = it.get("name", "")
                    inp = it.get("input") if isinstance(it.get("input"), dict) else {}
                    a.room, a.pose = tool_place(name)
                    a.detail = tool_detail(name, inp)
                    a.pending[it.get("id")] = name
                    a.done = a.stuck = a.busy = False
                    a.tools += 1
                    used_tool = True
                    if name in ("Task", "Agent"):
                        a.tasks.append((str(inp.get("prompt", ""))[:300],
                                        str(inp.get("description", "")),
                                        str(inp.get("subagent_type", "general-purpose"))))
                        a.tasks = a.tasks[-20:]
                    self._log(a, ts, a.detail)
                elif t in ("thinking", "redacted_thinking"):
                    if not a.busy:
                        a.thinks += 1
                        a.busy_since = ts
                    a.busy, a.done, a.stuck = True, False, False
                    a.detail = "고민 중…"
                elif t == "text" and str(it.get("text", "")).strip():
                    txt = it.get("text")
                    a.room, a.pose = "mydesk", "talk"
                    a.say = short(txt, 120)
                    a.detail = "💬 " + short(txt, 50)
                    a.stuck = a.busy = False
                    self._log(a, ts, short(txt, 120), "say")
            if msg.get("stop_reason") == "end_turn" and not used_tool:
                a.done, a.busy = True, False
                a.pending.clear()
            return

        # user
        if obj.get("isMeta"):
            return
        if isinstance(content, str):
            self._prompt(a, content, ts)
            return
        if not isinstance(content, list):
            return
        for it in content:
            if not isinstance(it, dict):
                continue
            t = it.get("type")
            if t == "tool_result":
                a.pending.pop(it.get("tool_use_id"), None)
                if not a.busy:
                    a.thinks += 1
                    a.busy_since = ts
                a.busy = True
                if it.get("is_error"):
                    a.stuck = True
                    a.detail = "😣 막힘 · " + short(result_text(it), 50)
                    self._log(a, ts, a.detail, "error")
                else:
                    a.stuck = False
            elif t == "text":
                self._prompt(a, it.get("text", ""), ts)

    def _prompt(self, a, text, ts):
        text = text or ""
        if text.startswith("[Request interrupted"):
            a.done, a.busy = True, False
            a.pending.clear()
            a.detail = "중단됨"
            self._log(a, ts, "⏹ 중단됨", "error")
            return
        if text.lstrip().startswith("<"):
            return
        if a.is_sub and not a.label:
            a.label = self._sub_label(a, text)
        if not a.is_sub and not a.first_prompt:
            a.first_prompt = short(text, 40)
        a.room, a.pose = "mydesk", "listen"
        a.detail = "📝 " + short(text, 50)
        a.done = a.stuck = False
        a.busy, a.thinks, a.say = True, 1, ""
        a.busy_since = ts
        self._log(a, ts, ("📝 " if not a.is_sub else "📋 ") + short(text, 100), "prompt")

    def _sub_label(self, a, text):
        m = self._main_of(a)
        head = text.strip()[:120]
        if m:
            for i, (prompt, desc, typ) in enumerate(m.tasks):
                if prompt and (prompt.strip()[:120] == head or head.startswith(prompt.strip()[:60])):
                    m.tasks.pop(i)
                    return f"{AGENT_TYPE_KO.get(typ, typ)} · {short(desc or prompt, 20)}"
        return "범용 · " + short(text, 20)

    # ── 화면용 상태 ──
    def _build(self):
        now = time.time()
        agents, sessions, logs = [], [], {}
        mains = {a.session: a for a in self.agents.values() if not a.is_sub}
        for key, a in list(self.agents.items()):
            age = now - a.last
            if a.is_sub:
                if age > GONE_AFTER:
                    del self.agents[key]
                    continue
                if (a.done and age > SUB_LEAVE_AFTER) or (not a.pending and not a.busy and age > SUB_QUIET_LEAVE) \
                        or age > SUB_QUIET_LEAVE * 3:
                    continue
                parent = mains.get(a.parent_session)
                if not parent:
                    continue
                agents.append(self._view(a, parent.id, a.room, a.pose, a.detail, now))
                continue
            sessions.append({
                "id": a.id, "project": a.project or "?", "cwd": a.cwd,
                "session": a.session, "title": a.title or a.first_prompt or "제목 없는 세션",
                "last": round(a.last, 1),
                "present": age < GONE_AFTER,
                "working": bool(a.pending or a.busy) and age < QUIET_TO_LOUNGE,
            })
            if age >= GONE_AFTER:
                continue
            room, pose, detail = a.room, a.pose, a.detail
            if not a.pending and not a.busy and ((a.done and age > DONE_TO_LOUNGE) or age > QUIET_TO_LOUNGE):
                room, pose = "lounge", "coffee"
                detail = "☕ 다음 지시 기다리는 중" if a.done else "☕ 쉬는 중"
            agents.append(self._view(a, a.id, room, pose, detail, now))
            if now - a.last < 6 * 3600:
                logs[a.id] = list(self.logs.get(a.id, []))[-30:]
        self._build_remote(now, sessions, agents, logs)
        # 오래 고민하거나, 한 세션에서 여럿이 함께 고민하면 회의실에 모여서 고민
        thinking = collections.defaultdict(list)
        for v in agents:
            if v["busy"] and not v["stuck"]:
                thinking[v["session"]].append(v)
        for group in thinking.values():
            for v in group:
                if len(group) >= MEETING_THINKERS or now - v["thinkSince"] > THINK_TO_MEETING:
                    v["room"], v["pose"] = "meeting", "meet"
        sessions.sort(key=lambda s: -s["last"])
        agents.sort(key=lambda x: (x["since"], x["id"]))
        return json.dumps({"sessions": sessions, "agents": agents, "logs": logs},
                          ensure_ascii=False, separators=(",", ":"))

    # ── 클라우드 세션 (Relay 로 받은 상태) ──
    def remote_update(self, event, path, data):
        """Firebase 스트리밍의 put/patch 한 건을 반영. path 는 /sessions 아래 경로"""
        parts = [p for p in (path or "/").split("/") if p]
        with self.remote_lock:
            if not parts:
                if event == "put":
                    self.remote = dict(data) if isinstance(data, dict) else {}
                elif isinstance(data, dict):
                    for k, v in data.items():
                        if v is None:
                            self.remote.pop(k, None)
                        else:
                            self.remote[k] = v
                return
            sid = parts[0]
            if len(parts) == 1:
                if data is None:
                    self.remote.pop(sid, None)
                elif event == "put" or not isinstance(self.remote.get(sid), dict):
                    self.remote[sid] = data
                else:
                    self.remote[sid].update(data)
                return
            node = self.remote.setdefault(sid, {})   # 더 깊은 경로: 그 자리만 바꿈
            for key in parts[1:-1]:
                node = node[int(key)] if isinstance(node, list) else node.setdefault(key, {})
            last = parts[-1]
            if isinstance(node, list):
                i = int(last)
                if i < len(node):
                    node[i] = data
            elif data is None:
                node.pop(last, None)
            else:
                node[last] = data

    def _build_remote(self, now, sessions, agents, logs):
        with self.remote_lock:
            remote = json.loads(json.dumps(self.remote))
        for sid, snap in remote.items():
            if not isinstance(snap, dict):
                continue
            at = (snap.get("at") or 0) / 1000
            age = now - at
            sess_id = "R" + hashlib.md5(sid.encode("utf-8")).hexdigest()[:9]
            workers = [w for w in (snap.get("workers") or []) if isinstance(w, dict)]
            present = age < GONE_AFTER and not snap.get("ended")
            busy_moods = ("work", "think", "listen", "stuck")
            sessions.append({
                "id": sess_id, "project": f"☁ {snap.get('project') or '클라우드'}", "cwd": "클라우드 세션",
                "session": sid, "title": snap.get("title") or "클라우드 세션", "last": round(at, 1),
                "present": present,
                "working": present and age < QUIET_TO_LOUNGE and any(w.get("mood") in busy_moods for w in workers),
            })
            if not present:
                continue
            for w in workers:
                is_sub = bool(w.get("isSub"))
                if is_sub and age > QUIET_TO_LOUNGE:
                    continue   # 소식이 끊긴 세션: 서브에이전트는 퇴근
                room, mood, detail = w.get("room") or "mydesk", w.get("mood") or "rest", w.get("detail") or ""
                if age > QUIET_TO_LOUNGE and not is_sub:
                    room, mood, detail = "lounge", "rest", "☕ 쉬는 중"
                if room not in ROOM_POSE:
                    room = "mydesk"
                pose = {"talk": "talk", "listen": "listen"}.get(mood) or ("coffee" if room == "lounge" else
                                                                            "idle" if mood == "rest" else ROOM_POSE[room])
                w_at = (w.get("at") or 0) / 1000
                agents.append({
                    "id": "r" + hashlib.md5(f"{sid}/{w.get('id')}".encode("utf-8")).hexdigest()[:9],
                    "session": sess_id, "name": w.get("name") or "Claude", "sub": is_sub,
                    "room": room, "pose": pose, "detail": detail,
                    "say": detail.removeprefix("💬 ") if mood == "talk" else "",
                    "busy": mood == "think" and room != "lounge", "stuck": mood == "stuck",
                    "thinks": 1, "tools": w.get("tools") or 0, "thinkSince": round(w_at, 1),
                    "last": round(max(w_at, at), 1), "since": round(w_at, 1),
                })
            logs[sess_id] = [{"t": round((l.get("at") or 0) / 1000, 1), "who": l.get("who") or "", "sub": l.get("who") != "Claude",
                              "text": l.get("text") or "", "kind": l.get("kind") or "tool"}
                             for l in (snap.get("log") or []) if isinstance(l, dict)][-30:]

    @staticmethod
    def _view(a, session_id, room, pose, detail, now):
        quiet = now - a.last > QUIET_TO_LOUNGE
        return {
            "id": a.id, "session": session_id, "name": a.name(), "sub": a.is_sub,
            "room": room, "pose": pose, "detail": detail,
            "say": a.say if pose == "talk" else "",
            "busy": a.busy and not a.pending and not quiet and room != "lounge",
            "stuck": a.stuck and room != "lounge",
            "thinks": a.thinks, "tools": a.tools, "thinkSince": round(a.busy_since, 1),
            "last": round(a.last, 1), "since": round(a.first_seen, 1),
        }

    def loop(self):
        while True:
            try:
                for p in self._list_files():
                    self._read(p)
                snap = self._build()
            except Exception as e:  # 한 파일이 이상해도 사무실은 계속 영업
                print("⚠", e, file=sys.stderr)
                time.sleep(1)
                continue
            if snap != self.snapshot:
                with self.cond:
                    self.snapshot = snap
                    self.version += 1
                    self.cond.notify_all()
            time.sleep(POLL_EVERY)


# ───────────────────────── 클라우드 중계 (Firebase Realtime Database) ─────────────────────────

class Relay:
    """클라우드 세션의 mod 가 <OFFICE_RELAY>/sessions/<id> 에 올린 상태를 실시간으로 받아 Watcher 에 넣는다.
    Firebase REST 스트리밍(Accept: text/event-stream)의 put/patch 이벤트를 그대로 따른다."""

    def __init__(self, base, watcher):
        self.url = base.rstrip("/") + "/sessions.json"
        self.watcher = watcher
        self.state = "연결 중"

    def run(self):
        while True:
            try:
                req = urllib.request.Request(self.url, headers={"Accept": "text/event-stream"})
                with urllib.request.urlopen(req, timeout=90) as r:   # Firebase 는 30초마다 keep-alive
                    self.state = "연결됨"
                    event = None
                    for raw in r:
                        line = raw.decode("utf-8", "replace").rstrip("\r\n")
                        if line.startswith("event:"):
                            event = line[6:].strip()
                        elif line.startswith("data:") and event in ("put", "patch"):
                            msg = json.loads(line[5:])
                            self.watcher.remote_update(event, msg.get("path"), msg.get("data"))
                        elif line.startswith("data:") and event in ("cancel", "auth_revoked"):
                            raise RuntimeError(f"중계 거부: {event} (규칙·주소 확인)")
            except Exception as e:   # 끊기면 잠시 뒤 다시
                self.state = f"끊김 · {e}"
                print("⚠ 클라우드 중계:", e, file=sys.stderr)
            time.sleep(RELAY_RETRY)


# ───────────────────────── HTTP / SSE ─────────────────────────

def make_handler(watcher, user):
    head = lambda: '{"now":%.1f,"root":%s,"user":%s,' % (
        time.time(), json.dumps(str(watcher.root), ensure_ascii=False), json.dumps(user, ensure_ascii=False))

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _payload(self, snap):
            return head() + snap[1:]

        def _send(self, body, ctype, cache=False):
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "max-age=86400" if cache else "no-cache")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            route = self.path.split("?", 1)[0]
            if route in ("/", "/index.html"):
                try:
                    body = HTML_FILE.read_bytes()
                except OSError:
                    self.send_error(500, "office.html must be next to office.py")
                    return
                self._send(body, "text/html; charset=utf-8")
            elif route == "/state":
                self._send(self._payload(watcher.snapshot).encode("utf-8"), "application/json; charset=utf-8")
            elif route == "/events":
                self._sse()
            elif route.startswith("/vendor/") and route.endswith(".js") and "/" not in route[8:]:
                f = HERE / "vendor" / route[8:]
                if f.is_file():
                    self._send(f.read_bytes(), "text/javascript; charset=utf-8", cache=True)
                else:  # vendor 폴더가 없으면 CDN 으로 (인터넷 필요)
                    self.send_response(302)
                    self.send_header("Location", f"https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}/build/{route[8:]}")
                    self.end_headers()
            else:
                self.send_error(404)

        def _sse(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            last = -1
            try:
                while True:
                    with watcher.cond:
                        watcher.cond.wait_for(lambda: watcher.version != last, timeout=15)
                        v, snap = watcher.version, watcher.snapshot
                    if v != last:
                        self.wfile.write(("data: " + self._payload(snap) + "\n\n").encode("utf-8"))
                        last = v
                    else:
                        self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                pass

    return Handler


# ───────────────────────── 데모 모드 ─────────────────────────

def _now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


_lock = threading.Lock()


def _append(f, obj):
    obj.setdefault("timestamp", _now_iso())
    with _lock:
        f.parent.mkdir(parents=True, exist_ok=True)
        with open(f, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(obj, ensure_ascii=False) + "\n")


DEMO_TOOLS = [
    ("Read", {"file_path": "src/auth/session.py"}), ("Read", {"file_path": "README.md"}),
    ("Grep", {"pattern": "SERVICE_UNAVAILABLE"}), ("Glob", {"pattern": "**/*.ts"}),
    ("Bash", {"command": "pytest -q", "description": "테스트 실행"}),
    ("Bash", {"command": "git status", "description": "변경 사항 확인"}),
    ("Edit", {"file_path": "src/auth/session.py"}), ("Write", {"file_path": "src/utils/retry.py"}),
    ("WebSearch", {"query": "python SSE keep-alive"}), ("mcp__jira__get_issue", {"query": "NCCX-412"}),
    ("TodoWrite", {}), ("Skill", {"skill": "code-review"}),
]
DEMO_SAY = ["에러 구조를 확인했습니다. 원인은 토큰 만료 처리 누락이에요.",
            "DomainErrorType이 5종이고, 그중 SERVICE_UNAVAILABLE만 재시도 대상입니다.",
            "테스트 3개가 실패해서 고정 참조 위치를 단위로 다시 뽑아 두겠습니다.",
            "수정 완료했어요. 전체 테스트 통과합니다."]


def _demo_session(root, proj, cwd, sess, title, rng):
    f = root / proj / f"{sess}.jsonl"
    base = {"sessionId": sess, "cwd": cwd}
    _append(f, {"type": "summary", "summary": title})
    n = 0
    while True:
        _append(f, {**base, "type": "user", "message": {"role": "user", "content": rng.choice(
            ["로그인 버그 고쳐줘", "T-013 부속 작업 진행해줘", "테스트 보강하고 커밋까지"])}})
        for _ in range(rng.randint(6, 14)):
            time.sleep(rng.uniform(1.5, 3))
            if rng.random() < 0.35:
                _append(f, {**base, "type": "assistant", "message": {"role": "assistant",
                            "content": [{"type": "thinking", "thinking": ""}]}})
                time.sleep(rng.uniform(2, 4))
            if rng.random() < 0.2:
                _append(f, {**base, "type": "assistant", "message": {"role": "assistant",
                            "content": [{"type": "text", "text": rng.choice(DEMO_SAY[:3])}]}})
                time.sleep(rng.uniform(2, 3))
            n += 1
            tid = f"toolu_{sess}_{n}"
            if rng.random() < 0.18:
                _demo_task(root, proj, cwd, sess, base, f, tid, rng)
                continue
            name, inp = rng.choice(DEMO_TOOLS)
            _append(f, {**base, "type": "assistant", "message": {"role": "assistant", "content": [
                {"type": "tool_use", "id": tid, "name": name, "input": inp}]}})
            time.sleep(rng.uniform(2, 5))
            err = name == "Bash" and rng.random() < 0.3
            _append(f, {**base, "type": "user", "message": {"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": tid, "is_error": err,
                 "content": "FAILED tests/test_session.py::test_refresh - AssertionError" if err else "ok"}]}})
        _append(f, {**base, "type": "assistant", "message": {"role": "assistant", "stop_reason": "end_turn",
                    "content": [{"type": "text", "text": DEMO_SAY[3]}]}})
        time.sleep(rng.uniform(30, 45))


def _demo_task(root, proj, cwd, sess, base, f, tid, rng):
    jobs = [("T-013 부속 작업", "general-purpose"), ("T-007 슬라이스 분석", "general-purpose"),
            ("API 호출부 탐색", "Explore"), ("마이그레이션 설계", "Plan")]
    picks = rng.sample(jobs, rng.randint(1, 3))
    content = []
    for i, (desc, typ) in enumerate(picks):
        content.append({"type": "tool_use", "id": f"{tid}_{i}", "name": "Task",
                        "input": {"description": desc, "subagent_type": typ, "prompt": f"{desc}을(를) 맡아 진행해 주세요."}})
    _append(f, {**base, "type": "assistant", "message": {"role": "assistant", "content": content}})
    threads = []
    for i, (desc, typ) in enumerate(picks):
        sf = root / proj / sess / "subagents" / f"agent-{tid}-{i}.jsonl"
        th = threading.Thread(target=_demo_sub, args=(sf, sess, cwd, f"{desc}을(를) 맡아 진행해 주세요.",
                                                      random.Random(hash(sf) & 0xffff)), daemon=True)
        th.start()
        threads.append(th)
        time.sleep(0.6)
    for th in threads:
        th.join()
    _append(f, {**base, "type": "user", "message": {"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": f"{tid}_{i}", "content": "done"} for i in range(len(picks))]}})


def _demo_sub(sf, sess, cwd, prompt, rng):
    base = {"sessionId": sess, "cwd": cwd, "isSidechain": True}
    _append(sf, {**base, "type": "user", "message": {"role": "user", "content": prompt}})
    for k in range(rng.randint(3, 7)):
        time.sleep(rng.uniform(2, 4))
        name, inp = rng.choice(DEMO_TOOLS[:10])
        tid = f"{sf.stem}_{k}"
        _append(sf, {**base, "type": "assistant", "message": {"role": "assistant", "content": [
            {"type": "tool_use", "id": tid, "name": name, "input": inp}]}})
        time.sleep(rng.uniform(2, 4))
        _append(sf, {**base, "type": "user", "message": {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": tid, "content": "ok"}]}})
    _append(sf, {**base, "type": "assistant", "message": {"role": "assistant", "stop_reason": "end_turn",
                 "content": [{"type": "text", "text": "조사 결과 정리했습니다."}]}})


def start_demo():
    root = Path(tempfile.mkdtemp(prefix="claude-office-demo-"))
    specs = [("-home-me-nccx", "/home/me/nccx", "NCCX-TC Jira 티켓 문서 작업"),
             ("-home-me-mcp-hub", "/home/me/mcp-hub", "MCP 서버 연결 정리"),
             ("-home-me-2d-boxing", "/home/me/2d_boxing", "히트박스 판정 수정")]
    for i, (proj, cwd, title) in enumerate(specs):
        threading.Thread(target=_demo_session,
                         args=(root, proj, cwd, f"demo-{i + 1}", title, random.Random(i * 7 + 3)),
                         daemon=True).start()
        time.sleep(0.3)
    old = root / "-home-me-ai-playground" / "demo-old.jsonl"
    _append(old, {"type": "summary", "summary": "프롬프트 실험 정리"})
    _append(old, {"sessionId": "demo-old", "cwd": "/home/me/ai-playground", "type": "user",
                  "timestamp": "2026-01-01T00:00:00Z", "message": {"role": "user", "content": "정리해줘"}})
    t = time.time() - 3 * 3600
    os.utime(old, (t, t))
    return root


# ───────────────────────── main ─────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Claude Code 아이소메트릭 사무실")
    ap.add_argument("--port", type=int, default=int(os.environ.get("OFFICE_PORT", "8765")))
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--root", default=os.environ.get("CLAUDE_PROJECTS")
                    or str(Path.home() / ".claude" / "projects"))
    ap.add_argument("--user", default=None, help="'내 자리'에 표시할 이름")
    ap.add_argument("--demo", action="store_true", help="가짜 세션으로 미리보기")
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--relay", default=os.environ.get("OFFICE_RELAY"),
                    help="클라우드 세션 중계 주소 (Firebase DB 주소/비밀 키). 환경 변수 OFFICE_RELAY")
    ap.add_argument("--new-relay-key", action="store_true", help="중계 주소에 쓸 비밀 키를 하나 만들어 출력")
    args = ap.parse_args()
    if args.new_relay_key:
        print(secrets.token_urlsafe(24))
        return

    try:
        user = args.user or getpass.getuser()
    except Exception:
        user = "나"
    root = start_demo() if args.demo else Path(args.root).expanduser()
    watcher = Watcher(root)
    threading.Thread(target=watcher.loop, daemon=True).start()
    if args.relay:
        threading.Thread(target=Relay(args.relay, watcher).run, daemon=True).start()

    server = ThreadingHTTPServer((args.host, args.port), make_handler(watcher, user))
    server.daemon_threads = True
    url = f"http://{args.host}:{args.port}"
    print(f"🏢 Claude Office 영업 시작 → {url}")
    print(f"   지켜보는 폴더: {root}{'  (데모)' if args.demo else ''}")
    if args.relay:
        print(f"   클라우드 세션: {args.relay.split('/')[2]} 에서 받는 중")
    print("   종료: Ctrl+C")
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n퇴근합니다 👋")
    finally:
        server.server_close()


if __name__ == "__main__":
    sys.exit(main())
