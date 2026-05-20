const TABLE_REF_PATTERN = /\b(?:FROM|JOIN)\s+([A-Za-z_][\w$#]*(?:\.[A-Za-z_][\w$#]*)?|"[^"]+"(?:\."[^"]+")?)/gi;

export function extractTableNamesFromSql(sql: string): string[] {
  const names = new Set<string>();
  for (const match of sql.matchAll(TABLE_REF_PATTERN)) {
    const raw = match[1]?.trim();
    if (!raw || raw.startsWith('(')) continue;
    names.add(raw.replace(/"/g, ''));
  }
  return Array.from(names);
}
