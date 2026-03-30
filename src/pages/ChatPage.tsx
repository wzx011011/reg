import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send, Bot, User, FileText, Bookmark, BookOpen, Loader2,
  Wifi, WifiOff, ChevronDown, ChevronRight, Search, Brain,
  Cpu, Clock, Database, Zap, ExternalLink,
} from 'lucide-react'
import { checkHealth, streamChat } from '../lib/api'

interface Source {
  type: 'blog' | 'bookmark' | 'document'
  title: string
}

interface RetrievalChunk {
  index: number
  text: string
  full_length: number
  source_type: string
  source_name: string
  similarity: number
  distance: number
}

interface RetrievalInfo {
  query: string
  top_k: number
  chunk_size: number
  results_count: number
  retrieval_time_ms: number
  chunks: RetrievalChunk[]
  llm_model: string
  system_prompt_length: number
  context_length: number
  trace_id?: string
  trace_url?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  retrieval?: RetrievalInfo
  timestamp: Date
}

const sourceIcons = { blog: BookOpen, bookmark: Bookmark, document: FileText }
const sourceColors = {
  blog: 'text-primary bg-primary/10',
  bookmark: 'text-accent bg-accent/10',
  document: 'text-warning bg-warning/10',
}

function getSimilarityColor(score: number): string {
  if (score >= 0.8) return 'text-success'
  if (score >= 0.5) return 'text-accent'
  if (score >= 0.3) return 'text-warning'
  return 'text-destructive'
}

function getSimilarityBar(score: number): string {
  if (score >= 0.8) return 'bg-success'
  if (score >= 0.5) return 'bg-accent'
  if (score >= 0.3) return 'bg-warning'
  return 'bg-destructive'
}

// Mock responses for offline mode
const MOCK_RESPONSES: { triggers: string[]; response: string; sources: Source[] }[] = [
  {
    triggers: ['你好', '嗨', '你是谁', '介绍'],
    response: '你好！我是你的数字分身——基于你的博客、书签和文档训练而成的 AI。试着问我关于你过去知识的问题吧！',
    sources: [],
  },
  {
    triggers: ['博客', '文章', '写过什么'],
    response: '根据你的博客库，你写了关于设计模式、C++多线程、Qt源码分析等文章。',
    sources: [{ type: 'blog', title: '设计模式系列' }],
  },
  {
    triggers: ['书签', '收藏', '链接'],
    response: '你的书签涵盖了 Qt/QML、C++、JS引擎、AI/ML、编译原理等领域。',
    sources: [{ type: 'bookmark', title: '收藏夹概览' }],
  },
]

function findMockResponse(input: string) {
  const lower = input.toLowerCase()
  const match = MOCK_RESPONSES.find(r => r.triggers.some(t => lower.includes(t.toLowerCase())))
  return match || {
    response: '演示模式，请启动后端后重试。',
    sources: [{ type: 'document' as const, title: '提示：请启动后端服务' }],
  }
}

const INITIAL_MESSAGE: Message = {
  id: '0',
  role: 'assistant',
  content: '你好！我是你的数字分身 🧠 有什么想问的，或者想让我帮你回忆的？',
  sources: [],
  timestamp: new Date(),
}

