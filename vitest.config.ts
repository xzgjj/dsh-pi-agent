import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/unit/**/*.test.mjs",
      "tests/contract/**/*.test.mjs",
      "tests/e2e/**/*.test.mjs",
      "scripts/**/*.spec.mjs",
    ],
    // 快照层在录制落盘前不进 CI（CI 只允许只读 replay，见 tests/snapshot/README.md）
    exclude: ["tests/snapshot/**", "**/node_modules/**", "**/dist/**"],
    environment: "node",
    // 测试必须独立、可重复：不共享任何全局状态，禁止并发写同一文件
    pool: "forks",
  },
});
