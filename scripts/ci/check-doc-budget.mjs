// scripts/ci/check-doc-budget.mjs
// 文档字数预算：规划类文档（CLAUDE.md / SPEC.md / IMPLEMENTATION_PLAN.md /
// AGENT_EXECUTION_PROTOCOL.md / cli.md）≤ ci-config.docBudget.planningLimit 字；
// 分析类文档（docs/**）不设上限。只检查已存在的文件，文件不存在不报错。
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { loadConfig, ROOT, countNonWhitespaceChars, fail, isMain } from "./lib-ci.mjs";

export function auditDocBudget(config, readFile = (p) => readFileSync(p, "utf8"), exists = existsSync) {
  const problems = [];
  const report = [];
  const { planningDocs, planningLimit } = config.docBudget;
  for (const rel of planningDocs) {
    const abs = path.join(ROOT, rel);
    if (!exists(abs)) continue;
    const chars = countNonWhitespaceChars(readFile(abs));
    report.push({ doc: rel, chars, limit: planningLimit });
    if (chars > planningLimit) {
      problems.push(`${rel} = ${chars} 字，超过规划文档上限 ${planningLimit}（分析类内容请移入 docs/**，那边不设上限）`);
    }
  }
  return { problems, report };
}

function main() {
  const config = loadConfig();
  const { problems, report } = auditDocBudget(config);
  for (const r of report) console.log(`OK: ${r.doc} = ${r.chars}/${r.limit} 字`);
  if (problems.length) fail(problems);
  console.log("doc-budget: 通过");
}

if (isMain(import.meta.url)) main();
