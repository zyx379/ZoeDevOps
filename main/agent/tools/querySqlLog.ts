import { ToolResult } from '../types';
import { buildSqlLogQuery, createLogApiClient, summarizeEvidence } from './logUtils';

export async function querySqlLog(
  args: { traceId: string; sqlId?: string; keyword?: string },
  projectId: string,
  apiBaseUrl?: string,
  apiToken?: string,
  apiLogPath?: string
): Promise<ToolResult> {
  try {
    const apiClient = await createLogApiClient({ projectId, apiBaseUrl, apiToken, apiLogPath });
    if (!apiClient) {
      return { success: false, error: '项目未配置 API，无法查询 SQL 日志' };
    }

    const queryParam = buildSqlLogQuery({
      traceId: args.traceId,
      sqlId: args.sqlId,
    });

    console.log('querySqlLog queryParam:', JSON.stringify(queryParam, null, 2));

    let result = await apiClient.getLogs(queryParam);

    // 精确 sqlId 无结果时，回退为仅 traceId 查询并在客户端按方法名模糊匹配
    if (result.logs.length === 0 && args.sqlId) {
      const fallbackParam = buildSqlLogQuery({ traceId: args.traceId });
      console.log('querySqlLog fallback queryParam:', JSON.stringify(fallbackParam, null, 2));
      const fallbackResult = await apiClient.getLogs(fallbackParam);
      const needle = args.sqlId.toLowerCase();
      const matched = fallbackResult.logs.filter(log => {
        const sqlId = (log.sqlId || log.originalLog?.sqlId || '').toLowerCase();
        return sqlId.includes(needle) || needle.includes(sqlId.split('.').pop() || '');
      });
      if (matched.length > 0) {
        result = { total: matched.length, logs: matched };
      }
    }

    if (result.logs.length === 0) {
      return {
        success: false,
        error: args.sqlId
          ? `未找到 sqlId="${args.sqlId}" 的 SQL 日志，请检查方法名是否正确，或尝试用 keyword 搜索`
          : `未找到 traceId="${args.traceId}" 的 SQL 日志`
      };
    }

    const sqlLogs = result.logs.map(log => ({
      sqlId: log.sqlId || '',
      sql: log.sqlContent || log.sql || log.statement || log.query || log.originalLog?.sqlContent || log.originalLog?.sql || log.errorMessage || '',
      params: log.requestParams || log.params || log.bindParams || log.originalLog?.requestParam || log.originalLog?.params || '',
      duration: log.duration || '',
      resultCount: log.resultCount || '',
      tableName: log.tableName || '',
      timestamp: log.timestamp || '',
      errorClass: log.errorClass || '',
      errorMessage: log.errorMessage || '',
    }));

    return {
      success: true,
      data: {
        traceId: args.traceId,
        sqlId: args.sqlId || '',
        totalCount: sqlLogs.length,
        sqlLogs,
        evidence: summarizeEvidence(result.logs, 15),
      }
    };
  } catch (error) {
    console.error('querySqlLog error:', error);
    return { success: false, error: (error as Error).message };
  }
}

export function buildSqlLogPrompt(args: { traceId: string; sqlId?: string }, result: any): string {
  const sqlLogs: any[] = result.sqlLogs || [];
  const totalCount = result.totalCount || sqlLogs.length;

  let prompt = `## SQL 执行日志\n\n`;
  prompt += `**TraceId**: ${args.traceId}\n`;
  if (args.sqlId) prompt += `**SQL 方法名**: ${args.sqlId}\n`;
  prompt += `**匹配 SQL 数**: ${totalCount}\n\n`;

  if (sqlLogs.length === 0) {
    prompt += `未找到匹配的 SQL 执行记录。\n`;
    return prompt;
  }

  const withSql = sqlLogs.filter((l: any) => l.sql && l.sql.trim());
  const withSqlId = sqlLogs.filter((l: any) => l.sqlId);
  const withParams = sqlLogs.filter((l: any) => l.params && l.params.trim());

  prompt += `**数据摘要**: 含 SQL 内容 ${withSql.length} 条, 含方法名 ${withSqlId.length} 条, 含入参 ${withParams.length} 条\n\n`;

  const displayLogs = withSql.length > 0 ? withSql : (withSqlId.length > 0 ? withSqlId : sqlLogs);
  const maxDisplay = 15;

  displayLogs.slice(0, maxDisplay).forEach((log: any, index: number) => {
    prompt += `### SQL #${index + 1}`;
    if (log.sqlId) prompt += ` — ${log.sqlId}`;
    prompt += `\n\n`;
    if (log.timestamp) prompt += `- 执行时间: ${log.timestamp}\n`;
    if (log.duration) prompt += `- 耗时: ${log.duration}ms\n`;
    if (log.resultCount) prompt += `- 返回行数: ${log.resultCount}\n`;
    if (log.tableName) prompt += `- 涉及表: ${log.tableName}\n`;
    if (log.params) prompt += `- 参数: \`\`\`json\n${log.params}\n\`\`\`\n`;
    if (log.sql) prompt += `- SQL:\n\`\`\`sql\n${log.sql}\n\`\`\`\n`;
    if (!log.sql && !log.params) prompt += `- ⚠️ 此条日志未包含 SQL 内容，可能是日志采集配置未开启 SQL 记录\n`;
    prompt += `\n`;
  });

  if (displayLogs.length > maxDisplay) {
    prompt += `... 还有 ${displayLogs.length - maxDisplay} 条 SQL 未显示。`;
    if (args.sqlId) {
      prompt += ` 已按 sqlId="${args.sqlId}" 筛选，若需查看更多请缩小范围。\n`;
    } else {
      prompt += ` 建议用 sqlId 参数指定 DAO 方法名精确筛选。\n`;
    }
  }

  if (withSql.length === 0 && sqlLogs.length > 0) {
    prompt += `\n⚠️ 所有 ${sqlLogs.length} 条日志均未包含 SQL 正文。可能原因：\n`;
    prompt += `1. 日志采集配置未开启 SQL 语句记录\n`;
    prompt += `2. SQL 内容在其他字段中（已尝试 sqlContent/sql/statement/query 均未找到）\n`;
    prompt += `请结合代码分析中的 DAO 方法逻辑推断 SQL。\n`;
  }

  prompt += `\n请结合以上 SQL 日志和代码分析结果，判断数据层面是否存在异常。`;
  return prompt;
}