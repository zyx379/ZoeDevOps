import { ToolResult } from '../types';
import { buildBaseLogQuery, createLogApiClient, summarizeEvidence } from './logUtils';

type TraceLogType = 'dubbo' | 'param' | 'normal';

const TRACE_LOG_CONFIG: Record<TraceLogType, { indexvalue: string; title: string }> = {
  dubbo: { indexvalue: 'log-dubbo*', title: 'RPC/Feign 调用日志' },
  param: { indexvalue: 'zlog-normal-*', title: '业务参数日志' },
  normal: { indexvalue: 'zlog-normal-*', title: '控制台日志' },
};

export async function queryTraceLogs(
  args: {
    traceId: string;
    serviceName?: string;
    keyword?: string;
    logLevel?: string[];
    pageSize?: string;
  },
  logType: TraceLogType,
  projectId: string,
  apiBaseUrl?: string,
  apiToken?: string,
  apiLogPath?: string
): Promise<ToolResult> {
  try {
    const apiClient = await createLogApiClient({ projectId, apiBaseUrl, apiToken, apiLogPath });
    if (!apiClient) {
      return { success: false, error: '项目未配置 API，无法查询日志' };
    }

    const config = TRACE_LOG_CONFIG[logType];
    const queryParam = buildBaseLogQuery({
      pageSize: args.pageSize || '20',
      indexvalue: config.indexvalue,
      logType,
      serviceName: args.serviceName,
      traceId: args.traceId,
      logLevel: args.logLevel || [],
      keyword: args.keyword || args.traceId,
    });

    console.log(`queryTraceLogs(${logType}) queryParam:`, JSON.stringify(queryParam, null, 2));

    const result = await apiClient.getLogs(queryParam);
    if (result.logs.length === 0) {
      return { success: false, error: `未找到 ${config.title}` };
    }

    const sortedLogs = [...result.logs].sort((a, b) => {
      const timeA = new Date(a.timestamp || a.originalLog?.timestamp || 0).getTime();
      const timeB = new Date(b.timestamp || b.originalLog?.timestamp || 0).getTime();
      return timeA - timeB;
    });
    const errorLogs = sortedLogs.filter(l => {
      const level = (l.logLevel || '').toUpperCase();
      return level.includes('ERROR') || level.includes('WARN') || l.errorClass || l.errorMessage;
    });

    return {
      success: true,
      data: {
        traceId: args.traceId,
        logType,
        title: config.title,
        totalCount: sortedLogs.length,
        errorCount: errorLogs.length,
        logs: sortedLogs,
        errorLogs,
        evidence: summarizeEvidence(errorLogs.length > 0 ? errorLogs : sortedLogs, 20),
      },
    };
  } catch (error) {
    console.error(`queryTraceLogs(${logType}) error:`, error);
    return { success: false, error: (error as Error).message };
  }
}

export function buildTraceLogsPrompt(args: { traceId: string }, result: any): string {
  const evidence = result.evidence || [];
  let prompt = `## ${result.title || 'Trace 日志'}\n\n`;
  prompt += `**TraceId**: ${args.traceId}\n`;
  prompt += `**总日志数**: ${result.totalCount || 0}\n`;
  prompt += `**异常/关键日志数**: ${result.errorCount || 0}\n\n`;

  if (evidence.length === 0) {
    prompt += `未提取到可用于分析的结构化日志证据。\n`;
    return prompt;
  }

  evidence.slice(0, 12).forEach((item: any, index: number) => {
    prompt += `### 证据 #${index + 1}\n`;
    if (item.serviceName) prompt += `- 服务: ${item.serviceName}\n`;
    if (item.kind) prompt += `- Span类型: ${item.kind}\n`;
    if (item.request) prompt += `- 调用/请求: ${item.request}\n`;
    if (item.level) prompt += `- 级别: ${item.level}\n`;
    if (item.errorClass) prompt += `- 异常类: ${item.errorClass}\n`;
    if (item.errorMessage) prompt += `- 异常信息: ${item.errorMessage}\n`;
    if (item.sqlId) prompt += `- SQL ID: ${item.sqlId}\n`;
    if (item.paramName) prompt += `- 参数名: ${item.paramName}\n`;
    if (item.paramValue) prompt += `- 参数值: ${String(item.paramValue).slice(0, 300)}\n`;
    if (item.message) prompt += `- 日志内容: ${String(item.message).slice(0, 300)}\n`;
    prompt += `\n`;
  });

  return prompt;
}

