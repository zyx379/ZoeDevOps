import { getSchemaCache } from '../database/sqlite';
import { getTableHeatMap, TableHeatRecord } from '../database/reportStorage';

export interface SchemaTableSummary {
  tableName: string;
  comments: string;
  owner: string;
  columns: { name: string; type: string; comment: string }[];
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

function formatTablesForPrompt(tables: SchemaTableSummary[], header: string): string {
  const lines = [`【${header}】`];
  for (const t of tables) {
    const cols = t.columns
      .slice(0, 20)
      .map((c) => `${c.name}(${c.type}${c.comment ? ',' + c.comment : ''})`)
      .join('; ');
    lines.push(`- ${t.tableName}${t.comments ? ` /*${t.comments}*/` : ''}: ${cols}`);
  }
  return lines.join('\n');
}
