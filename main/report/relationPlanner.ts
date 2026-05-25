import { ConversationMessage } from '../agent/types';
import { DeepSeekClient } from '../agent/deepseek';

export interface JoinPlanItem {
  left: string;
  leftColumn: string;
  right: string;
  rightColumn: string;
  reason?: string;
}

export interface RelationPlan {
  neededTables: string[];
  joins: JoinPlanItem[];
}

function normalizeName(name: string): string {
  return name.trim().replace(/["'`]/g, '').toUpperCase();
}

function parseJsonBlock(content: string): RelationPlan | null {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : content.trim();
  try {
    const parsed = JSON.parse(raw) as RelationPlan;
    if (!parsed || !Array.isArray(parsed.neededTables) || !Array.isArray(parsed.joins)) {
      return null;
    }
    return {
      neededTables: parsed.neededTables.map(normalizeName).filter(Boolean),
      joins: parsed.joins
        .map((j) => ({
          left: normalizeName(j.left || ''),
          leftColumn: normalizeName(j.leftColumn || ''),
          right: normalizeName(j.right || ''),
          rightColumn: normalizeName(j.rightColumn || ''),
          reason: j.reason || '',
        }))
        .filter((j) => j.left && j.leftColumn && j.right && j.rightColumn),
    };
  } catch {
    return null;
  }
}

function dedupePlan(plan: RelationPlan): RelationPlan {
  const tables = Array.from(new Set(plan.neededTables));
  const seen = new Set<string>();
  const joins = plan.joins.filter((j) => {
    const pair = [j.left, j.right].sort().join('::');
    const key = `${pair}::${j.leftColumn}::${j.rightColumn}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { neededTables: tables, joins };
}

export async function generateRelationPlan(
  client: DeepSeekClient,
  baseMessages: ConversationMessage[],
  userMessage: string,
  abortSignal?: AbortSignal
): Promise<RelationPlan | null> {
  const prompt = [
    '你是 SQL 关联规划助手。请根据用户需求和给定 schema 输出关联计划 JSON。',
    '仅输出 JSON，不要解释文本，格式：',
    '{"neededTables":["TABLE_A","TABLE_B"],"joins":[{"left":"TABLE_A","leftColumn":"COL_A","right":"TABLE_B","rightColumn":"COL_B","reason":"..."}]}',
    '要求：',
    '1) 表名和字段名必须来自 schema',
    '2) joins 仅保留必要关联',
    '3) 若无法确定关联字段，joins 为空数组',
    `用户需求：${userMessage}`,
  ].join('\n');

  const result = await client.chat(
    [...baseMessages, { role: 'user', content: prompt }],
    {
      tools: false,
      stream: false,
      max_tokens: 1200,
      signal: abortSignal,
    }
  );
  const content = result.choices[0]?.message?.content || '';
  const plan = parseJsonBlock(content);
  return plan ? dedupePlan(plan) : null;
}
