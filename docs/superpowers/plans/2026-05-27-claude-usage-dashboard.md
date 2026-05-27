# Claude Usage Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local Python toolkit that ingests `~/.claude/projects/*.jsonl` Claude Code session logs, tracks usage against Max 5x limits in SQLite, and exposes live state over MCP so other Claude sessions can forecast `go / caution / stop` before running tasks. Runs as four processes inside a persistent tmux session.

**Architecture:** Three roles, four processes, all sharing a single SQLite (WAL) database. An ingest daemon tails JSONL files with watchdog/fsevents; two Textual TUIs render fuel gauges and recent sessions; an MCP server exposes `get_state`, `forecast`, and `recent_sessions` tools over streamable HTTP. Tmux is the supervisor — each pane's `while :; do <cmd>; sleep N; done` wrapper provides crash-respawn.

**Tech Stack:** Python 3.12 · uv · typer (CLI) · watchdog (fsevents) · stdlib sqlite3 (WAL) · textual (TUI) · official `mcp` Python SDK (streamable HTTP) · pytest + pytest-asyncio + httpx (tests) · tomllib (config) · tmux + launchd (orchestration)

**Spec:** `docs/superpowers/specs/2026-05-27-claude-usage-dashboard-design.md`

---

## File structure (locked in before tasks)

```
claude-usage-dashboard/
├── pyproject.toml
├── uv.lock                                 # generated
├── .gitignore
├── .python-version
├── README.md
├── bin/
│   ├── claude-usage-up                     # tmux boot script
│   └── claude-usage-down                   # tmux teardown
├── config/
│   └── com.claude-usage.plist              # launchd template
├── src/claude_usage/
│   ├── __init__.py
│   ├── cli.py                              # typer entrypoint
│   ├── config.py                           # ~/.claude-usage/config.toml loader
│   ├── db.py                               # schema bootstrap, connection helpers
│   ├── extract.py                          # JSONL line → MessageRow (pure)
│   ├── ingest.py                           # cursor + per-file loop + watchdog glue
│   ├── windows.py                          # current_5h_window, weekly_hours_used (pure)
│   ├── forecast.py                         # forecast verdict logic (pure)
│   ├── mcp_server.py                       # streamable HTTP MCP server
│   └── tui/
│       ├── __init__.py
│       ├── gauge.py                        # Textual fuel gauge app
│       └── sessions.py                     # Textual sessions table app
└── tests/
    ├── conftest.py
    ├── fixtures/
    │   ├── sample_assistant_message.jsonl  # scrubbed real captures
    │   └── sample_session.jsonl
    ├── test_extract.py
    ├── test_windows.py
    ├── test_forecast.py
    ├── test_ingest_integration.py
    ├── test_mcp_integration.py
    └── test_bin_dry_run.py
```

Each file has one job:
- `extract.py` — pure parser, no I/O
- `windows.py` — pure SQL-or-list math against rows, no I/O beyond the cursor it's handed
- `forecast.py` — pure verdict logic
- `ingest.py` — only filesystem + DB writes
- `mcp_server.py` — only HTTP/MCP, delegates math to `windows.py` and `forecast.py`
- `tui/*.py` — only rendering, polls SQLite via `db.py`

---

### Task 1: Project scaffold

**Files:**
- Create: `pyproject.toml`
- Create: `.gitignore`
- Create: `.python-version`
- Create: `src/claude_usage/__init__.py`
- Create: `tests/conftest.py`
- Create: `README.md`

- [ ] **Step 1: Initialize git repo and the uv project**

```bash
cd "/Users/Kazim/CodingEnv/Claude Usage Dasboard"
git init
uv init --python 3.12 --package --name claude-usage
```

- [ ] **Step 2: Replace generated `pyproject.toml` with the full config**

```toml
[project]
name = "claude-usage"
version = "0.1.0"
description = "Local dashboard tracking Claude Code usage against Max 5x limits, exposed over MCP."
requires-python = ">=3.12"
dependencies = [
    "typer>=0.12",
    "watchdog>=4.0",
    "textual>=0.74",
    "mcp>=1.2",
]

[project.scripts]
claude-usage = "claude_usage.cli:app"

[dependency-groups]
dev = [
    "pytest>=8.3",
    "pytest-asyncio>=0.24",
    "httpx>=0.27",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 3: Create `.gitignore`**

```
__pycache__/
*.pyc
.venv/
.pytest_cache/
dist/
*.egg-info/
.superpowers/
```

- [ ] **Step 4: Create `.python-version`**

```
3.12
```

- [ ] **Step 5: Create empty `src/claude_usage/__init__.py` and `tests/conftest.py`**

`src/claude_usage/__init__.py`:
```python
__version__ = "0.1.0"
```

`tests/conftest.py`:
```python
import pytest
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def fixtures_dir() -> Path:
    return FIXTURES
```

- [ ] **Step 6: Sync the env and verify pytest can run**

```bash
uv sync
uv run pytest -q
```
Expected: `no tests ran in <Xs>` (no errors)

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml .gitignore .python-version src tests README.md uv.lock
git commit -m "chore: scaffold uv project with src layout"
```

---

### Task 2: DB schema and connection helper

**Files:**
- Create: `src/claude_usage/db.py`
- Test: `tests/test_db.py`

- [ ] **Step 1: Write the failing test**

`tests/test_db.py`:
```python
import sqlite3
from pathlib import Path
from claude_usage.db import open_db, ensure_schema


def test_open_db_creates_wal_database(tmp_path: Path):
    db_path = tmp_path / "usage.db"
    conn = open_db(db_path)
    ensure_schema(conn)

    journal = conn.execute("PRAGMA journal_mode").fetchone()[0]
    assert journal == "wal"

    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    assert {"messages", "ingest_cursor", "rate_windows"} <= tables
    conn.close()


def test_ensure_schema_is_idempotent(tmp_path: Path):
    db_path = tmp_path / "usage.db"
    conn = open_db(db_path)
    ensure_schema(conn)
    ensure_schema(conn)   # second call must not error
    conn.close()
```

- [ ] **Step 2: Verify it fails**

```bash
uv run pytest tests/test_db.py -v
```
Expected: `ModuleNotFoundError: No module named 'claude_usage.db'`

- [ ] **Step 3: Implement `db.py`**

```python
"""SQLite connection helpers and schema bootstrap."""
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    request_id        TEXT PRIMARY KEY,
    session_id        TEXT NOT NULL,
    project_path      TEXT NOT NULL,
    ts_utc            TEXT NOT NULL,
    model             TEXT NOT NULL,
    input_tokens      INTEGER NOT NULL,
    output_tokens     INTEGER NOT NULL,
    cache_read        INTEGER NOT NULL,
    cache_create_5m   INTEGER NOT NULL,
    cache_create_1h   INTEGER NOT NULL,
    service_tier      TEXT,
    source_file       TEXT NOT NULL,
    source_offset     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_messages_ts       ON messages(ts_utc);
CREATE INDEX IF NOT EXISTS ix_messages_session  ON messages(session_id);
CREATE INDEX IF NOT EXISTS ix_messages_model_ts ON messages(model, ts_utc);

CREATE TABLE IF NOT EXISTS ingest_cursor (
    source_file  TEXT PRIMARY KEY,
    last_offset  INTEGER NOT NULL,
    last_ts_utc  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_windows (
    window_start_utc TEXT PRIMARY KEY,
    window_end_utc   TEXT NOT NULL
);
"""


def open_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    return conn


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
```

- [ ] **Step 4: Run and verify**

