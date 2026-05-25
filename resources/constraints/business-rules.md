# ZOEHIS 业务规则

> 标注"来源"的内容均为从实际文档/代码中提取的客观事实。

---

## 一、业务模块清单（来源：实际目录结构）

### 1.1 药库管理模块

来源：`onelink-web-his-drug-fj-common/pages/`

| 模块目录 | 推测功能 |
|---------|---------|
| `hospatientDispensManage` | 住院摆药管理 |
| `outpatientDispensManage` | 门诊摆药管理 |
| `dispensingCheckManage` | 摆药审核管理 |
| `dispensingQuery` | 摆药查询 |
| `dispensConditionSetting` | 摆药条件设置 |
| `drugDictionaryManage` | 药品字典管理 |
| `stockInOutManage` | 出入库管理 |
| `inventoryManage` | 库存盘点管理 |
| `purchaseManage` | 采购管理 |
| `stockBillManage` | 库存单据管理 |
| `infusionManage` | 输液管理 |
| `medicalTechnicalDispens` | 医技摆药 |
| `drugTool` | 药品工具 |
| `departWorkManage` | 科室工作管理 |

### 1.2 收费管理模块

来源：`onelink-web-his-charge-fj-common/pages/`

| 模块目录 | 推测功能 |
|---------|---------|
| `charge/billingFeeManage` | 费用管理 |
| `charge/billingFeeManage_version2` | 费用管理V2 |
| `charge/cashRegisterManage` | 收银台管理 |
| `charge/chargePrintManage` | 收费打印管理 |
| `charge/checkOutManage` | 结算管理 |
| `charge/costSettlementManage` | 费用结算管理 |
| `charge/prePayManage` | 预交金管理 |
| `charge/refundManage` | 退费管理 |
| `charge/refundManage_version2` | 退费管理V2 |
| `charge/unifiedPaymentManage` | 统一支付管理 |
| `charge/guaranteeManage` | 担保管理 |
| `charge/eBill` | 电子票据 |
| `charge/newborn` | 新生儿 |
| `charge/vip` | VIP |
| `charge/sms` | 短信 |
| `charge/insurMobilePay` | 医保移动支付 |
| `insurance` | 医保管理 |
| `patient` | 患者信息管理 |
| `reconciliation` | 对账 |
| `dataHandle` | 数据处理/迁移 |

### 1.3 处方模块

来源：`onelink-micro-pres-fj-common` Java包结构

| 包路径 | 推测功能 |
|--------|---------|
| `prescribe.web.prescribe` | 处方管理 |
| `prescribe.web.treatment` | 治疗管理 |
| `prescribe.web.patient` | 患者管理 |
| `prescribe.web.operation` | 手术管理 |
| `prescribe.web.check` | 检查管理 |
| `prescribe.web.inspe` | 检验管理 |
| `prescribe.web.checkout` | 结算管理 |
| `prescribe.web.insurance` | 医保管理 |
| `prescribe.web.gcp` | GCP管理 |
| `printer` | 打印管理 |
| `workflow` | 工作流 |
| `websocket` | WebSocket |
| `thirdParty` | 第三方对接 |

---

## 二、门诊业务流程（来源：门诊住院业务流程-后台表结构.docx）

### 2.1 注册办卡

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 新增就诊卡 | `COM_CARD_BASIC_INFO` | 新增 |
| 记录押金 | `COM_CARD_DEPOSIT_RECORD` | 新增 |
| 记录维护 | `COM_CARD_MAINTAIN_RECORD` | 新增 |
| 新增病人信息 | `PAT_BASIC_INFO` | 新增 |
| 扩展病人信息 | `PAT_BASIC_INFO_EXTEND` | 新增 |

