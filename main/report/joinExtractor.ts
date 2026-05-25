import { getSchemaTables } from './schemaContext';
import { saveTableRelationship } from '../database/reportStorage';

export interface ParsedJoin {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  joinType: string;
}

function key(name: string): string {
  return name.trim().replace(/["'`]/g, '').toUpperCase();
}

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ');
}

function buildTableColumnMap(dataSourceId: string): Map<string, Set<string>> {
  const tableColumns = new Map<string, Set<string>>();
  for (const table of getSchemaTables(dataSourceId)) {
    const cols = new Set(table.columns.map((c) => key(c.name)));
    const full = key(table.tableName);
    tableColumns.set(full, cols);
    const parts = full.split('.');
    if (parts.length >= 2) {
      const short = key(parts[parts.length - 1]);
      if (!tableColumns.has(short)) {
        tableColumns.set(short, cols);
      }
    }
  }
  return tableColumns;
}

function resolveTableKey(ref: string, tableColumns: Map<string, Set<string>>): string | null {
  const k = key(ref);
  if (tableColumns.has(k)) return k;

  const short = k.includes('.') ? k.split('.').pop()! : k;
  if (tableColumns.has(short)) return short;

  const suffix = '.' + short;
  const matches = [...tableColumns.keys()].filter((t) => t === k || t.endsWith(suffix) || t === short);
  if (matches.length === 1) return matches[0];
  return null;
}

function parseTableAliases(sql: string, tableColumns: Map<string, Set<string>>): Map<string, string> {
  const aliases = new Map<string, string>();
  const cleaned = stripComments(sql);
  const re =
    /\b(?:FROM|JOIN)\s+((?:"[^"]+"|[A-Z0-9_$]+)(?:\.(?:"[^"]+"|[A-Z0-9_$]+))?)(?:\s+(?:AS\s+)?(?!(?:ON|WHERE|INNER|LEFT|RIGHT|FULL|CROSS|JOIN|GROUP|ORDER|HAVING|UNION)\b)(?:"([^"]+)"|([A-Z][A-Z0-9_$]*)))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const tableRef = key(m[1]);
    const resolved = resolveTableKey(tableRef, tableColumns) || tableRef;
    const alias = key(m[2] || m[3] || resolved.split('.').pop() || resolved);
    aliases.set(alias, resolved);
  }
  return aliases;
}

function parseJoinType(segment: string): string {
  const upper = segment.toUpperCase();
  if (/\bCROSS\s+JOIN\b/.test(upper)) return 'CROSS';
  if (/\bFULL(?:\s+OUTER)?\s+JOIN\b/.test(upper)) return 'FULL';
  if (/\bRIGHT(?:\s+OUTER)?\s+JOIN\b/.test(upper)) return 'RIGHT';
  if (/\bLEFT(?:\s+OUTER)?\s+JOIN\b/.test(upper)) return 'LEFT';
  return 'INNER';
}

function extractOnEqualities(onClause: string): Array<{ leftAlias: string; leftColumn: string; rightAlias: string; rightColumn: string }> {
  const rows: Array<{ leftAlias: string; leftColumn: string; rightAlias: string; rightColumn: string }> = [];
  const re =
    /\b(?:"([^"]+)"|([A-Z][A-Z0-9_$]*))\s*\.\s*(?:"([^"]+)"|([A-Z][A-Z0-9_$]*))\s*=\s*(?:"([^"]+)"|([A-Z][A-Z0-9_$]*))\s*\.\s*(?:"([^"]+)"|([A-Z][A-Z0-9_$]*))\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(onClause)) !== null) {
    rows.push({
      leftAlias: key(m[1] || m[2]),
      leftColumn: key(m[3] || m[4]),
      rightAlias: key(m[5] || m[6]),
      rightColumn: key(m[7] || m[8]),
    });
  }
  return rows;
}

