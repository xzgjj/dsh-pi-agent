# CLAUDE.md — 项目约定（agent 与人类共同遵守）

> 事实只有一个家：CI 规则在 `SPEC.md`，阈值在 `scripts/ci/ci-config.json`，
> 测试分层在 `tests/README.md`。本文只放指针与硬纪律，超 3000 字自动失败。

## 硬纪律

1. 改动前跑 `npm run ci`；提交前必须全绿（判定只认实测）。
2. 规划文档（CLAUDE.md/SPEC.md/IMPLEMENTATION_PLAN.md/AGENT_EXECUTION_PROTOCOL.md/cli.md）≤3000 字；
   分析与调研写进 `docs/**`（无上限），用一个事实一个家原则防重复。
3. 不删 `tests/` 下测试；`tests/contract/` 改动须维护者批准。
4. 改 `.github/workflows/**`、`scripts/ci/**`、`CODEOWNERS`、`SPEC.md` 须带
   `approved-rules-change` 标签（保护路径）。
5. CI 失败自动修复 ≤2 轮，之后必须人工介入；不绕过、不注释掉检查。
6. 同一事实只在一处维护；写文档前先查重复段落检查会不会拦你。

## 项目背景一句话

以 dsh（DeepSeek Harness）为运行时底座 + pi 上下文工程思想的自研桌面 Agent。
当前阶段：准备期（只建 CI/测试骨架与文档架构），业务代码 M1 后开始。
