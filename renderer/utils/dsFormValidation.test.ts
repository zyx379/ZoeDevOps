import {
  validateDsForm,
  isDsFormValid,
  mapDataSourceSaveError,
  type DsFormValues,
} from './dsFormValidation';

const base: DsFormValues = {
  name: '测试库',
  type: 'oracle',
  host: '127.0.0.1',
  port: 1521,
  sid: 'ORCL',
  serviceName: '',
  schema: '',
  username: 'sys',
  password: 'secret',
};

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(isDsFormValid(validateDsForm(base)), 'oracle valid form should pass');

const noSid = { ...base, sid: '', serviceName: '' };
assert(!isDsFormValid(validateDsForm(noSid)), 'oracle without sid/service should fail');

const dameng = { ...base, type: 'dameng' as const, sid: '', serviceName: '', schema: 'DMDB' };
assert(isDsFormValid(validateDsForm(dameng)), 'dameng with schema should pass');

const damengNoSchema = { ...dameng, schema: '' };
assert(!isDsFormValid(validateDsForm(damengNoSchema)), 'dameng without schema should fail');

const badPort = { ...base, port: 70000 };
assert(!isDsFormValid(validateDsForm(badPort)), 'invalid port should fail');

assert(
  mapDataSourceSaveError(new Error('UNIQUE constraint failed: data_sources.projectId')).includes(
    '已存在数据源'
  ),
  'unique error should map to friendly message'
);

console.log('dsFormValidation: all tests passed');
