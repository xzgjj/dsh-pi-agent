# tests/ — 测试架构（准备阶段版）

分层抄自 dsh（DeepSeek Harness）的 tier 测试体系，按本项目当前阶段裁剪。
每层一个目录、一条命令、一个明确职责；**测试文件最终跟被测代码走**（packages 出现后，
包内测试放包内 `tests/`，此目录保留 contract / e2e / snapshot / fixtures 四个跨包层）。

## 分层

| 层 | 目录 | 命令 | 抓什么 | 现状 |
|---|---|---|---|---|
| 单元 | `tests/unit/` | `npm run test` | 边界、错误路径、纯函数行为 | ✅ 已启用，当前测 CI 脚本自身 |
| 契约（受保护） | `tests/contract/` | `npm run test` | 防约定回归：CI 规则只严不松 | ✅ 已启用，修改须维护者批准 |
| 真实 API e2e | `tests/e2e/` | `npm run test`（带 `AGENT_E2E_KEY` 才跑） | 真实入口 + 真实模型冒烟 | ⏸ 占位，无密钥自动跳过 |
| 快照 | `tests/snapshot/` | CI 只读 replay | 锁定对外行为（无密钥） | ⏸ 未启用，见其 README |
| 夹具 | `tests/fixtures/` | — | 只读静态输入 | ✅ |

## 与未来 monorepo 的关系

dsh 纪律：测试与被测代码同区、每个包一个 HMR 安全测试、contract-regressions 常驻。
本项目到 M1 拆包后：`packages/<pkg>/tests/**` 就地放单元测试；`tests/contract` 收全局契约；
`tests/e2e` 收跨包真实冒烟。`vitest.config.ts` 的 include 随之扩展，exclude 规则不动。

## 三条铁律

1. **用例独立、可重复**：不共享可变全局状态；易变数据自建临时目录；vitest 用 forks pool。
2. **不许删测试救失败**：删除 `tests/` 下任何测试被 `check-protected-tests` 拦截；
   行为变更需评审后新增/修改用例，而不是让用例消失。
3. **断言外部世界**：验证文件、事件流、退出码等客观结果，不验证实现自我报告
   （dsh 复盘教训：mock 一切 + 单元全绿 ≠ 产品没坏）。

## CI 脚本的自我测试

准备阶段唯一被测对象就是 CI 脚本本身——这保证"能自己跑通全流程"：
`tests/unit/*` 测各 check 脚本的纯函数；`tests/contract/ci-contract.test.mjs`
测规则配置不可放松。新增检查脚本时必须同时带单元测试与契约断言。
