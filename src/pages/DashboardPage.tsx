import { useState, useEffect, useRef, useCallback } from 'react'
import {
  BookOpen, Bookmark, FileText, Upload, RefreshCw,
  CheckCircle2, TrendingUp, Database, Layers,
  Loader2, AlertCircle, Trash2, X, ChevronLeft, ChevronRight,
  Edit3, Save, Plus, Search, ArrowLeft,
} from 'lucide-react'
import {
  checkHealth, getStats, uploadFiles, deleteSource,
  listChunks, updateChunk, deleteChunk, createChunk,
  type Chunk,
} from '../lib/api'

interface SourceInfo {
  type: string
  name: string
  count: number
  last_sync: string
}

interface Stats {
  total_chunks: number
  total_documents: number
  sources: SourceInfo[]
}

interface UploadResult {
  filename: string
  title: string
  type: string
  chunks: number
  status: string
  error?: string
}

const sourceIconMap: Record<string, typeof BookOpen> = {
  blog: BookOpen,
  bookmark: Bookmark,
  document: FileText,
}
const sourceColorMap: Record<string, string> = {
  blog: 'text-primary bg-primary/10 border-primary/20',
  bookmark: 'text-accent bg-accent/10 border-accent/20',
  document: 'text-warning bg-warning/10 border-warning/20',
}

const MOCK_STATS: Stats = {
  total_chunks: 0,
  total_documents: 0,
  sources: [],
}

const PAGE_SIZE = 20

