export type ReportAttachmentKind = 'excel' | 'text' | 'image';

const ACCEPT =
  '.xlsx,.xls,.txt,.csv,.log,.md,.png,.jpg,.jpeg,.webp,.gif,.bmp';

export function reportAttachmentAccept(): string {
  return ACCEPT;
}

export function detectReportAttachmentKind(fileName: string): ReportAttachmentKind | null {
  const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
  if (['xlsx', 'xls'].includes(ext)) return 'excel';
  if (['txt', 'csv', 'log', 'md'].includes(ext)) return 'text';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) return 'image';
  return null;
}

export function attachmentKindLabel(kind: ReportAttachmentKind): string {
  if (kind === 'excel') return 'Excel';
  if (kind === 'text') return '文本';
  return '图片';
}

export function attachmentKindIcon(kind: ReportAttachmentKind): string {
  if (kind === 'excel') return '📊';
  if (kind === 'text') return '📄';
  return '🖼️';
}

export function defaultPromptForAttachmentOnly(kind: ReportAttachmentKind): string {
  if (kind === 'excel') return '请根据附件 Excel 分析数据，生成合适的查询 SQL 或说明处理方案。';
  if (kind === 'text') return '请根据附件文本内容分析，生成合适的查询 SQL 或数据洞察。';
  return '请识别附件图片中的表格或数据，结合数据库 Schema 生成查询 SQL 或处理建议。';
}

export async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}
