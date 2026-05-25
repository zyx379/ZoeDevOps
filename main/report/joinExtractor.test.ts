import { extractJoinsFromSql } from './joinExtractor';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const tables = [
  {
    tableName: 'ZOEPATIENT.PAT_OUTP_PATIENT_CLINIC_INFO',
    comments: '',
    owner: 'ZOEPATIENT',
    columns: [
      { name: 'PATIENT_ID', type: 'VARCHAR2', comment: '' },
      { name: 'CLINIC_DOCTOR_CODE', type: 'VARCHAR2', comment: '' },
    ],
  },
  {
    tableName: 'ZOECOMM.COM_STAFF_BASIC_INFO',
    comments: '',
    owner: 'ZOECOMM',
    columns: [
      { name: 'STAFF_NO', type: 'VARCHAR2', comment: '' },
    ],
  },
  {
    tableName: 'ZOEPATIENT.PAT_BASIC_INFO',
    comments: '',
    owner: 'ZOEPATIENT',
    columns: [
      { name: 'PATIENT_ID', type: 'VARCHAR2', comment: '' },
      { name: 'PHONE', type: 'VARCHAR2', comment: '' },
    ],
  },
];

const schemaContext = require('./schemaContext') as typeof import('./schemaContext');
const original = schemaContext.getSchemaTables;
schemaContext.getSchemaTables = () => tables as any;

const sql = `
SELECT c.PATIENT_ID, p.PHONE
FROM ZOEPATIENT.PAT_OUTP_PATIENT_CLINIC_INFO c
LEFT JOIN ZOECOMM.COM_STAFF_BASIC_INFO s ON c.CLINIC_DOCTOR_CODE = s.STAFF_NO
LEFT JOIN ZOEPATIENT.PAT_BASIC_INFO p ON c.PATIENT_ID = p.PATIENT_ID
WHERE c.PATIENT_ID = '1' AND ROWNUM <= 500
`;

const joins = extractJoinsFromSql('test-ds', sql);
assert(joins.length === 2, `expected 2 joins, got ${joins.length}`);
assert(
  joins.some(
    (j) =>
      j.leftTable.includes('PAT_OUTP') &&
      j.rightTable.includes('COM_STAFF') &&
      j.leftColumn === 'CLINIC_DOCTOR_CODE' &&
      j.rightColumn === 'STAFF_NO'
  ),
  'staff join missing'
);
assert(
  joins.some(
    (j) =>
      j.leftTable.includes('PAT_OUTP') &&
      j.rightTable.includes('PAT_BASIC') &&
      j.leftColumn === 'PATIENT_ID' &&
      j.rightColumn === 'PATIENT_ID'
  ),
  'patient join missing'
);

const singleTable = extractJoinsFromSql('test-ds', 'SELECT * FROM ZOEPATIENT.PAT_BASIC_INFO WHERE ROWNUM <= 10');
assert(singleTable.length === 0, 'single table should have no joins');

schemaContext.getSchemaTables = original;

console.log('joinExtractor tests passed');
