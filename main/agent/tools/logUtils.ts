import { ApiClient, LogQueryParam, AnalyzedLogInfo } from '../../api-client';
import { getProjectConfig } from '../../database/sqlite';
import { getFirstTokenFromRedis, RedisConfig } from '../../redis';

export interface LogApiOptions {
  projectId: string;
  apiBaseUrl?: string;
  apiToken?: string;
  apiLogPath?: string;
}

export async function createLogApiClient(options: LogApiOptions): Promise<ApiClient | null> {
  let configToUse: { baseUrl: string; logPath?: string; authType: 'custom'; customHeaderName: string } | undefined;
  let tokenToUse = options.apiToken;

  if (options.apiBaseUrl && options.apiLogPath) {
    configToUse = {
      baseUrl: options.apiBaseUrl,
      logPath: options.apiLogPath,
      authType: 'custom',
      customHeaderName: 'onelinkToken',
    };
  } else {
    const projectConfig = getProjectConfig(options.projectId);
    if (projectConfig?.apiBaseUrl && projectConfig.apiLogPath) {
      configToUse = {
        baseUrl: projectConfig.apiBaseUrl,
        logPath: projectConfig.apiLogPath,
        authType: 'custom',
        customHeaderName: 'onelinkToken',
      };
    }

    if (!tokenToUse && projectConfig?.redisHost && projectConfig.redisPort) {
      const redisConfig: RedisConfig = {
        host: projectConfig.redisHost,
        port: projectConfig.redisPort,
        password: projectConfig.redisPassword || undefined,
        db: projectConfig.redisDb || undefined,
      };
      tokenToUse = await getFirstTokenFromRedis(redisConfig) ?? undefined;
    }
  }

  if (!configToUse) return null;

  const apiClient = new ApiClient(configToUse);
  if (tokenToUse) {
    apiClient.setToken(tokenToUse);
  }
  return apiClient;
}

/** SQL 日志查询参数，对齐 OpenAPI 示例：顶层 traceId + sqlId，filterParamet 为空对象 */
export function buildSqlLogQuery(args: {
  traceId: string;
  sqlId?: string;
  logLevel?: string[];
  pageNum?: string;
  pageSize?: string;
}): LogQueryParam {
  return {
    traceId: args.traceId,
    indexvalue: 'log-sql*',
    logType: 'sql',
    pageNum: args.pageNum || '1',
    pageSize: args.pageSize || '20',
    sqlId: args.sqlId || '',
    logLevel: args.logLevel || [],
    filterParamet: {},
  };
}

export function buildBaseLogQuery(args: {
  traceId?: string;
  serviceName?: string;
  logLevel?: string[];
  pageSize?: string;
  pageNum?: string;
  indexvalue: string;
  logType: string;
  keyword?: string;
  sqlId?: string;
  timeRange?: { startDate?: string | null; endDate?: string | null };
}): LogQueryParam {
  const searchValue = args.keyword || args.sqlId || args.traceId || '';
  const filterParam = {
    searchType: '2',
    termChecked: !!args.sqlId,
    matchChecked: !args.sqlId,
    wildcardChecked: false,
    operator: args.sqlId ? 'AND' : '',
    value: args.sqlId || '',
    searchValue,
  };

  return {
    pageSize: args.pageSize || '20',
    pageNum: args.pageNum || '1',
    indexvalue: args.indexvalue,
    logType: args.logType,
    serviceName: args.serviceName || '',
    canary: '',
    traceId: args.traceId || '',
    sqlId: args.sqlId || '',
    logLevel: args.logLevel || [],
    timestamp: {
      startDate: args.timeRange?.startDate || null,
      endDate: args.timeRange?.endDate || null,
    },
    filterParam,
    filterParamet: filterParam,
  };
}

export interface LogEvidence {
  traceId?: string;
  logType: string;
  level?: string;
  serviceName?: string;
  timestamp?: string;
  request?: string;
  method?: string;
  status?: string;
  errorClass?: string;
  errorMessage?: string;
  sqlId?: string;
  sql?: string;
  params?: string;
  duration?: string | number;
  parentId?: string;
  spanId?: string;
  kind?: string;
  className?: string;
  message?: string;
  paramName?: string;
  paramValue?: string;
  contentHash?: string;
}

export function normalizeLogEvidence(log: AnalyzedLogInfo): LogEvidence {
  return {
    traceId: log.traceId || log.originalLog?.traceId,
    logType: log.logType || log.originalLog?.logType || '',
    level: log.logLevel,
    serviceName: log.serviceName,
    timestamp: log.timestamp || log.originalLog?.timestamp || log.originalLog?.['@timestamp'],
    request: log.reqUrl || log.rpcUrl,
    method: log.httpMethod,
    status: log.httpStatus,
    errorClass: log.errorClass,
    errorMessage: log.errorMessage,
    sqlId: log.sqlId,
    sql: log.sqlContent || log.sql || log.statement || log.query,
    params: log.requestParams || log.params || log.bindParams,
    duration: log.duration || log.runTime,
    parentId: log.parentId,
    spanId: log.spanId,
    kind: log.kind,
    className: log.className,
    message: log.message,
    paramName: log.paramName,
    paramValue: log.paramValue,
    contentHash: log.contentHash,
  };
}

export function summarizeEvidence(logs: AnalyzedLogInfo[], limit = 10): LogEvidence[] {
  return logs.slice(0, limit).map(normalizeLogEvidence);
}

