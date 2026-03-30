const API_BASE = '/api'

export async function checkHealth(): Promise<{ status: string; llm_configured: boolean; total_chunks: number } | null> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function getStats() {
  const res = await fetch(`${API_BASE}/stats`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

export async function* streamChat(message: string) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!res.body) throw new Error('No body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''

    for (const part of parts) {
      if (part.startsWith('data: ')) {
        try {
          yield JSON.parse(part.slice(6))
        } catch { /* skip malformed */ }
      }
    }
  }
}

export async function uploadFiles(files: File[]) {
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

export async function deleteSource(sourceType: string, sourceName: string) {
  const res = await fetch(`${API_BASE}/sources/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_type: sourceType, source_name: sourceName }),
  })
  return await res.json()
}

export interface AppConfig {
  llm_base_url: string
  llm_api_key: string
  llm_model: string
  chunk_size: number
  chunk_overlap: number
  top_k: number
  system_prompt: string
}

export async function getConfig(): Promise<AppConfig> {
  const res = await fetch(`${API_BASE}/config`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

export async function updateConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
  const res = await fetch(`${API_BASE}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

// ---- Chunk-level APIs ----

export interface Chunk {
  id: string
  text: string
  source_type: string
  source_name: string
  chunk_index: number
  ingested_at: string
}

export interface ChunkListResponse {
  chunks: Chunk[]
  total: number
  offset: number
  limit: number
}

export async function listChunks(params?: {
  source_type?: string
  source_name?: string
  offset?: number
  limit?: number
}): Promise<ChunkListResponse> {
  const query = new URLSearchParams()
  if (params?.source_type) query.set('source_type', params.source_type)
  if (params?.source_name) query.set('source_name', params.source_name)
  if (params?.offset !== undefined) query.set('offset', String(params.offset))
  if (params?.limit !== undefined) query.set('limit', String(params.limit))
  const res = await fetch(`${API_BASE}/chunks?${query}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

export async function updateChunk(id: string, text: string) {
  const res = await fetch(`${API_BASE}/chunks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

export async function deleteChunk(id: string) {
  const res = await fetch(`${API_BASE}/chunks/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

export async function createChunk(text: string, source_type: string, source_name: string) {
  const res = await fetch(`${API_BASE}/chunks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, source_type, source_name }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}
