/** 从 ZOEHIS business-rules.md 解析表名并计算 manualWeight 初始值 */

export type BusinessRulesSection = 'flow' | 'catalog' | 'naming' | 'other';

const TABLE_PREFIXES = ['COM_', 'PAT_', 'CHA_', 'PRES_', 'APP_', 'APT_', 'INS_', 'DIC_'];

const SECTION_WEIGHT: Record<BusinessRulesSection, number> = {
  flow: 5,
  catalog: 3,
  naming: 1,
  other: 2,
};

function normalizeTableName(name: string): string {
  return name.trim().replace(/["'`]/g, '').toUpperCase();
}

function shortName(name: string): string {
  const n = normalizeTableName(name);
  return n.includes('.') ? n.split('.').pop()! : n;
}

export function isLikelyTableName(name: string): boolean {
  const upper = normalizeTableName(name);
  const base = shortName(upper);
  if (base.length < 6) return false;
  if (TABLE_PREFIXES.some((p) => base.startsWith(p))) return true;
  return /^[A-Z][A-Z0-9_$]*\.[A-Z][A-Z0-9_$]+$/.test(upper);
}

function detectSection(line: string): BusinessRulesSection | null {
  if (/^##\s*[二三]、/.test(line)) return 'flow';
  if (/^##\s*五、/.test(line)) return 'catalog';
  if (/^##\s*四、/.test(line)) return 'naming';
  return null;
}

function addWeight(weights: Map<string, number>, name: string, section: BusinessRulesSection): void {
  if (!isLikelyTableName(name)) return;
  const delta = SECTION_WEIGHT[section];
  const full = normalizeTableName(name);
  const short = shortName(full);
  for (const key of new Set([full, short])) {
    weights.set(key, (weights.get(key) || 0) + delta);
  }
}

/** 解析 markdown，返回表名（短名/全名）→ 权重 */
export function parseBusinessRulesTableWeights(content: string): Map<string, number> {
  const weights = new Map<string, number>();
  let section: BusinessRulesSection = 'other';

  for (const line of content.split(/\r?\n/)) {
    const detected = detectSection(line);
    if (detected) {
      section = detected;
      continue;
    }

    const backtickRe = /`((?:[A-Z][A-Z0-9_$]*\.)?[A-Z][A-Z0-9_$]*)`/g;
    let m: RegExpExecArray | null;
    while ((m = backtickRe.exec(line)) !== null) {
      addWeight(weights, m[1], section);
    }
  }

  return weights;
}

export interface SchemaTableForHeat {
  tableName: string;
}

/** 将业务规则权重映射到 Schema 缓存中的真实表名 */
export function mapWeightsToSchemaTables(
  weights: Map<string, number>,
  schemaTables: SchemaTableForHeat[]
): Array<{ tableName: string; manualWeight: number }> {
  const results: Array<{ tableName: string; manualWeight: number }> = [];

  for (const table of schemaTables) {
    const canonical = table.tableName.trim();
    const upper = normalizeTableName(canonical);
    const short = shortName(upper);
    const manualWeight = Math.max(weights.get(upper) || 0, weights.get(short) || 0);
    if (manualWeight > 0) {
      results.push({ tableName: canonical, manualWeight });
    }
  }

  results.sort((a, b) => b.manualWeight - a.manualWeight || a.tableName.localeCompare(b.tableName));
  return results;
}

export function summarizeBusinessRulesWeights(weights: Map<string, number>): {
  tableCount: number;
  topTables: Array<{ name: string; weight: number }>;
} {
  const merged = new Map<string, number>();
  for (const [name, weight] of weights) {
    if (name.includes('.')) {
      merged.set(name, weight);
      continue;
    }
    const existing = merged.get(name) || 0;
    merged.set(name, Math.max(existing, weight));
  }

  const topTables = [...merged.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15)
    .map(([name, weight]) => ({ name, weight }));

  return { tableCount: merged.size, topTables };
}
