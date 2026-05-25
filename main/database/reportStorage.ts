import { v4 as uuidv4 } from 'uuid';
import { getDb, saveDatabase } from './sqlite';

export interface ReportHistoryRecord {
  id: string;
  projectId: string;
  dataSourceId: string;
  title: string;
  description: string;
  sql: string;
  queryResult: string;
  chartType: string;
  chartConfig: string;
  messages: string;
  createdAt: string;
  updatedAt: string;
}

export interface TableRelationshipRecord {
  id: string;
  dataSourceId: string;
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  joinType: string;
  validationSql: string;
  isValid: number;
  verifiedAt: string;
  createdAt: string;
}

export interface ReportTemplateRecord {
  id: string;
  projectId: string;
  dataSourceId: string;
  name: string;
  description: string;
  sqlTemplate: string;
  parameters: string;
  chartType: string;
  createdAt: string;
  updatedAt: string;
}

export interface TableHeatRecord {
  id: string;
  dataSourceId: string;
  tableName: string;
  queryCount: number;
  reportCount: number;
  manualWeight: number;
  lastUsedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SemanticFieldLearningRecord {
  id: string;
  dataSourceId: string;
  userPhrase: string;
  resolvedTable: string;
  resolvedColumn: string;
  hitCount: number;
  lastUsedAt: string;
  createdAt: string;
}

export function initReportTables(): void {
  const db = getDb();
  db.run(`
    CREATE TABLE IF NOT EXISTS report_history (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      dataSourceId TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      sql TEXT,
      queryResult TEXT,
      chartType TEXT DEFAULT 'table',
      chartConfig TEXT,
      messages TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS table_relationships (
      id TEXT PRIMARY KEY,
      dataSourceId TEXT NOT NULL,
      leftTable TEXT NOT NULL,
      leftColumn TEXT NOT NULL,
      rightTable TEXT NOT NULL,
      rightColumn TEXT NOT NULL,
      joinType TEXT DEFAULT 'INNER',
      validationSql TEXT,
      isValid INTEGER DEFAULT 1,
      verifiedAt TEXT,
      createdAt TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_table_relationships_ds ON table_relationships(dataSourceId)
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS report_templates (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      dataSourceId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      sqlTemplate TEXT NOT NULL,
      parameters TEXT,
      chartType TEXT DEFAULT 'bar',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS table_heat (
      id TEXT PRIMARY KEY,
      dataSourceId TEXT NOT NULL,
      tableName TEXT NOT NULL,
      queryCount INTEGER DEFAULT 0,
      reportCount INTEGER DEFAULT 0,
      manualWeight INTEGER DEFAULT 0,
      lastUsedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(dataSourceId, tableName)
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_table_heat_ds ON table_heat(dataSourceId)
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS semantic_field_learning (
      id TEXT PRIMARY KEY,
      dataSourceId TEXT NOT NULL,
      userPhrase TEXT NOT NULL,
      resolvedTable TEXT NOT NULL,
      resolvedColumn TEXT NOT NULL,
      hitCount INTEGER DEFAULT 1,
      lastUsedAt TEXT,
      createdAt TEXT NOT NULL,
      UNIQUE(dataSourceId, userPhrase, resolvedTable, resolvedColumn)
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_semantic_learning_ds_phrase
    ON semantic_field_learning(dataSourceId, userPhrase)
  `);
  saveDatabase();
}

export function invalidateTableRelationships(dataSourceId: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.run(
    'UPDATE table_relationships SET isValid = 0, verifiedAt = ? WHERE dataSourceId = ?',
    [now, dataSourceId]
  );
  saveDatabase();
}

function rowToRelationship(row: unknown[]): TableRelationshipRecord {
  return {
    id: row[0] as string,
    dataSourceId: row[1] as string,
    leftTable: row[2] as string,
    leftColumn: row[3] as string,
    rightTable: row[4] as string,
    rightColumn: row[5] as string,
    joinType: (row[6] as string) || 'INNER',
    validationSql: (row[7] as string) || '',
    isValid: row[8] as number,
    verifiedAt: (row[9] as string) || '',
    createdAt: row[10] as string,
  };
}

export function getTableRelationshipsByDs(dataSourceId: string): TableRelationshipRecord[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM table_relationships WHERE dataSourceId = ? ORDER BY createdAt DESC');
  stmt.bind([dataSourceId]);
  const rows: TableRelationshipRecord[] = [];
  while (stmt.step()) {
    rows.push(rowToRelationship(stmt.get()));
  }
  stmt.free();
  return rows;
}

export function findRelationship(
  dataSourceId: string,
  leftTable: string,
  rightTable: string
): TableRelationshipRecord | undefined {
  const all = getTableRelationshipsByDs(dataSourceId);
  return all.find(
    (r) =>
      (r.leftTable === leftTable && r.rightTable === rightTable) ||
      (r.leftTable === rightTable && r.rightTable === leftTable)
  );
}

export function saveTableRelationship(
  rel: Omit<TableRelationshipRecord, 'id' | 'createdAt'> & { id?: string }
): TableRelationshipRecord {
  const db = getDb();
  const id = rel.id || uuidv4();
  const now = new Date().toISOString();
  const existing = findRelationship(rel.dataSourceId, rel.leftTable, rel.rightTable);
  if (existing) {
    db.run(
      `UPDATE table_relationships SET leftColumn=?, rightColumn=?, joinType=?, validationSql=?, isValid=?, verifiedAt=? WHERE id=?`,
      [rel.leftColumn, rel.rightColumn, rel.joinType, rel.validationSql, rel.isValid, rel.verifiedAt || now, existing.id]
    );
    saveDatabase();
    return { ...existing, ...rel, id: existing.id };
  }
  db.run(
    `INSERT INTO table_relationships (id, dataSourceId, leftTable, leftColumn, rightTable, rightColumn, joinType, validationSql, isValid, verifiedAt, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, rel.dataSourceId, rel.leftTable, rel.leftColumn, rel.rightTable, rel.rightColumn, rel.joinType, rel.validationSql, rel.isValid, rel.verifiedAt || now, now]
  );
  saveDatabase();
  return { ...rel, id, createdAt: now } as TableRelationshipRecord;
}

export function deleteTableRelationship(id: string): void {
  getDb().run('DELETE FROM table_relationships WHERE id = ?', [id]);
  saveDatabase();
}

export function clearTableRelationships(dataSourceId: string): void {
  getDb().run('DELETE FROM table_relationships WHERE dataSourceId = ?', [dataSourceId]);
  saveDatabase();
}

export function getReportHistory(projectId: string, limit = 500): ReportHistoryRecord[] {
  const db = getDb();
  const stmt = db.prepare(
    'SELECT * FROM report_history WHERE projectId = ? ORDER BY createdAt DESC LIMIT ?'
  );
  stmt.bind([projectId, limit]);
  const rows: ReportHistoryRecord[] = [];
  while (stmt.step()) {
    const r = stmt.get();
    rows.push({
      id: r[0] as string,
      projectId: r[1] as string,
      dataSourceId: r[2] as string,
      title: r[3] as string,
      description: (r[4] as string) || '',
      sql: (r[5] as string) || '',
      queryResult: (r[6] as string) || '{}',
      chartType: (r[7] as string) || 'table',
      chartConfig: (r[8] as string) || '{}',
      messages: (r[9] as string) || '[]',
      createdAt: r[10] as string,
      updatedAt: r[11] as string,
    });
  }
  stmt.free();
  return rows;
}

export function saveReportHistory(
  record: Omit<ReportHistoryRecord, 'createdAt' | 'updatedAt'> & { id?: string }
): ReportHistoryRecord {
  const db = getDb();
  const id = record.id || uuidv4();
  const now = new Date().toISOString();
  const existing = record.id
    ? getReportHistory(record.projectId).find((h) => h.id === record.id)
    : undefined;

  if (existing) {
    db.run(
      `UPDATE report_history SET title=?, description=?, sql=?, queryResult=?, chartType=?, chartConfig=?, messages=?, updatedAt=? WHERE id=?`,
      [record.title, record.description, record.sql, record.queryResult, record.chartType, record.chartConfig, record.messages, now, id]
    );
  } else {
    db.run(
      `INSERT INTO report_history (id, projectId, dataSourceId, title, description, sql, queryResult, chartType, chartConfig, messages, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, record.projectId, record.dataSourceId, record.title, record.description, record.sql, record.queryResult, record.chartType, record.chartConfig, record.messages, now, now]
    );
  }
  saveDatabase();
  return { ...record, id, createdAt: existing?.createdAt || now, updatedAt: now };
}