// ---- Thinking Process Component ----
function ThinkingPanel({ retrieval }: { retrieval: RetrievalInfo }) {
  const [expanded, setExpanded] = useState(false)
  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set())

  const toggleChunk = (index: number) => {
    setExpandedChunks(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <div className="mt-2 mb-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Brain size={13} className="text-primary" />
        <span>思考过程</span>
        <span className="text-[10px] text-muted-foreground/60 ml-1">
          检索 {retrieval.results_count} 片段 · {retrieval.retrieval_time_ms}ms
        </span>
      </button>

      {expanded && (
        <div className="mt-2 rounded-xl border border-border/50 bg-surface/50 overflow-hidden text-xs animate-fade-in">
          {/* Step 1: Query */}
          <div className="p-3 border-b border-border/30">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
              <Search size={12} className="text-primary" />
              <span className="font-medium text-foreground">Step 1: 向量检索</span>
            </div>
            <div className="bg-surface-elevated rounded-lg p-2.5 font-mono text-foreground">
              query: "<span className="text-primary">{retrieval.query}</span>"
            </div>
            <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Database size={10} />
                Top-K: {retrieval.top_k}
              </span>
              <span className="flex items-center gap-1">
                <Zap size={10} />
                分片大小: {retrieval.chunk_size}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={10} />
                耗时: {retrieval.retrieval_time_ms}ms
              </span>
            </div>
          </div>

          {/* Step 2: Retrieved Chunks */}
          <div className="p-3 border-b border-border/30">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
              <Zap size={12} className="text-accent" />
              <span className="font-medium text-foreground">Step 2: 匹配结果 ({retrieval.results_count} 片段)</span>
            </div>
            <div className="space-y-2">
              {retrieval.chunks.map((chunk) => (
                <div key={chunk.index} className="rounded-lg border border-border/30 bg-surface-elevated overflow-hidden">
                  <button
                    onClick={() => toggleChunk(chunk.index)}
                    className="w-full flex items-center gap-2 p-2.5 hover:bg-primary/5 transition-colors text-left"
                  >
                    {expandedChunks.has(chunk.index)
                      ? <ChevronDown size={12} className="text-muted-foreground flex-shrink-0" />
                      : <ChevronRight size={12} className="text-muted-foreground flex-shrink-0" />
                    }
                    <span className="text-[10px] text-muted-foreground w-5">#{chunk.index + 1}</span>

                    {/* Similarity bar */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 w-24">
                      <div className="h-1.5 flex-1 bg-border/30 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getSimilarityBar(chunk.similarity)}`}
                          style={{ width: `${Math.min(chunk.similarity * 100, 100)}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-mono font-medium ${getSimilarityColor(chunk.similarity)}`}>
                        {(chunk.similarity * 100).toFixed(1)}%
                      </span>
                    </div>

                    <span className="text-foreground truncate flex-1">{chunk.source_name}</span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{chunk.full_length} 字</span>
                  </button>

                  {expandedChunks.has(chunk.index) && (
                    <div className="px-3 pb-2.5 border-t border-border/20">
                      <pre className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap mt-2 max-h-40 overflow-y-auto">
                        {chunk.text}
                      </pre>
                      <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground/60">
                        <span>类型: {chunk.source_type}</span>
                        <span>距离: {chunk.distance}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step 3: LLM call */}
          <div className="p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
              <Cpu size={12} className="text-success" />
              <span className="font-medium text-foreground">Step 3: LLM 生成</span>
            </div>
            <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
              <span>模型: <span className="text-foreground font-medium">{retrieval.llm_model}</span></span>
              <span>上下文: <span className="text-foreground">{retrieval.context_length} 字</span></span>
              <span>System Prompt: <span className="text-foreground">{retrieval.system_prompt_length} 字</span></span>
            </div>
            {retrieval.trace_url && (
              <a
                href={retrieval.trace_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-[10px] text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink size={10} />
                <span>Langfuse Trace</span>
                <span className="text-muted-foreground/50 font-mono">{retrieval.trace_id?.slice(0, 8)}</span>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Main Chat Page ----
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    checkHealth().then(h => setBackendOnline(!!h))
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isTyping) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    }
    const aiId = (Date.now() + 1).toString()

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    const health = await checkHealth()
    const isOnline = !!health
    setBackendOnline(isOnline)

    if (isOnline) {
      const aiMsg: Message = {
        id: aiId,
        role: 'assistant',
        content: '',
        sources: [],
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, aiMsg])

      try {
        let content = ''
        let sources: Source[] = []
        let retrieval: RetrievalInfo | undefined

        for await (const event of streamChat(trimmed)) {
          switch (event.type) {
            case 'chunk':
              content += event.content
              setMessages(prev =>
                prev.map(m => (m.id === aiId ? { ...m, content } : m))
              )
              break
            case 'sources':
              sources = event.data || []
              break
            case 'retrieval':
              retrieval = event.data
              setMessages(prev =>
                prev.map(m => (m.id === aiId ? { ...m, retrieval } : m))
              )
              break
            case 'error':
              content = event.content
              break
          }
        }

        setMessages(prev =>
          prev.map(m => (m.id === aiId ? { ...m, content, sources, retrieval } : m))
        )
      } catch {
        setMessages(prev =>
          prev.map(m =>
            m.id === aiId ? { ...m, content: '连接后端失败，请检查服务是否运行。' } : m
          )
        )
      }
    } else {
      const delay = 600 + Math.random() * 800
      await new Promise(r => setTimeout(r, delay))
      const { response, sources } = findMockResponse(trimmed)
      setMessages(prev => [
        ...prev,
        { id: aiId, role: 'assistant', content: response, sources, timestamp: new Date() },
      ])
    }

    setIsTyping(false)
  }, [input, isTyping])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-4 border-b border-border/50 glass-elevated flex-shrink-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
          <Bot size={18} className="text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-foreground">和你的数字分身对话</h1>
          <p className="text-xs text-muted-foreground">基于你的个人知识库</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {backendOnline === null ? (
            <Loader2 size={12} className="animate-spin text-muted-foreground" />
          ) : backendOnline ? (
            <>
              <Wifi size={14} className="text-success" />
              <span className="text-xs text-success">后端已连接</span>
            </>
          ) : (
            <>
              <WifiOff size={14} className="text-warning" />
              <span className="text-xs text-warning">演示模式</span>
            </>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6" style={{ background: 'var(--gradient-bg)' }}>
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 animate-fade-in ${msg.role === 'user' ? 'justify-end' : ''}`}
            >
              {msg.role === 'assistant' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-primary/15">
                  <Bot size={16} className="text-primary" />
                </div>
              )}
              <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-md'
                      : 'glass rounded-tl-md text-foreground'
                  }`}
                >
                  {msg.content || <span className="text-muted-foreground italic">思考中...</span>}
                </div>

                {/* Thinking Process Panel */}
                {msg.retrieval && (
                  <ThinkingPanel retrieval={msg.retrieval} />
                )}

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {msg.sources.map((src, i) => {
                      const Icon = sourceIcons[src.type] || FileText
                      const color = sourceColors[src.type] || sourceColors.document
                      return (
                        <span key={i} className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg ${color}`}>
                          <Icon size={12} />
                          {src.title}
                        </span>
                      )
                    })}
                  </div>
                )}
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  {msg.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {msg.role === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-surface-elevated">
                  <User size={16} className="text-muted-foreground" />
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-3 animate-fade-in">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-primary/15">
                <Bot size={16} className="text-primary" />
              </div>
              <div className="glass rounded-2xl rounded-tl-md px-4 py-3 flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  {backendOnline ? '检索知识库中...' : '正在思考...'}
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="px-4 py-4 border-t border-border/50 glass-elevated flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 bg-surface rounded-xl px-4 py-2 border border-border focus-within:border-primary/40 focus-within:shadow-glow transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题..."
              className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
              disabled={isTyping}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className="p-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/15"
              style={input.trim() && !isTyping ? { background: 'var(--gradient-primary)' } : undefined}
            >
              <Send size={16} className={input.trim() && !isTyping ? 'text-primary-foreground' : 'text-muted-foreground'} />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            {backendOnline ? '已连接后端 · 使用真实 RAG 检索' : '演示模式 · 启动后端后自动切换'}
          </p>
        </div>
      </div>
    </div>
  )
}
