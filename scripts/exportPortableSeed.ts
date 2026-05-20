import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';

const outputPath = process.argv[2] || path.join(process.cwd(), 'resources', 'seed', 'portable-seed.json');

function candidateUserDataDirs(): string[] {
  if (process.env.ZOE_DEVOPS_USER_DATA) {
    return [process.env.ZOE_DEVOPS_USER_DATA];
  }
  const appData = process.env.APPDATA || path.join(process.env.HOME || process.cwd(), 'AppData', 'Roaming');
  return [
    path.join(appData, 'zoe-devops'),
    path.join(appData, 'ZoeDevOps'),
  ];
}

function tableRows(db: any, sql: string): unknown[][] {
  try {
    const result = db.exec(sql);
    return result.length > 0 ? result[0].values : [];
  } catch {
    return [];
  }
}

function readSchemaCaches(userDataDir: string): { dataSourceId: string; tables: any[]; cachedAt?: string }[] {
  const dir = path.join(userDataDir, 'schema-cache');
  if (!fs.existsSync(dir)) return [];

  const caches: { dataSourceId: string; tables: any[]; cachedAt?: string }[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8'));
      if (parsed?.dataSourceId && Array.isArray(parsed.tables)) {
        caches.push({
          dataSourceId: parsed.dataSourceId,
          tables: parsed.tables,
          cachedAt: parsed.cachedAt,
        });
      }
    } catch {
      // Ignore malformed cache files; they can be regenerated from the database.
    }
  }
  return caches;
}

async function main() {
  const userDataDir = candidateUserDataDirs().find((dir) => fs.existsSync(path.join(dir, 'zoe-devops.db')));
  if (!userDataDir) {
    throw new Error('未找到 zoe-devops.db。可设置 ZOE_DEVOPS_USER_DATA 指向 Electron userData 目录。');
  }

  const SQL = await initSqlJs();
  const dbPath = path.join(userDataDir, 'zoe-devops.db');
  const db = new SQL.Database(fs.readFileSync(dbPath));

  const payload = {
    version: '1.0.0',
    seedId: `seed_${Date.now()}`,
    exportedAt: new Date().toISOString(),
    projects: tableRows(db, 'SELECT id, name, description, isActive, createdAt, updatedAt FROM projects'),
    dataSources: tableRows(
      db,
      'SELECT id, projectId, name, type, host, port, sid, serviceName, schema, username, password, createdAt, updatedAt FROM data_sources'
    ),
    projectConfigs: tableRows(
      db,
      'SELECT id, projectId, apiBaseUrl, apiTokenPath, apiVersionPath, apiLogPath, redisHost, redisPort, redisPassword, redisDb, createdAt, updatedAt FROM project_configs'
    ),
    schemaCaches: readSchemaCaches(userDataDir),
    tableHeat: tableRows(
      db,
      "SELECT id, dataSourceId, tableName, queryCount, reportCount, manualWeight, lastUsedAt, createdAt, updatedAt FROM table_heat"
    ),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload), 'utf-8');
  console.log(`Portable seed exported: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
