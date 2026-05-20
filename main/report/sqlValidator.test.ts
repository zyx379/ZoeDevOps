import { validateSql, ensureRowLimit } from './sqlValidator';
import { extractTableNamesFromSql } from './tableNames';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// SELECT only
assert(validateSql('SELECT * FROM T').valid, 'simple select');
assert(!validateSql('DELETE FROM T').valid, 'delete blocked');
assert(!validateSql('DROP TABLE T').valid, 'drop blocked');

// data access mode
assert(validateSql('INSERT INTO T (A) VALUES (1)', 'data_access').valid, 'insert ok');
assert(!validateSql('UPDATE T SET A=1', 'data_access').valid, 'update without where blocked');
assert(validateSql('UPDATE T SET A=1 WHERE ID=1', 'data_access').valid, 'update with where ok');

// row limit
const limited = ensureRowLimit('SELECT * FROM ORDERS', 'oracle');
assert(limited.includes('ROWNUM'), 'oracle rownum wrapper');
const dm = ensureRowLimit('SELECT * FROM ORDERS', 'dameng');
assert(dm.includes('TOP'), 'dameng top wrapper');

// table extraction for heat scoring
const tables = extractTableNamesFromSql('SELECT * FROM HIS.PATIENT p JOIN ORDERS o ON p.ID = o.PID WHERE ROWNUM <= 10');
assert(tables.includes('HIS.PATIENT'), 'extract schema-qualified table');
assert(tables.includes('ORDERS'), 'extract joined table');

console.log('sqlValidator tests passed');
