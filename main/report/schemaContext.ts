import { getSchemaCache } from '../database/sqlite';
import {
  getTableHeatMap,
  TableHeatRecord,
  getTableRelationshipsByDs,
  getSemanticFieldLearning,
} from '../database/reportStorage';
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
    columns: (t.columns || []).map((c: any) => ({
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

const SEMANTIC_FIELD_ALIASES: { triggers: string[]; terms: string[]; label: string }[] = [
  {
    label: '手机号/联系电话',
    triggers: ['手机号', '手机', '电话', '联系方式', '联系电话', '联系号码', '号码', 'phone', 'mobile', 'tel'],
    terms: ['PHONE', 'MOBILE', 'TEL', 'CONTACT_PHONE', 'CONTACT_TEL', 'TELEPHONE', 'MOBILE_PHONE', 'PHONE_NO', 'TEL_NO', 'SJH', 'LXDH', 'LXHM'],
  },
  {
    label: '医生',
    triggers: ['医生', '医师', 'doctor', 'physician'],
    terms: ['DOCTOR', 'DOC', 'YS', 'PHYSICIAN', 'CLINICIAN', 'DOCTOR_ID', 'DOCTOR_NO', 'DOCTOR_NAME', 'YSBH', 'YSDM', 'YSXM'],
  },
  {
    label: '患者/病人',
    triggers: ['患者', '病人', '就诊人', 'patient'],
    terms: ['PATIENT', 'PAT', 'BR', 'PERSON', 'PATIENT_ID', 'PATIENT_NO', 'PATIENT_NAME', 'BRID', 'BRXM'],
  },
  {
    label: '身份证',
    triggers: ['身份证', '证件号', 'idcard', 'identity'],
    terms: ['ID_CARD', 'IDCARD', 'CARD_NO', 'ID_NO', 'CERT_NO', 'IDENTITY_NO', 'SFZH', 'ZJHM'],
  },
];

function expandSemanticKeywords(words: string[]): string[] {
  const text = words.join(' ').toLowerCase();
  const expanded = new Set(words);
  for (const group of SEMANTIC_FIELD_ALIASES) {
    if (group.triggers.some((t) => text.includes(t.toLowerCase()))) {
      group.terms.forEach((term) => expanded.add(term));
    }
  }
  return [...expanded];
}

function semanticColumnCandidates(tables: SchemaTableSummary[], userMessage: string): string {
  const lower = userMessage.toLowerCase();
  const sections: string[] = [];
  for (const group of SEMANTIC_FIELD_ALIASES) {
    if (!group.triggers.some((t) => lower.includes(t.toLowerCase()))) continue;
    const terms = group.terms.map((t) => t.toUpperCase());
    const matches: string[] = [];
    for (const table of tables) {
      for (const col of table.columns) {
        const name = col.name.toUpperCase();
        const comment = col.comment || '';
        if (terms.some((term) => name.includes(term)) || group.triggers.some((t) => comment.includes(t))) {
          matches.push(`${table.tableName}.${col.name}${col.comment ? `(${col.comment})` : ''}`);
        }
      }
    }
    if (matches.length > 0) {
      sections.push(`【语义字段候选：${group.label}】\n${matches.slice(0, 80).map((m) => `- ${m}`).join('\n')}`);
    }
  }
  return sections.join('\n\n');
}

const PHRASE_SPLIT_RE = /[\s,，。！？!?:：;；、()（）"'`]+/;
const SEMANTIC_STOPWORDS = new Set([
  '查询', '统计', '看看', '帮我', '一下', '数据', '信息', '明细', '列表', '按', '并且', '以及',
  '今天', '昨天', '本周', '本月', '这个', '那个', '请', '给我', '展示',
]);

function extractBusinessPhrases(userMessage: string): string[] {
  const raw = userMessage
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9_\s]/gi, ' ')
    .split(PHRASE_SPLIT_RE)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2 && !SEMANTIC_STOPWORDS.has(x));
  return Array.from(new Set(raw)).slice(0, 20);
}

function buildLearnedSemanticContext(dataSourceId: string, userMessage: string, allTables: SchemaTableSummary[]): string {
  const phrases = extractBusinessPhrases(userMessage);
  if (phrases.length === 0) return '';
  const learnings = getSemanticFieldLearning(dataSourceId, 300);
  if (learnings.length === 0) return '';

  const existingCols = new Set(
    allTables.flatMap((t) =>
      t.columns.map((c) => `${t.tableName.toUpperCase()}.${c.name.toUpperCase()}`)
    )
  );
  const matched = learnings
    .filter((l) => {
      const phrase = l.userPhrase.toLowerCase();
      return phrases.some((p) => phrase.includes(p) || p.includes(phrase));
    })
    .filter((l) => existingCols.has(`${l.resolvedTable.toUpperCase()}.${l.resolvedColumn.toUpperCase()}`))
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, 10);
  if (matched.length === 0) return '';

  const lines = matched.map(
    (m) => `- 用户说"${m.userPhrase}" -> ${m.resolvedTable}.${m.resolvedColumn}（采纳 ${m.hitCount} 次）`
  );
  return `【历史学习映射】\n${lines.join('\n')}\n规则：优先使用以上映射字段，若当前查询上下文无该字段再退回语义候选。`;
}

function expandWithRelatedTables(dataSourceId: string, selectedTableNames: string[]): string[] {
  const rels = getTableRelationshipsByDs(dataSourceId).filter((r) => r.isValid === 1);
  const expanded = new Set(selectedTableNames.map(tableKey));
  for (const table of [...expanded]) {
    for (const rel of rels) {
      if (tableKey(rel.leftTable) === table) expanded.add(tableKey(rel.rightTable));
      if (tableKey(rel.rightTable) === table) expanded.add(tableKey(rel.leftTable));
    }
  }
  return [...expanded];
}

export function searchTables(dataSourceId: string, keywords: string[], limit = 30): SchemaTableSummary[] {
  const tables = getSchemaTables(dataSourceId);
  const heatMap = getTableHeatMap(dataSourceId);
  const expandedKeywords = expandSemanticKeywords(keywords);
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
      for (const kw of expandedKeywords) {
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
  const allTables = getSchemaTables(dataSourceId);

  const selected = expandWithRelatedTables(dataSourceId, selectedTables);
  if (selected.length > 0) {
    const tables = allTables.filter((t) => selected.includes(tableKey(t.tableName)));
    if (tables.length > 0) {
      const semantic = semanticColumnCandidates(allTables, userMessage);
      const learned = buildLearnedSemanticContext(dataSourceId, userMessage, allTables);
      return [
        learned,
        formatTablesForPrompt(tables, `用户指定 ${tables.length} 张表，本次报表优先且仅使用这些表`, true),
        semantic,
      ].filter(Boolean).join('\n\n');
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
  const semantic = semanticColumnCandidates(allTables, userMessage);
  const learned = buildLearnedSemanticContext(dataSourceId, userMessage, allTables);
  return [
    learned,
    formatTablesForPrompt(tables, `匹配到 ${tables.length} 张相关表`),
    semantic,
  ].filter(Boolean).join('\n\n');
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
