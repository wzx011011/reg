import { useNavigate } from 'react-router-dom'
import {
  MessageSquare, BookOpen, Bookmark, FileText,
  Sparkles, Link2, Brain, ArrowRight,
} from 'lucide-react'

const stats = [
  { label: '博客文章', value: '12', icon: BookOpen, color: 'text-primary' },
  { label: '浏览器书签', value: '256', icon: Bookmark, color: 'text-accent' },
  { label: '知识片段', value: '1.2k', icon: FileText, color: 'text-success' },
  { label: '数据源', value: '3', icon: Link2, color: 'text-warning' },
]

const features = [
  {
    icon: MessageSquare,
    title: '智能问答',
    desc: '基于你的全部个人数据，用自然语言检索和回答问题',
  },
  {
    icon: Brain,
    title: '记忆增强',
    desc: '再也不会忘记你曾经记录、收藏、讨论过的任何内容',
  },
  {
    icon: Sparkles,
    title: '知识关联',
    desc: '自动发现博客、书签、文档之间的隐藏联系',
  },
]

export default function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--gradient-bg)' }}>
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center px-6 pt-20 pb-16 lg:pt-28 lg:pb-24">
        {/* Orb visual */}
        <div className="orb-container animate-float mb-10">
          <div className="orb" />
          <div className="orb-ring animate-pulse-glow" />
          <div className="orb-ring-2" />
          {/* Orbiting particles */}
          <div className="orb-particle animate-orbit" style={{ top: '50%', left: '50%', animationDelay: '0s' }} />
          <div className="orb-particle animate-orbit" style={{ top: '50%', left: '50%', animationDelay: '-4s', background: 'hsl(var(--primary-glow))', width: '4px', height: '4px' }} />
          <div className="orb-particle animate-orbit" style={{ top: '50%', left: '50%', animationDelay: '-8s', width: '5px', height: '5px' }} />
        </div>

        {/* Headline */}
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-center mb-4 animate-slide-up">
          <span className="gradient-text">你的数字分身</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground text-center max-w-xl mb-8 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          将博客、书签、文档注入 AI，打造只属于你的知识助手
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-3 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <button
            onClick={() => navigate('/chat')}
            className="btn-primary flex items-center gap-2 text-base"
          >
            <MessageSquare size={18} />
            开始对话
            <ArrowRight size={16} />
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-secondary flex items-center gap-2 text-base"
          >
            管理知识库
          </button>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="card p-5 text-center animate-slide-up"
              style={{ animationDelay: `${0.1 * i + 0.3}s` }}
            >
              <stat.icon size={22} className={`mx-auto mb-2 ${stat.color}`} />
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <h2 className="text-2xl font-bold text-center text-foreground mb-10">核心能力</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((feat, i) => (
            <div
              key={feat.title}
              className="card p-6 group animate-slide-up"
              style={{ animationDelay: `${0.1 * i + 0.5}s` }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <feat.icon size={22} className="text-primary" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">{feat.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
