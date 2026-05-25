import { DeepSeekClient } from '../agent/deepseek';
import { ConversationMessage } from '../agent/types';
import { getGlobalConfig, getProjectDataSourceById } from '../database/sqlite';
import { buildSchemaContextForAI, buildSchemaContextForSqlOptimize } from './schemaContext';
import {
  getTableRelationshipsByDs,
  findRelationship,
  saveSemanticFieldLearning,
} from '../database/reportStorage';
import { persistVerifiedJoinsFromSql } from './joinExtractor';
import { executeOracleQuery } from '../database/oracle';
import { executeDamengQuery } from '../database/dameng';
import { validateSql, ensureRowLimit } from './sqlValidator';
import { validateSqlAgainstSchema } from './sqlSchemaValidator';
import { fetchExplainPlan } from './sqlExplain';
import { generateRelationPlan } from './relationPlanner';
import {
  extractSqlFromText,
  isSqlOptimizationRequest,
  needsSqlContinuation,
} from './reportIntent';

/** 主进程侧累积流式输出，始终以完整文本通知渲染进程，避免竞态乱序 */
class StreamDisplay {
  private base = '';
  private acc = '';

  constructor(private readonly emit: (full: string) => void) {}

  reset(base = ''): void {
    this.base = base;
    this.acc = '';
    this.emitNow();
  }

  append(delta: string): void {
    if (!delta) return;
    this.acc += delta;
    this.emitNow();
  }

  get full(): string {
    return this.base + this.acc;
  }

  private emitNow(): void {
    this.emit(this.full);
  }
}

export const REPORT_SYSTEM_PROMPT = `你是 HIS 数据报表助手，帮助运维人员将自然语言转为 SQL 和可视化报表。

规则：
1. 只生成 SELECT 语句，禁止 INSERT/UPDATE/DELETE/DROP/ALTER 等
2. 必须限制行数：Oracle 用 WHERE ROWNUM <= 500（或子查询外包一层再加 ROWNUM）；达梦用 SELECT TOP 500
3. 表名、列名必须逐字来自提供的 Schema，禁止编造、禁止猜测缩写
4. 用户说“手机号/电话/联系方式”等语义词时，要在 Schema 和「语义字段候选」中寻找 PHONE、MOBILE、TEL、CONTACT_PHONE 等真实存在字段；只能使用候选或 Schema 中确实存在的列
5. 生成 SQL 前必须自检每一个 别名.字段 是否存在于对应表；不存在就换用真实字段或先向用户确认，严禁输出不存在字段
6. 多表 JOIN 时必须写表别名，关联列优先使用「已验证表关系」
7. 时间条件：Oracle 用 TO_DATE('yyyy-mm-dd','YYYY-MM-DD')；达梦日期用 CAST 或 TO_DATE，与列类型匹配
8. 字符串字面量用单引号；LIKE 模糊查询注意转义；IN 列表元素均需引号包裹
9. 聚合查询中，SELECT 的非聚合列必须出现在 GROUP BY 中
10. 不确定时间范围、候选表时，先向用户确认，不要输出 SQL
11. 生成 SQL 时：只输出一条完整可执行语句，放在单个 \`\`\`sql 代码块中，块内不要夹杂解释文字；SQL 再长也必须完整输出，禁止用省略号或「同上」截断
12. 若用户反馈 SQL 执行报错，必须根据错误信息修正后重新输出完整 SQL，不要只给片段
13. 若用户仅要求换图表类型，回复 JSON：\`\`\`report-action\n{"action":"chart_only","chartType":"line|bar|pie|table"}\n\`\`\`
14. 报表标题放在首行，格式：# 标题
15. 输出顺序规则：
   - 用户明确要求排序时，严格按用户要求
   - 用户未指定排序时：时间类查询默认按时间字段 DESC；汇总统计默认按数值 DESC；明细默认按主键/业务ID ASC
   - 除用户明确说明“无需排序”，否则 SQL 必须包含 ORDER BY

回复使用中文。`;

