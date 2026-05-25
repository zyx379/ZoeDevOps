import { getSchemaTables } from './schemaContext';

export interface SqlSchemaValidationResult {
  valid: boolean;
  reason?: string;
}

function key(name: string): string {
  return name.trim().replace(/["'`]/g, '').toUpperCase();
}

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ');
}

/** 将 SQL 中的表引用解析为缓存 Schema 中的 canonical 表名 */
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
    const resolved = resolveTableKey(tableRef, tableColumns);
    if (!resolved) {
      aliases.set(tableRef, tableRef);
      continue;
    }
    const alias = key(m[2] || m[3] || resolved.split('.').pop() || resolved);
    aliases.set(alias, resolved);
  }
  return aliases;
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

/**
 * Lightweight guard against hallucinated columns.
 * Validates OWNER.TABLE references against cached schema (Oracle owner.table format).
 */
export function validateSqlAgainstSchema(dataSourceId: string, sql: string): SqlSchemaValidationResult {
  const tableColumns = buildTableColumnMap(dataSourceId);
  if (tableColumns.size === 0) {
    return { valid: true };
  }

  const aliases = parseTableAliases(sql, tableColumns);
  for (const table of new Set(aliases.values())) {
    const resolved = resolveTableKey(table, tableColumns);
    if (!resolved) {
      return { valid: false, reason: `SQL 使用了不存在的表：${table}` };
    }
  }

  const cleaned = stripComments(sql);
  const columnRef = /(?<!:)\b(?:"([^"]+)"|([A-Z][A-Z0-9_$]*))\s*\.\s*(?:"([^"]+)"|([A-Z][A-Z0-9_$]*))\b/gi;
  let m: RegExpExecArray | null;
  const builtInOwners = new Set(['DBMS_XPLAN']);
  while ((m = columnRef.exec(cleaned)) !== null) {
    const alias = key(m[1] || m[2]);
    const column = key(m[3] || m[4]);
    if (builtInOwners.has(alias)) continue;

    const tableRef = aliases.get(alias);
    if (!tableRef) {
      continue;
    }
    const resolvedTable = resolveTableKey(tableRef, tableColumns);
    const columns = resolvedTable ? tableColumns.get(resolvedTable) : undefined;
    if (!columns?.has(column)) {
      return {
        valid: false,
        reason: `SQL 使用了不存在的字段：${alias}.${column}（表 ${resolvedTable || tableRef} 中不存在 ${column}）`,
      };
    }
  }

  return { valid: true };
}
