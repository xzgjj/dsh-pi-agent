import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/**", "coverage/**", "dist/**", ".workbuddy/**"] },
  js.configs.recommended,
  {
    files: ["**/*.mjs", "**/*.ts"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      // 复杂度上限：代码能跑，但读不懂 → CI 拦（阈值见 scripts/ci/ci-config.json 的声明，
      // eslint 规则里只能写常量，契约测试负责校验两边一致）
      complexity: ["error", 10],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];
