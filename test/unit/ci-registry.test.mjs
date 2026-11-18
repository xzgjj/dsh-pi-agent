// test/unit/ci-registry.test.mjs
// 契约测试：docs/testing.md 注册表解析 + 仓库覆盖判定（check-test-registry.mjs 的核心行为）
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRegistryTable, discoverTests, findCoveringScope, auditRegistry } from "../../scripts/ci/check-test-registry.mjs";
import { loadConfig } from "../../scripts/ci/lib-ci.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../../scripts/ci/lib-ci.mjs";

const cfg = loadConfig().testRegistry;

test("注册表表头能被识别并解析出 5 列", () => {
  const md = [
    "| Scope 作用域 | Level 级别 | Runner 运行器 | Args 参数 | Metadata 元数据 |",
    "|---|---|---|---|---|",
    "| `test/unit/` | 单元测试 | node | `--test test/unit/` | fast, isolated |",
  ].join("\n");
  const { rows, error } = parseRegistryTable(md);
  assert.equal(error, undefined);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].scope, "test/unit/");
  assert.deepEqual(rows[0].metadata, ["fast", "isolated"]);
});

test("受控词表外的 Metadata 必须失败", () => {
  const md = [
    "| Scope 作用域 | Level 级别 | Runner 运行器 | Args 参数 | Metadata 元数据 |",
    "|---|---|---|---|---|",
    "| `test/unit/` | 单元测试 | node | `--test test/unit/` | fast, 随便写的 |",
  ].join("\n");
  const { problems } = auditRegistry(cfg, md, []);
  assert.ok(problems.some((p) => p.includes("Metadata 不在受控词表")));
});

test("Runner 不在受控词表必须失败", () => {
  const md = [
    "| Scope 作用域 | Level 级别 | Runner 运行器 | Args 参数 | Metadata 元数据 |",
    "|---|---|---|---|---|",
    "| `test/unit/` | 单元测试 | python | `--test test/unit/` | fast |",
  ].join("\n");
  const { problems } = auditRegistry(cfg, md, []);
  assert.ok(problems.some((p) => p.includes("Runner 不在受控词表")));
});

test("覆盖判定：子路径命中、兄弟路径不命中", () => {
  assert.equal(findCoveringScope("test/unit/a.test.mjs", ["test/unit/"]), "test/unit/");
  assert.equal(findCoveringScope("test/other/a.test.mjs", ["test/unit/"]), null);
  assert.equal(findCoveringScope("test/unit", ["test/unit/"]), "test/unit/");
});

test("真实仓库的注册表通过自检（无未登记测试时 problems 为空）", () => {
  const registryText = readFileSync(path.join(ROOT, cfg.registryDoc), "utf8");
  const discovered = discoverTests(ROOT, cfg);
  const { problems, report } = auditRegistry(cfg, registryText, discovered);
  assert.deepEqual(problems, []);
  // 发现的每个测试都必须有归属
  for (const r of report) assert.ok(r.scope, `未登记：${r.test}`);
});