```bash
uv run pytest tests/test_db.py -v
```
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add src/claude_usage/db.py tests/test_db.py
git commit -m "feat(db): add SQLite connection helper with WAL mode and schema bootstrap"
```

---

### Task 3: JSONL extraction (pure function, TDD)

**Files:**
- Create: `src/claude_usage/extract.py`
- Create: `tests/fixtures/sample_assistant_message.jsonl`
- Test: `tests/test_extract.py`

- [ ] **Step 1: Create the fixture**

`tests/fixtures/sample_assistant_message.jsonl` — a single line (one JSON object, no newline at start). Copy-paste this exact content:

```json
{"parentUuid":"8515bdd8-bb74-468d-9c55-c7707c92b2fa","isSidechain":false,"message":{"model":"claude-opus-4-7","id":"msg_012uw3TvEGpQ9mFVAG23PP46","type":"message","role":"assistant","content":[{"type":"text","text":"hello"}],"stop_reason":"end_turn","usage":{"input_tokens":6,"cache_creation_input_tokens":10822,"cache_read_input_tokens":16963,"output_tokens":316,"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":10822,"ephemeral_5m_input_tokens":0}}},"requestId":"req_011CaxLvNRmbTcgwaR9QyV2p","type":"assistant","uuid":"9bd60a1e-83d3-456a-afdc-968fa5ab4bb4","timestamp":"2026-05-12T08:17:05.848Z","cwd":"/Users/Kazim/CodingEnv","sessionId":"fe16106e-8416-4f40-a280-3e992f9e5c45"}
```

- [ ] **Step 2: Write the failing tests**

`tests/test_extract.py`:
```python
import json
from pathlib import Path
from claude_usage.extract import extract_usage, MessageRow


def test_extract_usage_from_assistant_message(fixtures_dir: Path):
    line = (fixtures_dir / "sample_assistant_message.jsonl").read_text().strip()
    row = extract_usage(line, source_file="/abs/path/x.jsonl", source_offset=0)
    assert isinstance(row, MessageRow)
    assert row.request_id == "req_011CaxLvNRmbTcgwaR9QyV2p"
    assert row.session_id == "fe16106e-8416-4f40-a280-3e992f9e5c45"
    assert row.project_path == "/Users/Kazim/CodingEnv"
    assert row.ts_utc == "2026-05-12T08:17:05.848Z"
    assert row.model == "claude-opus-4-7"
    assert row.input_tokens == 6
    assert row.output_tokens == 316
    assert row.cache_read == 16963
    assert row.cache_create_1h == 10822
    assert row.cache_create_5m == 0
    assert row.service_tier == "standard"


def test_extract_usage_skips_non_assistant_message():
    line = json.dumps({"type": "user", "message": {}})
    assert extract_usage(line, source_file="x", source_offset=0) is None


def test_extract_usage_skips_assistant_without_usage():
    line = json.dumps({"type": "assistant", "message": {"role": "assistant"}})
    assert extract_usage(line, source_file="x", source_offset=0) is None


def test_extract_usage_returns_none_on_malformed_json():
    assert extract_usage("{not json", source_file="x", source_offset=0) is None
```

- [ ] **Step 3: Verify they fail**

```bash
uv run pytest tests/test_extract.py -v
```
Expected: `ModuleNotFoundError: No module named 'claude_usage.extract'`

- [ ] **Step 4: Implement `extract.py`**

```python
"""Pure JSONL line → MessageRow extraction. No I/O."""
import json
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True, slots=True)
class MessageRow:
    request_id: str
    session_id: str
    project_path: str
    ts_utc: str
    model: str
    input_tokens: int
    output_tokens: int
    cache_read: int
    cache_create_5m: int
    cache_create_1h: int
    service_tier: Optional[str]
    source_file: str
    source_offset: int


def extract_usage(line: str, *, source_file: str, source_offset: int) -> Optional[MessageRow]:
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        return None

    if obj.get("type") != "assistant":
        return None
    msg = obj.get("message") or {}
    usage = msg.get("usage")
    if not usage:
        return None

    cache_creation = usage.get("cache_creation") or {}
    return MessageRow(
        request_id   = obj["requestId"],
        session_id   = obj["sessionId"],
        project_path = obj.get("cwd", ""),
        ts_utc       = obj["timestamp"],
        model        = msg.get("model", "unknown"),
        input_tokens    = int(usage.get("input_tokens", 0)),
        output_tokens   = int(usage.get("output_tokens", 0)),
        cache_read      = int(usage.get("cache_read_input_tokens", 0)),
        cache_create_5m = int(cache_creation.get("ephemeral_5m_input_tokens", 0)),
        cache_create_1h = int(cache_creation.get("ephemeral_1h_input_tokens", 0)),
        service_tier    = usage.get("service_tier"),
        source_file     = source_file,
        source_offset   = source_offset,
    )
```

- [ ] **Step 5: Run and verify**

```bash
uv run pytest tests/test_extract.py -v
```
Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add src/claude_usage/extract.py tests/test_extract.py tests/fixtures
git commit -m "feat(extract): pure JSONL → MessageRow parser with TDD coverage"
```

---

### Task 4: 5-hour window detection (pure function, TDD)

**Files:**
- Create: `src/claude_usage/windows.py`
- Test: `tests/test_windows.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_windows.py`:
```python
from datetime import datetime, timedelta, timezone
from claude_usage.windows import current_5h_window, msgs_in_window


UTC = timezone.utc


def ts(minutes_ago: int, *, now: datetime) -> str:
    return (now - timedelta(minutes=minutes_ago)).isoformat().replace("+00:00", "Z")


def test_no_messages_returns_none():
    now = datetime(2026, 5, 27, 17, 0, tzinfo=UTC)
    assert current_5h_window([], now=now) is None


def test_only_old_messages_returns_none():
    now = datetime(2026, 5, 27, 17, 0, tzinfo=UTC)
    msgs = [ts(6 * 60, now=now)]   # 6h ago, outside any active window
    assert current_5h_window(msgs, now=now) is None


def test_single_recent_message_starts_window():
    now = datetime(2026, 5, 27, 17, 0, tzinfo=UTC)
    msgs = [ts(30, now=now)]
    start, end = current_5h_window(msgs, now=now)
    assert (now - start).total_seconds() == 30 * 60
    assert (end - start) == timedelta(hours=5)


def test_window_anchors_on_first_message_after_gap():
    # Two clusters: one at -6h (closed window), one at -10min (current window).
    now = datetime(2026, 5, 27, 17, 0, tzinfo=UTC)
    msgs = [
        ts(6 * 60, now=now),     # 6h ago — outside current window
        ts(20, now=now),         # 20 min ago — starts the current window
        ts(10, now=now),         # within current window
    ]
    start, end = current_5h_window(msgs, now=now)
    assert (now - start).total_seconds() == 20 * 60


def test_msgs_in_window_counts_inclusive():
    now = datetime(2026, 5, 27, 17, 0, tzinfo=UTC)
    msgs = [ts(20, now=now), ts(10, now=now), ts(0, now=now)]
    start, end = current_5h_window(msgs, now=now)
    assert msgs_in_window(msgs, start=start, end=end) == 3
```

- [ ] **Step 2: Verify they fail**

```bash
uv run pytest tests/test_windows.py -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 3: Implement `windows.py`** (5-hour window portion only — weekly comes in next task)

```python
"""Pure functions over message timestamps. No I/O."""
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

WINDOW = timedelta(hours=5)


def _parse(ts: str) -> datetime:
    # Accept both "...Z" and "+00:00".
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def current_5h_window(
    timestamps: Iterable[str],
    *,
    now: datetime,
) -> Optional[tuple[datetime, datetime]]:
    """Return (start, end) of the active 5-hour window, or None if no window is active."""
    sorted_ts = sorted(_parse(t) for t in timestamps)
    if not sorted_ts:
        return None
    if now - sorted_ts[-1] > WINDOW:
        return None

    # Walk backwards from now: the window started at the earliest message
    # that isn't preceded by another within 5 hours.
    start = sorted_ts[-1]
    for prev, curr in zip(sorted_ts, sorted_ts[1:]):
        if curr - prev <= WINDOW:
            start = min(start, prev)
        else:
            start = curr
    # Final sweep: the actual start is the first message in the contiguous tail.
    contiguous_start = sorted_ts[-1]
    for t in reversed(sorted_ts[:-1]):
        if contiguous_start - t <= WINDOW:
            contiguous_start = t
        else:
            break
    return contiguous_start, contiguous_start + WINDOW


def msgs_in_window(
    timestamps: Iterable[str],
    *,
    start: datetime,
    end: datetime,
) -> int:
    return sum(1 for t in timestamps if start <= _parse(t) <= end)
