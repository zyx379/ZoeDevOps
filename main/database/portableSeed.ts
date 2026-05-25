import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { Database as SqlJsDatabase, SqlValue } from 'sql.js';
import { readSchemaCacheFromFile, writeSchemaCacheToFile } from './schemaCacheFiles';

export const PORTABLE_SEED_VERSION = '1.0.0';

export interface PortableSeedPayload {
  version: string;
  seedId: string;
  exportedAt: string;
  projects?: unknown[][];
  dataSources?: unknown[][];
  projectConfigs?: unknown[][];
  schemaCaches?: { dataSourceId: string; tables: any[]; cachedAt?: string }[];
  tableHeat?: unknown[][];
  tableRelationships?: unknown[][];
  semanticFieldLearning?: unknown[][];
}

export function getPortableSeedPath(): string | undefined {
  if (process.env.ZOE_DEVOPS_SEED_PATH) {
    return process.env.ZOE_DEVOPS_SEED_PATH;
  }

  const candidates = [
    path.join(process.resourcesPath || '', 'seed', 'portable-seed.json'),
    path.join(app.getAppPath(), 'resources', 'seed', 'portable-seed.json'),
    path.join(process.cwd(), 'resources', 'seed', 'portable-seed.json'),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function ensureSeedImportTable(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS seed_imports (
      seedId TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      importedAt TEXT NOT NULL
    )
  `);
}

function seedAlreadyImported(db: SqlJsDatabase, seedId: string): boolean {
  const stmt = db.prepare('SELECT seedId FROM seed_imports WHERE seedId = ?');
  stmt.bind([seedId]);
  const imported = stmt.step();
  stmt.free();
  return imported;
}

function toSqlValue(value: unknown): SqlValue | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (value instanceof Uint8Array) return value;
  return String(value);
}

function insertIfMissing(db: SqlJsDatabase, table: string, id: unknown, columns: string[], values: unknown[]): void {
  if (!id) return;
  const stmt = db.prepare(`SELECT id FROM ${table} WHERE id = ?`);
  stmt.bind([toSqlValue(id)]);
  const exists = stmt.step();
  stmt.free();
  if (exists) return;

  const placeholders = columns.map(() => '?').join(', ');
  try {
    db.run(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
      values.map(toSqlValue)
    );
  } catch (e) {
    console.warn(`[portable-seed] Skip ${table} row:`, e);
  }
}

export function importPortableSeedIfAvailable(db: SqlJsDatabase, saveDatabase: () => void): void {
  ensureSeedImportTable(db);
  const seedPath = getPortableSeedPath();
  if (!seedPath) return;

  try {
    const payload = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as PortableSeedPayload;
    if (!payload?.seedId || seedAlreadyImported(db, payload.seedId)) return;

    for (const row of payload.projects || []) {
      insertIfMissing(db, 'projects', row[0], ['id', 'name', 'description', 'isActive', 'createdAt', 'updatedAt'], row);
    }
    for (const row of payload.dataSources || []) {
      insertIfMissing(
        db,
        'data_sources',
        row[0],
        ['id', 'projectId', 'name', 'type', 'host', 'port', 'sid', 'serviceName', 'schema', 'username', 'password', 'createdAt', 'updatedAt'],
        row
      );
    }
    for (const row of payload.projectConfigs || []) {
      insertIfMissing(
        db,
        'project_configs',
        row[0],
        ['id', 'projectId', 'apiBaseUrl', 'apiTokenPath', 'apiVersionPath', 'apiLogPath', 'redisHost', 'redisPort', 'redisPassword', 'redisDb', 'createdAt', 'updatedAt'],
        row
      );
    }
    for (const row of payload.tableHeat || []) {
      insertIfMissing(
        db,
        'table_heat',
        row[0],
        ['id', 'dataSourceId', 'tableName', 'queryCount', 'reportCount', 'manualWeight', 'lastUsedAt', 'createdAt', 'updatedAt'],
        row
      );
    }
    for (const row of payload.tableRelationships || []) {
      insertIfMissing(
        db,
        'table_relationships',
        row[0],
        ['id', 'dataSourceId', 'leftTable', 'leftColumn', 'rightTable', 'rightColumn', 'joinType', 'validationSql', 'isValid', 'verifiedAt', 'createdAt'],
        row
      );
    }
    for (const row of payload.semanticFieldLearning || []) {
      insertIfMissing(
        db,
        'semantic_field_learning',
        row[0],
        ['id', 'dataSourceId', 'userPhrase', 'resolvedTable', 'resolvedColumn', 'hitCount', 'lastUsedAt', 'createdAt'],
        row
      );
    }
    for (const cache of payload.schemaCaches || []) {
      if (!cache.dataSourceId || !Array.isArray(cache.tables)) continue;
      if (!readSchemaCacheFromFile(cache.dataSourceId)) {
        writeSchemaCacheToFile(cache.dataSourceId, cache.tables);
      }
    }

    db.run('INSERT INTO seed_imports (seedId, version, importedAt) VALUES (?, ?, ?)', [
      payload.seedId,
      payload.version || PORTABLE_SEED_VERSION,
      new Date().toISOString(),
    ]);
    saveDatabase();
    console.log('[portable-seed] Imported seed:', seedPath);
  } catch (e) {
    console.error('[portable-seed] Import failed:', e);
  }
}
