from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import asyncio
from functools import partial

from config import HOST, PORT, UPLOADS_DIR, LLM_API_KEY, get_all_config, update_config
from config import LLM_BASE_URL, LLM_MODEL, TOP_K, CHUNK_SIZE, SYSTEM_PROMPT
from rag import RAGEngine
from importers import process_uploaded_file

app = FastAPI(title="Digital Twin API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rag = RAGEngine()


class ChatRequest(BaseModel):
    message: str


class DeleteSourceRequest(BaseModel):
    source_type: str
    source_name: str


# Use sync def for endpoints with blocking ChromaDB calls
# FastAPI will automatically run them in a threadpool

@app.get("/api/health")
def health():
    stats = rag.get_stats()
    return {
        "status": "ok",
        "llm_configured": bool(LLM_API_KEY),
        "total_chunks": stats["total_chunks"],
    }


@app.post("/api/chat")
async def chat(request: ChatRequest):
    import time
    t0 = time.time()

    # Run blocking ChromaDB query in thread
    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(None, partial(rag.query, request.message))
    t_retrieval = time.time() - t0

    context = rag.format_context(results)
    sources = rag.extract_sources(results)
    system_prompt = SYSTEM_PROMPT.format(context=context)

    # Build detailed retrieval info
    retrieval_chunks = []
    for i, (doc, meta, dist) in enumerate(zip(
        results.get("documents", []),
        results.get("metadatas", []),
        results.get("distances", []),
    )):
        retrieval_chunks.append({
            "index": i,
            "text": doc[:300] + ("..." if len(doc) > 300 else ""),
            "full_length": len(doc),
            "source_type": meta.get("source_type", ""),
            "source_name": meta.get("source_name", ""),
            "similarity": round(1 - dist, 4) if dist <= 1 else round(dist, 4),
            "distance": round(dist, 4),
        })

    retrieval_info = {
        "query": request.message,
        "top_k": TOP_K,
        "chunk_size": CHUNK_SIZE,
        "results_count": len(retrieval_chunks),
        "retrieval_time_ms": round(t_retrieval * 1000),
        "chunks": retrieval_chunks,
        "llm_model": LLM_MODEL,
        "llm_base_url": LLM_BASE_URL,
        "system_prompt_length": len(system_prompt),
        "context_length": len(context),
    }

    async def generate():
        # 1. Send retrieval details
        yield f"data: {json.dumps({'type': 'retrieval', 'data': retrieval_info}, ensure_ascii=False)}\n\n"

        # 2. Send sources
        yield f"data: {json.dumps({'type': 'sources', 'data': sources}, ensure_ascii=False)}\n\n"

        # 3. Stream LLM response
        async for event in rag.llm_stream(request.message, context):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/stats")
def get_stats():
    return rag.get_stats()


@app.post("/api/upload")
async def upload_files(files: list[UploadFile] = File(...)):
    results = []
    total_chunks = 0
    loop = asyncio.get_event_loop()

    for file in files:
        try:
            content = await file.read()
            save_path = UPLOADS_DIR / (file.filename or "unknown")
            with open(save_path, 'wb') as f:
                f.write(content)

            processed = process_uploaded_file(content, file.filename or "unknown")
            chunks = await loop.run_in_executor(
                None,
                partial(rag.ingest,
                        text=processed["text"],
                        source_type=processed["type"],
                        source_name=processed["title"])
            )
            total_chunks += chunks
            results.append({
                "filename": file.filename,
                "title": processed["title"],
                "type": processed["type"],
                "chunks": chunks,
                "status": "success",
            })
        except Exception as e:
            results.append({
                "filename": file.filename,
                "status": "error",
                "error": str(e),
            })

    return {"processed": len(results), "total_chunks": total_chunks, "results": results}


@app.post("/api/sources/delete")
def delete_source(request: DeleteSourceRequest):
    deleted = rag.delete_source(request.source_type, request.source_name)
    return {"deleted_chunks": deleted}


@app.post("/api/clear")
def clear_kb():
    rag.clear()
    return {"status": "cleared"}


class ConfigUpdate(BaseModel):
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None
    chunk_size: int | None = None
    chunk_overlap: int | None = None
    top_k: int | None = None
    system_prompt: str | None = None


@app.get("/api/config")
def get_config():
    return get_all_config()


@app.put("/api/config")
def put_config(body: ConfigUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    return update_config(updates)


# ---- Chunk-level endpoints ----

class ChunkUpdate(BaseModel):
    text: str

class ChunkCreate(BaseModel):
    text: str
    source_type: str = "document"
    source_name: str = "manual"


@app.get("/api/chunks")
def list_chunks(
    source_type: str | None = None,
    source_name: str | None = None,
    offset: int = 0,
    limit: int = 50,
):
    return rag.list_chunks(source_type, source_name, offset, limit)


@app.get("/api/chunks/{chunk_id}")
def get_chunk(chunk_id: str):
    chunk = rag.get_chunk(chunk_id)
    if not chunk:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"error": "Chunk not found"})
    return chunk


@app.put("/api/chunks/{chunk_id}")
def update_chunk(chunk_id: str, body: ChunkUpdate):
    ok = rag.update_chunk(chunk_id, body.text)
    if not ok:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"error": "Chunk not found"})
    return {"status": "updated", "id": chunk_id}


@app.delete("/api/chunks/{chunk_id}")
def delete_chunk(chunk_id: str):
    ok = rag.delete_chunk(chunk_id)
    if not ok:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"error": "Chunk not found"})
    return {"status": "deleted", "id": chunk_id}


@app.post("/api/chunks")
def create_chunk(body: ChunkCreate):
    chunk_id = rag.add_chunk(body.text, body.source_type, body.source_name)
    return {"status": "created", "id": chunk_id}
    return update_config(updates)


if __name__ == "__main__":
    import uvicorn
    print(f"\n[Digital Twin] Backend starting...")
    print(f"[API] http://{HOST}:{PORT}")
    print(f"[LLM] {'configured' if LLM_API_KEY else 'NOT configured -> edit .env'}")
    print(f"[KB]  {rag.get_stats()['total_chunks']} chunks\n")
    uvicorn.run(app, host=HOST, port=PORT)