```

- [ ] **Step 4: Run and verify**

```bash
uv run pytest tests/test_windows.py -v
```
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add src/claude_usage/windows.py tests/test_windows.py
git commit -m "feat(windows): 5-hour window detection with TDD coverage"
```

---

### Task 5: Weekly model-family hours (pure function, TDD)

**Files:**
- Modify: `src/claude_usage/windows.py` (add weekly logic)
- Modify: `tests/test_windows.py` (add weekly tests)

- [ ] **Step 1: Add the failing tests**

Append to `tests/test_windows.py`:
```python
from claude_usage.windows import weekly_hours_used, model_family


def test_model_family_buckets():
    assert model_family("claude-opus-4-7") == "opus"
    assert model_family("claude-sonnet-4-6") == "sonnet"
    assert model_family("claude-haiku-4-5") == "haiku"
    assert model_family("some-future-model") == "other"


def test_weekly_hours_counts_distinct_minute_buckets():
    # Three messages within the same minute should count as 1/60 hour, not 3/60.
    base = datetime(2026, 5, 27, 12, 0, tzinfo=UTC)
    msgs = [
        (base.isoformat().replace("+00:00", "Z"), "claude-opus-4-7"),
        ((base + timedelta(seconds=5)).isoformat().replace("+00:00", "Z"), "claude-opus-4-7"),
        ((base + timedelta(seconds=59)).isoformat().replace("+00:00", "Z"), "claude-opus-4-7"),
        ((base + timedelta(minutes=1)).isoformat().replace("+00:00", "Z"), "claude-opus-4-7"),
    ]
    now = base + timedelta(hours=1)
    hours = weekly_hours_used(msgs, family="opus", now=now)
    assert hours == 2 / 60   # exactly 2 minute-buckets


def test_weekly_hours_excludes_older_than_7_days():
    base = datetime(2026, 5, 27, 12, 0, tzinfo=UTC)
    msgs = [
        ((base - timedelta(days=8)).isoformat().replace("+00:00", "Z"), "claude-opus-4-7"),
        (base.isoformat().replace("+00:00", "Z"), "claude-opus-4-7"),
    ]
    assert weekly_hours_used(msgs, family="opus", now=base) == 1 / 60
```

- [ ] **Step 2: Verify they fail**

```bash
uv run pytest tests/test_windows.py -v
```
Expected: 3 new failures (`ImportError`)

- [ ] **Step 3: Extend `windows.py`**

Append to `src/claude_usage/windows.py`:
```python
WEEK = timedelta(days=7)


def model_family(model: str) -> str:
    m = model.lower()
    if "opus" in m:   return "opus"
    if "sonnet" in m: return "sonnet"
    if "haiku" in m:  return "haiku"
    return "other"


def weekly_hours_used(
    messages: Iterable[tuple[str, str]],   # (ts_utc, model)
    *,
    family: str,
    now: datetime,
) -> float:
    """Approximate weekly active-use hours for a model family.

    Counts the number of distinct one-minute buckets within the rolling 7-day
    window that contain at least one message of the given family.
    """
    cutoff = now - WEEK
    minute_buckets: set[tuple[int, int, int, int, int]] = set()
    for ts, model in messages:
        if model_family(model) != family:
            continue
        t = _parse(ts)
        if t < cutoff:
            continue
        minute_buckets.add((t.year, t.month, t.day, t.hour, t.minute))
    return len(minute_buckets) / 60.0
```

- [ ] **Step 4: Run and verify**

```bash
uv run pytest tests/test_windows.py -v
```
Expected: 8 passed (5 prior + 3 new)

- [ ] **Step 5: Commit**

```bash
git add src/claude_usage/windows.py tests/test_windows.py
git commit -m "feat(windows): weekly per-family hours via distinct minute buckets"
```

---

### Task 6: Forecast verdict logic (pure function, TDD)

**Files:**
- Create: `src/claude_usage/forecast.py`
- Test: `tests/test_forecast.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_forecast.py`:
```python
from claude_usage.forecast import forecast, Verdict


def base_state(**overrides):
    s = {
        "msgs_in_window": 50,
        "observed_cap_5h": 200,
        "weekly_hours_used": 5.0,
        "observed_cap_weekly": 20.0,
        "avg_minutes_per_msg": 1.0,
    }
    s.update(overrides)
    return s


def test_low_usage_returns_go():
    v = forecast(planned_msgs=10, model="opus", state=base_state())
    assert v["verdict"] == "go"
    assert v["window_ok"] is True
    assert v["weekly_ok"] is True


def test_high_usage_returns_caution_at_75_percent():
    # 50 used + 100 planned = 150 / 200 = 0.75 → caution
    v = forecast(planned_msgs=100, model="opus", state=base_state())
    assert v["verdict"] == "caution"


def test_very_high_usage_returns_stop_at_95_percent():
    # 50 + 140 = 190 / 200 = 0.95 → stop
    v = forecast(planned_msgs=140, model="opus", state=base_state())
    assert v["verdict"] == "stop"
    assert v["window_ok"] is False


def test_weekly_dominates_when_higher_than_5h():
    # 5h cap fine, weekly almost exhausted: 19 / 20 = 0.95 → stop
    v = forecast(planned_msgs=1, model="opus", state=base_state(weekly_hours_used=19.0))
    assert v["verdict"] == "stop"
    assert v["weekly_ok"] is False


def test_custom_thresholds_override_defaults():
    v = forecast(planned_msgs=10, model="opus", state=base_state(),
                 caution_threshold=0.10, stop_threshold=0.20)
    # 60/200 = 0.30 → above stop
    assert v["verdict"] == "stop"
```

- [ ] **Step 2: Verify they fail**

```bash
uv run pytest tests/test_forecast.py -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 3: Implement `forecast.py`**

```python
"""Pure verdict logic. State comes in, verdict goes out."""
from typing import Literal, TypedDict


class Verdict(TypedDict):
    verdict: Literal["go", "caution", "stop"]
    reason: str
    window_ok: bool
    weekly_ok: bool
    headroom_msgs_5h: int
    headroom_hours_weekly: float
    projected_pct_5h: float
    projected_pct_weekly: float


def forecast(
    *,
    planned_msgs: int,
    model: str,
    state: dict,
    caution_threshold: float = 0.75,
    stop_threshold: float = 0.95,
) -> Verdict:
    msgs_in_window      = state["msgs_in_window"]
    cap_5h              = state["observed_cap_5h"]
    weekly_hours        = state["weekly_hours_used"]
    cap_weekly          = state["observed_cap_weekly"]
    avg_min_per_msg     = state["avg_minutes_per_msg"]

    projected_msgs_5h   = msgs_in_window + planned_msgs
    projected_pct_5h    = projected_msgs_5h / cap_5h if cap_5h else 0.0

    projected_weekly_h  = weekly_hours + (planned_msgs * avg_min_per_msg) / 60.0
    projected_pct_weekly = projected_weekly_h / cap_weekly if cap_weekly else 0.0

    worst = max(projected_pct_5h, projected_pct_weekly)
    if worst >= stop_threshold:
        verdict = "stop"
    elif worst >= caution_threshold:
        verdict = "caution"
    else:
        verdict = "go"

    window_ok = projected_pct_5h     < stop_threshold
    weekly_ok = projected_pct_weekly < stop_threshold

    if worst == projected_pct_5h:
        reason = f"5h window projection: {projected_msgs_5h}/{cap_5h} ({projected_pct_5h:.0%})"
    else:
        reason = f"weekly projection: {projected_weekly_h:.1f}/{cap_weekly}h ({projected_pct_weekly:.0%})"

    return Verdict(
        verdict=verdict,
        reason=reason,
        window_ok=window_ok,
        weekly_ok=weekly_ok,
        headroom_msgs_5h=max(0, cap_5h - projected_msgs_5h),
        headroom_hours_weekly=max(0.0, cap_weekly - projected_weekly_h),
        projected_pct_5h=projected_pct_5h,
        projected_pct_weekly=projected_pct_weekly,
    )
```

- [ ] **Step 4: Run and verify**

```bash
uv run pytest tests/test_forecast.py -v
```
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add src/claude_usage/forecast.py tests/test_forecast.py
git commit -m "feat(forecast): go/caution/stop verdict against 5h + weekly projections"
```

