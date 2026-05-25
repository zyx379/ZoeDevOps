# ZoeDevOps 架构参考

## 目录结构

```
main/
  agent/                    # 智能分析 Agent
    agent.ts                # HISAnalysisAgent 核心
    deepseek.ts             # DeepSeek API
    chatSession.ts          # 追问会话
    config.ts               # System Prompt、TOOL_DEFINITIONS
    config-with-skill.ts    # 带 Skill 切换的配置
    skill-loader.ts         # 加载 .trae/skills 运行时 Skill
    types.ts                # ToolDefinition、ToolResult 等
    tools/
      index.ts              # executeTool 分发
      queryLog.ts           # 日志查询
      querySqlLog.ts        # SQL 日志
      queryTraceLogs.ts     # RPC/参数/普通日志
      queryMoreLogs.ts      # 追加日志
      queryBusinessData.ts  # 业务库只读查询
      getTableSchema.ts     # 表结构
      gitLab.ts             # get_code
      logUtils.ts           # 日志解析工具
  report/                   # AI 报表
    reportSession.ts        # 对话引擎
    reportIntent.ts         # 意图识别
    schemaContext.ts        # Schema 上下文
    relationPlanner.ts      # 表关系规划
    sqlValidator.ts         # SQL 安全（禁 DDL/DML）
    sqlSchemaValidator.ts   # 表/字段存在性
    sqlExplain.ts           # 执行计划
    attachmentParser.ts     # 附件解析
    tableNames.ts           # SQL 表名提取
  database/
    sqlite.ts               # 本地 sql.js
    oracle.ts               # Oracle
    dameng.ts               # 达梦
    reportStorage.ts        # 报表持久化
    schemaMerge.ts          # Schema 增量合并
    schemaCacheFiles.ts     # Schema 缓存文件
    portableSeed.ts         # 便携种子数据
  ipc/handlers.ts           # IPC 处理器
  requirements/versionCompare.ts
  preload.ts
  index.ts

renderer/
  pages/Schema.tsx          # 数据查询（主页）
  pages/Report.tsx          # AI 报表
  pages/DataSources.tsx     # 数据源
  pages/Requirements.tsx  # 需求管理
  stores/                   # Zustand（analysis/report/project/dataSource）
  utils/                    # reportUtils、dsFormValidation 等
  electron.d.ts             # window API 类型

.trae/skills/               # 应用内运行时 Skill（非 Cursor Skill）
  his-troubleshooting/
  ai-report/
  version-compare/
  zoe-devops/
```

## Agent 流水线

1. **6 步固定流程**：query_log → identify_service → match_repository → fetch_version_and_code → deep_analysis → conclusion
2. **深度分析 ReAct**：Reasoning + Acting，最多 10 次工具迭代
3. **证据优先级**：日志 > 代码 > SQL 执行记录 > 业务数据验证

## ToolDefinition 类型

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}
```

Handler 不在此接口内；各工具文件导出 async 函数，由 `executeTool` 路由。

## ToolResult

```typescript
interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}
```

## 运行时 Skill 结构（.trae/skills）

每个 Skill 目录含 `skill.json`（配置）+ `prompt.md`（系统提示）+ 可选 `examples/`。加载逻辑见 `skill-loader.ts` 的 `loadSkill()`。

## 报表 SQL 安全

- 仅允许 SELECT
- 白名单表/字段校验
- 执行前 Schema 一致性检查
- 结果行数上限

## 常见 IPC 通道

| 通道 | 用途 |
|-----|------|
| `api:startAnalysis` | 启动智能排查 |
| `db:executeQuery` | 执行 SQL |
| `db:getSchemaFromCache` | 读取 Schema 缓存 |
| `db:testConnection` | 测试数据源 |
| `project:*` | 项目管理 |

完整列表见 `main/ipc/handlers.ts`。
