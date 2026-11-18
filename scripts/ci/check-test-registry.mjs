// scripts/ci/check-test-registry.mjs
// 测试策略一致性检查：docs/testing.md 是唯一事实来源（registry 表）。
// 规则：仓库中发现的任何测试文件/目录，必须能被注册表中某个 Scope 覆盖；
//      注册表自身（Runner / Metadata 受控词表 / 重复 Scope）也在这里校验。
// 遗漏登记 → 明确失败，并给出登记指引。
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadConfig, ROOT, fail, isMain } from "./lib-ci.mjs";

// ---------- 注册表解析 ----------

// 从 markdown 文本中解析注册表（第一个含 Scope 表头的表格）
export function parseRegistryTable(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) { inTable = false; continue; }
    const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (!inTable) {
      if (cells[0] === "Scope 作用域" || cells[0] === "Scope") inTable = true;
      continue;
    }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "---")) continue; // 分隔行
    if (cells.length < 5) return { error: `注册表行格式错误（应为 5 列）：${trimmed}` };
    rows.push({
      scope: cells[0].replace(/`/g, ""),
      level: cells[1],
      runner: cells[2].replace(/`/g, ""),
      args: cells[3].replace(/`/g, ""),
      metadata: cells[4] ? cells[4].split(",").map((m) => m.trim()).filter(Boolean) : [],
      _raw: trimmed,
    });
  }
  return { rows };
}

// ---------- 仓库测试发现 ----------

// 递归收集测试路径：目录名命中 testDirs 或文件名含 testFilePatterns
export function discoverTests(root, cfg) {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (cfg.ignoreDirs.includes(name)) continue;
      const abs = path.join(dir, name);
      const rel = path.relative(root, abs).replace(/\\/g, "/");
      let st;
      try { st = statSync(abs); } catch { continue; }
      if (st.isDirectory()) {
        if (cfg.testDirs.includes(name)) {
          collectAllFiles(abs, rel, found);
        } else {
          walk(abs);
        }
      } else if (cfg.testFilePatterns.some((p) => name.includes(p))) {
        found.push(rel);
      }
    }
  };
  const collectAllFiles = (dir, relDir, out) => {
    for (const name of readdirSync(dir)) {
      const abs = path.join(dir, name);
      const rel = `${relDir}/${name}`;
      if (statSync(abs).isDirectory()) collectAllFiles(abs, rel, out);
      else out.push(rel);
    }
  };
  for (const rootRel of cfg.scanRoots) {
    const abs = path.join(root, rootRel);
    if (existsSync(abs) && statSync(abs).isDirectory()) walk(abs);
  }
  return found.sort();
}

// 覆盖判定：测试路径落在某个已登记 Scope 前缀之下
export function findCoveringScope(testPath, scopes) {
  return scopes.find((s) => testPath === s.replace(/\/$/, "") || testPath.startsWith(s.endsWith("/") ? s : `${s}/`)) || null;
}

// ---------- 主审计（纯函数，便于契约测试） ----------

export function auditRegistry(cfg, registryText, discoveredTests) {
  const problems = [];
  const parsed = parseRegistryTable(registryText);
  if (parsed.error) return { problems: [parsed.error], scopes: [], report: [] };

  const rows = parsed.rows;
  if (rows.length === 0) {
    problems.push("docs/testing.md 中没有解析到注册表（需要一个以 | Scope 作用域 | 开头的 5 列表格）");
  }

  // 注册表自身校验
  const seen = new Set();
  for (const r of rows) {
    if (!r.scope || !r.scope.includes("/")) problems.push(`Scope 非法（应为目录前缀，如 test/unit/）：${r.scope || "(空)"}`);
    if (seen.has(r.scope)) problems.push(`Scope 重复登记：${r.scope}`);
    seen.add(r.scope);
    if (!cfg.allowedRunners.some((runner) => r.runner === runner || r.runner.startsWith(`${runner} `))) {
      problems.push(`Runner 不在受控词表中（ci-config.allowedRunners）：${r.scope} → "${r.runner}"`);
    }
    if (!r.args) problems.push(`Args 为空（必须描述如何执行）：${r.scope}`);
    for (const m of r.metadata) {
      if (!cfg.allowedMetadata.includes(m)) {
        problems.push(`Metadata 不在受控词表中：${r.scope} → "${m}"（新词先加入 ci-config.json → testRegistry.allowedMetadata 并在 testing.md 说明）`);
      }
    }
  }

  // 仓库 ↔ 注册表一致性
  const scopes = rows.map((r) => r.scope);
  const report = [];
  for (const t of discoveredTests) {
    const scope = findCoveringScope(t, scopes);
    report.push({ test: t, scope });
    if (!scope) {
      problems.push(
        `未登记的测试：${t} —— 请移入已登记 Scope（如 test/unit/），或在 docs/testing.md 注册表中新增一行登记后再提交`
      );
    }
  }

  return { problems, scopes, report, rows };
}

function main() {
  const cfg = loadConfig().testRegistry;
  const docPath = path.join(ROOT, cfg.registryDoc);
  if (!existsSync(docPath)) fail([`测试注册表不存在：${cfg.registryDoc}（它是测试策略的唯一事实来源）`]);
  const registryText = readFileSync(docPath, "utf8");
  const discovered = discoverTests(ROOT, cfg);
  const { problems, report } = auditRegistry(cfg, registryText, discovered);
  for (const r of report) console.log(`OK: ${r.test} → ${r.scope}`);
  if (problems.length) fail(problems);
  console.log(`test-registry: 通过（${report.length} 个测试全部登记于 ${cfg.registryDoc}）`);
}

if (isMain(import.meta.url)) main();