---

### Task 7: Config loader

**Files:**
- Create: `src/claude_usage/config.py`
- Test: `tests/test_config.py`

- [ ] **Step 1: Write failing tests**

`tests/test_config.py`:
```python
from pathlib import Path
from claude_usage.config import load_config, Config


def test_load_config_defaults_when_file_missing(tmp_path: Path):
    cfg = load_config(tmp_path / "missing.toml")
    assert isinstance(cfg, Config)
    assert cfg.msgs_per_5h_window is None
    assert cfg.weekly_opus_hours is None
    assert cfg.weekly_sonnet_hours is None
    assert cfg.caution_threshold == 0.75
    assert cfg.stop_threshold == 0.95
    assert cfg.mcp_host == "127.0.0.1"
    assert cfg.mcp_port == 7878


def test_load_config_reads_overrides(tmp_path: Path):
    path = tmp_path / "config.toml"
    path.write_text("""
[caps]
msgs_per_5h_window  = 220
weekly_opus_hours   = 30.0
weekly_sonnet_hours = 250.0

[forecast]
caution_threshold = 0.80
stop_threshold    = 0.97

[mcp]
host = "0.0.0.0"
port = 9000
""")
    cfg = load_config(path)
    assert cfg.msgs_per_5h_window == 220
    assert cfg.weekly_opus_hours == 30.0
    assert cfg.weekly_sonnet_hours == 250.0
    assert cfg.caution_threshold == 0.80
    assert cfg.stop_threshold == 0.97
    assert cfg.mcp_host == "0.0.0.0"
    assert cfg.mcp_port == 9000
```

- [ ] **Step 2: Verify they fail**

```bash
uv run pytest tests/test_config.py -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 3: Implement `config.py`**

```python
"""Load ~/.claude-usage/config.toml or return defaults."""
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass(frozen=True)
class Config:
    msgs_per_5h_window:  Optional[int]   = None
    weekly_opus_hours:   Optional[float] = None
    weekly_sonnet_hours: Optional[float] = None
    caution_threshold:   float = 0.75
    stop_threshold:      float = 0.95
    mcp_host:            str   = "127.0.0.1"
    mcp_port:            int   = 7878


def load_config(path: Path) -> Config:
    if not path.exists():
        return Config()
    data = tomllib.loads(path.read_text())
    caps     = data.get("caps", {})
    forecast = data.get("forecast", {})
    mcp      = data.get("mcp", {})
    return Config(
        msgs_per_5h_window  = caps.get("msgs_per_5h_window"),
        weekly_opus_hours   = caps.get("weekly_opus_hours"),
        weekly_sonnet_hours = caps.get("weekly_sonnet_hours"),
        caution_threshold   = forecast.get("caution_threshold", 0.75),
        stop_threshold      = forecast.get("stop_threshold", 0.95),
        mcp_host            = mcp.get("host", "127.0.0.1"),
        mcp_port            = mcp.get("port", 7878),
    )


DEFAULT_PATH = Path.home() / ".claude-usage" / "config.toml"
```

- [ ] **Step 4: Run and verify**

```bash
uv run pytest tests/test_config.py -v
```
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add src/claude_usage/config.py tests/test_config.py
git commit -m "feat(config): TOML loader with documented defaults"
```

---

### Task 8: Ingest — per-file processing (integration test)

**Files:**
- Create: `src/claude_usage/ingest.py` (first half: per-file processor)
- Create: `tests/fixtures/sample_session.jsonl`
- Test: `tests/test_ingest_integration.py`

- [ ] **Step 1: Build the fixture**

`tests/fixtures/sample_session.jsonl` — 3 lines (one assistant message with usage, one user message, one assistant message with usage):

```json
{"type":"user","message":{"role":"user","content":"hi"},"uuid":"u1","sessionId":"s1","timestamp":"2026-05-12T08:17:00.000Z","cwd":"/p"}
{"type":"assistant","message":{"model":"claude-opus-4-7","role":"assistant","content":[],"usage":{"input_tokens":5,"output_tokens":100,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"service_tier":"standard","cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":0}}},"requestId":"req_A","sessionId":"s1","timestamp":"2026-05-12T08:17:05.000Z","cwd":"/p"}
{"type":"assistant","message":{"model":"claude-sonnet-4-6","role":"assistant","content":[],"usage":{"input_tokens":3,"output_tokens":50,"cache_read_input_tokens":100,"cache_creation_input_tokens":0,"service_tier":"standard","cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":0}}},"requestId":"req_B","sessionId":"s1","timestamp":"2026-05-12T08:17:10.000Z","cwd":"/p"}
```

- [ ] **Step 2: Write the failing integration test**

`tests/test_ingest_integration.py`:
```python
from pathlib import Path
from claude_usage.db import open_db, ensure_schema
from claude_usage.ingest import process_file


def test_process_file_inserts_only_assistant_messages_with_usage(tmp_path: Path, fixtures_dir: Path):
    src = fixtures_dir / "sample_session.jsonl"
    db = open_db(tmp_path / "usage.db")
    ensure_schema(db)
    process_file(db, src)

    rows = db.execute("SELECT request_id, model, output_tokens FROM messages ORDER BY ts_utc").fetchall()
    assert [r["request_id"] for r in rows] == ["req_A", "req_B"]
    assert [r["model"] for r in rows] == ["claude-opus-4-7", "claude-sonnet-4-6"]


def test_process_file_is_idempotent(tmp_path: Path, fixtures_dir: Path):
    src = fixtures_dir / "sample_session.jsonl"
    db = open_db(tmp_path / "usage.db")
    ensure_schema(db)
    process_file(db, src)
    process_file(db, src)   # second run — must not duplicate
    n = db.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    assert n == 2


def test_process_file_resumes_from_cursor(tmp_path: Path):
    src = tmp_path / "growing.jsonl"
    src.write_text(
        '{"type":"assistant","message":{"model":"claude-opus-4-7","usage":{"input_tokens":1,"output_tokens":2,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"service_tier":"standard","cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":0}}},"requestId":"r1","sessionId":"s","timestamp":"2026-05-12T08:17:05.000Z","cwd":"/p"}\n'
    )
    db = open_db(tmp_path / "usage.db")
    ensure_schema(db)
    process_file(db, src)
    assert db.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 1

    with src.open("a") as f:
        f.write('{"type":"assistant","message":{"model":"claude-opus-4-7","usage":{"input_tokens":1,"output_tokens":2,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"service_tier":"standard","cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":0}}},"requestId":"r2","sessionId":"s","timestamp":"2026-05-12T08:17:10.000Z","cwd":"/p"}\n')
    process_file(db, src)
    assert db.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 2
```

- [ ] **Step 3: Verify they fail**

```bash
uv run pytest tests/test_ingest_integration.py -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 4: Implement `ingest.py` (per-file portion only — watchdog wiring comes in next task)**

```python
"""Filesystem watcher + per-file JSONL → SQLite ingest."""
import sqlite3
from pathlib import Path
from typing import Optional

from claude_usage.extract import extract_usage, MessageRow

INSERT_SQL = """
INSERT OR IGNORE INTO messages (
    request_id, session_id, project_path, ts_utc, model,
    input_tokens, output_tokens, cache_read, cache_create_5m, cache_create_1h,
    service_tier, source_file, source_offset
) VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?)
"""


def _row_tuple(r: MessageRow) -> tuple:
    return (
        r.request_id, r.session_id, r.project_path, r.ts_utc, r.model,
        r.input_tokens, r.output_tokens, r.cache_read, r.cache_create_5m, r.cache_create_1h,
        r.service_tier, r.source_file, r.source_offset,
    )


def _get_cursor(conn: sqlite3.Connection, source_file: str) -> int:
    row = conn.execute(
        "SELECT last_offset FROM ingest_cursor WHERE source_file = ?", (source_file,)
    ).fetchone()
    return row["last_offset"] if row else 0


