// tests/e2e/live-smoke.test.mjs — 真实 API e2e 占位（dsh 思路：无密钥自动跳过，keyless CI 保持绿色）
// 真正启用条件：harness 能启动、能挂模型 provider。届时在此冒烟：
// 启动真实入口（不是 mock）→ 发送一条提示词 → 断言外部世界（会话文件/事件流）而非自我报告。
import { describe, it, expect } from "vitest";

describe("e2e: live smoke", () => {
  it.runIf(process.env.AGENT_E2E_KEY)("真实模型冒烟（当前准备阶段无 harness，挂起）", () => {
    expect.fail("准备阶段结束、M1 harness 可启动后实现此用例；密钥经 AGENT_E2E_KEY 注入");
  });
});
