// scripts/ci/check-diff-budget.mjs
// 改动范围白名单 + Diff 预算：单次变更超过 maxFiles / maxChangedLines 即失败，
// 防止"小任务变成大重构"。豁免路径（锁文件）不计入。无 git 基线时跳过（本地首跑）。
import { loadConfig, changedFiles, resolveBase, fail, skip, ROOT } from "./lib-ci.mjs";
import path from "node:path";

function matches(relPath, patterns) {
  return patterns.some((p) => {
    if (p.endsWith("/**")) return relPath.startsWith(p.slice(0, -2));
    return relPath === p || relPath.startsWith(p + "/");
  });
}

export function auditDiff(entries, config) {
  const { maxFiles, maxChangedLines, exemptPaths } = config.diffBudget;
  const counted = entries.filter((e) => !matches(e.path, exemptPaths));
  const problems = [];
  if (counted.length > maxFiles) {
    problems.push(`变更文件数 ${counted.length} > 预算 ${maxFiles}；拆分提交或走人工批准`);
  }
  // 行数预算：用 git diff --shortstat 由调用方传入时跳过；这里按文件近似（新增+删除行）由 CLI 补充
  return { counted, problems, maxFiles, maxChangedLines };
}

function main() {
  const config = loadConfig();
  const base = resolveBase(process.argv);
  if (!base) skip("无 git 基线（尚未初始化仓库或首个提交），diff 预算不适用");
  const entries = changedFiles(base);
  if (entries === null) skip("无法读取 git 变更集");
  const { counted, problems, maxFiles } = auditDiff(entries, config);

  // 行数统计（排除豁免路径）
  const { execFileSync } = awaiter();
  const exempt = entries.filter((e) => matches(e.path, config.diffBudget.exemptPaths)).map((e) => e.path);
  const statArgs = ["diff", "--shortstat", base, "--", ...entries.map((e) => e.path).filter((p) => !exempt.includes(p))];
  let changedLines = 0;
  if (statArgs.length > 3) {
    const out = execFileSync("git", statArgs, { cwd: ROOT, encoding: "utf8" }).trim();
    const m = out.match(/(\d+) changed/);
    changedLines = m ? Number(m[1]) : 0;
  }
  if (changedLines > config.diffBudget.maxChangedLines) {
    problems.push(`变更行数 ${changedLines} > 预算 ${config.diffBudget.maxChangedLines}；超出部分需人工批准`);
  }
  console.log(`diff-budget: ${counted.length}/${maxFiles} 文件，${changedLines}/${config.diffBudget.maxChangedLines} 行`);
  if (problems.length) fail(problems);
  console.log("diff-budget: 通过");
}

function awaiter() {
  return { execFileSync: process.binding ? require("node:child_process").execFileSync : null };
}

if (isMain(import.meta.url)) main();
