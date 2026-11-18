# 01 · DeepSeek Harness (dsh) 架构深度研究

> 研究对象：`deepseek-ai/deepseek-harness`，MIT，TypeScript，~105 万行 / 50+ packages
> 版本基准：dsh-v0.2.2-rc.1（developer preview，Node ≥ 24.9.0）
> 本文回答：dsh 的架构设计思路是什么？核心模块怎么分工？一轮 Agent 任务是怎么跑完的？

---

## 1. 设计思路：Agent = Model + Harness，且 Harness 没有特权核心

dsh 的定位不是模型，也不是产品，而是**套在模型外面的运行时骨架**——决定模型能看到什么、能调哪些工具、危险动作谁批准、出错怎么恢复。

它的架构宣言只有一句：

> **Everything is a Plugin. 仓库里没有"需要打补丁的核心"，扩展方式是把你的插件挂到别的插件旁边。**

传统 Agent 框架的痛点：所有模块 import 同一个特权核心，换一个 Bash 工具、换一个会话存储都要动核心 → fork 一次就永远离开上游。dsh 把这个问题在**架构层面**拆掉：

| 想换什么 | 做法 | 主循环感知 |
|---|---|---|
| 模型适配器 | 换 llm 插件 | 无感知 |
| 工具执行器/拦截器 | 在 tools/* 事件挂 waterfall listener | 无感知 |
| 会话持久化 | 替换 session 插件 | 无感知 |
| UI | 换/加 UI 插件（Web/Electron 共用底座） | 无感知 |

**配置本身就是架构**：一个运行中的 dsh 实例不是写死的应用，而是一张按顺序叠出来的**插件清单**。

---

## 2. 分层：Cordis 内核 → 核心包 → 插件树

```
┌─────────────────────────────────────────────────────┐
│ 入口层：Web UI / Electron / headless / Python SDK / ACP │
├─────────────────────────────────────────────────────┤
│ 组合层：profile（web/headless/sdk/sdk-minimal/acp）     │
│         bundle（dsh-base + 叠加包）→ patch 四层覆盖      │
├─────────────────────────────────────────────────────┤
│ 核心包层（全部是 Cordis 插件，各有 ctx 键）：             │
│  core/session        → ctx.sessions  追加式事件日志     │
│  core/system-prompt  → ctx.systemPrompt 提示词组装     │
│  core/tools          → ctx.tools     工具注册表+管线    │
│  core/agent          → ctx.agents    Agent 接口与注册表 │
│  core/agent-loop     → ctx.agentLoop 默认循环驱动器     │
│  llm/llm             → ctx.llm       消息/流式词汇+适配接缝│
│  core/scope          （库）per-agent 作用域注册原语      │
├─────────────────────────────────────────────────────┤
│ Cordis 内核：插件挂载/卸载/依赖（vendored，~7.6k 行）     │
└─────────────────────────────────────────────────────┘
```

关键概念：
- **profile（配置档）**：具名组装模板，列出叠了哪些 bundle。官方五档：`web`（浏览器 UI）、`headless`（跑一次就退）、`sdk`（JSON-RPC 服务端）、`sdk-minimal`（不套 dsh-base 的极简树）、`acp`（自动化协议入口）。
- **bundle（分发包）**：Cordis 配置行 + 挂载代码的分发格式。`dsh-base` 是共享第一层：模型适配器、工具、持久化、沙箱与审批策略、设置、凭据、遥测。
- **patch（补丁）**：按行 id 定位某条配置并**整段替换**或插入新行。层叠顺序：profile bundles → profile 的 cordis.patch.yml → 主目录 patch → 命令行 `--patch`。
- **自省**：`dsh --profile web --dump-config` 打印本机最终生效的整棵配置树——打印出来的任何一行都可以被你自己的 patch 换掉。

---

## 3. 执行模型：turn / step 两阶段 + PreparedStep 冻结

dsh 把执行拆成两个层次（源码：`packages/core/agent-loop/src/agent.ts`）：

- **Step（步）** = 一次模型请求 + 这次请求调起的全部工具调用。
- **Turn（轮）** = 0..n 个 step，从认领第一条输入开始，到"没有任何欠账"为止。

一轮的完整流转：

```
turn/start
  → 认领输入（inbox）
  → 快照模型选择
  → agent/pre-step（waterfall 链：可 reject step / 改写消息 / 放行）
  → 组装 system prompt + 工具 schema ┐
  → step/start                       │ 这一步内全部 frozen
  → 模型请求（ctx.llm 适配器，流式）    │
  → 工具调用走三段管线：               │
       tools/pre-execute（校验/拦截）  │
       tools/execute   （沙箱内执行）  │
       tools/post-execute（结果加工）  │
  → 结果写入 tool/result（SessionEvent 落盘）
  → step/end
  → 还有欠账（工具欠请求/新输入）？→ 认领下一步
  → agent/turn-stopping（串行）→ turn/end
```

两个重要工程细节：
1. **PreparedStep 冻结**：step 开始时，prompt section、模型选择、工具集合全部快照冻结——执行中途不可改。跨 step 换模型必须开新 turn。这保证了单步内状态一致。
2. **失败不静默**：失败的步骤把"缺失的工具结果"记录进日志，不会悄悄丢掉——重放/续跑时能还原出错现场。

---

## 4. 会话内核：append-only 事件流 + Projection

- 会话持久化是**只追加（append-only）的 SessionEvent 日志**，每个 event 带单调递增 `seq` + `type`。落盘为 `$DSH_HOME/sessions/<workspace>/session-*/session.v4.jsonl.zstd`（zstd 压缩的 JSONL）。
- **当前状态是投影（Projection）算出来的**：进程重启时重放一遍 log 就能还原全部状态（inbox 里 pending 哪些消息、哪些工具没执行完）。投影 schema 用 Zod 严格校验——非法状态变更直接抛错，保证重放不产生错误状态。
- **Append-only 的额外收益**：会话开头部分稳定不变 → 对 prompt caching（前缀缓存）极其友好。实测一次小任务 32.6K input / 572 output，缓存命中 75%。
- **一条事件流吃四方**：resume、fork（从某条消息分支新会话）、搜索、回放全部读同一流，没有第二套数据库要同步。
- 会话头部事件记录了会话出生配置：`permission/preset`（如 workspace-write）、`sandbox/mode`、`approval/policy`——审计时连"当时给了什么权限"都可回放。

---

## 5. 事件系统：三类事件域 + 五种分发模式

### 三类事件域（改动的第一个决定 = 选对域）

| 事件域 | 持久化 | 典型事件 | 用途 |
|---|---|---|---|
| **Session events** | ✅ 落盘 | turn/start、step/start、user/message、assistant/message、tool/call、tool/result、turn/end | 事实——重载后必须还在 |
| **Agent events (agent/*)** | ❌ 实时 | agent/pre-step、agent/request、agent/status、agent/assistant-stream、agent/turn-stopping | 观察/拦截进行中的工作，带 live Agent 引用 |
| **Capability events** | ❌ 适配层 | fs/*、tools/*、telemetry/*、llm/stream | 把策略挂到某个"接缝"上 |

### 五种分发模式（Cordis EventsService）

| 模式 | 等待? | 顺序? | 返回值 | 典型用途 |
|---|---|---|---|---|
| emit | 否 | 注册顺序 | 无 | 广播事实（session event） |
| **waterfall** | 否 | 注册顺序 | 有（中间件链） | 工具管线（必须调 `next()`） |
| parallel | 是 | 并行 | 无 | 独立观察（telemetry） |
| serial | 是 | 注册顺序 | 有 | 串行决策 |
| bail | 否 | 先到先停 | 有 | 短路判断（policy） |

waterfall 是中间件的标准形态：每个 listener 收到 `(...args, next)`，要么 `next()` 放行，要么 return 短路。**tools/pre-execute → execute → post-execute 就是一条 waterfall 链**。

---

## 6. 模型接入与调度

- **模型路由本身是插件**。Settings → Models 换 provider/改 Key，下一次请求立即生效，无需重启。
- 协议支持：**OpenAI Chat Completions、OpenAI Responses、Anthropic Messages** 三种 wire 协议；官方目录内置 DeepSeek/Anthropic/OpenAI/Kimi/GLM，Bedrock/Vertex/Azure/Codex 用原生凭据；任意 OpenAI 兼容端点走 Custom Model API（Provider ID + Base URL + 协议 + "拉取可用模型"）。
- **凭据只写不回显**：Key 存 `$DSH_HOME/.credentials.yaml`（权限 600），Settings 界面只显示脱敏引用。
- 会话记住自己用的模型（记录在历史里），改模型设置只影响之后的请求。

## 7. 工具、沙箱与审批

- **工具 = 作用域化注册表 + 带把关的执行管线**（core/tools + core/scope）。每个 agent 一套作用域，工具不是全局裸露的。
- 沙箱与审批策略是 dsh-base 的固定组成：会话出生时记录 sandbox mode（如 workspace-write）与 approval policy（如 ask）。模型要执行任何命令都不是直接跑——运行时把工具调用变成真实进程、套沙箱、执行、回收 stdout/stderr/exit code，每步先落日志。
- 子代理：Claude Code / Codex 可作为官方 bundle 装成"外部子代理 provider"；子代理会话在「会话层级」树中展示为父子关系。

## 8. 上下文管理（dsh 自带）

- `compaction` 插件：接近上下文上限时，用隐藏的 summarization agent 汇总较早历史，在 token 预算内保留近期 turns；旧工具输出可被裁剪。
- Web/桌面输入框支持 `/compact` 手动触发。
- append-only 日志 + 投影意味着压缩只是"投影时少看一段"，**原始事实永远在**——这是 dsh 上下文管理比"有损压缩"高明的地方。

## 9. 已验证的生态外延（说明这条架构路线跑得通）

- **dsh-superagent-prototype**（2026-10-31 开源）：Router（常驻接待/分派/共享上下文）+ Worker（按工单并行、上下文隔离）+ Watchdog（盯死循环与失败）。它就是装在 dsh 上的一个 bundle——证明"多 Agent 编排"可以完全建在插件层。
- **Claude Code hooks 兼容桥**：把 Claude Code 的 hooks.json 映射到 dsh hook 面——证明协议兼容层的可行性。

## 10. 对自研的启示（结论）

1. **不要 fork dsh 源码**——写自己的插件 + 自定义 profile/desktop bundle，这是它设计的本意，升级只做适配。
2. **会话事实层照抄**：append-only 事件日志 + Projection + 单一事件流支撑 resume/fork/replay/search，是轨迹视图、审计、续跑的统一地基。
3. **turn/step 冻结语义照抄**：prompt 与工具集在 step 内冻结，跨步换模型开新轮——简单且防状态撕裂。
4. **风险**：developer preview 破坏性变更、Cordis Proxy DI 有 30-50% 热路径开销、依赖图复杂导致初始化重——单机桌面产品要控制插件树的规模。
