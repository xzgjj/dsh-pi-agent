# tests/snapshot — 快照层（暂未启用）

dsh 思路：**无密钥锁定对外行为**，CI 里强制只读 replay 模式，绝不反写期望输出；
`record` / `refresh` 只允许在本地做，且每一处差异都要人工过目。

当前为空是正常的：准备阶段没有可录制的对外行为（CLI/会话/事件流尚未存在）。

启用时机：M1 之后，当 harness 产生稳定对外输出（JSON-RPC / 会话 JSONL / CLI 输出）时：

1. 本地录制期望输出到本目录（每个场景一个子目录）；
2. 录制内容 review 后提交；
3. 从 `vitest.config.ts` 的 exclude 中移除 `tests/snapshot/**`；
4. CI 永远只 replay —— 修改录制文件视同修改受保护测试。