def _save_cursor(conn: sqlite3.Connection, source_file: str, last_offset: int, last_ts_utc: str) -> None:
    conn.execute(
        """
        INSERT INTO ingest_cursor (source_file, last_offset, last_ts_utc)
        VALUES (?,?,?)
        ON CONFLICT(source_file) DO UPDATE SET
            last_offset = excluded.last_offset,
            last_ts_utc = excluded.last_ts_utc
        """,
        (source_file, last_offset, last_ts_utc),
    )


def process_file(conn: sqlite3.Connection, path: Path) -> int:
    """Process new bytes in `path`, return number of rows inserted (post-dedup)."""
    src = str(path)
    last_offset = _get_cursor(conn, src)
    if not path.exists():
        return 0

    size = path.stat().st_size
    if size < last_offset:                    # truncation
        last_offset = 0

    inserted = 0
    last_ts: Optional[str] = None

    conn.execute("BEGIN")
    try:
        with path.open("rb") as f:
            f.seek(last_offset)
            while True:
                line_start = f.tell()
                raw = f.readline()
                if not raw:
                    break
                if not raw.endswith(b"\n"):
                    # Partial line: don't advance past it; retry next call.
                    break
                row = extract_usage(raw.decode("utf-8", errors="replace").rstrip("\n"),
                                    source_file=src, source_offset=line_start)
                if row is not None:
                    cur = conn.execute(INSERT_SQL, _row_tuple(row))
                    inserted += cur.rowcount
                    last_ts = row.ts_utc
                last_offset = f.tell()
        _save_cursor(conn, src, last_offset, last_ts or "")
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return inserted
```

- [ ] **Step 5: Run and verify**

```bash
uv run pytest tests/test_ingest_integration.py -v
```
Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
git add src/claude_usage/ingest.py tests/test_ingest_integration.py tests/fixtures/sample_session.jsonl
git commit -m "feat(ingest): per-file processor with cursor + dedup + truncation handling"
```

---

### Task 9: Ingest daemon — watchdog wiring

**Files:**
- Modify: `src/claude_usage/ingest.py` (add the daemon entrypoint)

- [ ] **Step 1: Append daemon code to `ingest.py`**

```python
import time
import logging
import threading
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileSystemEvent

log = logging.getLogger("claude_usage.ingest")


class _JsonlHandler(FileSystemEventHandler):
    def __init__(self, dirty: set[Path], lock: threading.Lock):
        self.dirty = dirty
        self.lock = lock

    def _mark(self, path: str) -> None:
        if path.endswith(".jsonl"):
            with self.lock:
                self.dirty.add(Path(path))

    def on_created(self, event: FileSystemEvent) -> None:
        if not event.is_directory:
            self._mark(event.src_path)

    def on_modified(self, event: FileSystemEvent) -> None:
        if not event.is_directory:
            self._mark(event.src_path)


def run_daemon(conn: sqlite3.Connection, projects_dir: Path, debounce: float = 0.2) -> None:
    """Watch projects_dir for .jsonl changes, flush per debounce window. Runs forever."""
    log.info("daemon starting; watching %s", projects_dir)

    # Backfill: process every existing JSONL once.
    for jsonl in projects_dir.rglob("*.jsonl"):
        n = process_file(conn, jsonl)
        if n:
            log.info("backfill +%d msgs from %s", n, jsonl.name)

    dirty: set[Path] = set()
    lock = threading.Lock()
    handler = _JsonlHandler(dirty, lock)
    observer = Observer()
    observer.schedule(handler, str(projects_dir), recursive=True)
    observer.start()

    try:
        while True:
            time.sleep(debounce)
            with lock:
                batch = list(dirty)
                dirty.clear()
            for path in batch:
                try:
                    n = process_file(conn, path)
                    if n:
                        log.info("+%d msgs from %s", n, path.name)
                except Exception as e:
                    log.exception("process_file failed for %s: %s", path, e)
    finally:
        observer.stop()
        observer.join()
```

- [ ] **Step 2: Smoke-verify by importing**

```bash
uv run python -c "from claude_usage.ingest import run_daemon; print('ok')"
```
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add src/claude_usage/ingest.py
git commit -m "feat(ingest): watchdog-driven daemon with backfill + debounced batches"
```

---

### Task 10: CLI entrypoint (typer)

**Files:**
- Create: `src/claude_usage/cli.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write the failing test**

`tests/test_cli.py`:
```python
from typer.testing import CliRunner
from claude_usage.cli import app

runner = CliRunner()


def test_help_lists_all_subcommands():
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    out = result.stdout
    assert "daemon" in out
    assert "mcp" in out
    assert "tui" in out


def test_tui_help_lists_views():
    result = runner.invoke(app, ["tui", "--help"])
    assert result.exit_code == 0
    assert "gauge" in result.stdout
    assert "sessions" in result.stdout
```

- [ ] **Step 2: Verify it fails**

```bash
uv run pytest tests/test_cli.py -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 3: Implement `cli.py`**

```python
"""Typer entrypoint for the `claude-usage` command."""
import logging
from pathlib import Path

import typer

from claude_usage.db import open_db, ensure_schema
from claude_usage.config import load_config, DEFAULT_PATH

app = typer.Typer(help="Local Claude Code usage tracker.")
tui_app = typer.Typer(help="Render TUI views.")
app.add_typer(tui_app, name="tui")

DB_PATH = Path.home() / ".claude-usage" / "usage.db"
PROJECTS_DIR = Path.home() / ".claude" / "projects"


def _setup_logging() -> None:
    logging.basicConfig(
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        level=logging.INFO,
    )


@app.command()
def daemon() -> None:
    """Watch ~/.claude/projects and ingest into ~/.claude-usage/usage.db."""
    from claude_usage.ingest import run_daemon
    _setup_logging()
    conn = open_db(DB_PATH)
    ensure_schema(conn)
    run_daemon(conn, PROJECTS_DIR)


@app.command()
def mcp() -> None:
    """Start the MCP server on the configured port."""
    from claude_usage.mcp_server import serve
    _setup_logging()
    cfg = load_config(DEFAULT_PATH)
    serve(DB_PATH, cfg)


@tui_app.command()
def gauge() -> None:
    """Render the fuel gauge."""
    from claude_usage.tui.gauge import GaugeApp
    GaugeApp(DB_PATH, load_config(DEFAULT_PATH)).run()


@tui_app.command()
def sessions() -> None:
    """Render the recent sessions table."""
    from claude_usage.tui.sessions import SessionsApp
    SessionsApp(DB_PATH).run()


if __name__ == "__main__":
    app()
```

- [ ] **Step 4: Run and verify**

```bash
uv run pytest tests/test_cli.py -v
```
Expected: 2 passed

- [ ] **Step 5: Verify the installed entrypoint runs**

```bash
uv run claude-usage --help
```
Expected: Help text listing `daemon`, `mcp`, `tui`.

- [ ] **Step 6: Commit**

```bash
git add src/claude_usage/cli.py tests/test_cli.py
git commit -m "feat(cli): typer entrypoint wiring daemon/mcp/tui subcommands"
```

---

### Task 11: State snapshot service (the SQL-backed read layer)

**Files:**
- Create: `src/claude_usage/state.py`
- Test: `tests/test_state.py`

This is the read-side companion to `ingest.py`. It assembles a `StateSnapshot` dict by running aggregate queries against the DB and applying `windows.py` + `forecast.py` logic. The MCP server and TUI both consume it.

- [ ] **Step 1: Write the failing test**

`tests/test_state.py`:
```python
from datetime import datetime, timezone
from pathlib import Path

from claude_usage.db import open_db, ensure_schema
from claude_usage.config import Config
from claude_usage.state import StateService


def _insert(conn, ts: str, model: str, request_id: str):
    conn.execute(
        """INSERT INTO messages (request_id, session_id, project_path, ts_utc, model,
           input_tokens, output_tokens, cache_read, cache_create_5m, cache_create_1h,
           service_tier, source_file, source_offset)
           VALUES (?, 's', '/p', ?, ?, 1, 1, 0, 0, 0, 'standard', '/x', 0)""",
        (request_id, ts, model),
    )


