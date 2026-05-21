import { executeOracleQuery } from '../database/oracle';
import { executeDamengQuery } from '../database/dameng';
import { getProjectDataSourceById } from '../database/sqlite';

const MAX_PLAN_ROWS = 80;
const MAX_PLAN_CHARS = 12000;

function formatQueryResult(columns: string[], rows: any[][]): string {
  const lines: string[] = [];
  if (columns.length) lines.push(columns.join('\t'));
  for (const row of rows.slice(0, MAX_PLAN_ROWS)) {
    lines.push(row.map((c) => (c == null ? '' : String(c))).join('\t'));
  }
  if (rows.length > MAX_PLAN_ROWS) {
    lines.push(`... 共 ${rows.length} 行，已截断显示前 ${MAX_PLAN_ROWS} 行`);
  }
  let text = lines.join('\n');
  if (text.length > MAX_PLAN_CHARS) {
    text = text.slice(0, MAX_PLAN_CHARS) + '\n...（执行计划过长已截断）';
  }
  return text;
}

function stripSqlForExplain(sql: string): string {
  return sql.replace(/;\s*$/, '').trim();
}

export async function fetchExplainPlan(
  dataSourceId: string,
  dbType: 'oracle' | 'dameng',
  sql: string
): Promise<string> {
  const ds = getProjectDataSourceById(dataSourceId);
  if (!ds) throw new Error('数据源不存在');

  const cleanSql = stripSqlForExplain(sql);
  if (!cleanSql) throw new Error('SQL 为空');

  if (dbType === 'oracle') {
    return fetchOracleExplain(ds, cleanSql);
  }
  return fetchDamengExplain(ds, cleanSql);
}

async function fetchOracleExplain(ds: ReturnType<typeof getProjectDataSourceById>, sql: string): Promise<string> {
  const params = {
    host: ds!.host,
    port: ds!.port,
    serviceName: ds!.serviceName,
    sid: ds!.sid,
    username: ds!.username,
    password: ds!.password,
  };

  await executeOracleQuery(params, `EXPLAIN PLAN FOR ${sql}`);
  const plan = await executeOracleQuery(
    params,
    `SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY(FORMAT => 'TYPICAL'))`
  );
  return formatQueryResult(plan.columns, plan.rows);
}

async function fetchDamengExplain(ds: ReturnType<typeof getProjectDataSourceById>, sql: string): Promise<string> {
  const params = {
    host: ds!.host,
    port: ds!.port,
    schema: ds!.schema || ds!.username,
    username: ds!.username,
    password: ds!.password,
  };

  const attempts = [
    `EXPLAIN FOR ${sql}`,
    `EXPLAIN ${sql}`,
  ];

  let lastErr = '';
  for (const stmt of attempts) {
    try {
      const plan = await executeDamengQuery(params, stmt);
      return formatQueryResult(plan.columns, plan.rows);
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(lastErr || '达梦执行计划获取失败');
}