### 2.2 预交金

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 预交金充值 | `CHA_OUTP_PREPAY_RECORD` | 新增 |
| 账户管理 | `CHA_OUTP_PREPAY_ACCT_MAST` | 新增/更新 |
| 账户明细 | `CHA_OUTP_PREPAY_ACCT_DETL` | 新增/更新 |
| 消费流水 | `CHA_OUTP_CONSUME_MASTER` | 新增 |
| 消费明细 | `CHA_OUTP_CONSUME_DETAIL` | 新增 |

### 2.3 预约挂号

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 预约 | `APT_OUTP_APPT_RECORD` | 新增 |
| 查询排班 | `APT_DOCTOR_SCHEDULE_MASTER` | 查询 |
| 查询排班明细 | `APT_DOCTOR_SCHEDULE_DETAIL` | 查询 |

### 2.4 门诊诊病（病历、处方）

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 挂号（产生诊病记录） | `PAT_OUTP_PATIENT_CLINIC_INFO` | 新增 |
| 退号 | `PAT_OUTP_PATIENT_CLINIC_INFO` | 更新（状态改为作废） |
| 保存诊断 | `PAT_OUTP_PATIENT_DIAGNOSIS` | 新增 |
| 保存处方主表 | `PRES_OUTP_PRES_MASTER` | 新增/更新 |
| 保存处方细表 | `PRES_OUTP_PRES_DETAIL` | 新增/更新 |
| 保存中药处方附加 | （中药处方附加表） | 新增/更新 |
| 保存电子申请主表 | `PRES_OUTP_ELEC_APPLY_MASTER` | 新增 |
| 保存电子申请细表 | `PRES_OUTP_ELEC_APPLY_DETAIL` | 新增 |

**处方发送：**

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 产生摆药池数据 | `APP_OUTP_LAY_DRUG_POOL` | 新增 |
| 产生单据池主表 | `APP_OUTP_APPLY_SHEET_POOL` | 新增 |
| 产生单据池细表 | `APP_OUTP_APPLY_SHEET_DETAIL_PL` | 新增 |
| 更新处方状态 | `PRES_OUTP_PRES_MASTER` | 更新（状态→已发送） |

**取消发送处方：**

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 删除摆药池 | `APP_OUTP_LAY_DRUG_POOL` | 删除 |
| 删除单据池 | `APP_OUTP_APPLY_SHEET_POOL` / `DETAIL_PL` | 删除 |
| 更新处方状态 | `PRES_OUTP_PRES_MASTER` | 更新（状态→新开） |

### 2.5 取药、扣费执行

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 摆药条件设置 | 门诊摆药条件设置 | 配置 |
| 摆药柜台配置 | 门诊摆药柜台配置 | 配置 |
| 删除摆药池 | `APP_OUTP_LAY_DRUG_POOL` | 删除 |
| 新增摆药记录 | `APP_OUTP_LAY_DRUG_RECORDS` | 新增 |
| 更新药品库存 | 药品库存表 | 更新 |
| 新增药品账页 | 药品账页表 | 新增 |
| 更新预交金账户 | `CHA_OUTP_PREPAY_ACCT_MAST` / `DETL` | 新增/更新 |
| 新增消费流水 | `CHA_OUTP_CONSUME_MASTER` / `DETAIL` | 新增 |

### 2.6 扣费执行（单据）

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 删除单据池 | `APP_OUTP_APPLY_SHEET_POOL` / `DETAIL_PL` | 删除 |
| 新增单据主表 | `APP_OUTP_APPLY_SHEET` | 新增 |
| 新增单据细表 | `APP_OUTP_APPLY_SHEET_DETAIL` | 新增 |
| 更新预交金账户 | `CHA_OUTP_PREPAY_ACCT_MAST` / `DETL` | 新增/更新 |
| 新增费用明细 | `CHA_OUTP_CHARGE_DETAIL` | 插入 |
| 新增消费流水 | `CHA_OUTP_CONSUME_MASTER` / `DETAIL` | 新增 |