export function deleteReportHistory(id: string): void {
  getDb().run('DELETE FROM report_history WHERE id = ?', [id]);
  saveDatabase();
}

export function clearReportHistory(projectId: string): void {
  getDb().run('DELETE FROM report_history WHERE projectId = ?', [projectId]);
  saveDatabase();
}

export function getReportTemplates(projectId: string): ReportTemplateRecord[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM report_templates WHERE projectId = ? ORDER BY createdAt DESC');
  stmt.bind([projectId]);
  const rows: ReportTemplateRecord[] = [];
  while (stmt.step()) {
    const r = stmt.get();
    rows.push({
      id: r[0] as string,
      projectId: r[1] as string,
      dataSourceId: r[2] as string,
      name: r[3] as string,
      description: (r[4] as string) || '',
      sqlTemplate: r[5] as string,
      parameters: (r[6] as string) || '[]',
      chartType: (r[7] as string) || 'bar',
      createdAt: r[8] as string,
      updatedAt: r[9] as string,
    });
  }
  stmt.free();
  return rows;
}

export function saveReportTemplate(
  tpl: Omit<ReportTemplateRecord, 'createdAt' | 'updatedAt'> & { id?: string }
): ReportTemplateRecord {
  const db = getDb();
  const id = tpl.id || uuidv4();
  const now = new Date().toISOString();
  if (tpl.id) {
    db.run(
      `UPDATE report_templates SET name=?, description=?, sqlTemplate=?, parameters=?, chartType=?, updatedAt=? WHERE id=?`,
      [tpl.name, tpl.description, tpl.sqlTemplate, tpl.parameters, tpl.chartType, now, id]
    );
  } else {
    db.run(
      `INSERT INTO report_templates (id, projectId, dataSourceId, name, description, sqlTemplate, parameters, chartType, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, tpl.projectId, tpl.dataSourceId, tpl.name, tpl.description, tpl.sqlTemplate, tpl.parameters, tpl.chartType, now, now]
    );
  }
  saveDatabase();
  return { ...tpl, id, createdAt: now, updatedAt: now };
}

export function deleteReportTemplate(id: string): void {
  getDb().run('DELETE FROM report_templates WHERE id = ?', [id]);
  saveDatabase();
}

function rowToHeatRecord(row: unknown[]): TableHeatRecord {
  return {
    id: row[0] as string,
    dataSourceId: row[1] as string,
    tableName: row[2] as string,
    queryCount: Number(row[3] || 0),
    reportCount: Number(row[4] || 0),
    manualWeight: Number(row[5] || 0),
    lastUsedAt: (row[6] as string) || '',
    createdAt: row[7] as string,
    updatedAt: row[8] as string,
  };
}

export function getTableHeat(dataSourceId: string): TableHeatRecord[] {
  const db = getDb();
  const stmt = db.prepare(
    `SELECT id, dataSourceId, tableName, queryCount, reportCount, manualWeight, lastUsedAt, createdAt, updatedAt
     FROM table_heat
     WHERE dataSourceId = ?
     ORDER BY (queryCount + reportCount * 3 + manualWeight) DESC, updatedAt DESC`
  );
  stmt.bind([dataSourceId]);
  const rows: TableHeatRecord[] = [];
  while (stmt.step()) {
    rows.push(rowToHeatRecord(stmt.get()));
  }
  stmt.free();
  return rows;
}

export function getTableHeatMap(dataSourceId: string): Map<string, TableHeatRecord> {
  return new Map(getTableHeat(dataSourceId).map((r) => [r.tableName.toUpperCase(), r]));
}

export function bumpTableHeat(
  dataSourceId: string,
  tableNames: string[],
  source: 'query' | 'report',
  amount = 1
): void {
  const unique = Array.from(new Set(tableNames.map((t) => t.trim()).filter(Boolean)));
  if (unique.length === 0) return;

  const db = getDb();
  const now = new Date().toISOString();
  for (const tableName of unique) {
    const stmt = db.prepare(
      `SELECT id, queryCount, reportCount, manualWeight, createdAt
       FROM table_heat
       WHERE dataSourceId = ? AND UPPER(tableName) = UPPER(?)`
    );
    stmt.bind([dataSourceId, tableName]);
    if (stmt.step()) {
      const row = stmt.get();
      stmt.free();
      const queryCount = Number(row[1] || 0) + (source === 'query' ? amount : 0);
      const reportCount = Number(row[2] || 0) + (source === 'report' ? amount : 0);
      db.run(
        `UPDATE table_heat SET queryCount = ?, reportCount = ?, lastUsedAt = ?, updatedAt = ? WHERE id = ?`,
        [queryCount, reportCount, now, now, row[0]]
      );
    } else {
      db.run(
        `INSERT INTO table_heat (id, dataSourceId, tableName, queryCount, reportCount, manualWeight, lastUsedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          dataSourceId,
          tableName,
          source === 'query' ? amount : 0,
          source === 'report' ? amount : 0,
          0,
          now,
          now,
          now,
        ]
      );
      stmt.free();
    }
  }
  saveDatabase();
}

