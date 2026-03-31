"""RAG evaluation module.

Provides:
1. User feedback scoring (thumbs up/down)
2. Automatic LLM-based evaluation (relevance, faithfulness)
"""

import json
import httpx
from config import LLM_BASE_URL, LLM_API_KEY, LLM_MODEL

EVAL_PROMPT = """你是一个 RAG 系统的评估专家。请根据以下信息评估回答质量。

用户问题: {question}

检索到的知识片段:
{context}

AI 回答: {answer}

请从以下三个维度打分（0-10分），并给出简短理由：

1. **相关度 (relevance)**: 检索到的片段和用户问题是否相关
2. **忠实度 (faithfulness)**: 回答是否忠实于检索到的知识片段，没有编造内容
3. **完整度 (completeness)**: 回答是否充分解答了用户问题

请严格按以下 JSON 格式返回，不要包含其他内容：
{{"relevance": {{"score": 8, "reason": "..."}}, "faithfulness": {{"score": 7, "reason": "..."}}, "completeness": {{"score": 6, "reason": "..."}}}}"""


async def auto_evaluate(question: str, context: str, answer: str) -> dict | None:
    """Use LLM to auto-evaluate a RAG response. Returns scores or None on failure."""
    if not LLM_API_KEY or not answer.strip():
        return None

    prompt = EVAL_PROMPT.format(
        question=question,
        context=context[:2000],
        answer=answer[:2000],
    )

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{LLM_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {LLM_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": LLM_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "max_tokens": 500,
                },
                timeout=30.0,
            )
            if resp.status_code != 200:
                return None

            data = resp.json()
            content = data["choices"][0]["message"]["content"].strip()

            # Extract JSON from response (handle markdown code blocks)
            if "```" in content:
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
                content = content.strip()

            scores = json.loads(content)
            # Validate structure
            for key in ("relevance", "faithfulness", "completeness"):
                if key not in scores:
                    return None
                if "score" not in scores[key]:
                    return None
                scores[key]["score"] = max(0, min(10, int(scores[key]["score"])))

            return scores
    except Exception:
        return None


# ---- In-memory feedback storage ----
# In production, use a database. This is sufficient for local/demo use.
_feedback_store: dict[str, dict] = {}


def store_feedback(message_id: str, score: int, comment: str = "") -> dict:
    """Store user feedback for a message."""
    entry = {
        "message_id": message_id,
        "score": score,
        "comment": comment,
    }
    _feedback_store[message_id] = entry
    return entry


def get_feedback(message_id: str) -> dict | None:
    return _feedback_store.get(message_id)


def get_all_feedback() -> list[dict]:
    return list(_feedback_store.values())