export const REPORT_SQL_OPTIMIZATION_PROMPT = `
【SQL 优化专项模式】
用户正在请求优化/分析 SQL 性能。你必须：
1. 以系统提供的「全库表目录」与「相关表结构（含索引）」为依据，不得编造表或列
2. 结合系统自动采集的「EXPLAIN 执行计划」分析瓶颈（全表扫描、回表、错误 JOIN 顺序、缺失索引等）
3. 给出优化后的完整 SQL（放在 \`\`\`sql 代码块），并简要说明改动点
4. 优先建议：补索引、改写 JOIN、缩小驱动表、避免 SELECT *、将过滤条件下推
5. 若执行计划显示某表全表扫描且 WHERE 有过滤列，检查该列是否有可用索引
6. 优化 SQL 同样必须完整输出，不可截断`;

/** 报表对话单次回复上限（长 SQL 场景） */
const REPORT_MAX_TOKENS = 8192;

function extractSqlFromMarkdown(content: string): string | null {
  return extractSqlFromText(content);
}

function extractBusinessPhrases(userMessage: string): string[] {
  const stopwords = new Set([
    '查询', '统计', '看看', '帮我', '一下', '数据', '信息', '明细', '列表', '按', '并且', '以及',
    '今天', '昨天', '本周', '本月', '这个', '那个', '请', '给我', '展示',
  ]);
  return Array.from(
    new Set(
      userMessage
        .toLowerCase()
        .replace(/[^\u4e00-\u9fa5a-z0-9_\s]/gi, ' ')
        .split(/[\s,，。！？!?:：;；、()（）"'`]+/)
        .map((x) => x.trim())
        .filter((x) => x.length >= 2 && !stopwords.has(x))
    )
  ).slice(0, 20);
}

function extractQualifiedColumns(sql: string): Array<{ tableAlias: string; column: string }> {
  const rows: Array<{ tableAlias: string; column: string }> = [];
  const re = /(?<!:)\b(?:"([^"]+)"|([A-Z][A-Z0-9_$]*))\s*\.\s*(?:"([^"]+)"|([A-Z][A-Z0-9_$]*))\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    rows.push({
      tableAlias: (m[1] || m[2] || '').replace(/"/g, '').toUpperCase(),
      column: (m[3] || m[4] || '').replace(/"/g, '').toUpperCase(),
    });
  }
  return rows;
}

function parseAliasTableMap(sql: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /\b(?:FROM|JOIN)\s+((?:"[^"]+"|[A-Z0-9_$]+)(?:\.(?:"[^"]+"|[A-Z0-9_$]+))?)(?:\s+(?:AS\s+)?(?!(?:ON|WHERE|INNER|LEFT|RIGHT|FULL|CROSS|JOIN|GROUP|ORDER|HAVING|UNION)\b)(?:"([^"]+)"|([A-Z][A-Z0-9_$]*)))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const table = (m[1] || '').replace(/"/g, '').toUpperCase();
    const alias = (m[2] || m[3] || table.split('.').pop() || table).replace(/"/g, '').toUpperCase();
    map.set(alias, table);
    map.set(table, table);
  }
  return map;
}

export class ReportGenerationAbortedError extends Error {
  constructor() {
    super('生成已中止');
    this.name = 'ReportGenerationAbortedError';
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ReportGenerationAbortedError();
  }
}

export function isReportGenerationAborted(e: unknown): boolean {
  return (
    e instanceof ReportGenerationAbortedError ||
    (e instanceof DOMException && e.name === 'AbortError') ||
    (e instanceof Error && e.name === 'AbortError')
  );
}

export interface ReportSessionContext {
  projectId: string;
  dataSourceId: string;
  dbType: 'oracle' | 'dameng';
}

export class ReportSession {
  private client: DeepSeekClient;
  private conversation: ConversationMessage[] = [];
  private context: ReportSessionContext;

  constructor(context: ReportSessionContext) {
    const globalConfig = getGlobalConfig();
    this.client = new DeepSeekClient({
      apiKey: globalConfig?.deepseekApiKey || '',
      baseUrl: globalConfig?.deepseekBaseUrl || undefined,
      model: globalConfig?.deepseekModel || 'deepseek-chat',
    });
    this.context = context;
  }

  getConversation(): ConversationMessage[] {
    return [...this.conversation];
  }

  setConversation(messages: ConversationMessage[]): void {
    this.conversation = [...messages];
  }

  /** 从对话与上下文 SQL 中解析待优化/分析的 SQL */
  private resolveSqlForContext(userMessage: string, contextSql?: string | null): string | null {
    return (
      extractSqlFromText(userMessage) ||
      contextSql?.trim() ||
      [...this.conversation]
        .reverse()
        .map((m) => (m.role === 'assistant' ? extractSqlFromText(m.content) : null))
        .find(Boolean) ||
      null
    );
  }

  private async planAndEnsureRelationships(
    userMessage: string,
    schemaCtx: string,
    rels: ReturnType<typeof getTableRelationshipsByDs>,
    abortSignal?: AbortSignal
  ): Promise<string> {
    const baseMessages: ConversationMessage[] = [
      { role: 'system', content: `数据库类型: ${this.context.dbType}\n\n${schemaCtx}` },
      ...this.conversation.slice(-6),
    ];
    const plan = await generateRelationPlan(this.client, baseMessages, userMessage, abortSignal);
    if (!plan || plan.joins.length === 0) {
      return rels.length > 0
        ? `【强制可用关联】以下表关系已通过查询验证，生成 JOIN 时必须优先使用：\n${rels
            .map((r) => `- ${r.leftTable}.${r.leftColumn} = ${r.rightTable}.${r.rightColumn} (${r.joinType})`)
            .join('\n')}`
        : '【已验证表关系】暂无';
    }

    const existing = new Map<string, typeof rels[number]>();
    for (const r of rels) {
      const k = [r.leftTable, r.rightTable].sort().join('::');
      existing.set(k, r);
    }

    const sessionCandidates: Array<{ left: string; leftColumn: string; right: string; rightColumn: string }> = [];
    for (const join of plan.joins) {
      const key = [join.left, join.right].sort().join('::');
      if (existing.has(key)) continue;
      const check = await this.validateJoin(join.left, join.leftColumn, join.right, join.rightColumn);
      if (check.success) {
        sessionCandidates.push(join);
      }
    }

    const verifiedLines = Array.from(existing.values()).map(
      (r) => `- ${r.leftTable}.${r.leftColumn} = ${r.rightTable}.${r.rightColumn} (${r.joinType})`
    );
    const candidateLines = sessionCandidates.map(
      (j) => `- ${j.left}.${j.leftColumn} = ${j.right}.${j.rightColumn}（语法验证通过，待查询确认）`
    );

    const blocks: string[] = [];
    if (verifiedLines.length > 0) {
      blocks.push(
        `【强制可用关联】以下表关系已通过查询验证，生成 JOIN 时必须优先使用：\n${verifiedLines.join('\n')}`
      );
    }
    if (candidateLines.length > 0) {
      blocks.push(
        `【本轮候选关联】以下关联仅通过语法验证，可优先尝试；若最终 SQL 执行无数据则不应采用：\n${candidateLines.join('\n')}`
      );
    }
    if (blocks.length === 0) return '【已验证表关系】暂无';
    return blocks.join('\n\n');
  }

  async sendMessage(
    userMessage: string,
    onChunk: (content: string) => void,
    selectedTables: string[] = [],
    contextSql?: string | null,
    abortSignal?: AbortSignal
  ): Promise<{ content: string }> {
    throwIfAborted(abortSignal);
    const optimizeMode = isSqlOptimizationRequest(userMessage);
    const sqlForContext = this.resolveSqlForContext(userMessage, contextSql);

    const schemaCtx = optimizeMode
      ? buildSchemaContextForSqlOptimize(
          this.context.dataSourceId,
          sqlForContext,
          selectedTables,
          userMessage
        )
      : buildSchemaContextForAI(this.context.dataSourceId, userMessage, selectedTables);

    const rels = getTableRelationshipsByDs(this.context.dataSourceId).filter((r) => r.isValid === 1);
    const relText = await this.planAndEnsureRelationships(userMessage, schemaCtx, rels, abortSignal);

    let explainBlock = '';
    if (optimizeMode && sqlForContext) {
      throwIfAborted(abortSignal);
      try {
        const plan = await fetchExplainPlan(this.context.dataSourceId, this.context.dbType, sqlForContext);
        explainBlock = `\n\n【系统自动采集的 EXPLAIN 执行计划（${this.context.dbType}）】\n${plan}`;
      } catch (e) {
        if (isReportGenerationAborted(e)) throw e;
        explainBlock = `\n\n【执行计划】采集失败：${(e as Error).message}（请结合 Schema 与 SQL 文本继续优化）`;
      }
    }

    const systemContent =
      `${REPORT_SYSTEM_PROMPT}${optimizeMode ? REPORT_SQL_OPTIMIZATION_PROMPT : ''}` +
      `\n\n数据库类型: ${this.context.dbType}\n\n${schemaCtx}\n\n${relText}${explainBlock}`;

    this.conversation.push({ role: 'user', content: userMessage });

    try {
      const display = new StreamDisplay(onChunk);
      display.reset();

      const first = await this.chatOnceWithMeta(
        systemContent,
        (d) => display.append(d),
        undefined,
        abortSignal
      );
      let assistantContent = display.full || first.content;
      assistantContent = await this.continueIfTruncated(
        systemContent,
        assistantContent,
        display,
        first.finishReason,
        abortSignal
      );

      const sql = extractSqlFromMarkdown(assistantContent);
      if (sql) {
        assistantContent = await this.ensureExecutableSql(
          systemContent,
          sql,
          assistantContent,
          display,
          abortSignal
        );
      }

      this.conversation.push({ role: 'assistant', content: assistantContent });
      return { content: assistantContent };
    } catch (e) {
      if (isReportGenerationAborted(e)) {
        const last = this.conversation[this.conversation.length - 1];
        if (last?.role === 'user' && last.content === userMessage) {
          this.conversation.pop();
        }
      }
      throw e;
    }
  }

  private async chatOnceWithMeta(
    systemContent: string,
    onDelta: (delta: string) => void,
    conversationOverride?: ConversationMessage[],
    abortSignal?: AbortSignal
  ): Promise<{ content: string; finishReason: string }> {
    throwIfAborted(abortSignal);
    let streamContent = '';
    let finishReason = 'stop';
    const convo = conversationOverride ?? this.conversation;
    const messages: ConversationMessage[] = [
      { role: 'system', content: systemContent },
      ...convo,
    ];

    const response = await this.client.chat(messages, {
      tools: false,
      stream: true,
      max_tokens: REPORT_MAX_TOKENS,
      signal: abortSignal,
      onChunk: (chunk) => {
        const fr = chunk.choices[0]?.finish_reason;
        if (fr) finishReason = fr;
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          streamContent += delta.content;
          onDelta(delta.content);
        }
      },
    });

    const fr = response.choices[0]?.finish_reason;
    if (fr) finishReason = fr;

    return {
      content: response.choices[0]?.message?.content || streamContent,
      finishReason,
    };
  }

  /** 输出因 max_tokens 或 SQL 围栏未闭合被截断时，最多续写 1 次 */
  private async continueIfTruncated(
    systemContent: string,
    content: string,
    display: StreamDisplay,
    initialFinishReason = 'stop',
    abortSignal?: AbortSignal,
    maxContinuations = 1
  ): Promise<string> {
    let merged = content;
    let lastFinish = initialFinishReason;
    for (let i = 0; i < maxContinuations; i++) {
      throwIfAborted(abortSignal);
      if (!needsSqlContinuation(merged, lastFinish)) break;

      const continuationUser: ConversationMessage = {
        role: 'user',
        content:
          '上一轮回复中的 ```sql 代码块不完整或被截断。请仅补全缺失部分；若无法续写则重新输出完整 SQL（单个 ```sql 块，禁止省略）。',
      };
      const tempConvo: ConversationMessage[] = [
        ...this.conversation,
        { role: 'assistant', content: merged },
        continuationUser,
      ];
      display.reset(merged);
      display.append('\n\n');
      const { content: more, finishReason } = await this.chatOnceWithMeta(
        systemContent,
        (d) => display.append(d),
        tempConvo,
        abortSignal
      );
      merged = merged + more;
      display.reset(merged);
      lastFinish = finishReason;
    }
    return display.full || merged;
  }

  /** 试执行 SQL，失败时自动请求模型修正一次 */
  private async ensureExecutableSql(
    systemContent: string,
    sql: string,
    assistantContent: string,
    display: StreamDisplay,
    abortSignal?: AbortSignal,
    retriesLeft = 1
  ): Promise<string> {
    throwIfAborted(abortSignal);
    try {
      const schemaValidation = validateSqlAgainstSchema(this.context.dataSourceId, sql);
      if (!schemaValidation.valid) {
        throw new Error(schemaValidation.reason || 'SQL 字段校验失败');
      }
      const execResult = await this.executeSelect(sql);
      if (execResult.rowCount > 0) {
        persistVerifiedJoinsFromSql(this.context.dataSourceId, this.context.dbType, sql, execResult.rowCount);
      }
      this.learnSemanticMappings(this.context.dataSourceId, this.conversation[this.conversation.length - 1]?.content || '', sql);
      return assistantContent;
    } catch (e) {
      if (isReportGenerationAborted(e)) throw e;
      if (retriesLeft <= 0) {
        return assistantContent;
      }
      const errMsg = (e as Error).message || '未知错误';
      this.conversation.push({
        role: 'user',
        content:
          `上述 SQL 在数据库试执行失败，请修正后重新输出完整 SQL（放在 \`\`\`sql 代码块中）。\n` +
          `错误信息：${errMsg}\n` +
          `失败 SQL：\n\`\`\`sql\n${sql}\n\`\`\``,
      });
      const prefix = assistantContent + '\n\n';
      display.reset(prefix);
      const rev = await this.chatOnceWithMeta(
        systemContent,
        (d) => display.append(d),
        undefined,
        abortSignal
      );
      let merged = prefix + rev.content;
      merged = await this.continueIfTruncated(
        systemContent,
        merged,
        display,
        rev.finishReason,
        abortSignal
      );
      const revisedSql = extractSqlFromMarkdown(merged);
      if (revisedSql) {
        merged = await this.ensureExecutableSql(
          systemContent,
          revisedSql,
          merged,
          display,
          abortSignal,
          retriesLeft - 1
        );
      }
      return display.full || merged;
    }
  }

  async validateJoin(
    leftTable: string,
    leftColumn: string,
    rightTable: string,
    rightColumn: string
  ): Promise<{ success: boolean; message: string }> {
    const ds = getProjectDataSourceById(this.context.dataSourceId);
    if (!ds) return { success: false, message: '数据源不存在' };

    const cached = findRelationship(this.context.dataSourceId, leftTable, rightTable);
    if (cached && cached.isValid === 1) {
      return { success: true, message: '使用缓存的已验证关系' };
    }

    const validationSql =
      this.context.dbType === 'oracle'
        ? `SELECT COUNT(*) AS CNT FROM ${leftTable} A INNER JOIN ${rightTable} B ON A.${leftColumn} = B.${rightColumn} WHERE ROWNUM <= 10`
        : `SELECT TOP 10 COUNT(*) AS CNT FROM ${leftTable} A INNER JOIN ${rightTable} B ON A.${leftColumn} = B.${rightColumn}`;

    const check = validateSql(validationSql, 'select_only');
    if (!check.valid) {
      return { success: false, message: check.reason || '验证 SQL 无效' };
    }

    try {
      let rowCount = 0;
      if (ds.type === 'oracle') {
        const result = await executeOracleQuery(
          {
            host: ds.host,
            port: ds.port,
            serviceName: ds.serviceName,
            sid: ds.sid,
            username: ds.username,
            password: ds.password,
          },
          validationSql
        );
        rowCount = result.rowCount;
      } else {
        const result = await executeDamengQuery(
          {
            host: ds.host,
            port: ds.port,
            schema: ds.schema || ds.username,
            username: ds.username,
            password: ds.password,
          },
          validationSql
        );
        rowCount = result.rowCount;
      }

      if (rowCount >= 0) {
        return {
          success: true,
          message: '表关系语法验证通过（待查询有数据后自动保存）',
        };
      }
      return { success: false, message: '验证查询无结果' };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  async executeSelect(sql: string): Promise<{
    columns: string[];
    rows: any[][];
    rowCount: number;
    executionTime: number;
  }> {
    const ds = getProjectDataSourceById(this.context.dataSourceId);
    if (!ds) throw new Error('数据源不存在');

    const validation = validateSql(sql, 'select_only');
    if (!validation.valid) {
      throw new Error(validation.reason || 'SQL 校验失败');
    }

    const schemaValidation = validateSqlAgainstSchema(this.context.dataSourceId, validation.normalizedSql!);
    if (!schemaValidation.valid) {
      throw new Error(schemaValidation.reason || 'SQL 字段校验失败');
    }

    const limitedSql = ensureRowLimit(validation.normalizedSql!, ds.type);

    if (ds.type === 'oracle') {
      return executeOracleQuery(
        {
          host: ds.host,
          port: ds.port,
          serviceName: ds.serviceName,
          sid: ds.sid,
          username: ds.username,
          password: ds.password,
        },
        limitedSql
      );
    }
    return executeDamengQuery(
      {
        host: ds.host,
        port: ds.port,
        schema: ds.schema || ds.username,
        username: ds.username,
        password: ds.password,
      },
      limitedSql
    );
  }

  private learnSemanticMappings(dataSourceId: string, userMessage: string, sql: string): void {
    const phrases = extractBusinessPhrases(userMessage);
    if (phrases.length === 0) return;
    const aliasTable = parseAliasTableMap(sql);
    const refs = extractQualifiedColumns(sql);
    if (refs.length === 0) return;

    const candidates = refs
      .map((r) => ({
        table: aliasTable.get(r.tableAlias) || r.tableAlias,
        column: r.column,
      }))
      .filter((x) => !!x.table && !!x.column);
    if (candidates.length === 0) return;

    for (const phrase of phrases) {
      const scored = candidates
        .map((c) => {
          const n = c.column.toLowerCase();
          let score = 0;
          if (n.includes('phone') || n.includes('mobile') || n.includes('tel') || n.includes('lxdh') || n.includes('sjh')) {
            if (phrase.includes('电话') || phrase.includes('手机') || phrase.includes('联系方式') || phrase.includes('手机号')) {
              score += 5;
            }
          }
          if (n.includes(phrase)) score += 3;
          return { ...c, score };
        })
        .sort((a, b) => b.score - a.score);
      if (scored[0]?.score > 0) {
        saveSemanticFieldLearning(dataSourceId, phrase, scored[0].table, scored[0].column, 1);
      }
    }
  }
}

const reportSessions = new Map<string, ReportSession>();

export function getOrCreateReportSession(
  sessionKey: string,
  context: ReportSessionContext
): ReportSession {
  let session = reportSessions.get(sessionKey);
  if (!session) {
    session = new ReportSession(context);
    reportSessions.set(sessionKey, session);
  }
  return session;
}

export function clearReportSession(sessionKey: string): void {
  reportSessions.delete(sessionKey);
}
