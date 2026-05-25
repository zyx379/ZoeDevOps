import {
  isLikelyTableName,
  mapWeightsToSchemaTables,
  parseBusinessRulesTableWeights,
} from './businessRulesHeat';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(isLikelyTableName('PAT_BASIC_INFO'), 'PAT_BASIC_INFO');
assert(isLikelyTableName('ZOEPATIENT.PAT_BASIC_INFO'), 'owner table');
assert(!isLikelyTableName('DETL'), 'DETL should be skipped');
assert(!isLikelyTableName('门诊摆药条件设置'), 'Chinese should be skipped');

const sample = `
## 二、门诊业务流程
| 新增病人信息 | \`PAT_BASIC_INFO\` | 新增 |
| 挂号 | \`PAT_OUTP_PATIENT_CLINIC_INFO\` | 新增 |

## 五、完整数据库表清单
| \`PAT_BASIC_INFO\` | 病人基本信息 |
| \`DIC_DRUG_DICT\` | 药品字典 |
`;

const weights = parseBusinessRulesTableWeights(sample);
assert((weights.get('PAT_BASIC_INFO') || 0) >= 8, 'PAT_BASIC_INFO should accumulate flow + catalog');
assert((weights.get('PAT_OUTP_PATIENT_CLINIC_INFO') || 0) === 5, 'clinic info flow weight');
assert((weights.get('DIC_DRUG_DICT') || 0) === 3, 'dict catalog weight');

const mapped = mapWeightsToSchemaTables(weights, [
  { tableName: 'ZOEPATIENT.PAT_BASIC_INFO' },
  { tableName: 'ZOEPATIENT.PAT_OUTP_PATIENT_CLINIC_INFO' },
  { tableName: 'UNRELATED_TABLE' },
]);
assert(mapped.length === 2, 'only matched schema tables');
assert(mapped[0].tableName.includes('PAT_BASIC'), 'basic info should rank high');

console.log('businessRulesHeat tests passed');
