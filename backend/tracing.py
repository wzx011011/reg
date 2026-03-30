"""Langfuse tracing integration (optional).

If LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set, all chat
requests will be traced with retrieval spans and LLM generations.
Otherwise tracing is silently disabled.
"""

import os
from typing import Any

_langfuse = None
_enabled = False
_host = ""
_public_host = ""


def init_langfuse():
    """Initialize Langfuse client from environment variables."""
    global _langfuse, _enabled, _host, _public_host

    public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY", "")
    _host = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")
    # LANGFUSE_PUBLIC_HOST is the browser-accessible URL (defaults to http://localhost:3000)
    _public_host = os.getenv("LANGFUSE_PUBLIC_HOST", _host)

    if public_key and secret_key:
        try:
            from langfuse import Langfuse
            _langfuse = Langfuse(
                public_key=public_key,
                secret_key=secret_key,
                host=_host,
            )
            _enabled = True
            print(f"[Langfuse] Enabled -> {_host}")
        except Exception as e:
            print(f"[Langfuse] Init failed: {e}")
            _enabled = False
    else:
        print("[Langfuse] Not configured (set LANGFUSE_PUBLIC_KEY & LANGFUSE_SECRET_KEY in .env)")


def is_enabled() -> bool:
    return _enabled


def create_trace(name: str, **kwargs: Any):
    """Create a new Langfuse trace. Returns None if disabled."""
    if not _enabled or not _langfuse:
        return None
    try:
        return _langfuse.trace(name=name, **kwargs)
    except Exception:
        return None


def get_trace_url(trace_id: str) -> str:
    """Build the browser-accessible dashboard URL for a trace."""
    return f"{_public_host}/trace/{trace_id}"


def flush():
    """Flush pending events to Langfuse."""
    if _enabled and _langfuse:
        try:
            _langfuse.flush()
        except Exception:
            pass
