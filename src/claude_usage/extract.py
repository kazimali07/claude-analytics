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

    # Real Claude Code logs occasionally produce assistant messages with no
    # requestId (e.g. local checkpoints / synthesized continuations). Fall back
    # to the per-message uuid so we still de-dup correctly; skip the row only
    # if neither is present.
    request_id = obj.get("requestId") or obj.get("uuid")
    session_id = obj.get("sessionId")
    timestamp  = obj.get("timestamp")
    if not (request_id and session_id and timestamp):
        return None

    cache_creation = usage.get("cache_creation") or {}
    return MessageRow(
        request_id   = request_id,
        session_id   = session_id,
        project_path = obj.get("cwd", ""),
        ts_utc       = timestamp,
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
