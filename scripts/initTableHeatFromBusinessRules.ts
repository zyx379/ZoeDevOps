import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import {
  mapWeightsToSchemaTables,
  parseBusinessRulesTableWeights,
  summarizeBusinessRulesWeights,
} from '../main/report/businessRulesHeat';

function candidateUserDataDirs(): string[] {
  if (process.env.ZOE_DEVOPS_USER_DATA) {
    return [process.env.ZOE_DEVOPS_USER_DATA];
  }
  const appData = process.env.APPDATA || path.join(process.env.HOME || process.cwd(), 'AppData', 'Roaming');
  return [path.join(appData, 'zoe-devops'), path.join(appData, 'ZoeDevOps')];
}

function resolveRulesPath(): string {
  const argIdx = process.argv.indexOf('--rules');
  if (argIdx >= 0 && process.argv[argIdx + 1]) {
    return path.resolve(process.argv[argIdx + 1]);
  }
  if (process.env.BUSINESS_RULES_PATH) {
    return path.resolve(process.env.BUSINESS_RULES_PATH);
  }
  const candidates = [
    path.join(process.cwd(), 'resources', 'constraints', 'business-rules.md'),
    path.join(process.cwd(), '..', 'fj-common', 'ZOEHIS_AI_DEV_SKILL', 'constraints', 'business-rules.md'),
    'd:\\code\\fj-common\\ZOEHIS_AI_DEV_SKILL\\constraints\\business-rules.md',
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error('未找到 business-rules.md，请通过 --rules 或 BUSINESS_RULES_PATH 指定路径');
  }
  return found;
}

function readSchemaCaches(userDataDir: string): { dataSourceId: string; tables: { tableName: string }[] }[] {
  const dir = path.join(userDataDir, 'schema-cache');
  if (!fs.existsSync(dir)) return [];

  const caches: { dataSourceId: string; tables: { tableName: string }[] }[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8'));
      if (parsed?.dataSourceId && Array.isArray(parsed.tables)) {
        caches.push({
          dataSourceId: parsed.dataSourceId,
          tables: parsed.tables.map((t: any) => ({ tableName: String(t.tableName || '') })),
        });
      }
    } catch {
      // ignore malformed cache
    }
  }
  return caches;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const rulesPath = resolveRulesPath();
  const content = fs.readFileSync(rulesPath, 'utf-8');
  const weights = parseBusinessRulesTableWeights(content);
  const summary = summarizeBusinessRulesWeights(weights);

  console.log(`Business rules: ${rulesPath}`);
  console.log(`Parsed tables: ${summary.tableCount}`);
  console.log('Top weights:');
  for (const item of summary.topTables) {
    console.log(`  ${item.name} = ${item.weight}`);
  }

  const userDataDir = candidateUserDataDirs().find((dir) => fs.existsSync(path.join(dir, 'zoe-devops.db')));
  if (!userDataDir) {
    throw new Error('未找到 zoe-devops.db。可设置 ZOE_DEVOPS_USER_DATA 指向 Electron userData 目录。');
  }

  const schemaCaches = readSchemaCaches(userDataDir);
  if (schemaCaches.length === 0) {
    throw new Error('未找到 schema-cache，请先在应用中加载数据源 Schema。');
  }

  const SQL = await initSqlJs();
  const dbPath = path.join(userDataDir, 'zoe-devops.db');
  const db = new SQL.Database(fs.readFileSync(dbPath));

  let totalUpserts = 0;
  for (const cache of schemaCaches) {
    const mapped = mapWeightsToSchemaTables(weights, cache.tables);
    console.log(`\nDataSource ${cache.dataSourceId}: matched ${mapped.length}/${cache.tables.length} tables`);
    if (mapped.length > 0) {
      console.log(`  top: ${mapped.slice(0, 5).map((m) => `${m.tableName}(${m.manualWeight})`).join(', ')}`);
    }

    for (const item of mapped) {
      totalUpserts += 1;
      if (dryRun) continue;

      const select = db.prepare(
        'SELECT id, manualWeight FROM table_heat WHERE dataSourceId = ? AND UPPER(tableName) = UPPER(?)'
      );
      select.bind([cache.dataSourceId, item.tableName]);
      const now = new Date().toISOString();
      if (select.step()) {
        const row = select.get();
        select.free();
        const nextWeight = Math.max(Number(row[1] || 0), item.manualWeight);
        db.run('UPDATE table_heat SET manualWeight = ?, updatedAt = ? WHERE id = ?', [nextWeight, now, row[0]]);
      } else {
        select.free();
        const id = crypto.randomUUID();
        db.run(
          `INSERT INTO table_heat (id, dataSourceId, tableName, queryCount, reportCount, manualWeight, lastUsedAt, createdAt, updatedAt)
           VALUES (?, ?, ?, 0, 0, ?, '', ?, ?)`,
          [id, cache.dataSourceId, item.tableName, item.manualWeight, now, now]
        );
      }
    }
  }

  if (!dryRun) {
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
    console.log(`\nDone. Updated manualWeight for ${totalUpserts} table(s). Run seed:export to pack into portable seed.`);
  } else {
    console.log(`\nDry run. Would upsert ${totalUpserts} table(s).`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
