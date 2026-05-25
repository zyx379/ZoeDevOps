import fs from 'fs';
import path from 'path';

type SeedPayload = {
  seedId?: string;
  version?: string;
  exportedAt?: string;
  projects?: unknown[][];
  dataSources?: unknown[][];
  projectConfigs?: unknown[][];
  schemaCaches?: Array<{ dataSourceId?: string; tables?: unknown[] }>;
  tableHeat?: unknown[][];
  tableRelationships?: unknown[][];
  semanticFieldLearning?: unknown[][];
};

const seedPath = process.argv[2] || path.join(process.cwd(), 'resources', 'seed', 'portable-seed.json');

function countByDataSource(rows: unknown[][] | undefined, dsIndex: number): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows || []) {
    const ds = String(row?.[dsIndex] || '');
    if (!ds) continue;
    map.set(ds, (map.get(ds) || 0) + 1);
  }
  return map;
}

function printMap(title: string, m: Map<string, number>) {
  console.log(title);
  if (m.size === 0) {
    console.log('  - 无');
    return;
  }
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([k, v]) => console.log(`  - ${k}: ${v}`));
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

function main() {
  if (!fs.existsSync(seedPath)) {
    throw new Error(`种子文件不存在: ${seedPath}`);
  }
  const payload = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as SeedPayload;

  const projects = payload.projects?.length || 0;
  const dataSources = payload.dataSources?.length || 0;
  const schemaCaches = payload.schemaCaches?.length || 0;
  const tableHeat = payload.tableHeat?.length || 0;
  const rels = payload.tableRelationships?.length || 0;
  const semantics = payload.semanticFieldLearning?.length || 0;

  console.log('=== Portable Seed Verify ===');
  console.log(`seedPath: ${seedPath}`);
  console.log(`seedId: ${payload.seedId || 'N/A'}`);
  console.log(`version: ${payload.version || 'N/A'}`);
  console.log(`exportedAt: ${payload.exportedAt || 'N/A'}`);
  console.log(`projects: ${projects}`);
  console.log(`dataSources: ${dataSources}`);
  console.log(`schemaCaches: ${schemaCaches}`);
  console.log(`tableHeat: ${tableHeat}`);
  console.log(`tableRelationships: ${rels}`);
  console.log(`semanticFieldLearning: ${semantics}`);

  // 基础一致性：有数据源时，至少应包含 schema cache
  if (dataSources > 0) {
    assert(schemaCaches > 0, '存在 dataSources 但 schemaCaches 为空，请确认是否导出失败');
  }

  const relByDs = countByDataSource(payload.tableRelationships, 1);
  const semByDs = countByDataSource(payload.semanticFieldLearning, 1);
  printMap('tableRelationships by dataSourceId:', relByDs);
  printMap('semanticFieldLearning by dataSourceId:', semByDs);

  console.log('Portable seed verify passed');
}

main();