### 2.7 退药退费

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 退药主表 | `APP_RETURN_DRUG_MASTER` | 新增/更新 |
| 退药细表 | `APP_RETURN_DRUG_DETAIL` | 新增/更新 |
| 退费主表 | `APP_RETURN_MASTER` | 新增/更新 |
| 退费细表 | `APP_RETURN_DETAIL` | 新增/更新 |
| 更新预交金账户 | `CHA_OUTP_PREPAY_ACCT_MAST` / `DETL` | 新增/更新 |
| 更新费用明细 | `CHA_OUTP_CHARGE_DETAIL` | 更新/插入 |
| 新增消费流水 | `CHA_OUTP_CONSUME_MASTER` / `DETAIL` | 新增 |

### 2.8 门诊结算

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 结算主表 | `CHA_OUTP_SETTLE_MASTER` | 新增 |
| 结算细表 | `CHA_OUTP_SETTLE_DETAIL` | 新增 |
| 医保结算主表 | `INS_OUTP_SETTLE_MASTER` | 新增 |
| 医保结算细表 | `INS_OUTP_SETTLE_DETAIL` | 新增 |
| 预交金记录 | `CHA_OUTP_PREPAY_RECORD` | 新增/更新 |
| 更新预交金账户 | `CHA_OUTP_PREPAY_ACCT_MAST` / `DETL` | 更新/新增 |

### 2.9 门诊结账

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 收款员操作 | `CHA_OPERATOR_ACCOUNT_OPERATE` | 新增 |
| 结账主表 | `CHA_OUTP_ACCOUNT_MASTER` | 新增 |
| 预交金支付明细 | `CHA_OUTP_ACCOUNT_PREPAY_DETL` | 新增 |
| 发票费用明细 | `CHA_OUTP_ACCOUNT_INVOICE_DETL` | 新增 |

---

## 三、住院业务流程（来源：门诊住院业务流程-后台表结构.docx）

### 3.1 住院登记

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 入院记录 | `PAT_ADMISSION_RECORD` | 新增 |
| 入出转记录 | `PAT_TRANSFER_RECORD` | 新增 |

### 3.2 住院预交金

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 预交金充值 | `CHA_INP_PREPAY_RECORD` | 新增 |
| 账户管理 | `CHA_INP_PREPAY_ACCT` | 新增/更新 |

### 3.3 入科

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 新增在院信息 | `PAT_IN_HOSPITAL` | 新增 |
| 更新入院记录 | `PAT_ADMISSION_RECORD` | 更新 |
| 更新入出转记录 | `PAT_TRANSFER_RECORD` | 更新 |
| 新增床位使用记录 | `PAT_BED_USE_RECORD` | 新增 |

### 3.4 取消入科

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 删除在院信息 | `PAT_IN_HOSPITAL` | 删除 |
| 更新入院记录 | `PAT_ADMISSION_RECORD` | 更新 |
| 更新入出转记录 | `PAT_TRANSFER_RECORD` | 更新 |
| 更新床位使用记录 | `PAT_BED_USE_RECORD` | 更新 |

### 3.5 转科 / 取消转科 / 护理迁出

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 更新在院信息 | `PAT_IN_HOSPITAL` | 更新 |
| 更新入院记录 | `PAT_ADMISSION_RECORD` | 更新 |
| 新增/更新入出转记录 | `PAT_TRANSFER_RECORD` | 新增/更新 |

### 3.6 住院医嘱（病历、医嘱）

**保存医嘱：**

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 新增医嘱 | `PRES_INP_PRES_RECORD` | 新增 |

**发送医嘱：**

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 更新医嘱状态 | `PRES_INP_PRES_RECORD` | 更新（状态→已发送） |
| 更新检查申请单 | `PRES_INP_CHECK_ELEC_RECORD` | 更新 |
| 更新检验申请单 | `PRES_INP_INSPE_ELEC_RECORD` | 更新 |