/** 从成功执行的 SQL 中提取 JOIN 等值条件（仅 ON 子句，不含 WHERE） */
export function extractJoinsFromSql(dataSourceId: string, sql: string): ParsedJoin[] {
  const tableColumns = buildTableColumnMap(dataSourceId);
  if (tableColumns.size === 0) return [];

  const cleaned = stripComments(sql);
  const aliases = parseTableAliases(cleaned, tableColumns);
  const joinRe =
    /\b((?:INNER|LEFT(?:\s+OUTER)?|RIGHT(?:\s+OUTER)?|FULL(?:\s+OUTER)?|CROSS)\s+)?JOIN\s+[\s\S]*?\s+ON\s+([\s\S]*?)(?=\b(?:INNER|LEFT(?:\s+OUTER)?|RIGHT(?:\s+OUTER)?|FULL(?:\s+OUTER)?|CROSS\s+)?JOIN\b|\bWHERE\b|\bGROUP\s+BY\b|\bORDER\s+BY\b|\bHAVING\b|\bUNION\b|$)/gi;

  const seen = new Set<string>();
  const joins: ParsedJoin[] = [];
  let m: RegExpExecArray | null;
  while ((m = joinRe.exec(cleaned)) !== null) {
    const joinType = parseJoinType(m[0]);
    const onClause = m[2] || '';
    for (const eq of extractOnEqualities(onClause)) {
      const leftTable = aliases.get(eq.leftAlias);
      const rightTable = aliases.get(eq.rightAlias);
      if (!leftTable || !rightTable) continue;
      const resolvedLeft = resolveTableKey(leftTable, tableColumns);
      const resolvedRight = resolveTableKey(rightTable, tableColumns);
      if (!resolvedLeft || !resolvedRight) continue;
      if (resolvedLeft === resolvedRight) continue;

      const pairKey = [resolvedLeft, resolvedRight].sort().join('::') + `::${eq.leftColumn}::${eq.rightColumn}`;
      const pairKeyRev = [resolvedLeft, resolvedRight].sort().join('::') + `::${eq.rightColumn}::${eq.leftColumn}`;
      if (seen.has(pairKey) || seen.has(pairKeyRev)) continue;
      seen.add(pairKey);

      joins.push({
        leftTable: resolvedLeft,
        leftColumn: eq.leftColumn,
        rightTable: resolvedRight,
        rightColumn: eq.rightColumn,
        joinType,
      });
    }
  }
  return joins;
}

function buildValidationSql(
  dbType: 'oracle' | 'dameng',
  leftTable: string,
  leftColumn: string,
  rightTable: string,
  rightColumn: string
): string {
  return dbType === 'oracle'
    ? `SELECT COUNT(*) AS CNT FROM ${leftTable} A INNER JOIN ${rightTable} B ON A.${leftColumn} = B.${rightColumn} WHERE ROWNUM <= 10`
    : `SELECT TOP 10 COUNT(*) AS CNT FROM ${leftTable} A INNER JOIN ${rightTable} B ON A.${leftColumn} = B.${rightColumn}`;
}

/**
 * 查询成功且返回数据后，从 SQL 提取 JOIN 并持久化为已验证关系。
 * 仅当 rowCount > 0 时写入，避免空结果或错误关联被误缓存。
 */
export function persistVerifiedJoinsFromSql(
  dataSourceId: string,
  dbType: 'oracle' | 'dameng',
  sql: string,
  rowCount: number
): number {
  if (rowCount <= 0) return 0;

  const joins = extractJoinsFromSql(dataSourceId, sql);
  if (joins.length === 0) return 0;

  const now = new Date().toISOString();
  for (const join of joins) {
    saveTableRelationship({
      dataSourceId,
      leftTable: join.leftTable,
      leftColumn: join.leftColumn,
      rightTable: join.rightTable,
      rightColumn: join.rightColumn,
      joinType: join.joinType,
      validationSql: buildValidationSql(dbType, join.leftTable, join.leftColumn, join.rightTable, join.rightColumn),
      isValid: 1,
      verifiedAt: now,
    });
  }
  return joins.length;
}
