---
name: zoe-devops
description: 专为ZoeDevOps智能运维桌面工具设计的开发助手，精通Electron架构、Agent工具开发、AI报表功能及Oracle/达梦双数据库兼容。当用户需要开发新功能、修复Bug、重构代码、新增Agent排查工具或扩展报表能力时调用。
---

# ZoeDevOps 项目开发助手

## 快速定位

ZoeDevOps 是 Electron 桌面应用：**数据查询 + AI 报表 + HIS 智能排查**。技术栈：Electron 28、React 18、TypeScript、Vite 5、Zustand、Tailwind、DeepSeek function calling、sql.js（本地）、Oracle/达梦（业务库）、ECharts 6。

**两套 Skill 体系（勿混淆）**：
- `.cursor/skills/` — Cursor IDE 开发助手（本文件）
- `.trae/skills/` — 应用内运行时 Skill（由 `main/agent/skill-loader.ts` 加载，供排查场景切换 Prompt）

详细目录与模块说明见 [reference.md](reference.md)。

## 开发原则

1. **最小改动**：只改任务相关文件，匹配现有命名与抽象
2. **主进程能力走 IPC**：新能力经 `main/ipc/handlers.ts` + `main/preload.ts` + `renderer/electron.d.ts` 暴露
3. **类型安全**：函数声明返回类型；避免 `any`，必要时 `unknown` + 类型守卫
4. **双库兼容**：Oracle 与达梦 SQL 方言差异在 `main/database/oracle.ts` / `dameng.ts` 分别处理，不硬编码单库语法
5. **改完验证**：优先跑相关测试脚本（见下方）

## 任务路由

| 用户意图 | 首要阅读 |
|---------|---------|
| 新增/修改 Agent 排查工具 | `main/agent/tools/` → `tools/index.ts` → `config.ts` |
| 排查 Prompt / 运行时 Skill | `main/agent/config.ts`、`config-with-skill.ts`、`.trae/skills/` |
| AI 报表（SQL 生成/校验/执行） | `main/report/` |
| 数据源 / Schema 缓存 | `main/database/` |
| 前端页面 / 状态 | `renderer/pages/`、`renderer/stores/` |
| IPC 新通道 | `main/ipc/handlers.ts` |

## Agent 工具开发

工具分两层：**LLM 定义**（`config.ts` 的 `TOOL_DEFINITIONS`）+ **执行器**（`tools/index.ts` 的 `executeTool` switch）。

### 新建工具清单

```
- [ ] 创建 main/agent/tools/{name}.ts（handler 函数 + 可选 buildXxxPrompt）
- [ ] 在 tools/index.ts 的 executeTool 添加 case
- [ ] 在 config.ts TOOL_DEFINITIONS 添加 schema（name 与 case 一致，snake_case）
- [ ] 如需前端触发，确认 IPC handler 已注册
- [ ] 编写 *.test.ts（参考 logUtils.test.ts）
```

### Handler 模板

```typescript
import type { ToolResult } from '../types';

export async function myTool(args: { param: string }): Promise<ToolResult> {
  try {
    if (!args.param?.trim()) {
      return { success: false, error: 'param 不能为空' };
    }
    const data = await doWork(args.param);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: `操作失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
```

### 现有工具名

`query_log` · `get_code` · `query_business_data` · `query_more_logs` · `get_table_schema` · `query_sql_log` · `query_rpc_log` · `query_param_log` · `query_normal_log`

### HIS 排查知识

日志类型：错误 / RPC(Feign·Dubbo) / 参数 / SQL / 普通。常见异常：ORA-01427、BadSqlGrammarException、FeignException、NullPointerException。排查案例见 `.trae/skills/his-troubleshooting/examples/`。

## AI 报表开发

流程：意图识别 (`reportIntent.ts`) → Schema 上下文 (`schemaContext.ts`) → SQL 生成 → 安全校验 (`sqlValidator.ts`) → Schema 校验 (`sqlSchemaValidator.ts`) → 只读执行 → 失败时最多 1 次自动修正。

扩展点：
- 新意图 → `reportIntent.ts` 的 `detectIntent`
- 新校验 → `sqlValidator.ts` 校验链
- 语义学习 → `reportStorage.ts` 的 `semantic_field_learning`

## 数据库双库差异

| 场景 | Oracle | 达梦 |
|-----|--------|------|
| 行数限制 | `ROWNUM <= N` | `TOP N` / `LIMIT` |
| 空值 | `NVL` | `IFNULL` |
| 日期 | `TO_DATE` / `TO_CHAR` | `CAST` / `CONVERT` |

查询默认最大 500 行；Schema 缓存在本地 SQLite，支持增量合并（`schemaMerge.ts`）。

## IPC 约定

- 通道名：`domain:action`（如 `db:executeQuery`、`api:startAnalysis`）
- Handler 返回：`{ success: boolean, data?: T, error?: string }`
- 类型同步：`renderer/electron.d.ts` 与 preload 暴露的 API 保持一致

## 测试命令

```bash
npm run typecheck
npm run test:log-utils
npm run test:sql
npm run test:attachment
npm run test:ds-validation
npm run seed:verify
```

## 编码规范

- 文件 camelCase · 类 PascalCase · 常量 UPPER_SNAKE_CASE
- 数据库/API 操作 try-catch，错误信息含上下文
- 不提交密钥；不扩大无关 diff

## 相关文档

- [reference.md](reference.md) — 完整目录结构与 Agent 流水线
- `docs/智能分析/` — Agent 设计文档
- `docs/AI报表智能化升级设计.md` — 报表升级设计
- `docs/MCP-Server-集成指南.md` — MCP 集成
