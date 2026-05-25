import { buildBaseLogQuery, buildSqlLogQuery, normalizeLogEvidence } from './logUtils';
import { AnalyzedLogInfo } from '../../api-client';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const sqlQuery = buildSqlLogQuery({
  traceId: 'trace-1',
  sqlId: 'getOutpPartBoundDrugInfo',
});

assert(sqlQuery.traceId === 'trace-1', 'traceId should be passed at top level');
assert(sqlQuery.sqlId === 'getOutpPartBoundDrugInfo', 'sqlId should be passed at top level');
assert(sqlQuery.indexvalue === 'log-sql*', 'indexvalue should default to log-sql*');
assert(sqlQuery.logType === 'sql', 'logType should default to sql');
assert(sqlQuery.pageNum === '1', 'pageNum should default to 1');
assert(sqlQuery.pageSize === '20', 'pageSize should default to 20');
assert(JSON.stringify(sqlQuery.filterParamet) === '{}', 'filterParamet should be empty object for SQL query');
assert(sqlQuery.filterParam === undefined, 'SQL query should not send filterParam');

const rpcQuery = buildBaseLogQuery({
  traceId: 'trace-1',
  indexvalue: 'log-dubbo*',
  logType: 'dubbo',
});

assert(rpcQuery.indexvalue === 'log-dubbo*', 'rpc query should target dubbo index');
assert(rpcQuery.logType === 'dubbo', 'rpc query should use dubbo logType');
assert(rpcQuery.pageNum === '1', 'base query should default pageNum to 1');
assert(rpcQuery.pageSize === '20', 'base query should default pageSize to 20');

const evidence = normalizeLogEvidence({
  id: 'span-1',
  logType: 'http',
  logLevel: 'ERROR',
  serviceName: 'optimus-service',
  reqUrl: '/api/treeForLog',
  traceId: 'trace-1',
  parentId: 'root',
  spanId: 'span-1',
  errorClass: 'BadSqlGrammarException',
  errorMessage: 'ORA-01427',
  sqlId: 'treeForLog',
  sqlContent: 'select * from dual',
  requestParams: '{"id":"1"}',
  originalLog: {},
} as AnalyzedLogInfo);

assert(evidence.traceId === 'trace-1', 'evidence should keep traceId');
assert(evidence.errorMessage === 'ORA-01427', 'evidence should keep error message');
assert(evidence.sqlId === 'treeForLog', 'evidence should keep sqlId');
assert(evidence.sql === 'select * from dual', 'evidence should keep SQL text');

console.log('logUtils tests passed');
