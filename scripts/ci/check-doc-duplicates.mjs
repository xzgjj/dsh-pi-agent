// scripts/ci/check-doc-duplicates.mjs
// 重复段落检查：全仓 markdown 中，规范化后相同且 ≥ minChars 的段落只允许出现一次。
// 目的：对齐"模型爱堆细节/重复论述"的偏置——同一事实只允许一个家（一个事实一个家）。
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadConfig, ROOT, fail, isMain } from "./lib-ci.mjs";

const SKIP_DIRS = new Set(["node_modules", ".git", ".workbuddy", "dist", "coverage"]);

export function listMarkdownFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) listMarkdownFiles(abs, acc);
    else if (name.endsWith(".md")) acc.push(abs);
  }
  return acc;
}

export function extractParagraphs(md) {
  const paragraphs = [];
  let inCodeBlock = false;
  let buffer = [];
  const flush = () => {
    if (buffer.length) {
      paragraphs.push(buffer.join("\n").trim());
      buffer = [];
    }
  };
  for (const line of md.split(/\r?\n/)) {
    if (/^(```|~~~)/.test(line.trim())) {
      flush(); // 代码块边界切断段落
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    if (/^#{1,6}\s/.test(line)) { flush(); continue; } // 标题不算段落
    if (line.trim() === "") flush();
    else buffer.push(line);
  }
  flush();
  return paragraphs;
}

export function normalize(text) {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function findDuplicates(filesContent, minChars) {
  const seen = new Map(); // normalized -> { file, snippet }
  const duplicates = [];
  for (const { file, paragraphs } of filesContent) {
    for (const p of paragraphs) {
      const n = normalize(p);
      if (n.length < minChars) continue;
      if (seen.has(n)) {
        duplicates.push({ file, snippet: p.slice(0, 60), firstFile: seen.get(n).file });
      } else {
        seen.set(n, { file });
      }
    }
  }
  return duplicates;
}

function main() {
  const config = loadConfig();
  const { minChars } = config.duplicateParagraph;
  const files = listMarkdownFiles(ROOT);
  const filesContent = files.map((f) => ({
    file: path.relative(ROOT, f),
    paragraphs: extractParagraphs(readFileSync(f, "utf8")),
  }));
  const duplicates = findDuplicates(filesContent, minChars);
  if (duplicates.length) {
    fail(duplicates.map((d) => `重复段落：${d.file}「${d.snippet}…」与 ${d.firstFile} 重复（一个事实一个家，请引用而不是复制）`));
  }
  console.log(`doc-duplicates: 通过（扫描 ${files.length} 个 md 文件）`);
}

if (isMain(import.meta.url)) main();
