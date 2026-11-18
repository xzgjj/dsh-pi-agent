// scripts/ci/check-protected-paths.mjs
// 规则文件保护：CI 规则、workflow、阈值配置（ci-config.json）、CODEOWNERS、SPEC.md
// 被改动时，PR 必须带批准标签（approved-rules-change），否则失败——批准者与开发者分离。
import { loadConfig, changedFiles, resolveBase, fail, skip, isMain } from "./lib-ci.mjs";
import { matches } from "./check-diff-budget.mjs";

function main() {
  const config = loadConfig();
  const base = resolveBase(process.argv);
  if (!base) skip("无 git 基线，保护路径不适用");
  const entries = changedFiles(base);
  if (entries === null) skip("无法读取 git 变更集");

  const labels = (process.env.PR_LABELS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const approved = process.argv.includes("--approved") || labels.includes(config.protectedPaths.requireLabel);
  const touched = entries
    .map((e) => e.path.replace(/\\/g, "/"))
    .filter((p) => matches(p, config.protectedPaths.paths));

  if (touched.length && !approved) {
    fail([
      `本次改动触及受保护规则文件：${touched.join(", ")}`,
      `规则变更须指定人批准：PR 需带标签 ${config.protectedPaths.requireLabel}（由 CODEOWNERS 中的审批人添加），或本地复核时显式传 --approved`,
    ]);
  }
  console.log(touched.length ? `protected-paths: ${touched.length} 个规则文件变更，已获批准` : "protected-paths: 通过（未触及规则文件）");
}

if (isMain(import.meta.url)) main();
