// tests/unit/check-doc-budget.test.mjs — 文档字数预算检查的单元测试
import { describe, it, expect } from "vitest";
import { auditDocBudget } from "../../scripts/ci/check-doc-budget.mjs";
import { loadConfig } from "../../scripts/ci/lib-ci.mjs";
import path from "node:path";

const config = loadConfig();

describe("check-doc-budget", () => {
  it("规划文档超 3000 字 → 报问题", () => {
    const exists = (abs) => abs.endsWith("SPEC.md");
    const readFile = () => "字".repeat(3001);
    const { problems } = auditDocBudget(config, readFile, exists);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("SPEC.md");
    expect(problems[0]).toContain("3000");
  });

  it("规划文档正好 3000 字 → 通过（上限是闭区间）", () => {
    const exists = (abs) => abs.endsWith("SPEC.md");
    const readFile = () => "字".repeat(3000);
    const { problems, report } = auditDocBudget(config, readFile, exists);
    expect(problems).toHaveLength(0);
    expect(report[0]).toEqual({ doc: "SPEC.md", chars: 3000, limit: 3000 });
  });

  it("不存在的规划文档 → 跳过不报错", () => {
    const exists = () => false;
    const readFile = () => {
      throw new Error("不应被调用");
    };
    const { problems, report } = auditDocBudget(config, readFile, exists);
    expect(problems).toHaveLength(0);
    expect(report).toHaveLength(0);
  });

  it("中英文混排按非空白字符计数", () => {
    const exists = (abs) => abs.endsWith("CLAUDE.md");
    const readFile = () => "CI rules  文档预算  \n\t 3000字以内";
    const { report } = auditDocBudget(config, readFile, exists);
    expect(report[0].chars).toBe(18); // "CIrules文档预算3000字以内" = 18 个非空白字符
  });

  it("配置里的规划文档路径都与仓库根拼接", () => {
    for (const rel of config.docBudget.planningDocs) {
      expect(path.isAbsolute(path.join(process.cwd(), rel))).toBe(true);
    }
  });
});
