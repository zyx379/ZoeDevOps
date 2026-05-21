import {
  extractSqlFromText,
  isSqlBlockLikelyTruncated,
  needsSqlContinuation,
  isSqlOptimizationRequest,
  extractTableNamesFromSql,
} from './reportIntent';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(extractSqlFromText('```sql\nSELECT 1\n```') === 'SELECT 1', 'closed sql');
assert(extractSqlFromText('```sql\nSELECT * FROM T_ORDER') === 'SELECT * FROM T_ORDER', 'open sql');
assert(isSqlOptimizationRequest('帮我优化这个慢查询'), 'optimize kw');
assert(extractTableNamesFromSql('SELECT * FROM T_A JOIN T_B ON ...').includes('T_A'), 'tables');
assert(isSqlBlockLikelyTruncated('```sql\nSELECT 1 FROM t'), 'truncated open fence');
assert(!isSqlBlockLikelyTruncated('```sql\nSELECT 1;\n```'), 'closed fence ok');
assert(needsSqlContinuation('x', 'length'), 'length finish');

console.log('reportIntent tests passed');
