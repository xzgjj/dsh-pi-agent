# SPEC.md — CI 规则（v1，准备阶段）

> CI 拦可判定的问题，例外由人批准。阈值唯一事实来源：`scripts/ci/ci-config.json`（一个事实一个家）。
> 首次引入即基线；规则只严不松、阈值只紧不宽、判定只认实测。

## 检查矩阵（问题 → 自动检查 → 人工判断）

| 问题 | 自动检查 | 人工判断 |
|---|---|---|
| 文档堆细节、压缩后与代码脱节 | 字数预算（规划文档≤3000字，分析文档 docs/** 无上限）+ 全仓重复段落查重 | 内容是否值得保留 |
| 堆细节、造多余抽象 | 重复率（knip 未使用代码 + eslint no-unused-vars） | 抽象是否必要 |
| 小任务变成大重构 | diff 预算：≤40 文件、≤3000 行 | 超出范围是否批准 |
| 代码能跑但读不懂 | eslint（complexity≤10）+ tsc --noEmit | 命名与设计审查 |
| 改测试让失败消失 | check-protected-tests：禁删测试，contract 层改须批准 | 行为变更是否合理 |
| 顺手关闭 CI 规则 | check-protected-paths：规则文件变更须带 `approved-rules-change` 标签 | 批准者与开发者分离 |

## 规划文档清单（受 3000 字预算约束）

`CLAUDE.md`、`SPEC.md`、`IMPLEMENTATION_PLAN.md`、`AGENT_EXECUTION_PROTOCOL.md`、`cli.md`。
超限内容移入 `docs/**`（分析文档不设上限），并用一行链接指回。

## 受保护路径

`.github/workflows/**`、`scripts/ci/**`、`CODEOWNERS`、`SPEC.md` ——
PR 必须带 `approved-rules-change` 标签（CODEOWNERS 审批人添加），否则 CI 失败。

## 重试纪律

CI 失败后自动修复最多 2 轮（共 3 次运行）；第 3 轮仍红必须人工介入。
workflow 内不配置任何重试步骤；每个 job 设 timeout-minutes。

## 运行方式

本地全流程：`npm run ci`（= check:docs + typecheck + lint + knip + test + diff/guard）。
CI 三 job：docs（预算+查重）、quality（typecheck+lint+unused+test）、governance（diff+保护）。
