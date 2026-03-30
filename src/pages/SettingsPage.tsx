import { useState, useEffect } from 'react'
import {
  Settings, Brain, Cpu, Sliders, Save, RotateCcw,
  Loader2, CheckCircle2, AlertCircle, Eye, EyeOff,
  MessageSquare,
} from 'lucide-react'
import { checkHealth, getConfig, updateConfig, type AppConfig } from '../lib/api'

const DEFAULT_SYSTEM_PROMPT = `你是用户的数字分身——基于用户个人知识库（博客、书签、文档等）构建的 AI 助手。

回答规则：
1. 优先基于检索到的知识片段回答
2. 如果知识库中没有相关信息，诚实说明
3. 使用自然、友好的语气
4. 在回答中提及信息来源（哪篇博客、哪个书签等）

以下是从知识库中检索到的相关内容：
{context}

请基于以上内容回答用户的问题。`

export default function SettingsPage() {
  const [online, setOnline] = useState<boolean | null>(null)
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [draft, setDraft] = useState<Partial<AppConfig>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    checkHealth().then(h => {
      const isOnline = !!h
      setOnline(isOnline)
      if (isOnline) {
        getConfig().then(c => {
          setConfig(c)
          setDraft(c)
        }).catch(() => setError('无法加载配置'))
      }
    })
  }, [])

  const hasChanges = config && JSON.stringify(draft) !== JSON.stringify(config)

  const handleSave = async () => {
    if (!hasChanges) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const updates: Partial<AppConfig> = {}
      for (const key of Object.keys(draft) as (keyof AppConfig)[]) {
        if (draft[key] !== config![key]) {
          (updates as Record<string, unknown>)[key] = draft[key]
        }
      }
      const newConfig = await updateConfig(updates)
      setConfig(newConfig)
      setDraft(newConfig)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('保存失败，请检查后端连接')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (config) setDraft({ ...config })
  }

  const updateField = (key: keyof AppConfig, value: string | number) => {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  if (online === false) {
    return (
      <div className="flex-1 overflow-y-auto p-6 lg:p-8" style={{ background: 'var(--gradient-bg)' }}>
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-foreground mb-6">设置</h1>
          <div className="card p-6 border-warning/30 flex items-center gap-3">
            <AlertCircle size={20} className="text-warning flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-warning">后端未连接</p>
              <p className="text-xs text-muted-foreground mt-1">请先启动后端服务才能管理设置</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!config || !draft) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--gradient-bg)' }}>
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8" style={{ background: 'var(--gradient-bg)' }}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Settings size={22} className="text-primary" />
              设置
            </h1>
            <p className="text-sm text-muted-foreground mt-1">配置 LLM 和 RAG 参数</p>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button onClick={handleReset} className="btn-secondary flex items-center gap-1.5 text-sm py-2 px-3">
                <RotateCcw size={14} />
                重置
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="btn-primary flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>

        {/* Status messages */}
        {saved && (
          <div className="mb-4 card p-3 border-success/30 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-success" />
            <span className="text-sm text-success">设置已保存，部分参数需重启后端生效</span>
          </div>
        )}
        {error && (
          <div className="mb-4 card p-3 border-destructive/30 flex items-center gap-2">
            <AlertCircle size={16} className="text-destructive" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}

        {/* LLM Config */}
        <section className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-5">
            <Brain size={18} className="text-primary" />
            <h2 className="text-lg font-semibold text-foreground">LLM 模型配置</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">API Base URL</label>
              <input
                type="text"
                value={draft.llm_base_url || ''}
                onChange={e => updateField('llm_base_url', e.target.value)}
                className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
                placeholder="https://api.openai.com/v1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">支持 OpenAI 兼容接口：DeepSeek、智谱GLM、Ollama 等</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={draft.llm_api_key || ''}
                  onChange={e => updateField('llm_api_key', e.target.value)}
                  className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2.5 pr-10 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors font-mono"
                  placeholder="sk-..."
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">模型名称</label>
              <input
                type="text"
                value={draft.llm_model || ''}
                onChange={e => updateField('llm_model', e.target.value)}
                className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
                placeholder="gpt-4o-mini"
              />
              <p className="text-[11px] text-muted-foreground mt-1">如 glm-4-flash, deepseek-chat, qwen2.5, gpt-4o-mini</p>
            </div>
          </div>
        </section>

        {/* RAG Config */}
        <section className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-5">
            <Sliders size={18} className="text-accent" />
            <h2 className="text-lg font-semibold text-foreground">RAG 检索参数</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">分片大小</label>
              <input
                type="number"
                value={draft.chunk_size || 500}
                onChange={e => updateField('chunk_size', parseInt(e.target.value) || 500)}
                min={100}
                max={2000}
                step={50}
                className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
              />
              <p className="text-[11px] text-muted-foreground mt-1">每个知识片段的字符数上限</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">重叠字符</label>
              <input
                type="number"
                value={draft.chunk_overlap || 50}
                onChange={e => updateField('chunk_overlap', parseInt(e.target.value) || 50)}
                min={0}
                max={200}
                step={10}
                className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
              />
              <p className="text-[11px] text-muted-foreground mt-1">相邻片段间重叠的字符数</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">检索数量 (Top-K)</label>
              <input
                type="number"
                value={draft.top_k || 5}
                onChange={e => updateField('top_k', parseInt(e.target.value) || 5)}
                min={1}
                max={20}
                className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
              />
              <p className="text-[11px] text-muted-foreground mt-1">每次检索返回的最相关片段数</p>
            </div>
          </div>
          <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/10">
            <div className="flex items-start gap-2">
              <Cpu size={14} className="text-primary mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-muted-foreground">
                <span className="text-foreground font-medium">提示：</span>
                分片大小影响检索精度，较小的值精度更高但上下文较少；Top-K 越大提供的上下文越多但可能引入噪声。修改分片参数后需重新导入数据才对已有数据生效。
              </p>
            </div>
          </div>
        </section>

        {/* System Prompt */}
        <section className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <MessageSquare size={18} className="text-success" />
              <h2 className="text-lg font-semibold text-foreground">系统提示词</h2>
            </div>
            <button
              onClick={() => updateField('system_prompt', DEFAULT_SYSTEM_PROMPT)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              恢复默认
            </button>
          </div>
          <textarea
            value={draft.system_prompt || ''}
            onChange={e => updateField('system_prompt', e.target.value)}
            rows={10}
            className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors resize-y font-mono leading-relaxed"
            placeholder="输入系统提示词..."
          />
          <p className="text-[11px] text-muted-foreground mt-1.5">
            使用 <code className="bg-surface-elevated px-1 py-0.5 rounded text-primary text-[10px]">{'{context}'}</code> 作为知识库检索结果的占位符
          </p>
        </section>
      </div>
    </div>
  )
}
