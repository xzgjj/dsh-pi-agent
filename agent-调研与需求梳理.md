# 自研 Agent（dsh 风格桌面版）需求梳理与复用调研

> 2026-11-18 · 调研报告 v1
> 目标：做一个"自己的 Agent"——以 **DeepSeek Harness (dsh)** 为架构底座，桌面化打包，会话式交互（ChatGPT 风格），兼容 dsh 插件/MCP/Skill 生态，并增加 WorkBuddy 式工作台（PPT/网页右侧编辑面板）。

---

## 0. 先解开两个"记不清"

| 你听说的 | 实际是什么 | 结论 |
|---|---|---|
| "pi" | **Pi Coding Agent**（badlogic/pi-mono，Mario Zechner，MIT，TS） | 极简 harness + 上下文工程标杆，适合抄上下文管理思想 |
| "dsh 开头的那个" | **DeepSeek Harness**（deepseek-ai/deepseek-harness，命令行就叫 `dsh`，MIT，TS） | 就是你想参考的主对象，28 万+ star，"一切皆插件" |

你的记忆没错——这两个恰好就是 2026 年公认"模型底层调用与上下文管理"做得最好的两个 harness。

---

## 1. 需求梳理（从你的描述结构化）

### 1.1 核心定位
- **形态**：本地桌面应用（打包安装，不是 `npx` 拉起的临时服务）——类似 dsh 的 Electron 桌面档，但做成独立产品。
- **交互范式**：**会话制（ChatGPT 式）**，而不是"项目制"。
  - ✅ 默认新建一个干净会话；选了会话才挂对应上下文。
  - ❌ 不像 dsh/Claude Code 默认按 workspace 扫描目录、自动加载 AGENTS.md/CLAUDE.md 和全部 skill——这些改为**会话可选、按需加载**。
- **页面布局**：复刻 dsh Web UI——左侧会话侧边栏 + 中间对话流 + 右侧条件面板。

### 1.2 功能清单（对标 dsh）
| 功能 | 说明 | 来源参考 |
|---|---|---|
| 对话 | 多会话、可恢复、可 fork 分支、可搜索 | dsh session 内核（JSONL+SQLite） |
| 轨迹 Trajectory | 逐条回看系统提示词、推理、工具调用参数/返回、文件 diff——"黑匣子回放" | dsh Trajectory 视图（你明确要的核心功能） |
| 终端 + 文件管理 | 内嵌终端 + 文件树侧栏 | dsh terminal 插件 + OpenCode/Cline 的文件面板 |
| 模型设置 | Settings→Models：添加官方/自定义 provider（Base URL、协议、Key），Key 只写不回显 | dsh 已有成熟实现（OpenAI Chat/Responses、Anthropic Messages 协议） |
| 插件系统 | **兼容 dsh 插件协议**（Cordis、dsh-plugin 生态可直接装） | dsh |
| MCP | 内置 MCP 客户端插件，外部工具按 MCP 注册 | dsh mcp 包 |
| Skill 系统 | 与 dsh/Claude Code 兼容的 SKILL.md 按需渐进加载 | dsh skill 包 + pi 的 progressive disclosure |
| 工作台（差异化） | 处理 PPT / 网页时右侧出现编辑面板（Canvas），平时不出现，默认仍是纯对话 | WorkBuddy / ChatGPT Canvas 模式 |
| 子代理/后台任务 | 后台长命令、子代理任务面板（Job Panel） | dsh jobs/subagent |

### 1.3 明确不做 / 后置
- 云端多人协作、评测基础设施、团队审批策略——单机优先。
- pi 式"无权限弹窗"激进路线——保留审批门，但做成会话级开关。

---

## 2. 复用对象调研（推荐清单，按复用价值排序）

### ★★★★★ DeepSeek Harness（dsh）— 主底座
- `deepseek-ai/deepseek-harness`，MIT，TypeScript，27.8 万 star，developer preview（v0.2.2-rc）
- **架构**：基于 Cordis 元框架，"Everything is a Plugin"。模型适配器、工具注册表、会话日志、甚至 Agent 主循环本身都是插件，由 profile + patch 配置层叠组合，无需改核心。
- **复用方式**：不是 fork 改源码，而是**写自己的插件 + 自定义 profile/desktop bundle**——这是它设计的本意，"fork 税"为零。
- 50+ 官方包：sandbox、guard、mcp、skill、subagent、team、terminal、jobs、schedule、lsp、compaction、plan、todo、workflow、workspace、credentials、telemetry…
- ⚠️ 风险：developer preview，官方声明会有破坏性变更 → 锁版本、把自有能力全部放进自己的插件，升级时只处理适配层。

