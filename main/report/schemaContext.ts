import { getSchemaCache } from '../database/sqlite';
import { getTableHeatMap, TableHeatRecord } from '../database/reportStorage';
import { extractTableNamesFromSql } from './reportIntent';

export interface SchemaTableSummary {
  tableName: string;
  comments: string;
  owner: string;
  columns: { name: string; type: string; comment: string }[];
  indexes?: { name: string; column: string; type: string; unique: string }[];
}

export function getSchemaTables(dataSourceId: string): SchemaTableSummary[] {
  const cache = getSchemaCache(dataSourceId, undefined, true);
  if (!cache?.schemaData || !Array.isArray(cache.schemaData)) {
    return [];
  }
  return cache.schemaData.map((t: any) => ({
    tableName: t.tableName,
    comments: t.comments || '',
    owner: t.owner || '',
    columns: (t.columns || []).slice(0, 40).map((c: any) => ({
      name: c.columnName,
      type: c.dataType,
      comment: c.comments || '',
    })),
    indexes: (t.indexes || []).slice(0, 20).map((idx: any) => ({
      name: idx.indexName,
      column: idx.columnName,
      type: idx.indexType,
      unique: idx.uniqueness,
    })),
  }));
}

function tableKey(name: string): string {
  return name.trim().toUpperCase();
}

function tableHeatScore(heatMap: Map<string, TableHeatRecord>, tableName: string): number {
  const heat = heatMap.get(tableKey(tableName));
  if (!heat) return 0;
  return heat.queryCount + heat.reportCount * 3 + heat.manualWeight;
}

export function searchTables(dataSourceId: string, keywords: string[], limit = 30): SchemaTableSummary[] {
  const tables = getSchemaTables(dataSourceId);
  const heatMap = getTableHeatMap(dataSourceId);
  if (keywords.length === 0) {
    return tables
      .map((t) => ({ t, heat: tableHeatScore(heatMap, t.tableName) }))
      .sort((a, b) => b.heat - a.heat)
      .slice(0, limit)
      .map((x) => x.t);
  }

  const scored = tables
    .map((t) => {
      const hay = `${t.tableName} ${t.comments} ${t.columns.map((c) => `${c.name} ${c.comment}`).join(' ')}`.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (hay.includes(kw.toLowerCase())) score += 1;
      }
      return { t, score, heat: tableHeatScore(heatMap, t.tableName) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.heat - a.heat);

  return scored.slice(0, limit).map((x) => x.t);
}

export function buildSchemaContextForAI(dataSourceId: string, userMessage: string, selectedTables: string[] = []): string {
  const keywords = userMessage
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 8);

  const selected = selectedTables.map(tableKey);
  if (selected.length > 0) {
    const tables = getSchemaTables(dataSourceId).filter((t) => selected.includes(tableKey(t.tableName)));
    if (tables.length > 0) {
      return formatTablesForPrompt(tables, `用户指定 ${tables.length} 张表，本次报表优先且仅使用这些表`);
    }
  }

  const tables = searchTables(dataSourceId, keywords, 25);
  if (tables.length === 0) {
    const all = searchTables(dataSourceId, [], 15);
    if (all.length === 0) {
      return '【Schema 未加载】请先在「数据查询」模块加载表结构。';
    }
    return formatTablesForPrompt(all, '未匹配到关键词，以下为部分表结构');
  }
  return formatTablesForPrompt(tables, `匹配到 ${tables.length} 张相关表`);
}

function formatTablesForPrompt(tables: SchemaTableSummary[], header: string, detailed = false): string {
  const lines = [`【${header}】`];
  for (const t of tables) {
    const colLimit = detailed ? 50 : 20;
    const cols = t.columns
      .slice(0, colLimit)
      .map((c) => `${c.name}(${c.type}${c.comment ? ',' + c.comment : ''})`)
      .join('; ');
    let line = `- ${t.tableName}${t.comments ? ` /*${t.comments}*/` : ''}: ${cols}`;
    if (detailed && t.indexes && t.indexes.length > 0) {
      const idx = t.indexes
        .map((i) => `${i.name}(${i.column},${i.type}${i.unique ? ',' + i.unique : ''})`)
        .join('; ');
      line += `\n  索引: ${idx}`;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/** SQL 优化场景：相关表完整结构 + 全库表目录 */
export function buildSchemaContextForSqlOptimize(
  dataSourceId: string,
  sql: string | null,
  selectedTables: string[],
  userMessage: string
): string {
  const allTables = getSchemaTables(dataSourceId);
  if (allTables.length === 0) {
    return '【Schema 未加载】请先在「数据查询」模块加载表结构。';
  }

  const referenced = sql ? extractTableNamesFromSql(sql) : [];
  const selected = selectedTables.map(tableKey);

  const detailKeys = new Set<string>([...referenced, ...selected]);
  for (const kw of userMessage
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2)) {
    for (const t of allTables) {
      if (t.tableName.toUpperCase().includes(kw.toUpperCase()) || t.comments.includes(kw)) {
        detailKeys.add(tableKey(t.tableName));
      }
    }
  }

  const detailed = allTables.filter((t) => detailKeys.has(tableKey(t.tableName)));
  const detailBlock =
    detailed.length > 0
      ? formatTablesForPrompt(
          detailed.slice(0, 40),
          `SQL 优化相关表（${detailed.length} 张，含列与索引）`,
          true
        )
      : formatTablesForPrompt(allTables.slice(0, 15), '未识别到 SQL 中表名，以下为热度较高表', true);

  const catalogLines = allTables.map(
    (t) => `- ${t.tableName}${t.comments ? ` /*${t.comments}*/` : ''} (${t.columns.length}列)`
  );
  const maxCatalogLines = 600;
  const catalog =
    catalogLines.length <= maxCatalogLines
      ? catalogLines.join('\n')
      : catalogLines.slice(0, maxCatalogLines).join('\n') +
        `\n... 另有 ${catalogLines.length - maxCatalogLines} 张表未列出，优化时请优先使用上方相关表`;

  return `${detailBlock}\n\n【全库表目录（共 ${allTables.length} 张，仅供关联与命名参考）】\n${catalog}`;
}