export default function DashboardPage() {
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)
  const [stats, setStats] = useState<Stats>(MOCK_STATS)
  const [uploading, setUploading] = useState(false)
  const [uploadResults, setUploadResults] = useState<UploadResult[] | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Chunk browsing state
  const [viewMode, setViewMode] = useState<'overview' | 'chunks'>('overview')
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [chunkTotal, setChunkTotal] = useState(0)
  const [chunkOffset, setChunkOffset] = useState(0)
  const [chunkFilter, setChunkFilter] = useState<{ type?: string; name?: string }>({})
  const [loadingChunks, setLoadingChunks] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // New chunk form
  const [showNewChunk, setShowNewChunk] = useState(false)
  const [newChunk, setNewChunk] = useState({ text: '', source_type: 'document', source_name: '' })
  const [creatingChunk, setCreatingChunk] = useState(false)

  const fetchStats = useCallback(async () => {
    try {
      const data = await getStats()
      setStats(data)
    } catch { /* offline */ }
  }, [])

  useEffect(() => {
    checkHealth().then(h => {
      const online = !!h
      setBackendOnline(online)
      if (online) fetchStats()
    })
  }, [fetchStats])

  const fetchChunks = useCallback(async (offset = 0, filter?: { type?: string; name?: string }) => {
    setLoadingChunks(true)
    try {
      const f = filter || chunkFilter
      const data = await listChunks({
        source_type: f.type,
        source_name: f.name,
        offset,
        limit: PAGE_SIZE,
      })
      setChunks(data.chunks)
      setChunkTotal(data.total)
      setChunkOffset(offset)
    } catch { /* */ }
    setLoadingChunks(false)
  }, [chunkFilter])

  const handleViewChunks = (sourceType?: string, sourceName?: string) => {
    const filter = { type: sourceType, name: sourceName }
    setChunkFilter(filter)
    setViewMode('chunks')
    setEditingId(null)
    setSearchQuery('')
    fetchChunks(0, filter)
  }

  const handleFiles = async (files: File[]) => {
    if (!backendOnline || files.length === 0) return
    setUploading(true)
    setUploadResults(null)
    try {
      const res = await uploadFiles(files)
      setUploadResults(res.results)
      await fetchStats()
    } catch {
      setUploadResults([{ filename: '上传失败', title: '', type: '', chunks: 0, status: 'error', error: '无法连接后端' }])
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  }

  const handleDeleteSource = async (sourceType: string, sourceName: string) => {
    if (!backendOnline || !confirm(`确定删除 "${sourceName}" 的所有片段？`)) return
    await deleteSource(sourceType, sourceName)
    await fetchStats()
  }

  const handleSaveChunk = async (id: string) => {
    setSavingId(id)
    try {
      await updateChunk(id, editText)
      setChunks(prev => prev.map(c => c.id === id ? { ...c, text: editText } : c))
      setEditingId(null)
    } catch { /* */ }
    setSavingId(null)
  }

  const handleDeleteChunk = async (id: string) => {
    if (!confirm('确定删除此片段？')) return
    try {
      await deleteChunk(id)
      setChunks(prev => prev.filter(c => c.id !== id))
      setChunkTotal(prev => prev - 1)
      await fetchStats()
    } catch { /* */ }
  }

  const handleCreateChunk = async () => {
    if (!newChunk.text.trim() || !newChunk.source_name.trim()) return
    setCreatingChunk(true)
    try {
      await createChunk(newChunk.text, newChunk.source_type, newChunk.source_name)
      setNewChunk({ text: '', source_type: 'document', source_name: '' })
      setShowNewChunk(false)
      await fetchStats()
      fetchChunks(chunkOffset)
    } catch { /* */ }
    setCreatingChunk(false)
  }

  const filteredChunks = searchQuery
    ? chunks.filter(c =>
        c.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.source_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : chunks

  const overviewItems = [
    { label: '总文档数', value: stats.total_documents.toString(), icon: Database, color: 'text-primary' },
    { label: '知识片段', value: stats.total_chunks.toLocaleString(), icon: Layers, color: 'text-accent' },
    { label: '数据源类型', value: new Set(stats.sources.map(s => s.type)).size.toString(), icon: TrendingUp, color: 'text-success' },
    { label: '后端状态', value: backendOnline ? '在线' : '离线', icon: backendOnline ? CheckCircle2 : AlertCircle, color: backendOnline ? 'text-success' : 'text-warning' },
  ]

  const totalPages = Math.ceil(chunkTotal / PAGE_SIZE)
  const currentPage = Math.floor(chunkOffset / PAGE_SIZE) + 1

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8" style={{ background: 'var(--gradient-bg)' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          {viewMode === 'chunks' ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setViewMode('overview'); setEditingId(null) }}
                className="p-2 rounded-lg hover:bg-surface-elevated transition-colors text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {chunkFilter.name ? `${chunkFilter.name}` : '全部片段'}
                </h1>
                <p className="text-sm text-muted-foreground">
                  共 {chunkTotal} 个片段
                  {chunkFilter.type && <span className="ml-1">· 类型: {chunkFilter.type}</span>}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-1">知识库管理</h1>
              <p className="text-sm text-muted-foreground">管理你的数据源，查看和编辑知识片段</p>
            </div>
          )}
        </div>

        {/* Backend offline warning */}
        {backendOnline === false && (
          <div className="mb-6 card p-4 border-warning/30 flex items-center gap-3">
            <AlertCircle size={18} className="text-warning flex-shrink-0" />
            <div className="text-sm">
              <span className="text-warning font-medium">后端未连接</span>
              <span className="text-muted-foreground ml-2">
                请运行 <code className="bg-surface-elevated px-1.5 py-0.5 rounded text-xs font-mono text-foreground">cd backend && python app.py</code>
              </span>
            </div>
          </div>
        )}

        {viewMode === 'overview' ? (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {overviewItems.map((s) => (
                <div key={s.label} className="card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <s.icon size={18} className={s.color} />
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                  </div>
                  <div className="text-xl font-bold text-foreground">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Data Sources */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">数据源</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewChunks()}
                    disabled={!backendOnline || stats.total_chunks === 0}
                    className="btn-secondary flex items-center gap-2 text-sm py-2 px-3 disabled:opacity-40"
                  >
                    <Layers size={14} />
                    浏览全部片段
                  </button>
                  <button
                    onClick={fetchStats}
                    disabled={!backendOnline}
                    className="btn-secondary flex items-center gap-2 text-sm py-2 px-3 disabled:opacity-40"
                  >
                    <RefreshCw size={14} />
                    刷新
                  </button>
                </div>
              </div>

              {stats.sources.length === 0 ? (
                <div className="card p-8 text-center">
                  <Database size={32} className="mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">知识库为空，请上传文件开始构建</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {stats.sources.map((source) => {
                    const Icon = sourceIconMap[source.type] || FileText
                    const color = sourceColorMap[source.type] || sourceColorMap.document
                    return (
                      <div key={`${source.type}:${source.name}`} className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border ${color}`}>
                          <Icon size={22} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-foreground truncate">{source.name}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">类型: {source.type}</p>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-lg font-bold text-foreground">{source.count}</div>
                            <div className="text-[10px] text-muted-foreground">片段</div>
                          </div>
                          <button
                            onClick={() => handleViewChunks(source.type, source.name)}
                            className="p-2 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                            title="查看和编辑片段"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => handleDeleteSource(source.type, source.name)}
                            className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            title="删除此数据源"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Upload Area */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`card p-8 border-dashed border-2 transition-all cursor-pointer group ${
                dragOver
                  ? 'border-primary/60 bg-primary/5'
                  : backendOnline
                    ? 'border-border hover:border-primary/30'
                    : 'border-border/50 opacity-60 cursor-not-allowed'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".md,.txt,.html,.htm,.json,.pdf"
                onChange={(e) => handleFiles(Array.from(e.target.files || []))}
                className="hidden"
                disabled={!backendOnline}
              />
              <div className="flex flex-col items-center text-center">
                {uploading ? (
                  <>
                    <Loader2 size={32} className="animate-spin text-primary mb-3" />
                    <p className="text-sm text-foreground font-medium">正在处理文件...</p>
                  </>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-primary/10 group-hover:bg-primary/15 transition-colors mb-4">
                      <Upload size={24} className="text-primary" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground mb-1">上传新数据</h3>
                    <p className="text-xs text-muted-foreground mb-3">拖拽文件到这里，或点击选择文件</p>
                    <p className="text-[10px] text-muted-foreground">支持 .md .txt .html .json 格式</p>
                  </>
                )}
              </div>
            </div>

            {/* Upload Results */}
            {uploadResults && (
              <div className="mt-4 card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">上传结果</h3>
                  <button onClick={() => setUploadResults(null)} className="p-1 hover:bg-surface-elevated rounded">
                    <X size={14} className="text-muted-foreground" />
                  </button>
                </div>
                <div className="space-y-2">
                  {uploadResults.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      {r.status === 'success' ? (
                        <CheckCircle2 size={14} className="text-success flex-shrink-0" />
                      ) : (
                        <AlertCircle size={14} className="text-destructive flex-shrink-0" />
                      )}
                      <span className="text-foreground truncate">{r.title || r.filename}</span>
                      {r.status === 'success' && (
                        <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">{r.chunks} 片段</span>
                      )}
                      {r.error && (
                        <span className="text-xs text-destructive ml-auto flex-shrink-0">{r.error}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* ===== Chunk Browser ===== */
          <>
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="搜索片段内容..."
                  className="w-full bg-surface-elevated border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
                />
              </div>
              <button
                onClick={() => setShowNewChunk(true)}
                className="btn-primary flex items-center justify-center gap-1.5 text-sm py-2.5 px-4"
              >
                <Plus size={15} />
                新建片段
              </button>
            </div>

            {/* New Chunk Form */}
            {showNewChunk && (
              <div className="card p-5 mb-5 border-primary/20">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Plus size={15} className="text-primary" />
                  手动添加知识片段
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">来源类型</label>
                    <select
                      value={newChunk.source_type}
                      onChange={e => setNewChunk(prev => ({ ...prev, source_type: e.target.value }))}
                      className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                    >
                      <option value="document">文档</option>
                      <option value="blog">博客</option>
                      <option value="bookmark">书签</option>
                      <option value="note">笔记</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">来源名称</label>
                    <input
                      type="text"
                      value={newChunk.source_name}
                      onChange={e => setNewChunk(prev => ({ ...prev, source_name: e.target.value }))}
                      placeholder="如：学习笔记"
                      className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-xs text-muted-foreground mb-1">内容</label>
                  <textarea
                    value={newChunk.text}
                    onChange={e => setNewChunk(prev => ({ ...prev, text: e.target.value }))}
                    rows={4}
                    placeholder="输入知识片段内容..."
                    className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 resize-y"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setShowNewChunk(false); setNewChunk({ text: '', source_type: 'document', source_name: '' }) }}
                    className="btn-secondary text-sm py-2 px-3"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleCreateChunk}
                    disabled={!newChunk.text.trim() || !newChunk.source_name.trim() || creatingChunk}
                    className="btn-primary flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-40"
                  >
                    {creatingChunk ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    添加
                  </button>
                </div>
              </div>
            )}

            {/* Chunks List */}
            {loadingChunks ? (
              <div className="card p-12 flex items-center justify-center">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            ) : filteredChunks.length === 0 ? (
              <div className="card p-8 text-center">
                <Layers size={32} className="mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? '没有匹配的片段' : '暂无片段'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredChunks.map((chunk) => {
                  const isEditing = editingId === chunk.id
                  const isSaving = savingId === chunk.id
                  const Icon = sourceIconMap[chunk.source_type] || FileText
                  const color = sourceColorMap[chunk.source_type] || sourceColorMap.document

                  return (
                    <div key={chunk.id} className={`card p-4 transition-all ${isEditing ? 'border-primary/30 ring-1 ring-primary/10' : ''}`}>
                      {/* Chunk header */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border text-xs ${color}`}>
                          <Icon size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-foreground truncate block">{chunk.source_name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            #{chunk.chunk_index} · {chunk.ingested_at?.slice(0, 10)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleSaveChunk(chunk.id)}
                                disabled={isSaving}
                                className="p-1.5 rounded-lg hover:bg-success/10 text-success transition-colors"
                                title="保存"
                              >
                                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground transition-colors"
                                title="取消"
                              >
                                <X size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => { setEditingId(chunk.id); setEditText(chunk.text) }}
                                className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                title="编辑"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteChunk(chunk.id)}
                                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                title="删除"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Chunk content */}
                      {isEditing ? (
                        <textarea
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          rows={6}
                          className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-y font-mono leading-relaxed"
                          autoFocus
                        />
                      ) : (
                        <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-4 cursor-pointer hover:text-foreground transition-colors"
                          onClick={() => { setEditingId(chunk.id); setEditText(chunk.text) }}
                        >
                          {chunk.text}
                        </div>
                      )}

                      {/* Chunk ID */}
                      <div className="mt-2 text-[10px] text-muted-foreground/50 font-mono truncate">
                        ID: {chunk.id}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Pagination */}
            {!searchQuery && totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-6">
                <button
                  onClick={() => fetchChunks(chunkOffset - PAGE_SIZE)}
                  disabled={chunkOffset === 0}
                  className="p-2 rounded-lg hover:bg-surface-elevated disabled:opacity-30 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-sm text-muted-foreground">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => fetchChunks(chunkOffset + PAGE_SIZE)}
                  disabled={chunkOffset + PAGE_SIZE >= chunkTotal}
                  className="p-2 rounded-lg hover:bg-surface-elevated disabled:opacity-30 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