### ★★★★★ Pi（badlogic/pi-mono）— 上下文管理思想来源
- MIT，TypeScript monorepo（pi-ai / pi-agent-core / pi-coding-agent / pi-tui 分层，层间依赖强制）。
- **pi-ai 统一 LLM 层**：抹平 4 种 wire 协议（OpenAI Completions/Responses、Anthropic Messages、Google GenAI）、15+ provider、会话中途换模型——这块可以直接拿来当模型适配层参考甚至直接依赖。
- **上下文工程精华**（建议整套抄设计）：
  - 系统 prompt < 1000 token（激进极简）
  - 会话 = **append-only 树（DAG）**，JSONL 落盘，支持分支/回溯/换模型
  - compaction：结构化摘要（目标/约束/进度/决策/下一步/关键上下文）+ 累计文件追踪 + 分裂轮处理
  - skill 渐进披露：触发匹配才加载，保护 prompt cache
- 可直接以包形式只用 pi-ai 层，不必接受整个 pi 工作流。

### ★★★★ OpenCode — 多客户端共享运行时 + 会话投影
- MIT，Go→TS，114k star。核心循环 `session/prompt.ts` 约 700 行。
- 值得抄：**Agent Profile 机制**（一个循环装不同身份：Build/Plan/Explore/隐藏的 Compaction/Title/Summary agent）、Session/Message/Part 投影进 SQLite、Doom-Loop 检测（同参数连续调 3 次自动暂停）。
- 你的"会话制"改造成本参考它：多界面只提交请求 + 消费事件流，状态在服务端 Session。

### ★★★★ Codex CLI — 安全沙箱 + token budget
- Apache 2.0，Rust（96%），2026-08 开源，**可读的生产级 harness 范本**。
- 值得抄：landlock/seccomp 系统级沙箱三级权限、队列对（tx_sub/rx_event）外观模式让 TUI 不阻塞、**token budget 替代 compaction** 的新思路（模型知道剩余额度、主动切换窗口、history/notes 工具保记忆不压缩）。

### ★★★ 参考级
| 项目 | 价值 |
|---|---|
| Cline | 每步审批的权限模型 + Shadow Git（工具执行后自动 commit 快照，可回滚任意一步）|
| Aider | Repo Map（tree-sitter 抽签名，省 token）|
| Goose | MCP 优先的 70+ 扩展生态（Linux 基金会）|
| OpenHands | 事件流架构、Docker 沙箱默认隔离 |

---

## 3. 四个方向的架构与链路

