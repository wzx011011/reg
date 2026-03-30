# 数字分身 Digital Twin

> 基于 RAG 的个人知识库 AI 助手 | RAG-powered Personal Knowledge Base AI Assistant

将你的博客、浏览器书签、文档注入 AI，打造只属于你的知识助手。

Turn your blogs, browser bookmarks, and documents into an AI-powered personal knowledge assistant.

---

## 功能特性 Features

### 智能对话 Intelligent Chat
- 基于个人知识库的 RAG 检索问答 | RAG-based Q&A over your personal knowledge base
- 流式响应，实时输出 | Streaming responses in real-time
- 完整的思考过程可视化（向量检索 → 匹配片段 → LLM 生成）| Full thinking process visualization (vector retrieval → matched chunks → LLM generation)
- 相似度分数展示，透明化检索逻辑 | Similarity scores displayed for transparent retrieval logic

### 知识库管理 Knowledge Base Management
- 多格式文件导入：Markdown、HTML、JSON、纯文本 | Multi-format import: Markdown, HTML, JSON, plain text
- 浏览器书签自动解析（Edge / Chrome） | Automatic browser bookmark parsing (Edge / Chrome)
- 博客爬取（支持 cnblogs 等） | Blog crawling (supports cnblogs, etc.)
- 片段级 CRUD：浏览、搜索、编辑、删除、手动新建 | Chunk-level CRUD: browse, search, edit, delete, manual create
- 数据源管理与统计 | Data source management & statistics

### 系统设置 System Settings
- LLM 模型配置（支持 OpenAI 兼容接口）| LLM model configuration (OpenAI-compatible API)
- RAG 参数调节：分片大小、重叠字符、Top-K | RAG parameter tuning: chunk size, overlap, Top-K
- 系统提示词自定义 | Custom system prompt
- 所有配置持久化到 `.env` | All configs persisted to `.env`

---

## 技术栈 Tech Stack

| 层级 Layer | 技术 Technology |
|---|---|
| 前端 Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| 后端 Backend | Python FastAPI + Uvicorn |
| 向量数据库 Vector DB | ChromaDB (all-MiniLM-L6-v2 embedding) |
| LLM | 任意 OpenAI 兼容接口 (GLM / DeepSeek / GPT / Ollama) |
| CI/CD | GitHub Actions + Docker + GHCR |

---

## 快速开始 Quick Start

### 前置要求 Prerequisites
- Node.js >= 18
- Python >= 3.10
- 一个 OpenAI 兼容的 LLM API Key | An OpenAI-compatible LLM API Key

### 1. 克隆仓库 Clone

```bash
git clone git@github.com:wzx011011/reg.git
cd reg
```

### 2. 启动前端 Start Frontend

```bash
npm install
npm run dev
```

前端运行在 `http://localhost:5173` | Frontend runs at `http://localhost:5173`

### 3. 启动后端 Start Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# 编辑 .env 填入你的 LLM API Key | Edit .env with your LLM API Key
python app.py
```

后端运行在 `http://localhost:8000` | Backend runs at `http://localhost:8000`

### 4. 导入数据 Import Data

```bash
# 编辑 import_data.py 中的路径配置 | Edit paths in import_data.py
cd backend
python import_data.py
```

---

## Docker 部署 Docker Deployment

```bash
# 配置环境变量 | Configure environment variables
cp backend/.env.example backend/.env
# 编辑 backend/.env | Edit backend/.env

# 一键启动 | One-click start
docker compose up -d
```

访问 `http://localhost` | Visit `http://localhost`

---

## 项目结构 Project Structure

```
.
├── src/                          # 前端源码 Frontend source
│   ├── pages/
│   │   ├── HomePage.tsx          # 首页 Home page
│   │   ├── ChatPage.tsx          # 对话页（含思考过程）Chat (with thinking process)
│   │   ├── DashboardPage.tsx     # 知识库管理 Knowledge base management
│   │   └── SettingsPage.tsx      # 设置页 Settings
│   ├── components/
│   │   └── Sidebar.tsx           # 侧边栏导航 Sidebar navigation
│   ├── lib/
│   │   └── api.ts                # API 客户端 API client
│   └── index.css                 # 设计系统 Design system
├── backend/
│   ├── app.py                    # FastAPI 服务端 FastAPI server
│   ├── rag.py                    # RAG 引擎 RAG engine
│   ├── config.py                 # 配置管理 Configuration management
│   ├── importers.py              # 多格式导入器 Multi-format importers
│   ├── import_data.py            # 数据导入脚本 Data import script
│   ├── Dockerfile                # 后端镜像 Backend image
│   └── requirements.txt          # Python 依赖 Python dependencies
├── .github/workflows/
│   ├── ci.yml                    # CI：lint / typecheck / build / test
│   └── cd.yml                    # CD：Docker build & push to GHCR
├── Dockerfile.frontend           # 前端镜像（nginx）Frontend image (nginx)
├── docker-compose.yml            # 全栈编排 Full-stack orchestration
└── tailwind.config.js            # Tailwind 主题配置 Tailwind theme config
```

---

## API 接口 API Endpoints

| 方法 Method | 路径 Path | 说明 Description |
|---|---|---|
| `GET` | `/api/health` | 健康检查 Health check |
| `POST` | `/api/chat` | 流式对话（SSE）Streaming chat (SSE) |
| `GET` | `/api/stats` | 知识库统计 Knowledge base stats |
| `POST` | `/api/upload` | 上传文件 Upload files |
| `GET` | `/api/chunks` | 列出片段（分页+筛选）List chunks (paginated) |
| `PUT` | `/api/chunks/:id` | 编辑片段 Edit chunk |
| `DELETE` | `/api/chunks/:id` | 删除片段 Delete chunk |
| `POST` | `/api/chunks` | 新建片段 Create chunk |
| `GET` | `/api/config` | 获取配置 Get config |
| `PUT` | `/api/config` | 更新配置 Update config |
| `POST` | `/api/sources/delete` | 删除数据源 Delete data source |
| `POST` | `/api/clear` | 清空知识库 Clear knowledge base |

---

## CI/CD

**CI** — 每次 push / PR 到 main 自动触发 | Auto-triggered on push/PR to main：
- 前端 Frontend：ESLint → TypeScript Check → Vite Build
- 后端 Backend：Ruff Lint → Pytest
- Docker：验证镜像构建 | Validate image builds

**CD** — 打 tag 或手动触发 | Triggered by tag or manual dispatch：
- 构建 Docker 镜像 → 推送到 GitHub Container Registry
- Build Docker images → Push to GitHub Container Registry

---

## 许可证 License

MIT
