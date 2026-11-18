# 测试策略注册表（Testing Registry）

> **本文件是测试策略的唯一事实来源（Single Source of Truth）。**
> 仓库与注册表的一致性由 `node scripts/ci/check-test-registry.mjs` 强制：
> 任何出现在仓库里、但没有登记在下表 Scope 中的测试文件/目录，都会产生明确的 CI 失败。

## 规则

1. **新增测试必须登记**：先把测试放进某个已登记的 Scope 目录，或在本表新增一行，再提交代码。否则注册表检查失败。
2. **一个测试只属于一个层级**：按被测对象的边界选择 Level，不按"写起来方便"。
3. **Metadata 是机器可校验的受控词表**（见下），不允许自由发挥新词；新词先加入 `ci-config.json → testRegistry.allowedMetadata` 并在此说明含义。
4. Runner 只允许出现在 `ci-config.json → testRegistry.allowedRunners` 中。
5. 登记了 Scope 但目录尚不存在是**允许**的（预登记）；目录存在但没有登记是**禁止**的。

## 受控词表（Metadata）

| 词 | 含义 |
|---|---|
| `fast` | 全量运行 < 10s，可随每次提交运行 |
| `slow` | > 10s 或需要真实构建/启动流程 |
| `isolated` | 用例间无共享状态，可安全并行 |
| `needs-network` | 依赖外部网络（打桩除外） |
| `needs-filesystem` | 需要真实文件系统读写 |
| `needs-display` | 需要 GUI/桌面环境（Electron 壳） |
| `needs-vm` | 需要虚拟机或系统级沙箱（landlock/seccomp 等） |
| `serial` | 禁止并行，必须串行执行 |
| `protected` | 受保护回归测试：修改/删除需人工审批（联动 ci-config.protectedTests） |
| `manual` | 不进常规 CI，手动触发 |

## 注册表

| Scope 作用域 | Level 级别 | Runner 运行器 | Args 参数 | Metadata 元数据 |
|---|---|---|---|---|
| `test/unit/` | 单元测试 | node | `--test test/unit/` | fast, isolated |
| `test/contract/` | 契约/回归测试 | node | `--test test/contract/` | fast, protected |
| `test/integration/` | 集成测试 | node | `--test test/integration/` | slow, needs-filesystem |
| `test/e2e/` | 端到端（CLI/桌面壳） | node | `--test test/e2e/` | slow, needs-display |
| `test/vm/` | 沙箱/系统级测试 | node | `--test test/vm/` | slow, needs-vm, serial |
| `tests/contract/` | 契约/回归测试（历史路径，CI 保护规则沿用） | vitest | `run tests/contract/` | fast, protected |
| `tests/unit/` | 单元测试（历史路径，CI 检查脚本自测） | vitest | `run tests/unit/` | fast, isolated |
| `tests/e2e/` | 真实 API 冒烟（keyless 自动跳过，AGENT_E2E_KEY 注入后才运行） | vitest | `run tests/e2e/` | slow, needs-network, manual |

## 层级选择指引

- **单元（unit）**：单个函数/模块，依赖全部打桩。CI 每次提交必跑。
- **契约（contract）**：锁定跨模块对外行为（如 CI 检查脚本自身的契约、配置 schema）。改坏=明确失败，修改需审批。
- **集成（integration）**：多个真实模块协作（会话内核 + 插件加载 + 工具管线），真实文件系统、无网络。
- **端到端（e2e）**：从入口启动完整产品路径（CLI 子命令、Electron 壳冒烟），需要显示环境。
- **系统级（vm）**：涉及沙箱、权限边界（landlock/审批策略），在隔离环境串行跑。

## 运行与检查命令

```bash
# 一致性检查（仓库测试 ↔ 本表）——遗漏未登记的测试会明确失败
node scripts/ci/check-test-registry.mjs

# 按层级运行
node --test test/unit/
node --test test/contract/
node --test test/integration/
```
