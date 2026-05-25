# AI 报表智能化升级设计文档

> 版本：v1.0
> 更新日期：2026-05-22
> 文档性质：设计方案，指导后续开发

---

## 一、背景与问题

当前 AI 报表模块已具备自然语言转 SQL、表关系缓存、表热度评分等基础能力，但在实际使用中暴露出三个核心问题：

1. **表关系未真正驱动 SQL 生成**：已验证的表关系仅作为文本提示拼入 Prompt，AI 仍可能无视关系、编造关联字段、乱 JOIN。
2. **语义联想无学习机制**：字段语义映射（如"手机号"→`PHONE`）是硬编码的，无法从用户反馈中积累，做不到"越用越聪明"。
3. **输出顺序不稳定**：AI 对排序规则理解不一致，用户未指定时返回顺序随机。

本方案围绕"**让表关系强制约束 AI**"和"**用户反馈驱动语义学习**"两个核心目标进行设计。

---

## 二、设计原则

| 原则 | 说明 |
|------|------|
| 关系优先 | 多表查询时，已验证的表关系是强制约束，不是参考建议 |
| 反馈闭环 | 用户的每一次采纳、修正、执行成功，都是学习信号 |
| 渐进增强 | 不推翻现有架构，在现有热度、关系缓存基础上叠加能力 |
| 可解释 | AI 为什么选这张表、这个字段，用户能看得到原因 |

---

## 三、方案总览

```
用户输入
   │
   ▼
┌─────────────────────────────────────────┐
│  阶段1：意图分析 + 表选择                  │
│  - 语义关键词提取                          │
│  - 热度评分选表                            │
│  - 【新增】关联表自动推荐                   │
└─────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────┐
│  阶段2：关系推理与验证（核心改进）          │
│  - AI 先输出"需要哪些表、怎么关联"          │
│  - 检查已验证关系缓存                      │
│  - 缺失的关系 → AI 推理候选 → 执行验证 SQL  │
│  - 验证通过 → 写入缓存                     │
│  - 【新增】验证失败 → 向用户确认或换方案     │
└─────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────┐
│  阶段3：Schema 上下文组装                  │
│  - 表结构                                  │
│  - 已验证关系（强制可用）                  │
│  - 【新增】历史语义映射（学习所得）          │
│  - 语义字段候选                            │
└─────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────┐
│  阶段4：SQL 生成与校验                     │
│  - AI 生成 SQL                             │
│  - Schema 校验（防幻觉字段）               │
│  - 试执行                                  │
│  - 失败 → 自动修正（现有能力）             │
└─────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────┐
│  阶段5：用户反馈与学习（核心改进）          │
│  - 执行成功 → 记录"用户说法→实际字段"映射   │
│  - 用户手动修正 SQL → diff 提取映射更新     │
│  - 高频映射下次优先注入 Prompt             │
└─────────────────────────────────────────┘
```

---

## 四、详细设计

### 4.1 表关系强制驱动（解决"关系没用起来"）

#### 4.1.1 现状问题

当前 `reportSession.ts` 把表关系以文本形式拼入 System Prompt：

```
【已验证表关系】
- A.PATIENT_ID = B.PATIENT_ID (INNER)
```

AI 只是"看到"了这些关系，但：
- 没有机制强制 AI 必须使用它们
- 当关系缺失时，AI 会自行猜测关联字段（如幻觉出 `DOCTOR_CODE`）
- 选表阶段完全不考虑关系，用户选了 `PAT_OUTP_PATIENT_CLINIC_INFO`，系统不会自动推荐关联的 `PAT_BASIC_INFO`

#### 4.1.2 改进方案：关系推理 → 验证 → 缓存 → 强约束

**步骤1：AI 先输出"关联计划"**

在正式生成 SQL 之前，增加一轮对话让 AI 输出 JSON 格式的关联计划：

```json
{
  "neededTables": ["PAT_OUTP_PATIENT_CLINIC_INFO", "PAT_BASIC_INFO"],
  "joins": [
    {
      "left": "PAT_OUTP_PATIENT_CLINIC_INFO",
      "leftColumn": "PATIENT_ID",
      "right": "PAT_BASIC_INFO",
      "rightColumn": "PATIENT_ID",
      "reason": "两表均含 PATIENT_ID，用于获取患者联系方式"
    }
  ]
}
```

**步骤2：系统检查关系缓存**

对每个 `joins` 项，查询 `table_relationships`：
- 缓存命中且 `isValid=1` → 直接通过
- 缓存未命中 → 进入步骤3

**步骤3：自动验证新关系**

调用现有的 `validateJoin()` 方法，执行验证 SQL：

```sql
SELECT COUNT(*) AS CNT
FROM PAT_OUTP_PATIENT_CLINIC_INFO A
INNER JOIN PAT_BASIC_INFO B ON A.PATIENT_ID = B.PATIENT_ID
WHERE ROWNUM <= 10
```