**校对医嘱：**

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 更新医嘱状态 | `PRES_INP_PRES_RECORD` | 更新（状态→已校对） |
| 产生申请记录池 | `PRES_APPLY_RECORDS_POOL` | 新增（后面申请时使用） |
| 临时医嘱自动申请 | （同医嘱申请流程） | |

**医嘱申请：**

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 产生摆药池 | `APP_INP_LAY_DRUG_POOL` | 新增 |
| 产生单据池主表 | `APP_INP_APPLY_SHEET_POOL` | 新增 |
| 产生单据池细表 | `APP_INP_APPLY_SHEET_DETAIL_PL` | 新增 |
| 临时医嘱更新状态 | `PRES_INP_PRES_RECORD` | 更新（状态→在执行） |

**重整医嘱：**

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 更新医嘱 | `PRES_INP_PRES_RECORD` | 更新 |
| 新增重整记录 | `PRES_INP_PRES_RECORD_RESET` | 新增 |

**作废医嘱：**

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 更新医嘱状态 | `PRES_INP_PRES_RECORD` | 更新 |

**停嘱医嘱：**

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 医生停嘱 | `PRES_INP_PRES_RECORD` | 更新（停嘱医生、停嘱时间、状态） |
| 插入停嘱记录 | `PRES_INP_PRES_RECORD_STOP` | 新增 |
| 护士审核 | `PRES_INP_PRES_RECORD` | 更新（停嘱操作人、操作时间） |
| 删除停嘱记录 | `PRES_INP_PRES_RECORD_STOP` | 删除 |

### 3.7 住院取药、扣费执行

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 删除摆药池 | `APP_INP_LAY_DRUG_POOL` | 删除 |
| 新增摆药记录 | `APP_INP_LAY_DRUG_RECORDS` | 新增 |
| 更新预交金账户 | `CHA_INP_PREPAY_ACCT` | 更新 |
| 新增费用明细 | `CHA_INP_CHARGE_DETAIL` | 新增 |

### 3.8 住院单据执行

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 删除单据池 | `APP_INP_APPLY_SHEET_POOL` / `DETAIL_PL` | 删除 |
| 新增单据主表 | `APP_INP_APPLY_SHEET` | 新增 |
| 新增单据细表 | `APP_INP_APPLY_SHEET_DETAIL` | 新增 |
| 更新预交金账户 | `CHA_INP_PREPAY_ACCT` | 更新 |
| 新增费用明细 | `CHA_INP_CHARGE_DETAIL` | 新增 |

### 3.9 住院退药退费

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 退药主表 | `APP_RETURN_DRUG_MASTER` | 新增/更新 |
| 退药细表 | `APP_RETURN_DRUG_DETAIL` | 新增/更新 |
| 退费主表 | `APP_RETURN_MASTER` | 新增/更新 |
| 退费细表 | `APP_RETURN_DETAIL` | 新增/更新 |
| 更新费用明细 | `CHA_INP_CHARGE_DETAIL` | 新增/更新 |
| 更新预交金账户 | `CHA_INP_PREPAY_ACCT` | 更新 |

### 3.10 出院

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 删除在院信息（病历归档时） | `PAT_IN_HOSPITAL` | 删除 |
| 更新入院记录 | `PAT_ADMISSION_RECORD` | 更新 |
| 新增/更新入出转记录 | `PAT_TRANSFER_RECORD` | 新增/更新 |
| 更新床位使用记录 | `PAT_BED_USE_RECORD` | 更新 |

### 3.11 住院结算

| 操作 | 涉及表 | 操作类型 |
|------|--------|---------|
| 结算主表 | `CHA_INP_SETTLE_MASTER` | 新增 |
| 结算细表 | `CHA_INP_SETTLE_DETAIL` | 新增 |
| 医保结算主表 | `INS_INP_SETTLE_MASTER` | 新增 |
| 医保结算细表 | `INS_INP_SETTLE_DETAIL` | 新增 |
| 更新费用明细 | `CHA_INP_CHARGE_DETAIL` | 新增/更新 |
| 更新预交金账户 | `CHA_INP_PREPAY_ACCT` | 更新 |