def test_state_snapshot_includes_active_window(tmp_path: Path):
    conn = open_db(tmp_path / "u.db")
    ensure_schema(conn)
    _insert(conn, "2026-05-27T16:50:00Z", "claude-opus-4-7", "r1")
    _insert(conn, "2026-05-27T16:55:00Z", "claude-opus-4-7", "r2")
    svc = StateService(conn, Config())
    now = datetime(2026, 5, 27, 17, 0, tzinfo=timezone.utc)
    snap = svc.get_state(now=now)
    assert snap["window_5h"]["active"] is True
    assert snap["window_5h"]["msgs_used"] == 2
    assert snap["weekly"]["opus_hours_used"] == 2 / 60
```

- [ ] **Step 2: Verify it fails**

```bash
uv run pytest tests/test_state.py -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 3: Implement `state.py`**

```python
"""Assembles read-side StateSnapshot for MCP and TUI consumers."""
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from claude_usage.config import Config
from claude_usage.windows import current_5h_window, msgs_in_window, weekly_hours_used, model_family
from claude_usage.forecast import forecast as _forecast, Verdict


@dataclass
class StateService:
    conn: sqlite3.Connection
    cfg:  Config

    def _all_ts(self) -> list[str]:
        return [r[0] for r in self.conn.execute("SELECT ts_utc FROM messages ORDER BY ts_utc")]

    def _ts_with_model(self) -> list[tuple[str, str]]:
        return [(r[0], r[1]) for r in self.conn.execute("SELECT ts_utc, model FROM messages")]

    def _observed_max_msgs(self) -> int:
        if self.cfg.msgs_per_5h_window is not None:
            return self.cfg.msgs_per_5h_window
        # All-time max msgs in any 5h window. For now a simple linear scan
        # (cheap at single-user scale; rewrite as windowed SQL if it bites).
        ts = self._all_ts()
        if not ts:
            return 200
        parsed = sorted(datetime.fromisoformat(t.replace("Z", "+00:00")) for t in ts)
        best = 1
        left = 0
        for right in range(len(parsed)):
            while parsed[right] - parsed[left] > timedelta(hours=5):
                left += 1
            best = max(best, right - left + 1)
        return best

    def _observed_max_weekly(self, family: str) -> float:
        override = self.cfg.weekly_opus_hours if family == "opus" else self.cfg.weekly_sonnet_hours
        if override is not None:
            return override
        # Approximate observed max as the highest 7-day rolling hours seen.
        # Cheap heuristic: walk weekly bucket counts. For v0 use a 35h floor
        # for opus, 280h for sonnet so percentages aren't 100% from day 1.
        floor = 35.0 if family == "opus" else 280.0
        return floor

    def _avg_minutes_per_msg(self, family: str) -> float:
        rows = list(self.conn.execute(
            "SELECT ts_utc, model FROM messages ORDER BY ts_utc DESC LIMIT 500"
        ))
        same = [r for r in rows if model_family(r["model"]) == family]
        if len(same) < 2:
            return 1.0
        first = datetime.fromisoformat(same[-1]["ts_utc"].replace("Z", "+00:00"))
        last  = datetime.fromisoformat(same[0]["ts_utc"].replace("Z", "+00:00"))
        span_minutes = (last - first).total_seconds() / 60.0
        return max(0.1, span_minutes / len(same))

    def get_state(self, *, now: Optional[datetime] = None) -> dict:
        now = now or datetime.now(timezone.utc)
        ts = self._all_ts()
        window = current_5h_window(ts, now=now)
        observed_cap = self._observed_max_msgs()
        msgs_used = 0
        window_payload = {"active": False}
        if window is not None:
            start, end = window
            msgs_used = msgs_in_window(ts, start=start, end=end)
            window_payload = {
                "active": True,
                "started_at": start.isoformat().replace("+00:00", "Z"),
                "ends_at":    end.isoformat().replace("+00:00", "Z"),
                "msgs_used":  msgs_used,
                "msgs_observed_max": observed_cap,
                "pct_of_observed_max": msgs_used / observed_cap if observed_cap else 0.0,
            }

        ts_model = self._ts_with_model()
        opus_h   = weekly_hours_used(ts_model, family="opus", now=now)
        sonnet_h = weekly_hours_used(ts_model, family="sonnet", now=now)
        opus_cap   = self._observed_max_weekly("opus")
        sonnet_cap = self._observed_max_weekly("sonnet")

        return {
            "window_5h": window_payload,
            "weekly": {
                "opus_hours_used":   opus_h,
                "opus_observed_max": opus_cap,
                "opus_pct":          opus_h / opus_cap if opus_cap else 0.0,
                "sonnet_hours_used":   sonnet_h,
                "sonnet_observed_max": sonnet_cap,
                "sonnet_pct":          sonnet_h / sonnet_cap if sonnet_cap else 0.0,
            },
            "as_of": now.isoformat().replace("+00:00", "Z"),
        }

    def forecast(self, *, planned_msgs: int, model: str, now: Optional[datetime] = None) -> Verdict:
        snap = self.get_state(now=now)
        family = "opus" if "opus" in model.lower() else "sonnet"
        state = {
            "msgs_in_window":      snap["window_5h"].get("msgs_used", 0),
            "observed_cap_5h":     snap["window_5h"].get("msgs_observed_max", self._observed_max_msgs()),
            "weekly_hours_used":   snap["weekly"][f"{family}_hours_used"],
            "observed_cap_weekly": snap["weekly"][f"{family}_observed_max"],
            "avg_minutes_per_msg": self._avg_minutes_per_msg(family),
        }
        return _forecast(
            planned_msgs=planned_msgs, model=model, state=state,
            caution_threshold=self.cfg.caution_threshold,
            stop_threshold=self.cfg.stop_threshold,
        )

    def recent_sessions(self, *, limit: int = 10) -> list[dict]:
        rows = list(self.conn.execute("""
            SELECT session_id, project_path,
                   MIN(ts_utc) AS started_at,
                   MAX(ts_utc) AS ended_at,
                   SUM(input_tokens)  AS input_tokens,
                   SUM(output_tokens) AS output_tokens,
                   SUM(cache_read)    AS cache_read
            FROM messages
            GROUP BY session_id
            ORDER BY ended_at DESC
            LIMIT ?
        """, (limit,)))
        return [dict(r) for r in rows]
```

- [ ] **Step 4: Run and verify**

```bash
uv run pytest tests/test_state.py -v
```
Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
git add src/claude_usage/state.py tests/test_state.py
git commit -m "feat(state): SQL-backed StateService assembling snapshot + forecast + recents"
```

---

### Task 12: MCP server

**Files:**
- Create: `src/claude_usage/mcp_server.py`
- Test: `tests/test_mcp_integration.py`

- [ ] **Step 1: Write the failing test**

`tests/test_mcp_integration.py`:
```python
import asyncio
import pytest
from pathlib import Path

from claude_usage.db import open_db, ensure_schema
from claude_usage.config import Config
from claude_usage.state import StateService
from claude_usage.mcp_server import build_server


@pytest.mark.asyncio
async def test_get_state_tool_returns_snapshot(tmp_path: Path):
    conn = open_db(tmp_path / "u.db")
    ensure_schema(conn)
    svc = StateService(conn, Config())
    server = build_server(svc)
    # Call the tool directly through the server's registered handler.
    tools = await server.list_tools()
    names = {t.name for t in tools}
    assert {"get_state", "forecast", "recent_sessions"} <= names


@pytest.mark.asyncio
async def test_forecast_tool_returns_verdict(tmp_path: Path):
    conn = open_db(tmp_path / "u.db")
    ensure_schema(conn)
    svc = StateService(conn, Config())
    server = build_server(svc)
    result = await server.call_tool("forecast", {"planned_msgs": 5, "model": "opus"})
    # result is a list of content items; the structured payload is in the first.
    payload = result[0].text if hasattr(result[0], "text") else result[0]
    assert "verdict" in payload
```

- [ ] **Step 2: Verify it fails**

```bash
uv run pytest tests/test_mcp_integration.py -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 3: Implement `mcp_server.py`**

