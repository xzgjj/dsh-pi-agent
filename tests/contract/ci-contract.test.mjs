// tests/contract/ci-contract.test.mjs — CI 契约回归测试（受保护：修改须维护者批准）
// 职责：防止 CI 规则被悄悄放松。任何"把阈值调宽"的改动都会在这里失败。
// 对应 dsh 的 contract-regressions.spec.ts 思路：永久测试，防约定回归。
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { loadConfig, ROOT } from "../../scripts/ci/lib-ci.mjs";

const config = loadConfig();
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));

describe("CI 契约：规则只严不松", () => {
  it("规划文档上限 = 3000 字（放宽即失败）", () => {
    expect(config.docBudget.planningLimit).toBeLessThanOrEqual(3000);
  });

  it("五个规划文档都注册了字数预算", () => {
    for (const rel of ["CLAUDE.md", "SPEC.md", "IMPLEMENTATION_PLAN.md", "AGENT_EXECUTION_PROTOCOL.md", "cli.md"]) {
      expect(config.docBudget.planningDocs, `缺少 ${rel}`).toContain(rel);
    }
  });

  it("自动修复轮数上限 ≤ 2（不允许无限循环）", () => {
    expect(config.retryPolicy.maxAutoFixRounds).toBeLessThanOrEqual(2);
    expect(config.retryPolicy.maxAutoFixRounds).toBeGreaterThanOrEqual(0);
  });

  it("workflow 与 CI 脚本目录在保护路径里（关闭 CI 规则须批准）", () => {
    expect(config.protectedPaths.paths).toContain(".github/workflows/**");
    expect(config.protectedPaths.paths).toContain("scripts/ci/**");
    expect(config.protectedPaths.requireLabel).toBeTruthy();
  });

  it("tests/contract/ 受审批保护；tests/ 全目录禁删", () => {
    expect(config.protectedTests.noDeletionDirs).toContain("tests/");
    expect(config.protectedTests.approvalDirs).toContain("tests/contract/");
  });

  it("重复段落最小长度 ≥ 20（太短会误报）", () => {
    expect(config.duplicateParagraph.minChars).toBeGreaterThanOrEqual(20);
  });

  it("diff 预算存在且有上限", () => {
    expect(config.diffBudget.maxFiles).toBeGreaterThan(0);
    expect(config.diffBudget.maxChangedLines).toBeGreaterThan(0);
    expect(config.diffBudget.maxFiles).toBeLessThanOrEqual(40);
    expect(config.diffBudget.maxChangedLines).toBeLessThanOrEqual(3000);
  });

  it("每个 CI 检查脚本都挂进了 npm scripts（能自己跑通全流程）", () => {
    const scripts = readdirSync(path.join(ROOT, "scripts", "ci")).filter(
      (f) => f.startsWith("check-") && f.endsWith(".mjs"),
    );
    expect(scripts.length).toBeGreaterThanOrEqual(5);
    for (const f of scripts) {
      const invoked = Object.values(pkg.scripts).some((cmd) => cmd.includes(f));
      expect(invoked, `${f} 未挂进任何 npm script`).toBe(true);
    }
  });
});

describe("CI 契约：eslint 复杂度阈值与配置声明一致", () => {
  it("eslint complexity = ci-config.codeQuality.eslintComplexityMax", () => {
    const eslintConfig = readFileSync(path.join(ROOT, "eslint.config.mjs"), "utf8");
    const m = eslintConfig.match(/complexity:\s*\["error",\s*(\d+)\]/);
    expect(m, "eslint.config.mjs 缺少 complexity 规则").toBeTruthy();
    expect(Number(m[1])).toBe(config.codeQuality.eslintComplexityMax);
  });
});