---

## 四、数据库表命名规范（来源：门诊住院业务流程-后台表结构.docx）

### 4.1 表名前缀规律

| 前缀 | 含义 | 示例 |
|------|------|------|
| `COM_` | 公共/通用 | `COM_CARD_BASIC_INFO`, `COM_REGISTER_CONFIG` |
| `PAT_` | 患者 | `PAT_BASIC_INFO`, `PAT_IN_HOSPITAL`, `PAT_ADMISSION_RECORD` |
| `CHA_` | 收费/账务 | `CHA_OUTP_PREPAY_RECORD`, `CHA_INP_CHARGE_DETAIL` |
| `PRES_` | 处方/医嘱 | `PRES_OUTP_PRES_MASTER`, `PRES_INP_PRES_RECORD` |
| `APP_` | 申请/执行 | `APP_OUTP_LAY_DRUG_POOL`, `APP_RETURN_DRUG_MASTER` |
| `APT_` | 预约 | `APT_OUTP_APPT_RECORD`, `APT_DOCTOR_SCHEDULE_MASTER` |
| `INS_` | 医保 | `INS_OUTP_SETTLE_MASTER`, `INS_INP_SETTLE_DETAIL` |
| `DIC_` | 字典 | `DIC_PAY_MODE_DICT`, `DIC_DRUG_DICT`, `DIC_BED_DICT` |

### 4.2 门诊/住院区分规律

| 后缀 | 含义 | 示例 |
|------|------|------|
| `_OUTP_` | 门诊 | `CHA_OUTP_PREPAY_RECORD`, `PRES_OUTP_PRES_MASTER` |
| `_INP_` | 住院 | `CHA_INP_PREPAY_ACCT`, `PRES_INP_PRES_RECORD` |

### 4.3 主细表规律

| 后缀 | 含义 | 示例 |
|------|------|------|
| `_MASTER` | 主表 | `PRES_OUTP_PRES_MASTER`, `CHA_OUTP_SETTLE_MASTER` |
| `_DETAIL` | 细表 | `PRES_OUTP_PRES_DETAIL`, `CHA_OUTP_SETTLE_DETAIL` |
| `_POOL` | 池表（待处理） | `APP_OUTP_LAY_DRUG_POOL`, `APP_INP_APPLY_SHEET_POOL` |
| `_RECORD` | 记录表 | `APP_OUTP_LAY_DRUG_RECORDS`, `CHA_OUTP_PREPAY_RECORD` |
| `_TEMPLATE_MASTER` | 模板主表 | `PRES_OUTP_TEMPLATE_MASTER`, `ZOEPRES.PRES_INP_TEMPLATE_MASTER` |
| `_TEMPLATE_DETAIL` | 模板细表 | `PRES_OUTP_TEMPLATE_DETAIL`, `ZOEPRES.PRES_INP_TEMPLATE_DETAIL` |

---

## 五、完整数据库表清单（来源：门诊住院业务流程-后台表结构.docx）

### 5.1 公共/患者表

| 表名 | 用途 |
|------|------|
| `COM_CARD_BASIC_INFO` | 就诊卡基本信息 |
| `COM_CARD_DEPOSIT_RECORD` | 就诊卡押金记录 |
| `COM_CARD_MAINTAIN_RECORD` | 就诊卡维护记录 |
| `PAT_BASIC_INFO` | 病人基本信息 |
| `PAT_BASIC_INFO_EXTEND` | 病人基本信息扩展 |
| `PAT_OUTP_PATIENT_CLINIC_INFO` | 门诊病人诊病信息 |
| `PAT_OUTP_PATIENT_DIAGNOSIS` | 门诊病人诊断 |
| `PAT_ADMISSION_RECORD` | 病人入院记录 |
| `PAT_TRANSFER_RECORD` | 病人入出转记录 |
| `PAT_IN_HOSPITAL` | 病人在院信息 |
| `PAT_BED_USE_RECORD` | 床位使用记录 |

