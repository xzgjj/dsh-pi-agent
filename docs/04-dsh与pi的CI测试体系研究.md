# 04 · dsh 与 pi 的 CI / 测试体系研究（本项目 CI 设计依据）

> 研究对象：`earendil-works/pi`（pi-mono，原 badlogic/pi-mono）的 `.github/workflows/ci.yml`；
> DeepSeek Harness (dsh) 的公开工程文档（测试分层五~七层、事故复盘）。
> 本文是分析文档，不设字数上限；结论落地见 `SPEC.md` 与 `scripts/ci/`（一个事实一个家）。

---

## 1. pi 的 CI 结构（ci.yml 实测要点）

| 设计点 | pi 的做法 | 我们是否采用 |
|---|---|---|
| 触发与并发 | push(main)+PR；`concurrency` 同 ref 取消旧运行 | ✅ 采用（省资源、反馈更快） |
| job 拆分 | build-check / test(矩阵：coding-agent、durable、chord、other) / mcp-conformance，慢套件不背靠背 | ✅ 思想采用：docs / quality / governance 三 job |
| 聚合命令 | `npm run check` 一个命令跑 lint+type+杂项 | ✅ `npm run check` + `npm run ci` |
| 契约基线 | mcp-conformance 对照 `baseline.json`，回归即红 | ✅ 对应我们的 contract 层 + ci-config 契约测试 |
| PR 门禁 | 独立 `pr-gate.yml` + `approve-contributor.yml`（机器人提交审批流） | ⚠️ 暂不需要（单人阶段），保留 CODEOWNERS + 标签门禁 |
| 动作版本 | actions 全部 pin 到 commit SHA | ⚠️ 准备阶段用 @v4，开源后 pin SHA |
| 无密钥 CI | conformance/e2e 在缺密钥时自动跳过保持绿色 | ✅ 采用（AGENT_E2E_KEY 门控） |

## 2. dsh 的测试分层（tier 体系，五~七层）

| 层 | 命令 | 抓什么 | 对本项目 |
|---|---|---|---|
| Unit | `pnpm run test`（vitest，tests 与代码同区） | 边界、错误路径、事件顺序、并发竞态；每个注册表一个 HMR 安全测试 | ✅ `tests/unit/`（monorepo 后移到包内） |
| Coverage gate | `test:coverage`（逐文件 100%） | 未覆盖行 = 死代码提醒，删而不是补 | ⏸ 无 src，M1 后引入并定基线 |
| Real-API e2e | `test:e2e`（带密钥打真 provider） | 单元全绿≠能用；价值最高的是真实入口冒烟 | ✅ 占位已建，密钥门控自动跳过 |
| Snapshot | `test:snapshot`（无密钥锁对外行为） | CI 强制只读 replay，record/refresh 只在本地 | ✅ 目录与规范已建，未启用 |
| Expected / bench | `test:expected` / `test:bench` | 组装后 CLI 预期输出 / 性能 | ⏸ M1 后评估 |

dsh 复盘核心教训（直接写进我们的纪律）：
1. **测试必须走真实入口路径**——mock 一切 + 快照刷新当验收 = "单元全绿、产品却坏"。
2. **断言外部世界而非自我报告**——未修改的文件应逐字节一致。
3. **文档与源码永不漂移**——dsh 用 verify-type-equiv 门禁解析类型+JSDoc 断言文档代码块一致；
   我们先用"一个事实一个家 + 重复段落查重"做轻量版，类型级门禁 M1 后评估。
4. **contract-regressions 常驻**——防约定回归的永久测试（对应 `tests/contract/ci-contract.test.mjs`）。

## 3. 人类 vs 模型：为什么 CI 规则长这样

模型的偏置：事无巨细堆细节、文档越写越长、顺手加抽象、绕过检查让红灯变绿。
这些不可靠"自觉"，只能靠**每次修改后自动发生**的可判定检查：
反馈越早，失败与刚引入的改动的因果越容易定位。所以规则表按"问题 → 自动检查 → 人工判断"组织：
CI 拦一切可判定的；例外（超 diff 预算、删测试、改规则）由人批准，批准者与开发者分离。

## 4. 已落地的取舍（本阶段）

- 语言与工具链与对齐对象一致：TypeScript + Node 22 + vitest（pi/dsh 同款）。
- 字数预算而非禁止长文：分析文档无上限（研究需要厚度），规划文档 ≤3000 字（规划要薄）。
- diff 预算而非禁止大改：白名单豁免锁文件，超限走人工批准。
- 重试上限 2 轮：agent 修 CI 失败时防止无限循环；workflow 内零重试步骤。
- 未做（明确后置）：覆盖率门禁、pin SHA、PR label bot、类型-文档一致性门禁、浏览器快照。
