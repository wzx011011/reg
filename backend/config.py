import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
CHROMA_DIR = BASE_DIR / "chroma_db"
ENV_FILE = BASE_DIR / ".env"

DATA_DIR.mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)

# LLM
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.deepseek.com/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat")

# Server
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# RAG
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "50"))
TOP_K = int(os.getenv("TOP_K", "5"))

DEFAULT_SYSTEM_PROMPT = """你是用户的数字分身——基于用户个人知识库（博客、书签、文档等）构建的 AI 助手。

回答规则：
1. 优先基于检索到的知识片段回答
2. 如果知识库中没有相关信息，诚实说明
3. 使用自然、友好的语气
4. 在回答中提及信息来源（哪篇博客、哪个书签等）

以下是从知识库中检索到的相关内容：
{context}

请基于以上内容回答用户的问题。"""

SYSTEM_PROMPT = os.getenv("SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT)


def get_all_config() -> dict:
    """Return all current configuration values."""
    return {
        "llm_base_url": LLM_BASE_URL,
        "llm_api_key": ("*" * 8 + LLM_API_KEY[-6:]) if len(LLM_API_KEY) > 6 else "未配置",
        "llm_model": LLM_MODEL,
        "chunk_size": CHUNK_SIZE,
        "chunk_overlap": CHUNK_OVERLAP,
        "top_k": TOP_K,
        "system_prompt": SYSTEM_PROMPT,
    }


def update_config(updates: dict) -> dict:
    """Update config in memory and persist to .env file."""
    import config as cfg

    env_map = {
        "llm_base_url": "LLM_BASE_URL",
        "llm_api_key": "LLM_API_KEY",
        "llm_model": "LLM_MODEL",
        "chunk_size": "CHUNK_SIZE",
        "chunk_overlap": "CHUNK_OVERLAP",
        "top_k": "TOP_K",
        "system_prompt": "SYSTEM_PROMPT",
    }

    changed = {}
    for key, value in updates.items():
        if key not in env_map:
            continue
        # Skip masked API key
        if key == "llm_api_key" and value.startswith("*"):
            continue
        attr = env_map[key]
        # Type conversion
        if key in ("chunk_size", "chunk_overlap", "top_k"):
            value = int(value)
        setattr(cfg, attr, value)
        changed[key] = value

    # Persist changed values to .env
    if changed:
        _write_env(changed, env_map)

    return get_all_config()


def _write_env(changed: dict, env_map: dict):
    """Update .env file with changed values."""
    lines = []
    if ENV_FILE.exists():
        lines = ENV_FILE.read_text(encoding="utf-8").splitlines()

    existing_keys = {}
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            k = stripped.split("=", 1)[0].strip()
            existing_keys[k] = i

    for key, value in changed.items():
        env_key = env_map[key]
        env_line = f"{env_key}={value}"
        if env_key in existing_keys:
            lines[existing_keys[env_key]] = env_line
        else:
            lines.append(env_line)

    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
