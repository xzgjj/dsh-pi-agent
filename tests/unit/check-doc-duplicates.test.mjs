// tests/unit/check-doc-duplicates.test.mjs — 重复段落检查的单元测试
import { describe, it, expect } from "vitest";
import { extractParagraphs, normalize, findDuplicates } from "../../scripts/ci/check-doc-duplicates.mjs";
import { loadConfig } from "../../scripts/ci/lib-ci.mjs";

const config = loadConfig();
const minChars = config.duplicateParagraph.minChars;

describe("check-doc-duplicates", () => {
  it("extractParagraphs 按空行分段", () => {
    const md = "第一段内容。\n\n第二段内容。\n";
    expect(extractParagraphs(md)).toEqual(["第一段内容。", "第二段内容。"]);
  });

  it("标题不作为段落参与查重", () => {
    const md = "## 相同的标题\n\n段落 A。\n\n## 相同的标题\n\n段落 B。";
    const paras = extractParagraphs(md);
    expect(paras).toEqual(["段落 A。", "段落 B。"]);
  });

  it("代码块内容不参与查重", () => {
    const md = "```bash\nnpm run ci && npm run ci\n```\n\n正文。";
    expect(extractParagraphs(md)).toEqual(["正文。"]);
  });

  it("normalize 去掉标点、空白与大小写差异", () => {
    expect(normalize("Hello, World！")).toBe(normalize("hello world"));
  });

  it("跨文件完全重复的段落 → 被抓出", () => {
    const dup = "这一段在两个文件里逐字重复了，用来验证查重逻辑确实能抓住它。";
    const files = [
      { file: "a.md", paragraphs: [dup] },
      { file: "b.md", paragraphs: [dup] },
    ];
    const dups = findDuplicates(files, minChars);
    expect(dups).toHaveLength(1);
    expect(dups[0]).toMatchObject({ file: "b.md", firstFile: "a.md" });
  });

  it("短段落（< minChars）不参与查重", () => {
    const files = [
      { file: "a.md", paragraphs: ["很短。"] },
      { file: "b.md", paragraphs: ["很短。"] },
    ];
    expect(findDuplicates(files, minChars)).toHaveLength(0);
  });

  it("同一文件内重复也抓出", () => {
    const dup = "同一段落在同一个文件里出现了两次，这同样是不允许的堆细节行为。";
    const files = [{ file: "a.md", paragraphs: [dup, dup] }];
    expect(findDuplicates(files, minChars)).toHaveLength(1);
  });
});