### 5.2 预约挂号表

| 表名 | 用途 |
|------|------|
| `APT_OUTP_APPT_RECORD` | 门诊预约记录 |
| `APT_DOCTOR_SCHEDULE_MASTER` | 门诊医生排班主表 |
| `APT_DOCTOR_SCHEDULE_DETAIL` | 门诊医生排班细表 |

### 5.3 处方/医嘱表

| 表名 | 用途 |
|------|------|
| `PRES_OUTP_PRES_MASTER` | 门诊处方主表 |
| `PRES_OUTP_PRES_DETAIL` | 门诊处方细表 |
| `PRES_OUTP_TEMPLATE_MASTER` | 门诊处方模板主表 |
| `PRES_OUTP_TEMPLATE_DETAIL` | 门诊处方模板细表 |
| `PRES_OUTP_ELEC_APPLY_MASTER` | 门诊电子申请主表 |
| `PRES_OUTP_ELEC_APPLY_DETAIL` | 门诊电子申请细表 |
| `PRES_INP_PRES_RECORD` | 住院医嘱记录表 |
| `PRES_INP_PRES_RECORD_RESET` | 住院医嘱重整记录 |
| `PRES_INP_PRES_RECORD_STOP` | 医嘱停嘱记录表 |
| `PRES_INP_CHECK_ELEC_RECORD` | 住院检查电子申请单记录 |
| `PRES_INP_INSPE_ELEC_RECORD` | 住院检验电子申请单记录 |
| `PRES_APPLY_RECORDS_POOL` | 医嘱申请记录池 |
| `PRES_APPLY_RECORDS` | 医嘱申请记录表（定时归档） |
| `PRES_DRUG_ADDITION_DETAIL` | 住院医嘱药品附加费明细 |
| `ZOEPRES.PRES_INP_TEMPLATE_MASTER` | 住院医嘱模板主表 |
| `ZOEPRES.PRES_INP_TEMPLATE_DETAIL` | 住院医嘱模板细表 |

### 5.4 摆药/单据表

| 表名 | 用途 |
|------|------|
| `APP_OUTP_LAY_DRUG_POOL` | 门诊摆药池 |
| `APP_OUTP_LAY_DRUG_RECORDS` | 门诊摆药记录 |
| `APP_OUTP_APPLY_SHEET_POOL` | 门诊单据池主表 |
| `APP_OUTP_APPLY_SHEET_DETAIL_PL` | 门诊单据池细表 |
| `APP_OUTP_APPLY_SHEET` | 门诊单据主表 |
| `APP_OUTP_APPLY_SHEET_DETAIL` | 门诊单据细表 |
| `APP_INP_LAY_DRUG_POOL` | 住院摆药池 |
| `APP_INP_LAY_DRUG_RECORDS` | 住院摆药记录 |
| `APP_INP_APPLY_SHEET_POOL` | 住院单据池主表 |
| `APP_INP_APPLY_SHEET_DETAIL_PL` | 住院单据池细表 |
| `APP_INP_APPLY_SHEET` | 住院单据主表 |
| `APP_INP_APPLY_SHEET_DETAIL` | 住院单据细表 |
| `APP_RETURN_DRUG_MASTER` | 退药主表 |
| `APP_RETURN_DRUG_DETAIL` | 退药细表 |
| `APP_RETURN_MASTER` | 退费主表 |
| `APP_RETURN_DETAIL` | 退费细表 |
| `APP_TEMPLATE_MASTER` | 单据模板主表 |
| `APP_TEMPLATE_DETAIL` | 单据模板细表 |

