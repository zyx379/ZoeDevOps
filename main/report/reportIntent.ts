/** 从文本中提取 SQL（含未闭合的 ```sql 块，应对模型截断） */
export function extractSqlFromText(content: string): string | null {
  const closed = content.match(/```sql\s*([\s\S]*?)```/i);
  if (closed) return closed[1].trim();
  const open = content.match(/```sql\s*([\s\S]*)$/i);
  return open ? open[1].trim() : null;
}

/** SQL 代码块是否因截断而未闭合（仅检测未闭合的 ```sql 围栏） */
export function isSqlBlockLikelyTruncated(content: string): boolean {
  const opens = (content.match(/```sql/gi) || []).length;
  const closes = (content.match(/```sql[\s\S]*?```/gi) || []).length;
  return opens > closes;
}

/** 是否需要在模型结束后再发起续写 */
export function needsSqlContinuation(content: string, finishReason?: string): boolean {
  if (finishReason === 'length') return true;
  return isSqlBlockLikelyTruncated(content);
}

/** 用户是否在请求 SQL 优化 / 性能分析 */
export function isSqlOptimizationRequest(message: string): boolean {
  return /优化|改进|性能|慢查询|执行计划|explain|索引|改写|提速|调优|加速|瓶颈/i.test(message);
}

/** 从 SQL 中提取可能涉及的表名（大写） */
export function extractTableNamesFromSql(sql: string): string[] {
  const tables = new Set<string>();
  const re = /\b(?:FROM|JOIN)\s+(?:[A-Z0-9_$]+\.)?([A-Z][A-Z0-9_$]*)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1].toUpperCase();
    if (!['SELECT', 'WHERE', 'AND', 'OR', 'ON', 'AS', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'CROSS'].includes(name)) {
      tables.add(name);
    }
  }
  return [...tables];
}
