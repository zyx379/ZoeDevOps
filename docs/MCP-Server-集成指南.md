# ZoeDevOps MCP Server 集成指南

## 概述

本文档介绍如何将 MCP Server 与现有的 ZoeDevOps Electron 项目集成，以及如何使用 Skill 系统。

## 架构关系

```
┌─────────────────────────────────────────────────────────────┐
│                    ZoeDevOps 桌面应用                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  智能分析    │  │  AI 报表    │  │  版本对比           │  │
│  │  (Agent)    │  │  (Report)   │  │  (Version)          │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                    │             │
│         └────────────────┼────────────────────┘             │
│                          │                                   │
│              ┌───────────┴───────────┐                       │
│              │    Skill 加载器        │                       │
│              │  (skill-loader.ts)    │                       │
│              └───────────┬───────────┘                       │
│                          │                                   │
│         ┌────────────────┼────────────────┐                  │
│         │                │                │                  │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐          │
│  │his-troubles │  │ ai-report   │  │version-     │          │
│  │  -hooting   │  │             │  │  -compare   │          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
└─────────┼────────────────┼────────────────┼──────────────────┘
          │                │                │
          └────────────────┼────────────────┘
                           │
              ┌────────────┴────────────┐
              │    MCP Server           │
              │  (mcp-server/)          │
              │                         │
              │  • query_log            │
              │  • query_sql_log        │
              │  • query_business_data  │
              │  • ...                  │
              └─────────────────────────┘
```

## 集成方式

### 方式一：独立进程（推荐）

MCP Server 作为独立进程运行，通过 stdio 与 Electron 主进程通信。

**优点**：
- 隔离性好，不影响主应用稳定性
- 可以独立更新和部署
- 支持多语言客户端

**配置步骤**：

1. 构建 MCP Server
```bash
cd mcp-server
npm install
npm run build
```

2. 在 Electron 主进程中启动 MCP Server
```typescript
// main/mcp-integration.ts
import { spawn } from 'child_process';
import { join } from 'path';

export function startMcpServer() {
  const mcpServerPath = join(__dirname, '../../mcp-server/dist/index.js');
  
  const env = {
    ...process.env,
    ZOE_PROJECT_ID: 'your-project-id',
    ZOE_API_BASE_URL: 'http://your-api.com',
    ZOE_DB_TYPE: 'oracle',
    // ... 其他配置
  };

  const mcpProcess = spawn('node', [mcpServerPath], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  mcpProcess.stdout.on('data', (data) => {
    console.log('[MCP Server]', data.toString());
  });

  mcpProcess.stderr.on('data', (data) => {
    console.error('[MCP Server Error]', data.toString());
  });

  return mcpProcess;
}
```

### 方式二：直接集成

将 MCP Server 的工具逻辑直接集成到 Electron 主进程中。

**优点**：
- 无需额外进程
- 配置更简单
- 性能更好（无进程间通信开销）

**配置步骤**：

1. 复用现有的工具实现
```typescript
// main/agent/tools/index.ts 已存在，无需修改
```

2. 使用 Skill 加载器
```typescript
// main/agent/agent.ts
import { initializeSkill, getSystemPrompt, getToolDefinitions } from './config-with-skill.js';

// 初始化时加载 Skill
initializeSkill('his-troubleshooting');

// 获取 System Prompt
const systemPrompt = getSystemPrompt();

// 获取工具定义
const tools = getToolDefinitions();
```

## Skill 使用指南

### 1. 列出可用 Skill

```typescript
import { listAvailableSkills } from './skill-loader.js';

const skills = listAvailableSkills();
console.log('可用 Skill:', skills);
// 输出: ['his-troubleshooting', 'ai-report', 'version-compare']
```

### 2. 加载指定 Skill

```typescript
import { loadSkill } from './skill-loader.js';

const skill = loadSkill('his-troubleshooting');
if (skill) {
  console.log('Skill 名称:', skill.config.name);
  console.log('System Prompt:', skill.systemPrompt);
  console.log('可用工具:', skill.toolDefinitions.map(t => t.name));
  console.log('案例数量:', skill.examples.length);
}
```

### 3. 根据场景自动选择 Skill

```typescript
import { selectSkillForScenario } from './skill-loader.js';

// 故障排查场景
const skill1 = selectSkillForScenario('查询日志报错 ORA-01427');
// 返回: 'his-troubleshooting'

// 报表场景
const skill2 = selectSkillForScenario('生成患者收费统计报表');
// 返回: 'ai-report'

// 版本对比场景
const skill3 = selectSkillForScenario('对比 v1.2 和 v1.3 版本差异');
// 返回: 'version-compare'
```

### 4. 在 Agent 中使用 Skill

