import assert from 'assert';
import {
  detectAttachmentKind,
  parseExcelAttachment,
  parseTextAttachment,
} from './attachmentParser';

assert.strictEqual(detectAttachmentKind('a.XLSX'), 'excel');
assert.strictEqual(detectAttachmentKind('notes.txt'), 'text');
assert.strictEqual(detectAttachmentKind('shot.PNG'), 'image');
assert.strictEqual(detectAttachmentKind('readme.pdf'), null);

const textContent = '科室,收入\n内科,100\n外科,200';
const textB64 = Buffer.from(textContent, 'utf8').toString('base64');
const textParsed = parseTextAttachment(textB64, 'sample.csv');
assert.strictEqual(textParsed.success, true);
assert.ok(textParsed.promptBlock?.includes('内科'));
assert.ok(textParsed.promptBlock?.includes('附件文本'));

const longText = '这是一段较长的测试文本内容。'.repeat(3000);
const longB64 = Buffer.from(longText, 'utf8').toString('base64');
const longParsed = parseTextAttachment(longB64, 'big.txt');
assert.strictEqual(longParsed.success, true);
assert.ok(longParsed.promptBlock?.includes('已截取'));

console.log('attachmentParser.test.ts: all passed');