- 验证通过 → 写入 `table_relationships`，标记 `isValid=1`
- 验证失败 → 尝试 AI 提供的备选关联方案，或向用户确认

**步骤4：把"强制可用关系"注入 Prompt**

改变 Prompt 表述，从"参考"变为"强制约束"：

```text
【强制可用关联】以下表关系已通过数据库验证，生成 JOIN 时必须优先使用：
- PAT_OUTP_PATIENT_CLINIC_INFO.PATIENT_ID = PAT_BASIC_INFO.PATIENT_ID

约束：
1. 若查询涉及上述表，JOIN 条件必须严格使用上述关联字段
2. 若【强制可用关联】中缺少所需表的关系，禁止自行猜测关联字段
3. 必须先向用户确认关系，或请求用户手动选择关联列
```

#### 4.1.3 选表时自动推荐关联表

在 `buildSchemaContextForAI` 中，当用户通过左侧勾选或系统匹配到初始表后，自动扩展关联表：

```typescript
function expandWithRelatedTables(
  selectedTables: string[],
  relationships: TableRelationshipRecord[]
): string[] {
  const expanded = new Set(selectedTables);
  for (const table of selectedTables) {
    for (const rel of relationships.filter(r => r.isValid === 1)) {
      if (rel.leftTable === table) expanded.add(rel.rightTable);
      if (rel.rightTable === table) expanded.add(rel.leftTable);
    }
  }
  return [...expanded];
}
```

这样用户选了一张表，系统会自动把"能连上的表"也加入候选，AI 不会漏掉关键表。

---

### 4.2 语义学习系统（解决"越用越聪明"）

#### 4.2.1 核心思路

把"用户怎么说"和"最终用了哪个字段"的映射关系持久化，按使用频次排序，下次优先推荐给 AI。

#### 4.2.2 数据模型

在 SQLite 新增表：

```sql
CREATE TABLE IF NOT EXISTS semantic_field_learning (
  id TEXT PRIMARY KEY,
  dataSourceId TEXT NOT NULL,
  userPhrase TEXT NOT NULL,        -- 用户原始说法，如"手机号"
  resolvedTable TEXT,              -- 最终采用的表
  resolvedColumn TEXT NOT NULL,    -- 最终采用的列
  hitCount INTEGER DEFAULT 1,      -- 被采纳次数
  lastUsedAt TEXT,                 -- 最近使用时间
  createdAt TEXT NOT NULL,
  UNIQUE(dataSourceId, userPhrase, resolvedTable, resolvedColumn)
);
```

#### 4.2.3 学习触发点

| 场景 | 行为 | 权重 |
|------|------|------|
| AI 生成 SQL，用户直接执行成功 | 提取用户 Query 中的关键词，记录映射 | +1 |
| 用户手动修正 SQL 后执行成功 | diff 分析：哪些字段被替换，记录修正映射 | +3 |
| 同一映射多次被使用 | `hitCount` 累加 | 自然增长 |
| 用户明确反馈"这个不对" | 降低错误映射权重，或标记失效 | -5 / 删除 |

**提取算法示例：**

```typescript
function extractSemanticMappings(
  userMessage: string,
  sql: string,
  schemaTables: SchemaTableSummary[]
): Array<{ phrase: string; table: string; column: string }> {
  // 1. 从 SQL 中提取 SELECT / WHERE / JOIN 中实际使用的字段
  // 2. 从 userMessage 中提取业务关键词（去掉时间、数字、停用词）
  // 3. 将业务关键词与字段做模糊匹配
  // 4. 返回映射列表
}
```

#### 4.2.4 使用机制

在 `buildSchemaContextForAI` 中，组装 Prompt 时追加：

```typescript
function buildLearnedSemanticContext(
  dataSourceId: string,
  userMessage: string
): string {
  // 1. 精确匹配：userPhrase 出现在 userMessage 中
  // 2. 模糊匹配：userPhrase 与 userMessage 中的词有公共子串
  // 3. 按 hitCount 降序，取前 10 条
  // 4. 返回格式：
}
```

注入 Prompt 的文本示例：

```text
【历史学习映射】（基于用户过去的使用习惯）
- 用户说"手机号" → 实际使用 PAT_BASIC_INFO.PHONE（被采纳 15 次）
- 用户说"联系电话" → 实际使用 PAT_BASIC_INFO.PHONE（被采纳 8 次）
- 用户说"患者姓名" → 实际使用 PAT_OUTP_PATIENT_CLINIC_INFO.PATIENT_NAME（被采纳 12 次）

规则：优先使用【历史学习映射】中的字段，除非该字段在当前表中不存在。
```

#### 4.2.5 与硬编码规则的优先级