### 3.1 Agent 主循环（所有项目同构，约 1000-2000 行 TS 可写完）
```
while(true):
  1. 组装 system prompt + 工具 schema + 会话历史 → 调 LLM（流式）
  2. 返回含工具调用? 否 → 输出回答，轮结束
  3. 是 → 走工具三段管线：pre-execute（校验/拦截）→ execute（沙箱）→ post-execute（结果加工）
  4. 结果写回会话历史，回到 1
```
dsh 的术语：**步 = 一次模型请求+其工具；轮 = 0..n 步，从认领输入到没有欠账**。事件流：turn/start → step/start → tools/* → step/end → turn/end。失败步骤记录缺失的工具结果，不静默丢弃。

### 3.2 上下文管理（三条流派，建议混合）
| 流派 | 代表 | 机制 | 适用 |
|---|---|---|---|
| Compaction | pi / Claude Code / dsh | 阈值触发 → LLM 结构化摘要旧行为，保留近 20k token | 通用，成熟 |
| Token Budget | Codex 新方案 | 模型被告知剩余额度，主动切窗口；history/notes 工具保留完整记忆 | 长任务不失忆，前沿 |
| Repo Map / 渐进披露 | Aider / pi | 只给签名地图；skill 触发才加载 | 省 token、保 cache 前缀稳定 |

**建议**：底座用 compaction（dsh 自带），会话制改造点在于——**默认会话不带项目扫描**，AGENTS.md/CLAUDE.md/skill 改为"会话设置里显式勾选要挂载的工作区和规则"。

### 3.3 插件与协议体系（你的兼容性需求）
- **dsh 插件**：Cordis 插件向共享上下文贡献"服务 + 类型化事件 + 可撤销副作用"；卸载自动回退；`dsh --dump-config` 可打印整棵插件树，任何一行可被 patch 替换。你的产品 = 一组自定义 bundle 叠在 dsh-base 上 → 天然兼容 dsh-plugin 生态。
- **MCP**：dsh 内置 MCP 客户端插件，直接复用；这是 2026 年事实标准（Claude Code/Cline/Goose/Copilot 全支持）。
- **Skill**：SKILL.md 渐进加载格式已被 dsh/Claude Code/Codex/pi 通用化，直接兼容。
- **CLI 工具**：pi 的思路可借鉴——CLI 工具 + README 即 skill，不必都做成 MCP server。

### 3.4 UI 形态与链路（dsh Web UI → 桌面）
dsh 的入口共享同一会话内核（JSONL+SQLite，session_root 持久化），所以 Web/桌面/SDK 天然同数据。你的布局映射：

```
┌─────────────┬───────────────────────┬──────────────────┐
│ 会话侧边栏   │  对话流（Conversation）│ 条件面板（默认隐藏）│
│ 分组/搜索/   │  ├ 消息 + diff 摘要     │ PPT 编辑器        │
│ 层级/归档    │  ├ [对话|轨迹] Tab      │ 网页 Canvas 预览  │
│             │  ├ 分支/重试/👍👎       │ 文件树 + 终端      │
│             │  └ 输入框+模型选择      │ （按任务类型出现） │
└─────────────┴───────────────────────┴──────────────────┘
   Settings 页：通用 / 模型（添加 provider、Key 只写不回显）/ 插件 / Agent 预设
```

**条件面板（你截图的 WorkBuddy 行为）实现思路**：
1. 会话事件流里已有任务类型信号（模型在读 pptx / 写 html）→ 前端监听 session 事件。
2. 面板本身做成 dsh 的 **UI 插件**（dsh 支持插件扩展 UI/React 组件，Creator 预设就是干这个的）→ 面板按"任务声明"显隐，默认纯对话。
3. PPT 渲染用 html 预览（doc-typeset 类 HTML→PPT 流程），网页用 iframe/内置浏览器预览 + 双向编辑。

---

## 4. 推荐总体方案（一句话版）

> **以 dsh 为运行时底座（插件 + profile 方式接入，不 fork 核心），抄 pi 的会话树与 compaction 设计，借 OpenCode 的 Profile/投影和 Codex 的沙箱/预算思想，桌面壳用 Electron 复用 dsh desktop 档，UI 复刻 dsh Web 布局 + WorkBuddy 式条件工作台插件。**

### 分层架构
```
┌─ 桌面壳（Electron）：窗口/托盘/自动更新
├─ UI 层：会话侧边栏 · 对话流 · 轨迹视图 · 条件工作台面板（PPT/网页）
├─ 入口适配：本地 IPC/WebSocket → JSON-RPC（对应 dsh sdk profile）
├─ 运行时（dsh-core）：agent-loop · session(JSONL+SQLite) · system-prompt · tools 管线
├─ 能力插件：mcp · skill · terminal · fs · jobs · subagent · sandbox/guard
├─ 模型层：llm 适配器（pi-ai 或 dsh llm 包；OpenAI/Anthropic/自定义协议）
└─ 自有插件包：会话制改造（默认不扫盘）· 工作台面板 · 轨迹增强
```

### 落地路线图
1. **M1 可跑（2-3 周）**：`npx @deepseek-ai/dsh web` 跑通 → 用 sdk/headless profile 挂 JSON-RPC → Electron 壳包一层，验证模型配置/对话/终端。
2. **M2 会话制改造**：默认会话 = 空上下文；工作区/AGENTS.md/skill 改为会话设置挂载项；会话列表/搜索/fork。
3. **M3 轨迹与文件面板**：Trajectory 视图直接消费 dsh session 事件；加文件树+内嵌终端。
4. **M4 工作台插件**：检测 PPT/网页任务 → 右侧面板显隐；PPT 走 HTML→PPTX 管线，网页 iframe 预览。
5. **M5 生态**：直接装 dsh-plugin 生态插件 + MCP 服务器；锁 dsh 版本应对破坏性变更。

### 关键风险
- dsh 仍是 developer preview（破坏性变更）→ 一切自有逻辑放自己插件里，升级只适配接口。
- 桌面打包要处理 dsh 运行时随包分发（dsh 官方 Electron 档已验证此路径可行）。
- 条件工作台面板是全链路里唯一没有现成开源可整体复用的部分（可参考 OpenHands Agent Canvas 的多 harness 驱动思路）。

---

## 5. 一页速查：各 Agent 核心循环位置（想读源码从这里下手）
| 项目 | 主循环位置 | 特点 |
|---|---|---|
| OpenCode | `packages/opencode/src/session/prompt.ts`（~700 行） | 最易读 |
| Cline | `src/core/task/index.ts`（3547 行，一坨） | 权限+Hooks |
| Codex | `core/src/session/`（Rust，队列对） | 沙箱+预算 |
| pi | `pi-agent-core`（刻意极简） | 上下文工程 |
| dsh | `core/agent-loop` 插件 | 一切皆插件 |
