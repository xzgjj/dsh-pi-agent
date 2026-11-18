// scripts/ci/check-protected-tests.mjs
// 测试保护：任何 tests/ 下的测试文件被删除 → 失败（改测试让失败消失是经典作弊）；
// tests/contract/ 下的受保护回归测试被删除或修改 → 除非带 --approved / 环境声明，一律失败。
import { loadConfig, changedFiles, resolveBase, fail, skip, isMain } from "./lib-ci.mjs";

function main() {
  const config = loadConfig();
  const approved = process.argv.includes("--approved") || process.env.CI_PROTECTED_APPROVED === "1";
  const base = resolveBase(process.argv.filter((a) => a !== "--approved"));
  if (!base) skip("无 git 基线，测试保护不适用");
  const entries = changedFiles(base);
  if (entries === null) skip("无法读取 git 变更集");

  const problems = [];
  for (const e of entries) {
    const p = e.path.replace(/\\/g, "/");
    const isDeleted = e.status === "D";
    const touchesTests = p.startsWith("tests/");
    if (!touchesTests) continue;

    if (isDeleted) {
      problems.push(`测试被删除：${p}（不允许改测试让失败消失；如属行为变更，请走人工评审并在提交说明中记录）`);
      continue;
    }
    if (p.startsWith("tests/contract/") && !approved) {
      problems.push(`受保护回归测试被修改：${p}（tests/contract/ 的变更必须由维护者批准，CI 侧需带 --approved 或 CI_PROTECTED_APPROVED=1）`);
    }
  }
  if (problems.length) fail(problems);
  console.log("protected-tests: 通过");
}

if (isMain(import.meta.url)) main();