```python
"""MCP server exposing usage state over streamable HTTP."""
import json
import logging
from pathlib import Path
from typing import Any

from mcp.server import Server
from mcp.server.streamable_http import streamable_http_server
from mcp.types import Tool, TextContent

from claude_usage.config import Config
from claude_usage.db import open_db, ensure_schema
from claude_usage.state import StateService

log = logging.getLogger("claude_usage.mcp")


def build_server(svc: StateService) -> Server:
    server = Server("claude-usage")

    @server.list_tools()
    async def _list() -> list[Tool]:
        return [
            Tool(
                name="get_state",
                description="Current usage snapshot against 5h and weekly limits.",
                inputSchema={"type": "object", "properties": {}, "additionalProperties": False},
            ),
            Tool(
                name="forecast",
                description="Will `planned_msgs` of `model` fit in current 5h window AND weekly cap? Returns go/caution/stop.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "planned_msgs": {"type": "integer", "minimum": 1},
                        "model": {"type": "string", "enum": ["opus", "sonnet"], "default": "opus"},
                    },
                    "required": ["planned_msgs"],
                    "additionalProperties": False,
                },
            ),
            Tool(
                name="recent_sessions",
                description="Last N sessions with model mix and tokens.",
                inputSchema={
                    "type": "object",
                    "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 10}},
                    "additionalProperties": False,
                },
            ),
        ]

    @server.call_tool()
    async def _call(name: str, args: dict[str, Any]) -> list[TextContent]:
        log.info("tool=%s args=%s", name, args)
        if name == "get_state":
            payload = svc.get_state()
        elif name == "forecast":
            payload = svc.forecast(planned_msgs=args["planned_msgs"], model=args.get("model", "opus"))
        elif name == "recent_sessions":
            payload = svc.recent_sessions(limit=args.get("limit", 10))
        else:
            raise ValueError(f"unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(payload, default=str))]

    return server


def serve(db_path: Path, cfg: Config) -> None:
    conn = open_db(db_path)
    ensure_schema(conn)
    svc = StateService(conn, cfg)
    server = build_server(svc)
    log.info("MCP server listening on http://%s:%d/mcp", cfg.mcp_host, cfg.mcp_port)
    streamable_http_server(server, host=cfg.mcp_host, port=cfg.mcp_port)
```

- [ ] **Step 4: Run and verify**

```bash
uv run pytest tests/test_mcp_integration.py -v
```
Expected: 2 passed

If the `mcp` SDK API surface differs from the assumptions above, the test will surface the exact mismatch. Adjust imports and decorator names to the SDK version pinned in `pyproject.toml`, but keep the three tools and their schemas identical.

- [ ] **Step 5: Commit**

```bash
git add src/claude_usage/mcp_server.py tests/test_mcp_integration.py
git commit -m "feat(mcp): streamable HTTP server with get_state/forecast/recent_sessions"
```

---

### Task 13: TUI — fuel gauge

**Files:**
- Create: `src/claude_usage/tui/__init__.py`
- Create: `src/claude_usage/tui/gauge.py`

No unit test for Textual rendering (per spec — visual iteration is by eye). Verify by running.

- [ ] **Step 1: Create `tui/__init__.py`**

```python
```

(empty)

- [ ] **Step 2: Implement `gauge.py`**

```python
"""Textual fuel-gauge app for tmux pane 0."""
from datetime import datetime, timezone
from pathlib import Path

from textual.app import App, ComposeResult
from textual.containers import Vertical
from textual.widgets import Static, ProgressBar
from textual.timer import Timer

from claude_usage.db import open_db, ensure_schema
from claude_usage.config import Config
from claude_usage.state import StateService


class GaugeApp(App):
    CSS = """
    Screen { background: #0b0f14; }
    #title { padding: 1 2; color: #a3e3a8; }
    .row   { padding: 0 2; height: 4; }
    .label { color: #7aa2c7; }
    .green  ProgressBar > .bar--bar { color: #a3e3a8; }
    .yellow ProgressBar > .bar--bar { color: #ffd479; }
    .red    ProgressBar > .bar--bar { color: #ff8585; }
    """

    REFRESH_SECONDS = 2.0

    def __init__(self, db_path: Path, cfg: Config) -> None:
        super().__init__()
        conn = open_db(db_path)
        ensure_schema(conn)
        self.svc = StateService(conn, cfg)
        self._timer: Timer | None = None

    def compose(self) -> ComposeResult:
        yield Static("CLAUDE USAGE — Max 5x", id="title")
        with Vertical(classes="row", id="row-5h"):
            yield Static("5-hour window", classes="label")
            yield ProgressBar(id="bar-5h", show_eta=False)
            yield Static("", id="text-5h")
        with Vertical(classes="row", id="row-opus"):
            yield Static("Weekly Opus", classes="label")
            yield ProgressBar(id="bar-opus", show_eta=False)
            yield Static("", id="text-opus")
        with Vertical(classes="row", id="row-sonnet"):
            yield Static("Weekly Sonnet", classes="label")
            yield ProgressBar(id="bar-sonnet", show_eta=False)
            yield Static("", id="text-sonnet")
        yield Static("", id="footer")

    def on_mount(self) -> None:
        self._refresh()
        self._timer = self.set_interval(self.REFRESH_SECONDS, self._refresh)

    def _refresh(self) -> None:
        snap = self.svc.get_state(now=datetime.now(timezone.utc))
        self._set_bar("bar-5h", "text-5h", "row-5h",
                      pct=snap["window_5h"].get("pct_of_observed_max", 0.0),
                      label=self._5h_text(snap))
        w = snap["weekly"]
        self._set_bar("bar-opus", "text-opus", "row-opus",
                      pct=w["opus_pct"],
                      label=f"{w['opus_hours_used']:.1f}h / {w['opus_observed_max']:.1f}h")
        self._set_bar("bar-sonnet", "text-sonnet", "row-sonnet",
                      pct=w["sonnet_pct"],
                      label=f"{w['sonnet_hours_used']:.1f}h / {w['sonnet_observed_max']:.1f}h")

    def _5h_text(self, snap: dict) -> str:
        w = snap["window_5h"]
        if not w["active"]:
            return "no active window"
        return f"{w['msgs_used']} / {w['msgs_observed_max']} msgs  ·  resets {w['ends_at']}"

    def _set_bar(self, bar_id: str, text_id: str, row_id: str, *, pct: float, label: str) -> None:
        bar = self.query_one(f"#{bar_id}", ProgressBar)
        bar.update(total=100, progress=int(pct * 100))
        self.query_one(f"#{text_id}", Static).update(label)
        row = self.query_one(f"#{row_id}")
        row.set_classes(["row", "red" if pct >= 0.8 else "yellow" if pct >= 0.6 else "green"])
```

- [ ] **Step 3: Smoke run the binary**

```bash
uv run claude-usage tui gauge
```
Expected: TUI launches, shows three rows. `Ctrl-C` to exit. (No assertion — visual check only.)

- [ ] **Step 4: Commit**

```bash
git add src/claude_usage/tui/__init__.py src/claude_usage/tui/gauge.py
git commit -m "feat(tui): fuel gauge — Textual app with color-coded thresholds"
```

---

### Task 14: TUI — recent sessions table

**Files:**
- Create: `src/claude_usage/tui/sessions.py`

- [ ] **Step 1: Implement `sessions.py`**

```python
"""Textual sessions-table app for tmux pane 1."""
from pathlib import Path
from textual.app import App, ComposeResult
from textual.widgets import DataTable

from claude_usage.db import open_db, ensure_schema
from claude_usage.config import Config
from claude_usage.state import StateService


class SessionsApp(App):
    REFRESH_SECONDS = 5.0

    def __init__(self, db_path: Path) -> None:
        super().__init__()
        conn = open_db(db_path)
        ensure_schema(conn)
        self.svc = StateService(conn, Config())

    def compose(self) -> ComposeResult:
        yield DataTable(id="t")

    def on_mount(self) -> None:
        table: DataTable = self.query_one("#t", DataTable)
        table.add_columns("ended", "project", "session", "tokens_in", "tokens_out", "cache_read")
        self._refresh()
        self.set_interval(self.REFRESH_SECONDS, self._refresh)

    def _refresh(self) -> None:
        table: DataTable = self.query_one("#t", DataTable)
        table.clear()
        for s in self.svc.recent_sessions(limit=20):
            table.add_row(
                (s["ended_at"] or "")[11:19],
                Path(s["project_path"] or "").name or "-",
                (s["session_id"] or "")[:8],
                f"{s['input_tokens']:,}",
                f"{s['output_tokens']:,}",
                f"{s['cache_read']:,}",
            )
```

