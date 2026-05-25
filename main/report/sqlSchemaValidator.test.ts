import { validateSqlAgainstSchema } from './sqlSchemaValidator';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// Mock getSchemaTables via monkey-patch is heavy; test resolve logic through exported validate with empty ds would pass.
// Minimal unit: import internal behavior by testing validate with mock - skip if no mock infra.
// Instead test key parsing patterns via a tiny harness:

const tables = [
  {
    tableName: 'ZOEPATIENT.PAT_OUTP_PATIENT_CLINIC_INFO',
    comments: '',
    owner: 'ZOEPATIENT',
    columns: [
      { name: 'PATIENT_ID', type: 'VARCHAR2', comment: '' },
      { name: 'EVENT_NO', type: 'VARCHAR2', comment: '' },
      { name: 'CLINIC_DOCTOR_CODE', type: 'VARCHAR2', comment: '' },
      { name: 'PATIENT_NAME', type: 'VARCHAR2', comment: '' },
    ],
  },
  {
    tableName: 'ZOECOMM.COM_STAFF_BASIC_INFO',
    comments: '',
    owner: 'ZOECOMM',
    columns: [
      { name: 'STAFF_NO', type: 'VARCHAR2', comment: '' },
      { name: 'STAFF_NAME', type: 'VARCHAR2', comment: '' },
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

// Patch module - run validate by temporarily overriding getSchemaTables
const schemaContext = require('./schemaContext') as typeof import('./schemaContext');
const original = schemaContext.getSchemaTables;
schemaContext.getSchemaTables = () => tables as any;

const sql = `
SELECT c.PATIENT_ID, p.PHONE
FROM ZOEPATIENT.PAT_OUTP_PATIENT_CLINIC_INFO c
LEFT JOIN ZOECOMM.COM_STAFF_BASIC_INFO s ON c.CLINIC_DOCTOR_CODE = s.STAFF_NO
LEFT JOIN ZOEPATIENT.PAT_BASIC_INFO p ON c.PATIENT_ID = p.PATIENT_ID
WHERE ROWNUM <= 500
`;

const ok = validateSqlAgainstSchema('test-ds', sql);
assert(ok.valid, `expected valid sql, got: ${ok.reason}`);

const bad = validateSqlAgainstSchema(
  'test-ds',
  'SELECT x FROM ZOEPATIENT.PAT_OUTP_PATIENT_CLINIC_INFO c WHERE c.DOCTOR_CODE = 1'
);
assert(!bad.valid, 'hallucinated column should fail');

schemaContext.getSchemaTables = original;

console.log('sqlSchemaValidator tests passed');