/** 写入或提升 manualWeight（不降低已有权重，不影响 queryCount/reportCount） */
export function upsertTableHeatManualWeight(
  dataSourceId: string,
  tableName: string,
  manualWeight: number
): void {
  if (!tableName.trim() || manualWeight <= 0) return;

  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `SELECT id, manualWeight, queryCount, reportCount, createdAt
     FROM table_heat
     WHERE dataSourceId = ? AND UPPER(tableName) = UPPER(?)`
  );
  stmt.bind([dataSourceId, tableName]);
  if (stmt.step()) {
    const row = stmt.get();
    stmt.free();
    const nextWeight = Math.max(Number(row[1] || 0), manualWeight);
    db.run(`UPDATE table_heat SET manualWeight = ?, updatedAt = ? WHERE id = ?`, [nextWeight, now, row[0]]);
  } else {
    stmt.free();
    db.run(
      `INSERT INTO table_heat (id, dataSourceId, tableName, queryCount, reportCount, manualWeight, lastUsedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), dataSourceId, tableName, 0, 0, manualWeight, '', now, now]
    );
  }
  saveDatabase();
}

export function deleteTableHeat(id: string): void {
  getDb().run('DELETE FROM table_heat WHERE id = ?', [id]);
  saveDatabase();
}

export function clearTableHeat(dataSourceId: string): void {
  getDb().run('DELETE FROM table_heat WHERE dataSourceId = ?', [dataSourceId]);
  saveDatabase();
}

function rowToSemanticRecord(row: unknown[]): SemanticFieldLearningRecord {
  return {
    id: row[0] as string,
    dataSourceId: row[1] as string,
    userPhrase: row[2] as string,
    resolvedTable: row[3] as string,
    resolvedColumn: row[4] as string,
    hitCount: Number(row[5] || 1),
    lastUsedAt: (row[6] as string) || '',
    createdAt: row[7] as string,
  };
}

export function getSemanticFieldLearning(
  dataSourceId: string,
  limit = 200
): SemanticFieldLearningRecord[] {
  const db = getDb();
  const stmt = db.prepare(
    `SELECT id, dataSourceId, userPhrase, resolvedTable, resolvedColumn, hitCount, lastUsedAt, createdAt
     FROM semantic_field_learning
     WHERE dataSourceId = ?
     ORDER BY hitCount DESC, lastUsedAt DESC
     LIMIT ?`
  );
  stmt.bind([dataSourceId, limit]);
  const rows: SemanticFieldLearningRecord[] = [];
  while (stmt.step()) {
    rows.push(rowToSemanticRecord(stmt.get()));
  }
  stmt.free();
  return rows;
}

export function saveSemanticFieldLearning(
  dataSourceId: string,
  userPhrase: string,
  resolvedTable: string,
  resolvedColumn: string,
  weight = 1
): void {
  const phrase = userPhrase.trim();
  if (!phrase) return;
  const table = resolvedTable.trim().toUpperCase();
  const column = resolvedColumn.trim().toUpperCase();
  if (!table || !column) return;

  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `SELECT id, hitCount FROM semantic_field_learning
     WHERE dataSourceId = ? AND userPhrase = ? AND resolvedTable = ? AND resolvedColumn = ?`
  );
  stmt.bind([dataSourceId, phrase, table, column]);
  if (stmt.step()) {
    const row = stmt.get();
    stmt.free();
    db.run(
      `UPDATE semantic_field_learning
       SET hitCount = ?, lastUsedAt = ?
       WHERE id = ?`,
      [Number(row[1] || 1) + Math.max(1, weight), now, row[0]]
    );
  } else {
    stmt.free();
    db.run(
      `INSERT INTO semantic_field_learning
       (id, dataSourceId, userPhrase, resolvedTable, resolvedColumn, hitCount, lastUsedAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), dataSourceId, phrase, table, column, Math.max(1, weight), now, now]
    );
  }
  saveDatabase();
}
