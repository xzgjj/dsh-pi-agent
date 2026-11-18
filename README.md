# dsh-pi-agent

基于 **DeepSeek Harness (dsh)** 运行时的自有 Agent 桌面产品：复用 dsh 的插件协议、MCP、Skills 与会话内核，借鉴 **pi (pi-mono)** 的上下文管理与模型调度设计。

核心想法一句话：**ChatGPT 式会话交互（默认空会话、按需挂载上下文）+ dsh 级可插拔运行时 + WorkBuddy 式工件工作台**（PPT/网页/文档任务时右侧才出现编辑面板，平时就是纯对话）。

详细设计与调研见仓库内规划（分析文档不入库）。