### 5.5 收费/结算表

| 表名 | 用途 |
|------|------|
| `CHA_OUTP_PREPAY_RECORD` | 门诊预交金记录 |
| `CHA_OUTP_PREPAY_ACCT_MAST` | 门诊预交金账户主表 |
| `CHA_OUTP_PREPAY_ACCT_DETL` | 门诊预交金账户细表 |
| `CHA_OUTP_CONSUME_MASTER` | 门诊消费流水主表 |
| `CHA_OUTP_CONSUME_DETAIL` | 门诊消费流水细表 |
| `CHA_OUTP_CHARGE_DETAIL` | 门诊费用明细 |
| `CHA_OUTP_SETTLE_MASTER` | 门诊结算主表 |
| `CHA_OUTP_SETTLE_DETAIL` | 门诊结算细表 |
| `CHA_OUTP_ACCOUNT_MASTER` | 门诊结账主表 |
| `CHA_OUTP_ACCOUNT_PREPAY_DETL` | 门诊结账预交金支付明细 |
| `CHA_OUTP_ACCOUNT_INVOICE_DETL` | 门诊结账发票费用明细 |
| `CHA_OPERATOR_ACCOUNT_OPERATE` | 收款员结账操作表 |
| `CHA_INP_PREPAY_RECORD` | 住院预交金记录 |
| `CHA_INP_PREPAY_ACCT` | 住院预交金账户表 |
| `CHA_INP_CHARGE_DETAIL` | 住院费用明细 |
| `CHA_INP_SETTLE_MASTER` | 住院结算主表 |
| `CHA_INP_SETTLE_DETAIL` | 住院结算细表 |

### 5.6 医保表

| 表名 | 用途 |
|------|------|
| `INS_OUTP_SETTLE_MASTER` | 门诊医保结算主表 |
| `INS_OUTP_SETTLE_DETAIL` | 门诊医保结算细表 |
| `INS_INP_SETTLE_MASTER` | 住院医保结算主表 |
| `INS_INP_SETTLE_DETAIL` | 住院医保结算细表 |

### 5.7 字典表

| 表名 | 用途 |
|------|------|
| `DIC_PAY_MODE_DICT` | 支付方式字典 |
| `DIC_REGISTER_CLASS_DICT` | 挂号类别字典 |
| `DIC_DRUG_DICT` | 药品字典 |
| `DIC_CLINIC_ITEM_DICT` | 临床诊疗项目字典 |
| `DIC_PRICE_ITEM_DICT` | 价表项目字典 |
| `DIC_ITEM_CLASS_DICT` | 项目科目字典 |
| `DIC_BILL_TYPE_DICT` | 单据类型字典 |
| `DIC_BED_DICT` | 床位字典 |
| `DIC_BASIC_DICT` | 基础字典 |
| `DIC_RATE_TYPE_DICT` | 费别字典 |
| `DIC_OUTP_COMMON_ITEM_CONFIG` | 门诊处置常用配置项 |
| `COM_REGISTER_CONFIG` | 挂号类别分发表 |
| `COM_CLINIC_PRICELIST_DICT` | 诊疗与收费项目对照表 |
| `COM_INSUR_PRICE_ITEM_DICT` | 医保价项字典 |
| `COM_RATE_SPECIAL_CHARGE_DIST` | 费别特殊收费项目分发 |
| `COM_INSUR_INVOICE_DICT` | 医保发票字典 |

---

## 六、待投喂

以下内容仍需后续补充：

- [ ] 各表的详细字段定义（字段名、类型、约束）
- [ ] 处方/医嘱的状态值定义（新开、已发送、已校对、在执行等）
- [ ] 数据校验规则（金额校验、库存校验等）
- [ ] 事务管理规范（哪些操作需要事务）
- [ ] 数据权限控制规则
- [ ] 操作日志规范
- [ ] 票据相关表结构
- [ ] 打印业务规则
