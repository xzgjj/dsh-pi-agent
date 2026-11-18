// scripts/ci/check-diff-budget.mjs
// 改动范围白名单 + Diff 预算：单次变更超过 maxFiles / maxChangedLines 即失败，
// 防止"小任务变成大重构"。豁免路径（锁文件）不计入。无 git 基线时跳过（本地首跑）。
import { execFileSync } from "node:child_process";
import { loadConfig, changedFiles, resolveBase, fail, skip, ROOT } from "./lib-ci.mjs";

export function matches(relPath, patterns) {
  return patterns.some((p) => {
    if (p.endsWith("/**")) return relPath.startsWith(p.slice(0, -2));
    return relPath === p || relPath.startsWith(p + "/");
  });
}

// 纯函数审计：文件数预算在这里判；行数预算由 CLI 主流程统计后交给 judgeLines
export function auditDiff(entries, config) {
  const { maxFiles, exemptPaths } = config.diffBudget;
  const counted = entries.filter((e) => !matches(e.path, exemptPaths));
  const problems = [];
  if (counted.length > maxFiles) {
    problems.push(`变更文件数 ${counted.length} > 预算 ${maxFiles}；拆分提交或走人工批准`);
  }
  return { counted, problems };
}

export function countChangedLines(base, entries, config) {
  const counted = entries.filter((e) => !matches(e.path, config.diffBudget.exemptPaths));
  if (!counted.length) return 0;
  const out = execFileSync(
    ["git", "diff", "--shortstat", base, "--", ...counted.map((e) => e.path)],
    { cwd: ROOT, encoding: "utf8" },
  ).trim();
  const m = out.match(/(\d+) changed/);
  return m ? Number(m[1]) : 0;
}

function main() {
  const config = loadConfig();
  const base = resolveBase(process.argv);
  if (!base) skip("无 git 基线（尚未初始化仓库或首个提交），diff 预算不适用");
  const entries = changedFiles(base);
  if (entries === null) skip("无法读取 git 变更集");

  const { counted, problems } = auditDiff(entries, config);
  const changedLines = countChangedLines(base, entries, config);
  if (changedLines > config.diffBudget.maxChangedLines) {
    problems.push(`变更行数 ${changedLines} > 预算 ${config.diffBudget.maxChangedLines}；超出部分需人工批准`);
  }
  console.log(`diff-budget: ${counted.length}/${config.diffBudget.maxFiles} 文件，${changedLines}/${config.diffBudget.maxChangedLines} 行`);
  if (problems.length) fail(problems);
  console.log("diff-budget: 通过");
}

if (isMain(import.meta.url)) main();
