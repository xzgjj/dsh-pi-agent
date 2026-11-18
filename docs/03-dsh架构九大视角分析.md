# 03 · dsh 架构的九大视角分析（IoC / DI / 生命周期 / 作用域 / AOP / 事件 / 动态组合）

> 分析对象 = dsh 的底座 **Cordis**（cordiverse/cordis，7,634 行 TS，零运行时依赖，MIT）。
> 论文基础：《A Programming Paradigm for Spatiotemporal Composability》（时空可组合性）。
> DeepSeek fork 后独立发版为 @deepseek-ai/cordis 4.0.1。
> 本文把 dsh 的架构逐个拆成九个经典软件工程视角，供自研时"抄思想不抄代码"或"直接复用"做决策。

---

## 0. 一句话总纲

Cordis 把 Spring 风格的 DI 容器、Rust 风格的 RAII 自动清理、Erlang 风格的进程隔离、Vue 3 的 Proxy 响应式，缝合成一个极小的插件内核。它解决的正是两个正交维度：
- **时间可组合性（Temporal）**：组件卸载时，它的所有副作用可被完整、安全地撤销。
- **空间可组合性（Spatial）**：组件声明依赖什么服务，不关心谁提供、何时出现；依赖变化时自动调整。

---

## 1. IoC 容器

- **Context 就是一切的核心容器**：所有服务（`ctx.tools`、`ctx.llm`、`ctx.sessions`…）注册在 Context 上。
- Context 是**层级化**的：根 Context 通过 `ctx.plugin()` 派生子 Context，子级再派生孙级，形成**作用域树**。
- 实现要点：Context 在构造时把自己包进 `new Proxy(this, ReflectService.handler)`，属性访问 `ctx.foo` 路由到 `reflect.store[key]`；**service 的存储 key 是 Symbol（root 首次 provide 时分配），不是字符串**——同名服务在不同 isolate 下对应不同 Symbol，这是作用域隔离能成立的物理基础。
- 内核纪律："**内核只做三件事**——生命周期管'装得进卸得掉'，插件解析管'理得清依赖'，上下文传播管'传得了数据'"。路由、命令、网络、存储、权限……全部构建在内核之上的插件（Koishi 就是这么一路搭出来的，dsh 也是）。内核一旦掺和业务逻辑，插件就再也薄不下来了。

> 自研启示：如果直接复用 @deepseek-ai/cordis，第 1-9 节全部白送；如果自研轻量内核，至少抄"Context 树 + Symbol key + 可逆副作用"这三件。

## 2. 依赖注入

- Cordis 用的是**服务定位器（Service Locator）模式，而不是构造函数注入**：`ctx.provide('name', impl)` 注册，消费方 `ctx.name` 直接取——依赖声明通过 **`inject`** 完成（声明式依赖，demand-driven，避免构造函数注入的强耦合）。
- **依赖图推导加载顺序**：一个插件声明它需要哪些 service，Cordis 等这些 service 都存在后再 load——不用手写 boot sequence。
- **响应式 coeffect**：依赖的服务提供方变化时，依赖它的插件会被**自动停用并重新激活**（fiber epoch 机制：所有依赖 fiber.uid 用 `:` 拼接成 epoch 字符串，epoch 变化 → 触发 unload/reload）。
- @Inject 装饰器甚至支持 **method 级依赖**（TC39 Stage 3 decorator 的 addInitializer），依赖触发时机延迟到 init hook——"service 内部方法按需申请依赖"。

> 与 NestJS 对比：NestJS 有 DI 但没有 effect tracking（写插件的人仍要手动清 timer/listener）；Cordis 把 DI 和清理绑在一起。

## 3. 服务抽象

- dsh 的关键抽象是**接缝（Seam）**：一个可替换的能力位，由三个角色构成——
  1. **Service Definition**：声明接口（如"一个 llm 适配器长什么样"）；
  2. **Service Provider**：实现它（如 anthropic-messages 适配器）；
  3. **Consumer**：使用方（如 agent-loop）。
- 接缝是"换一个 provider 就换掉整个产品形态"的原因。核心接缝：`ctx.llm`（模型）、`ctx.tools`（工具）、`ctx.sessions`（会话）、`ctx.systemPrompt`（提示词）、`ctx.agentLoop`（循环驱动）。
- **服务继承沿树向下**（原型链实现）：根上提供的 database，子级孙级都能 `ctx.database` 拿到；父级看不到子级私有服务——天然的隔离。
- 最佳实践（官方口径）：**插件之间一律通过 ctx 上的服务通信，而不是相互 import 源码**——"换实现不影响调用方"的根本前提。

## 4. 模块边界

- dsh 的边界不是目录，而是**事件域 + ctx 键**：
  - `core/session` 只管追加日志与内存存储，不知道 agent-loop 存在；
  - `core/agent-loop` 只管步/轮推进，通过 `ctx.llm` 的接口调模型，不 import 任何 provider；
  - `llm/llm` 只定义消息/流式词汇与适配器接口，不关心谁驱动它。
- 边界的检验标准：**换掉任何一个核心包插件，其他层零改动**。这是"无特权核心"的可测试定义。
- 自研时建议把自己的功能全部写成"contributing to a seam"的形式：每加一个能力先问"它挂在哪个接缝上？卸载时怎么回退？"

## 5. 生命周期