```
用户输入
   │
   ▼
┌────────────────────────────┐
│ 1. 历史学习映射（最高优先）  │  ← 用户自己"教"过 AI 的
│    hitCount >= 3 的映射     │
├────────────────────────────┤
│ 2. 系统语义规则              │  ← 硬编码的 SEMANTIC_FIELD_ALIASES
│    （手机号/电话→PHONE...）  │
├────────────────────────────┤
│ 3. Schema 直接匹配           │  ← 列名/注释包含关键词
│    （如列注释里有"电话"）     │
├────────────────────────────┤
│ 4. 向用户确认                │  ← 以上都匹配不到时
└────────────────────────────┘
```

---

### 4.3 输出顺序规范（解决"顺序乱"）

在 System Prompt 中增加明确的排序规则：

```text
【输出顺序规则】
1. 若用户明确要求排序（如"按时间倒序""按收入降序"），严格按用户要求
2. 若用户未指定，按以下默认规则：
   - 时间范围查询 → 按时间字段降序（最新在前）
   - 汇总/统计查询 → 按数值结果降序
   - TOP/N 查询 → 按被取 TOP 的指标降序
   - 明细查询 → 按主键或业务 ID 升序
3. 禁止无 ORDER BY 的查询（除非用户明确说"随便"）
4. 多字段排序时，把最重要字段放前面
```

---

## 五、Prompt 改造要点

综合以上改进，System Prompt 的结构应调整为：

```text
你是 HIS 数据报表助手...

【强制约束】
1. 只生成 SELECT...
2. 必须限制行数...
3. 表名、列名必须来自 Schema...
4. 【新增】多表 JOIN 时必须使用【强制可用关联】中的关系...
5. 【新增】优先使用【历史学习映射】中的字段...

【输出顺序规则】...

数据库类型: oracle

【Schema 上下文】...
【强制可用关联】...
【历史学习映射】...
【语义字段候选】...
```

---

## 六、实施优先级

| 阶段 | 内容 | 预估改动范围 | 价值 |
|------|------|-------------|------|
| 阶段1 | 新增 `semantic_field_learning` 表 + 记录逻辑 | DB + reportSession 执行成功回调 | 高，启动数据积累 |
| 阶段2 | `buildSchemaContextForAI` 注入历史映射 | schemaContext.ts + Prompt | 高，立即见效 |
| 阶段3 | 选表时自动推荐关联表 | schemaContext.ts | 中，提升便利性 |
| 阶段4 | Prompt 增加排序规则 | reportSession.ts 常量 | 低，快速解决 |
| 阶段5 | 关系推理 → 验证 → 强约束流程 | reportSession.ts 核心流程改造 | 高，根治乱 JOIN |
| 阶段6 | 用户手动修正 SQL 后的 diff 学习 | UI + reportSession + DB | 中，加速学习 |

**建议启动顺序：阶段1 → 阶段2 → 阶段4 → 阶段3 → 阶段5 → 阶段6**

这样可以在最短时间内让 AI"开始学"，同时逐步解决关系约束问题。

---

## 七、风险与应对

| 风险 | 应对 |
|------|------|
| 学习数据积累慢 | 阶段1先上线记录逻辑，哪怕没有消费端，数据也会自然积累 |
| 历史映射过时（表结构变了） | 每次注入前校验 `resolvedColumn` 是否仍在 Schema 中，不存在则降级 |
| AI 忽视 Prompt 约束 | 阶段5配合 Function Calling / JSON 模式，用结构化输出强制约束 |
| 用户隐私敏感 | `userPhrase` 只存业务关键词，不存完整句子；可配置关闭学习 |

---

## 八、与现有能力的衔接

| 现有能力 | 衔接方式 |
|---------|---------|
| 表热度评分 (`table_heat`) | 语义学习与之独立，但选表时两者共同作用：热度决定"选哪些表"，学习映射决定"用哪些字段" |
| 表关系缓存 (`table_relationships`) | 直接复用，阶段5让 AI 必须优先使用 `isValid=1` 的关系 |
| Schema 缓存 (`schemaCacheFiles`) | 语义注入前校验字段是否存在，防止表结构变更后推荐失效字段 |
| SQL 校验 (`validateSqlAgainstSchema`) | 现有能力，继续作为最后一道防线 |
| 报表历史 (`report_history`) | 可从历史记录中批量导入学习数据（冷启动） |

---

## 九、验收标准

1. 用户说"查手机号"，AI 第一次可能猜错；用户修正为 `PAT_BASIC_INFO.PHONE` 后，第二次说"手机号"AI 直接命中正确字段。
2. 多表查询时，AI 不再编造关联字段，未验证的关系会主动请求确认。
3. 用户未指定排序时，时间查询默认按时间倒序，汇总查询默认按数值降序。
4. 选表界面勾选一张表后，系统自动推荐与之有关联的表（带"关联"标签）。
