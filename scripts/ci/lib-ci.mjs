// scripts/ci/lib-ci.mjs — CI 脚本共享工具：配置加载 + git 变更集解析
// 唯一事实来源是同目录 ci-config.json；这里不放任何阈值。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, "..", "..");

export function loadConfig() {
  return JSON.parse(readFileSync(path.join(__dirname, "ci-config.json"), "utf8"));
}

export function countNonWhitespaceChars(text) {
  return text.replace(/\s+/gu, "").length;
}

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (err) {
    if (allowFail) return null;
    throw err;
  }
}

// 解析 diff 基线：--base 参数 > GITHUB_BASE_REF（PR 事件）> origin/main > HEAD~1
export function resolveBase(argv) {
  const baseFlagIdx = argv.indexOf("--base");
  if (baseFlagIdx !== -1 && argv[baseFlagIdx + 1]) return argv[baseFlagIdx + 1];
  if (process.env.GITHUB_BASE_REF) return process.env.GITHUB_BASE_REF;
  if (git(["rev-parse", "--verify", "--quiet", "origin/main"], { allowFail: true }) !== null) return "origin/main";
  if (git(["rev-parse", "--verify", "--quiet", "HEAD~1"], { allowFail: true }) !== null) return "HEAD~1";
  return null;
}

// 返回与 base 的变更文件列表（A/M/D/R），无 git 或无 base 时返回 null（调用方决定 skip 策略）
export function changedFiles(base) {
  if (!base) return null;
  const out = git(["diff", "--name-status", "-M", base, "--"]).trim();
  if (!out) return [];
  return out.split("\n").map((line) => {
    const [status, ...rest] = line.split("\t");
    return { status, path: rest[rest.length - 1] };
  });
}

// 判断脚本是否被直接执行（而非被测试 import）
export function isMain(importMetaUrl) {
  return Boolean(process.argv[1]) && importMetaUrl === pathToFileURL(process.argv[1]).href;
}

export function skip(message) {
  console.log(`SKIP: ${message}`);
  process.exit(0);
}

export function fail(messages) {
  for (const m of messages) console.error(`FAIL: ${m}`);
  process.exit(1);
}