- **Fiber 是生命周期单元**：每个插件加载时从当前 ctx 派生子 ctx，插件内的全部副作用由子 ctx 管理，插件整体作为副作用被父级收集。
- **Effect-as-RAII**：`effect(execute, label)` 接受返回 `Disposable | Iterable | AsyncIterable` 的函数；插件作者只写业务，**清理代码由 dispose 闭包返回时"自动拥有"**。`ctx.on()`、`ctx.command()`、注册 tool schema、prompt section——几乎每个 API 都是"某个函数的可逆化版本"，开发者不理解理论也能自然写出可逆插件。
- 卸载：同步执行 dispose、cleanup hook 异步执行；**DisposableList 用 WeakMap + 序号实现 O(1) 按引用删除**，`_disposables` 高效回滚；inertia 锁保证 reload/unload 不并发。
- dsh 层面的对应：插件卸载 → 它注册的 tool schema、prompt section、事件监听、UI 组件全部自动消失，无需手写清理。

## 6. 作用域（Scope）

三个正交操作（这是 Cordis API 表面上最值得精读的部分）：
| 操作 | 语义 | 典型用途 |
|---|---|---|
| `extend(meta)` | 创建子 context，原型链继承父 | 组织层级（profile → bundle → plugin） |
| `isolate(name)` | 把服务名映射到新 Symbol | **会话/请求隔离**——每个 agent/会话一套独立的 tools/session 实例 |
| `intercept(name, config)` | 在原型链上累加 intercept 配置 | **不改 service 实现就改配置**——"局部定制 + 全局兜底" |

- dsh 的 `core/scope` 包把这套原语用在 agent 维度：**per-agent 作用域隔离**的注册表。
- 精细控制还有 `ctx.intersect()`、`ctx.groups()`（按用户分组、按条件隔离）。
- tracker + shadow receiver：service 方法被调用时 `this` 被替换为带 ctx 属性的 shadow receiver——**service 内部写 `this.ctx` 永远拿到"当前调用方的 ctx"而不是创建时的 ctx**——这是 isolate 语义成立的运行时基础。

> 自研对应：你要的"会话制"天然需要这个——每个会话一个 isolate 作用域，工具集/挂载规则/模型互不串味。

## 7. AOP / 拦截

- dsh 没有"切面"这个词，但 waterfall 事件就是标准中间件洋葱模型：
  - `agent/pre-step`：step 开始前跑一遍——每个插件可以 **reject 这个 step / rewrite 用户消息 / 放行**（= 环绕通知）；
  - `tools/pre-execute`：校验与拦截（= 前置通知），`tools/post-execute`：结果加工（= 后置通知）；
  - `llm/stream`：模型流上挂策略（= 对模型调用的环绕）。
- 规则：waterfall listener 必须调用 `next()` 才继续——忘记就短路（这是使用时的最大坑，但换来"任意点可拦截"的表达力）。
- Claude Code hooks 兼容桥证明：外部生态的 hook 系统（hooks.json）可以映射到这套拦截面上。
- Cline 有 7 个生命周期钩子、可返回 `{cancel:true}`——同思路的另一种实现。

## 8. 事件驱动

- **类型化事件**：服务通过 TypeScript declaration merging 声明事件类型，dispatch 时选模式（emit / waterfall / parallel / serial / bail，见 01 号文档第 5 节）。
- **三类事件域**的核心决策：**事实持久化、过程实时、策略适配**三分——写扩展前先决定事件该属于哪个域，这个纪律值得照抄。
- 事件沿 Context 树流动（emit/serial/parallel），插件之间通过事件协作而不是拿彼此引用——"短生命周期的数据流"。
- 与"长生命周期的服务继承"正好互补：**共享与隔离统一在同一原语（Context 树）里**——想共享就在上层 provide，想隔离就开子 Context。

## 9. 动态组合

- **profile → bundle → patch 四层叠加**就是动态组合的配置面：运行实例 = 按序叠加的插件树；`--dump-config` 可打印整棵树；任何一行可被 patch 换掉。
- 四种入口（Web/headless/SDK/ACP/桌面）共享同一会话内核——**入口是插件，底座是同一棵树**。
- **HMR（Node 下的热更新）**：chokidar 监听 + 模块缓存备份 + 全量重导入 + rollback 三件套；"accepted/declined 分类算法"决定哪些改动要 reload、哪些只是传递性。Creator 预设甚至支持"内存中试装插件"。
- dsh-superagent 证明组合的上限：Router/Worker/Watchdog 三个角色全部用 bundle 表达，没改一行 dsh 核心。

---

## 10. 取舍清单（照抄什么、警惕什么）

**换来什么**：所有能力可替换、可 patch；卸载干净无泄漏；依赖图自动推导；同一运行时吃四方入口。

**付出什么**：
- Proxy DI 热路径 30-50% 属性访问开销（对 UI 高频路径要注意）；
- 初始化重、依赖图复杂（105 万行的代价）；
- waterfall 忘调 next() 就静默短路；
- schema 严格是双刃剑（非法状态直接抛错，好也不好）。

**给自研的决策建议**：
1. 直接复用 `@deepseek-ai/cordis`（MIT），不重写内核——九大视角全部白送，且与 dsh 插件生态天然兼容。
2. 自己写的每个能力（会话制改造、工作台面板、轨迹增强）都做成插件，贡献到接缝上。
3. 会话级 isolate 用 `isolate()` 实现；工作台面板的显隐用事件域（capability events）驱动 UI 插件。
