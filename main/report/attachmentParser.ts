import * as XLSX from 'xlsx';

export type ReportAttachmentKind = 'excel' | 'text' | 'image';

const TEXT_MAX_CHARS = 32_000;
const TEXT_PREVIEW_LINES = 80;
const EXCEL_PREVIEW_ROWS = 5;

const IMAGE_PARSE_PROMPT = `你是 OCR/表格识别助手。请识别用户上传图片中的表格或结构化文字，输出：
1. 若有表格：列出列名（表头）和前 10 行数据，用制表符分隔列
2. 若无表格：概括图片中的关键文字与数字
3. 若无法识别，明确说明原因
使用中文，不要编造不存在的数据。`;

export function detectAttachmentKind(fileName: string): ReportAttachmentKind | null {
  const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
  if (['xlsx', 'xls'].includes(ext)) return 'excel';
  if (['txt', 'csv', 'log', 'md'].includes(ext)) return 'text';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) return 'image';
  return null;
}

export function mimeTypeForAttachment(fileName: string, kind: ReportAttachmentKind): string {
  const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
  if (kind === 'image') {
    const map: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      bmp: 'image/bmp',
    };
    return map[ext] || 'image/jpeg';
  }
  if (kind === 'excel') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'text/plain';
}

export interface ParsedExcelSheet {
  name: string;
  headers: string[];
  previewRows: string[][];
  totalRows: number;
}

export interface ParseAttachmentResult {
  success: boolean;
  kind?: ReportAttachmentKind;
  fileName?: string;
  message?: string;
  promptBlock?: string;
  sheets?: ParsedExcelSheet[];
}

export function parseExcelAttachment(base64: string, fileName: string): ParseAttachmentResult {
  try {
    const buffer = Buffer.from(base64, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheets: ParsedExcelSheet[] = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
      const headers = (data[0] || []).map(String);
      const previewRows = data.slice(1, 1 + EXCEL_PREVIEW_ROWS).map((row) => (row || []).map(String));
      return { name, headers, previewRows, totalRows: Math.max(0, data.length - 1) };
    });
    return {
      success: true,
      kind: 'excel',
      fileName,
      sheets,
      promptBlock: formatExcelPrompt(fileName, sheets),
    };
  } catch (error) {
    return { success: false, kind: 'excel', fileName, message: (error as Error).message };
  }
}

function formatExcelPrompt(fileName: string, sheets: ParsedExcelSheet[]): string {
  const parts = sheets.map((sheet) => {
    const preview = sheet.previewRows.map((r) => r.join('\t')).join('\n');
    return `Sheet「${sheet.name}」（共 ${sheet.totalRows} 行）\n表头: ${sheet.headers.join(', ')}\n预览:\n${preview || '(无数据行)'}`;
  });
  return `[附件 Excel: ${fileName}]\n${parts.join('\n\n')}`;
}

export function parseTextAttachment(base64: string, fileName: string): ParseAttachmentResult {
  try {
    const raw = Buffer.from(base64, 'base64').toString('utf8');
    const normalized = raw.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const truncated = normalized.length > TEXT_MAX_CHARS;
    const content = truncated ? normalized.slice(0, TEXT_MAX_CHARS) : normalized;
    const previewLines = lines.slice(0, TEXT_PREVIEW_LINES);
    const preview =
      lines.length > TEXT_PREVIEW_LINES
        ? `${previewLines.join('\n')}\n...（共 ${lines.length} 行，已截断展示前 ${TEXT_PREVIEW_LINES} 行）`
        : previewLines.join('\n');

    return {
      success: true,
      kind: 'text',
      fileName,
      promptBlock: `[附件文本: ${fileName}${truncated ? `，原文约 ${normalized.length} 字符，已截取前 ${TEXT_MAX_CHARS} 字符` : ''}]\n${preview}\n\n--- 全文供分析 ---\n${content}`,
    };
  } catch (error) {
    return { success: false, kind: 'text', fileName, message: (error as Error).message };
  }
}

export async function parseImageAttachment(base64: string, fileName: string): Promise<ParseAttachmentResult> {
  const { getGlobalConfig } = await import('../database/sqlite');
  const { DeepSeekClient } = await import('../agent/deepseek');
  const globalConfig = getGlobalConfig();
  if (!globalConfig?.deepseekApiKey) {
    return { success: false, kind: 'image', fileName, message: '请先在项目管理中配置 DeepSeek API Key' };
  }

  const mime = mimeTypeForAttachment(fileName, 'image');
  const client = new DeepSeekClient({
    apiKey: globalConfig.deepseekApiKey,
    baseUrl: globalConfig.deepseekBaseUrl || undefined,
    model: globalConfig.deepseekModel || 'deepseek-chat',
  });

  try {
    const recognized = await client.chatWithImage(IMAGE_PARSE_PROMPT, base64, mime, {
      temperature: 0.2,
      max_tokens: 4096,
    });
    const text = recognized.trim();
    if (!text) {
      return { success: false, kind: 'image', fileName, message: '图片识别未返回内容' };
    }
    return {
      success: true,
      kind: 'image',
      fileName,
      promptBlock: `[附件图片: ${fileName}，AI 识别结果]\n${text}`,
    };
  } catch (error) {
    const msg = (error as Error).message || '图片识别失败';
    const hint =
      msg.includes('image') || msg.includes('vision') || msg.includes('multimodal')
        ? '当前 API/模型可能不支持图片。请在输入框用文字描述图片内容，或改用 Excel/txt 附件。'
        : msg;
    return { success: false, kind: 'image', fileName, message: hint };
  }
}

export async function parseReportAttachment(
  kind: ReportAttachmentKind,
  base64: string,
  fileName: string
): Promise<ParseAttachmentResult> {
  if (kind === 'excel') return parseExcelAttachment(base64, fileName);
  if (kind === 'text') return parseTextAttachment(base64, fileName);
  return parseImageAttachment(base64, fileName);
}