```typescript
// main/agent/agent.ts
import { initializeSkill, getSystemPrompt, switchSkill } from './config-with-skill.js';

class HISAnalysisAgent {
  private currentSkill: string = 'his-troubleshooting';

  constructor() {
    // 初始化默认 Skill
    initializeSkill(this.currentSkill);
  }

  async analyze(request: AnalysisRequest) {
    // 根据请求内容自动切换 Skill
    if (request.description.includes('报表')) {
      this.switchToSkill('ai-report');
    } else if (request.description.includes('版本')) {
      this.switchToSkill('version-compare');
    }

    const systemPrompt = getSystemPrompt();
    const tools = getToolDefinitions();

    // 调用 DeepSeek API...
  }

  private switchToSkill(skillName: string) {
    if (skillName !== this.currentSkill) {
      switchSkill(skillName);
      this.currentSkill = skillName;
    }
  }
}
```

## 环境变量配置

### MCP Server 配置

```bash
# 项目配置
ZOE_PROJECT_ID=your-project-id
ZOE_API_BASE_URL=http://your-log-api.com
ZOE_API_LOG_PATH=/api/log/query

# Redis 配置（用于自动获取 Token）
ZOE_REDIS_HOST=localhost
ZOE_REDIS_PORT=6379

# 数据库配置
ZOE_DB_TYPE=oracle
ZOE_DB_HOST=localhost
ZOE_DB_PORT=1521
ZOE_DB_SERVICE_NAME=ORCL
ZOE_DB_USERNAME=user
ZOE_DB_PASSWORD=password
```

### Electron 主进程配置

在 Electron 主进程中，可以通过以下方式传递配置给 MCP Server：

```typescript
// main/index.ts
import { startMcpServer } from './mcp-integration.js';

// 从项目配置中读取
const projectConfig = getProjectConfig(projectId);

// 设置环境变量
process.env.ZOE_PROJECT_ID = projectId;
process.env.ZOE_API_BASE_URL = projectConfig.apiBaseUrl;
process.env.ZOE_DB_TYPE = projectConfig.dataSource?.type;
// ...

// 启动 MCP Server
const mcpProcess = startMcpServer();
```

## 在 Claude Desktop 中使用

### 配置 Claude Desktop

编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "zoe-devops": {
      "command": "node",
      "args": ["/path/to/ZoeDevOps/mcp-server/dist/index.js"],
      "env": {
        "ZOE_PROJECT_ID": "your-project-id",
        "ZOE_API_BASE_URL": "http://your-log-api.com",
        "ZOE_DB_TYPE": "oracle",
        "ZOE_DB_HOST": "localhost",
        "ZOE_DB_PORT": "1521",
        "ZOE_DB_SERVICE_NAME": "ORCL",
        "ZOE_DB_USERNAME": "user",
        "ZOE_DB_PASSWORD": "password"
      }
    }
  }
}
```

### 使用示例

在 Claude Desktop 中，你可以这样提问：

```
帮我排查这个错误：traceId=a1b2c3d4e5f6
```

Claude 会自动调用 MCP Server 的工具：
1. `query_log` - 查询 HTTP 日志
2. `query_sql_log` - 查询 SQL 日志
3. `query_business_data` - 验证数据

## 开发调试

### 调试 MCP Server

```bash
cd mcp-server
npm run inspect
```

这会启动 MCP Inspector，可以在浏览器中调试工具调用。

### 测试 Skill 加载

```bash
# 在 Electron 主进程中测试
node -e "
const { loadSkill } = require('./main/agent/skill-loader.js');
const skill = loadSkill('his-troubleshooting');
console.log('Loaded:', skill.config.name);
console.log('Tools:', skill.toolDefinitions.map(t => t.name));
"
```

## 迁移指南

### 从旧版本迁移

如果你的项目还在使用静态的 `SYSTEM_PROMPT`，可以按照以下步骤迁移：

1. **备份原有配置**
```bash
cp main/agent/config.ts main/agent/config.ts.backup
```

2. **使用新的配置方式**
```typescript
// 修改 main/agent/agent.ts
// 从：
import { SYSTEM_PROMPT, TOOL_DEFINITIONS } from './config.js';

// 改为：
import { initializeSkill, getSystemPrompt, getToolDefinitions } from './config-with-skill.js';

// 初始化
initializeSkill('his-troubleshooting');
```

3. **验证功能**
- 测试日志查询功能
- 测试 SQL 执行功能
- 验证 System Prompt 是否正确加载

## 最佳实践

1. **Skill 命名规范**
   - 使用小写字母和连字符
   - 例如：`his-troubleshooting`, `ai-report`

2. **案例编写**
   - 每个案例应包含完整的排查过程
   - 使用真实的 Trace ID 和 SQL
   - 提供多种修复方案

3. **工具定义**
   - 保持与主项目工具定义一致
   - 参数描述要清晰具体
   - 标明必填参数

4. **版本管理**
   - Skill 版本与项目版本保持一致
   - 重大变更时更新版本号
   - 保留旧版本 Skill 以确保兼容性