- [ ] **Step 2: Smoke run**

```bash
uv run claude-usage tui sessions
```
Expected: table renders (may be empty until ingest has run). `Ctrl-C` to exit.

- [ ] **Step 3: Commit**

```bash
git add src/claude_usage/tui/sessions.py
git commit -m "feat(tui): recent sessions table"
```

---

### Task 15: Tmux orchestration scripts

**Files:**
- Create: `bin/claude-usage-up`
- Create: `bin/claude-usage-down`
- Test: `tests/test_bin_dry_run.py`

- [ ] **Step 1: Write the dry-run test**

`tests/test_bin_dry_run.py`:
```python
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def test_up_dry_run_prints_tmux_commands():
    result = subprocess.run(
        [str(REPO / "bin" / "claude-usage-up"), "--dry-run"],
        capture_output=True, text=True, check=True,
    )
    out = result.stdout
    assert "tmux new-session" in out
    assert "claude-usage tui gauge" in out
    assert "claude-usage tui sessions" in out
    assert "claude-usage daemon" in out
    assert "claude-usage mcp" in out
```

- [ ] **Step 2: Verify it fails**

```bash
uv run pytest tests/test_bin_dry_run.py -v
```
Expected: FileNotFoundError (script doesn't exist).

- [ ] **Step 3: Create `bin/claude-usage-up`**

```bash
#!/usr/bin/env bash
set -euo pipefail
SESSION="${CLAUDE_DASH_SESSION:-claude-dash}"
DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1

run() { if [[ $DRY -eq 1 ]]; then echo "$*"; else eval "$*"; fi; }

if [[ $DRY -eq 0 ]] && tmux has-session -t "$SESSION" 2>/dev/null; then
    exec tmux attach -t "$SESSION"
fi

run "tmux new-session -d -s $SESSION -n main"
run "tmux send-keys -t $SESSION:0.0 'while :; do claude-usage tui gauge;    sleep 1; done' Enter"
run "tmux split-window -t $SESSION:0   -v -p 40"
run "tmux send-keys -t $SESSION:0.1 'while :; do claude-usage tui sessions; sleep 1; done' Enter"
run "tmux split-window -t $SESSION:0.1 -h"
run "tmux send-keys -t $SESSION:0.2 'while :; do claude-usage daemon;       sleep 2; done' Enter"
run "tmux split-window -t $SESSION:0.1 -h"
run "tmux send-keys -t $SESSION:0.3 'while :; do claude-usage mcp;          sleep 2; done' Enter"

if [[ $DRY -eq 0 ]]; then
    exec tmux attach -t "$SESSION"
fi
```

- [ ] **Step 4: Create `bin/claude-usage-down`**

```bash
#!/usr/bin/env bash
set -euo pipefail
SESSION="${CLAUDE_DASH_SESSION:-claude-dash}"
tmux kill-session -t "$SESSION"
```

- [ ] **Step 5: Make them executable and run the test**

```bash
chmod +x bin/claude-usage-up bin/claude-usage-down
uv run pytest tests/test_bin_dry_run.py -v
```
Expected: 1 passed

- [ ] **Step 6: Commit**

```bash
git add bin/claude-usage-up bin/claude-usage-down tests/test_bin_dry_run.py
git commit -m "feat(bin): tmux up/down scripts with --dry-run smoke test"
```

---

### Task 16: Launchd auto-start template

**Files:**
- Create: `config/com.claude-usage.plist`

- [ ] **Step 1: Create the plist**

`config/com.claude-usage.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>            <string>com.claude-usage</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-lc</string>
        <string>REPLACE_WITH_ABSOLUTE_PATH/bin/claude-usage-up --no-attach</string>
    </array>
    <key>RunAtLoad</key>        <true/>
    <key>KeepAlive</key>        <false/>
    <key>StandardOutPath</key>  <string>REPLACE_WITH_HOME/.claude-usage/launchd.out.log</string>
    <key>StandardErrorPath</key><string>REPLACE_WITH_HOME/.claude-usage/launchd.err.log</string>
</dict>
</plist>
```

- [ ] **Step 2: Patch `claude-usage-up` to honor `--no-attach`**

In `bin/claude-usage-up`, replace `DRY=0` block with:
```bash
DRY=0
NO_ATTACH=0
for arg in "$@"; do
    case "$arg" in
        --dry-run)   DRY=1 ;;
        --no-attach) NO_ATTACH=1 ;;
    esac
done
```

And replace the trailing attach with:
```bash
if [[ $DRY -eq 0 && $NO_ATTACH -eq 0 ]]; then
    exec tmux attach -t "$SESSION"
fi
```

- [ ] **Step 3: Commit**

```bash
git add config/com.claude-usage.plist bin/claude-usage-up
git commit -m "feat(launchd): plist template + --no-attach flag for boot-time use"
```

---

### Task 17: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the generated README**

`README.md`:
````markdown
# claude-usage

Local dashboard tracking personal Claude Code usage against Anthropic Max 5x limits, exposed over MCP so other Claude sessions can forecast `go / caution / stop` before running tasks.

## Quick start

```bash
uv sync
uv run claude-usage --help

# One-time: create the data dir and (optional) config file
mkdir -p ~/.claude-usage
cp config/com.claude-usage.plist /tmp/com.claude-usage.plist
# edit the plist to substitute real absolute paths, then install it:
#   cp /tmp/com.claude-usage.plist ~/Library/LaunchAgents/
#   launchctl load ~/Library/LaunchAgents/com.claude-usage.plist

# Boot the tmux session manually
./bin/claude-usage-up
```

Detach with `Ctrl-B D`. Reattach anytime: `tmux a -t claude-dash`.

## Configure other Claude Code sessions to use the MCP server

Add to a project's `.mcp.json`:

```json
{
  "mcpServers": {
    "claude-usage": { "url": "http://localhost:7878/mcp" }
  }
}
```

Then call `forecast(planned_msgs=N, model="opus")` from the session.

## Architecture

See `docs/superpowers/specs/2026-05-27-claude-usage-dashboard-design.md`.

## Develop

```bash
uv run pytest
```
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with quick-start and MCP client setup"
```

---

## Self-review

**Spec coverage check:**
- ✅ Architecture (3 roles / 4 processes / SQLite WAL / tmux): Tasks 1–2, 15
- ✅ Data model (`messages`, `ingest_cursor`, `rate_windows`): Task 2
- ✅ Stack (Python/uv/typer/watchdog/textual/mcp/sqlite3): Task 1
- ✅ Ingest logic + edge cases (truncation, partial line, idempotency, backfill): Tasks 8–9
- ✅ 5-hour window math: Task 4
- ✅ Weekly per-family hours: Task 5
- ✅ Forecast `go/caution/stop`: Task 6
- ✅ All-time observed-cap calibration: Task 11
- ✅ MCP tools `get_state`, `forecast`, `recent_sessions` over streamable HTTP: Task 12
- ✅ TUI fuel gauge + sessions table: Tasks 13–14
- ✅ Config file with defaults: Task 7
- ✅ Tmux up/down scripts with `--dry-run` smoke test: Task 15
- ✅ Launchd auto-start: Task 16
- ✅ Error handling (truncation, partial JSON, idempotency): Task 8
- ✅ Test strategy split (unit/integration/smoke): present throughout

**Placeholder scan:** No "TBD"/"TODO"/"implement later" found.

**Type/name consistency:** `StateService.get_state` / `forecast` / `recent_sessions` match exactly across Tasks 11–13. `MessageRow` field names match between Tasks 3 and 8.

**One known SDK-version risk:** Task 12 uses `mcp.server.streamable_http.streamable_http_server` and decorator names matching the `mcp >= 1.2` package shape. If the installed SDK version pinned in Task 1 differs, the test added in Task 12 surfaces the exact import/signature mismatch — adjust there without touching tool semantics.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-27-claude-usage-dashboard.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
