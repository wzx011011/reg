import chromadb
import uuid
import json
from datetime import datetime
from typing import AsyncGenerator
from config import CHROMA_DIR, CHUNK_SIZE, CHUNK_OVERLAP, TOP_K, SYSTEM_PROMPT
from config import LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
import httpx


class RAGEngine:
    def __init__(self):
        self.client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        self.collection = self.client.get_or_create_collection(
            name="knowledge_base",
            metadata={"hnsw:space": "cosine"}
        )

    def get_stats(self) -> dict:
        count = self.collection.count()
        if count == 0:
            return {"total_chunks": 0, "total_documents": 0, "sources": []}

        all_meta = self.collection.get(include=["metadatas"])
        sources: dict[str, dict] = {}
        for meta in all_meta["metadatas"]:
            src_type = meta.get("source_type", "unknown")
            src_name = meta.get("source_name", "unknown")
            key = f"{src_type}:{src_name}"
            if key not in sources:
                sources[key] = {
                    "type": src_type,
                    "name": src_name,
                    "count": 0,
                    "last_sync": meta.get("ingested_at", ""),
                }
            sources[key]["count"] += 1

        return {
            "total_chunks": count,
            "total_documents": len(sources),
            "sources": list(sources.values()),
        }

    def chunk_text(self, text: str) -> list[str]:
        chunks: list[str] = []
        paragraphs = text.split('\n\n')
        current = ""

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            if len(current) + len(para) + 2 <= CHUNK_SIZE:
                current += ("\n\n" + para if current else para)
            else:
                if current:
                    chunks.append(current)
                if len(para) > CHUNK_SIZE:
                    # Split long paragraphs by sentences
                    sents = para.replace('。', '。|').replace('！', '！|').replace('？', '？|').replace('. ', '. |').split('|')
                    current = ""
                    for s in sents:
                        s = s.strip()
                        if not s:
                            continue
                        if len(current) + len(s) <= CHUNK_SIZE:
                            current += s
                        else:
                            if current:
                                chunks.append(current)
                            current = s
                else:
                    current = para

        if current:
            chunks.append(current)

        # Add overlap
        if CHUNK_OVERLAP > 0 and len(chunks) > 1:
            overlapped = []
            for i, chunk in enumerate(chunks):
                if i > 0:
                    overlap = chunks[i - 1][-CHUNK_OVERLAP:]
                    chunk = overlap + " " + chunk
                overlapped.append(chunk)
            return overlapped

        return chunks if chunks else [text[:CHUNK_SIZE]] if text.strip() else []

    def ingest(self, text: str, source_type: str, source_name: str) -> int:
        chunks = self.chunk_text(text)
        if not chunks:
            return 0

        ids = [str(uuid.uuid4()) for _ in chunks]
        metadatas = [
            {
                "source_type": source_type,
                "source_name": source_name,
                "chunk_index": i,
                "total_chunks": len(chunks),
                "ingested_at": datetime.now().isoformat(),
            }
            for i in range(len(chunks))
        ]

        self.collection.add(documents=chunks, metadatas=metadatas, ids=ids)
        return len(chunks)

    def query(self, question: str, n_results: int | None = None) -> dict:
        if self.collection.count() == 0:
            return {"documents": [], "metadatas": [], "distances": []}

        n = min(n_results or TOP_K, self.collection.count())
        results = self.collection.query(
            query_texts=[question],
            n_results=n,
            include=["documents", "metadatas", "distances"]
        )
        return {
            "documents": results["documents"][0] if results["documents"] else [],
            "metadatas": results["metadatas"][0] if results["metadatas"] else [],
            "distances": results["distances"][0] if results["distances"] else [],
        }

    def format_context(self, results: dict) -> str:
        if not results["documents"]:
            return "（知识库为空，尚未导入任何数据）"
        parts = []
        for i, (doc, meta) in enumerate(zip(results["documents"], results["metadatas"])):
            src = f"[{meta.get('source_type', '?')} - {meta.get('source_name', '?')}]"
            parts.append(f"片段{i + 1} {src}:\n{doc}")
        return "\n\n---\n\n".join(parts)

    def extract_sources(self, results: dict) -> list[dict]:
        seen: set[str] = set()
        sources = []
        for meta in results["metadatas"]:
            key = f"{meta.get('source_type')}:{meta.get('source_name')}"
            if key not in seen:
                seen.add(key)
                sources.append({
                    "type": meta.get("source_type", "document"),
                    "title": meta.get("source_name", "未知来源"),
                })
        return sources

    async def llm_stream(self, question: str, context: str) -> AsyncGenerator[dict, None]:
        """Pure async LLM streaming - no blocking ChromaDB calls."""
        if not LLM_API_KEY:
            yield {"type": "error", "content": "Please configure LLM_API_KEY in backend/.env"}
            return

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT.format(context=context)},
            {"role": "user", "content": question},
        ]

        try:
            async with httpx.AsyncClient() as client:
                async with client.stream(
                    "POST",
                    f"{LLM_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {LLM_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": LLM_MODEL,
                        "messages": messages,
                        "stream": True,
                        "temperature": 0.7,
                        "max_tokens": 2000,
                    },
                    timeout=60.0,
                ) as response:
                    if response.status_code != 200:
                        body = await response.aread()
                        yield {"type": "error", "content": f"LLM API error ({response.status_code}): {body.decode()[:200]}"}
                        return

                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            raw = line[6:]
                            if raw == "[DONE]":
                                break
                            try:
                                data = json.loads(raw)
                                content = data["choices"][0].get("delta", {}).get("content", "")
                                if content:
                                    yield {"type": "chunk", "content": content}
                            except (json.JSONDecodeError, KeyError, IndexError):
                                continue
        except httpx.ConnectError:
            yield {"type": "error", "content": f"Cannot connect to LLM API ({LLM_BASE_URL})"}
        except Exception as e:
            yield {"type": "error", "content": f"LLM error: {str(e)}"}

    def delete_source(self, source_type: str, source_name: str) -> int:
        all_data = self.collection.get(
            where={"$and": [
                {"source_type": {"$eq": source_type}},
                {"source_name": {"$eq": source_name}},
            ]},
        )
        if all_data["ids"]:
            self.collection.delete(ids=all_data["ids"])
            return len(all_data["ids"])
        return 0

    def clear(self):
        self.client.delete_collection("knowledge_base")
        self.collection = self.client.get_or_create_collection(
            name="knowledge_base",
            metadata={"hnsw:space": "cosine"}
        )

    # ---- Chunk-level operations ----

    def list_chunks(self, source_type: str | None = None, source_name: str | None = None,
                    offset: int = 0, limit: int = 50) -> dict:
        """List chunks with optional source filter and pagination."""
        where = None
        if source_type and source_name:
            where = {"$and": [
                {"source_type": {"$eq": source_type}},
                {"source_name": {"$eq": source_name}},
            ]}
        elif source_type:
            where = {"source_type": {"$eq": source_type}}

        result = self.collection.get(
            where=where,
            include=["documents", "metadatas"],
            limit=limit,
            offset=offset,
        )

        total = self.collection.count()
        if where:
            # Get total for this filter
            all_filtered = self.collection.get(where=where, include=[])
            total = len(all_filtered["ids"])

        chunks = []
        for i, (cid, doc, meta) in enumerate(
            zip(result["ids"], result["documents"], result["metadatas"])
        ):
            chunks.append({
                "id": cid,
                "text": doc,
                "source_type": meta.get("source_type", ""),
                "source_name": meta.get("source_name", ""),
                "chunk_index": meta.get("chunk_index", 0),
                "ingested_at": meta.get("ingested_at", ""),
            })

        return {"chunks": chunks, "total": total, "offset": offset, "limit": limit}

    def get_chunk(self, chunk_id: str) -> dict | None:
        result = self.collection.get(ids=[chunk_id], include=["documents", "metadatas"])
        if not result["ids"]:
            return None
        return {
            "id": result["ids"][0],
            "text": result["documents"][0],
            "source_type": result["metadatas"][0].get("source_type", ""),
            "source_name": result["metadatas"][0].get("source_name", ""),
            "chunk_index": result["metadatas"][0].get("chunk_index", 0),
            "ingested_at": result["metadatas"][0].get("ingested_at", ""),
        }

    def update_chunk(self, chunk_id: str, new_text: str) -> bool:
        """Update a chunk's text (re-embeds automatically)."""
        existing = self.collection.get(ids=[chunk_id], include=["metadatas"])
        if not existing["ids"]:
            return False
        meta = existing["metadatas"][0]
        meta["edited_at"] = datetime.now().isoformat()
        self.collection.update(ids=[chunk_id], documents=[new_text], metadatas=[meta])
        return True

    def delete_chunk(self, chunk_id: str) -> bool:
        existing = self.collection.get(ids=[chunk_id], include=[])
        if not existing["ids"]:
            return False
        self.collection.delete(ids=[chunk_id])
        return True

    def add_chunk(self, text: str, source_type: str, source_name: str) -> str:
        """Add a single chunk manually."""
        chunk_id = str(uuid.uuid4())
        meta = {
            "source_type": source_type,
            "source_name": source_name,
            "chunk_index": 0,
            "total_chunks": 1,
            "ingested_at": datetime.now().isoformat(),
            "manual": "true",
        }
        self.collection.add(documents=[text], metadatas=[meta], ids=[chunk_id])
        return chunk_id
