import { DeepSeekClient } from '../agent/deepseek';
import { ConversationMessage } from '../agent/types';
import { getGlobalConfig, getProjectDataSourceById } from '../database/sqlite';
import { buildSchemaContextForAI } from './schemaContext';
import {
  getTableRelationshipsByDs,
  findRelationship,
  saveTableRelationship,
} from '../database/reportStorage';
import { executeOracleQuery } from '../database/oracle';
import { executeDamengQuery } from '../database/dameng';
import { validateSql, ensureRowLimit } from './sqlValidator';

export const REPORT_SYSTEM_PROMPT = `你是 HIS 数据报表助手，帮助运维人员将自然语言转为 SQL 和可视化报表。

规则：
1. 只生成 SELECT 语句，禁止 INSERT/UPDATE/DELETE/DROP/ALTER 等
2. 必须限制行数：Oracle 用 WHERE ROWNUM <= 500（或子查询外包一层再加 ROWNUM）；达梦用 SELECT TOP 500
3. 表名、列名必须逐字来自提供的 Schema，禁止编造、禁止猜测缩写
4. 多表 JOIN 时必须写表别名，关联列优先使用「已验证表关系」
5. 时间条件：Oracle 用 TO_DATE('yyyy-mm-dd','YYYY-MM-DD')；达梦日期用 CAST 或 TO_DATE，与列类型匹配
6. 字符串字面量用单引号；LIKE 模糊查询注意转义；IN 列表元素均需引号包裹
7. 聚合查询中，SELECT 的非聚合列必须出现在 GROUP BY 中
8. 不确定时间范围、候选表时，先向用户确认，不要输出 SQL
9. 生成 SQL 时：只输出一条完整可执行语句，放在单个 \`\`\`sql 代码块中，块内不要夹杂解释文字
10. 若用户反馈 SQL 执行报错，必须根据错误信息修正后重新输出完整 SQL，不要只给片段
11. 若用户仅要求换图表类型，回复 JSON：\`\`\`report-action\n{"action":"chart_only","chartType":"line|bar|pie|table"}\n\`\`\`
12. 报表标题放在首行，格式：# 标题

回复使用中文。`;

function extractSqlFromMarkdown(content: string): string | null {
  const match = content.match(/```sql\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : null;
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

  async sendMessage(
    userMessage: string,
    onChunk: (content: string) => void,
    selectedTables: string[] = []
  ): Promise<{ content: string }> {
    const schemaCtx = buildSchemaContextForAI(this.context.dataSourceId, userMessage, selectedTables);
    const rels = getTableRelationshipsByDs(this.context.dataSourceId).filter((r) => r.isValid === 1);
    const relText =
      rels.length > 0
        ? '【已验证表关系】\n' +
          rels.map((r) => `- ${r.leftTable}.${r.leftColumn} = ${r.rightTable}.${r.rightColumn} (${r.joinType})`).join('\n')
        : '【已验证表关系】暂无';

    const systemContent = `${REPORT_SYSTEM_PROMPT}\n\n数据库类型: ${this.context.dbType}\n\n${schemaCtx}\n\n${relText}`;

    this.conversation.push({ role: 'user', content: userMessage });

    let assistantContent = await this.chatOnce(systemContent, onChunk);
    const sql = extractSqlFromMarkdown(assistantContent);
    if (sql) {
      assistantContent = await this.ensureExecutableSql(systemContent, sql, assistantContent, onChunk);
    }

    this.conversation.push({ role: 'assistant', content: assistantContent });
    return { content: assistantContent };
  }

  private async chatOnce(
    systemContent: string,
    onChunk: (content: string) => void
  ): Promise<string> {
    let streamContent = '';
    const messages: ConversationMessage[] = [
      { role: 'system', content: systemContent },
      ...this.conversation,
    ];

    const response = await this.client.chat(messages, {
      tools: false,
      stream: true,
      onChunk: (chunk) => {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          streamContent += delta.content;
          onChunk(delta.content);
        }
      },
    });

    return response.choices[0]?.message?.content || streamContent;
  }

  /** 试执行 SQL，失败时自动请求模型修正一次 */
  private async ensureExecutableSql(
    systemContent: string,
    sql: string,
    assistantContent: string,
    onChunk: (content: string) => void,
    retriesLeft = 1
  ): Promise<string> {
    try {
      await this.executeSelect(sql);
      return assistantContent;
    } catch (e) {
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
      onChunk('\n\n');
      let revised = await this.chatOnce(systemContent, onChunk);
      const revisedSql = extractSqlFromMarkdown(revised);
      if (revisedSql) {
        revised = await this.ensureExecutableSql(systemContent, revisedSql, revised, onChunk, retriesLeft - 1);
      }
      return revised;
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
        saveTableRelationship({
          dataSourceId: this.context.dataSourceId,
          leftTable,
          leftColumn,
          rightTable,
          rightColumn,
          joinType: 'INNER',
          validationSql,
          isValid: 1,
          verifiedAt: new Date().toISOString(),
        });
        return { success: true, message: '表关系验证通过并已缓存' };
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
