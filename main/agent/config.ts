export const DEEPSEEK_CONFIG = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  maxTokens: 4096,
  temperature: 0.2,
};

export const GITLAB_CONFIG = {
  baseUrl: 'http://gitlab.zoesoft.com.cn',
  token: '',
  defaultBranch: 'main',
};

export const SYSTEM_PROMPT = `你是 HIS（医院信息系统）智能运维诊断助手，目标是帮助运维人员快速定位问题根因并给出可执行修复建议。

## 核心原则
1. 所有结论必须来自证据：日志、代码、SQL 执行记录、业务数据验证四类证据优先级最高。
2. 不要只根据异常名猜测根因；如果缺关键证据，要明确说明缺什么、已查到什么。
3. 输出要短而准：先给一句话根因，再给证据链，最后给修复步骤。

## 标准排查链路
1. Trace 日志：先看 HTTP，再看 RPC/Feign、SQL、参数、控制台日志，识别真实报错服务和异常 span。
2. 代码定位：根据 Controller/Service/DAO/Mapper 方法名或堆栈，使用 get_code 精确搜索，不要整文件泛读。
3. SQL 还原：发现 DAO/Mapper 方法后，必须优先 query_sql_log(traceId, sqlId)，确认真实 SQL、入参、耗时和异常。
4. 数据验证：SQL 指向数据异常时，用 query_business_data 执行只读 SELECT 验证。
5. 结论：把“现象 -> 证据 -> 根因 -> 修复”串起来。

## 常见 HIS 案例
- ORA-01427 / 单行子查询返回多行：不要只说 SQL 错误，要指出哪个子查询或业务编码可能不唯一，并建议加唯一约束、改 join/聚合或修复脏数据。
- BadSqlGrammarException：先查 sqlId 的实际 SQL 和绑定参数，再结合 Mapper 代码判断字段、表名、动态条件或数据库方言问题。
- Feign/Dubbo 下游失败：HTTP 网关日志不是最终服务，必须沿 RPC/Feign 日志找到 CLIENT -> SERVER 的真实下游服务。
- 参数/开关类问题：从 param/normal 日志中找 BizParam、配置项、操作人和版本信息，避免把配置问题误判成代码 bug。

## 可用工具
- get_code(serviceName, filePath, searchPattern, branch, tag)：按方法名、类名或关键字搜索代码。
- query_rpc_log(traceId)：查询 RPC/Feign 调用链，定位真实后端服务。
- query_sql_log(traceId, sqlId)：查询 DAO/Mapper 方法的实际 SQL。
- query_param_log(traceId)：查询业务参数和配置项日志。
- query_normal_log(traceId)：查询控制台日志。
- query_more_logs(serviceName, logLevel, traceId)：补查 HTTP 错误日志。
- get_table_schema(tableNamePattern)：查询表结构缓存。
- query_business_data(sql, description)：执行只读业务数据验证。

## 输出格式
1. 一句话结论，不超过 30 字。
2. 关键证据，列出 3-6 条，包含日志类型、服务、方法、SQL ID 或表名。
3. 根因解释，说明为什么这些证据能支持结论。
4. 修复建议，不超过 3 条，尽量具体到代码、SQL、配置或数据处理。`;

export const SERVICE_IDENTIFY_PROMPT = `你是 HIS 微服务识别专家。请分析日志并返回 JSON。

规则：
1. serviceName 使用日志中的精确服务名，不要翻译。
2. 如果当前日志是网关、webapi、gateway，但 RPC/Feign/堆栈指向下游服务，优先返回真实下游业务服务。
3. isFrontend：Vue 页面、前端资源或 vueFile 为 true；Java Controller/Service/DAO 为 false。
4. reasoning 用中文简述依据。
5. suggestedDirection 只能是 "frontend" 或 "backend"。

只返回 JSON，不要 Markdown：
{"serviceName": "exact-service-name", "isFrontend": false, "reasoning": "brief explanation", "suggestedDirection": "backend"}`;

export const DEEP_ANALYSIS_PROMPT = SYSTEM_PROMPT;

export const CHAT_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

你现在处于追问会话中。优先复用前面分析得到的结论和工具证据；如果用户追问缺少的信息，可以继续调用工具补证。`;

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_code',
      description: 'Get code from GitLab repository',
      parameters: {
        type: 'object',
        properties: {
          serviceName: { type: 'string', description: 'Service name' },
          filePath: { type: 'string', description: 'File path' },
          searchPattern: { type: 'string', description: 'Search pattern' },
          startLine: { type: 'number', description: 'Start line' },
          endLine: { type: 'number', description: 'End line' },
          branch: { type: 'string', description: 'Git branch' },
          tag: { type: 'string', description: 'Git tag/version' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_rpc_log',
      description: 'Query RPC/Feign logs by traceId to find downstream service calls',
      parameters: {
        type: 'object',
        properties: {
          traceId: { type: 'string', description: 'Trace ID' },
          serviceName: { type: 'string', description: 'Optional service name' },
          keyword: { type: 'string', description: 'Optional keyword' },
        },
        required: ['traceId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_sql_log',
      description: 'Query SQL execution logs',
      parameters: {
        type: 'object',
        properties: {
          traceId: { type: 'string', description: 'Trace ID' },
          sqlId: { type: 'string', description: 'SQL ID/Method name' },
        },
        required: ['traceId', 'sqlId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_param_log',
      description: 'Query business parameter logs by traceId',
      parameters: {
        type: 'object',
        properties: {
          traceId: { type: 'string', description: 'Trace ID' },
          serviceName: { type: 'string', description: 'Optional service name' },
          keyword: { type: 'string', description: 'Optional keyword' },
        },
        required: ['traceId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_normal_log',
      description: 'Query console/application logs by traceId',
      parameters: {
        type: 'object',
        properties: {
          traceId: { type: 'string', description: 'Trace ID' },
          serviceName: { type: 'string', description: 'Optional service name' },
          keyword: { type: 'string', description: 'Optional keyword' },
          logLevel: { type: 'array', items: { type: 'string' }, description: 'Log levels' },
        },
        required: ['traceId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_log',
      description: 'Query system logs',
      parameters: {
        type: 'object',
        properties: {
          serviceName: { type: 'string', description: 'Service name' },
          traceId: { type: 'string', description: 'Trace ID' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_more_logs',
      description: 'Query more logs',
      parameters: {
        type: 'object',
        properties: {
          serviceName: { type: 'string', description: 'Service name' },
          logLevel: { type: 'array', items: { type: 'string' }, description: 'Log levels' },
          traceId: { type: 'string', description: 'Trace ID' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_table_schema',
      description: 'Get database table schema',
      parameters: {
        type: 'object',
        properties: {
          tableNamePattern: { type: 'string', description: 'Table name pattern' },
        },
        required: ['tableNamePattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_business_data',
      description: 'Query business data',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'SQL query' },
          description: { type: 'string', description: 'Query description' },
          dataSourceId: { type: 'string', description: 'Optional datasource id; normally omit it and use project default' },
        },
        required: ['sql', 'description'],
      },
    },
  },
];