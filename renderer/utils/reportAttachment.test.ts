import assert from 'assert';
import {
  detectReportAttachmentKind,
  defaultPromptForAttachmentOnly,
  attachmentKindLabel,
} from './reportAttachment';

assert.strictEqual(detectReportAttachmentKind('data.xls'), 'excel');
assert.strictEqual(detectReportAttachmentKind('log.log'), 'text');
assert.strictEqual(detectReportAttachmentKind('pic.jpeg'), 'image');
assert.strictEqual(detectReportAttachmentKind('archive.zip'), null);

assert.ok(defaultPromptForAttachmentOnly('excel').includes('Excel'));
assert.ok(defaultPromptForAttachmentOnly('image').includes('图片'));
assert.strictEqual(attachmentKindLabel('text'), '文本');

console.log('reportAttachment.test.ts: all passed');
