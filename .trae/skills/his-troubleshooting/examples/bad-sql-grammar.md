# 案例：BadSqlGrammarException SQL语法错误

## 问题描述
达梦数据库迁移后，患者查询功能报错

## Trace ID
`c3d4e5f6g7h8i9j0k1l2`

## 排查过程

### 1. 查询 HTTP 日志
```
query_log(traceId: "c3d4e5f6g7h8i9j0k1l2")
```
结果：
- 服务：patient-service
- 错误：BadSqlGrammarException: Error preparing statement
- 请求：/api/patient/search

### 2. 查询 SQL 日志
```
query_sql_log(traceId: "c3d4e5f6g7h8i9j0k1l2", sqlId: "PatientMapper.search")
```
结果：
```sql
SELECT * FROM PATIENT_INFO 
WHERE CREATE_DATE >= TO_DATE(?,'YYYY-MM-DD HH24:MI:SS')
AND NAME LIKE '%' || ? || '%'
```
参数：['2024-01-01 00:00:00', '张三']

### 3. 查看普通日志
```
query_normal_log(traceId: "c3d4e5f6g7h8i9j0k1l2")
```
结果：
```
Caused by: dm.jdbc.driver.DMException: 第 1 行, 第 45 列[HH24]附近出现错误: 
语法分析出错
```

## 根因分析
1. 原 Oracle SQL 使用了 `TO_DATE` 函数和 `HH24` 格式
2. 达梦数据库不支持 Oracle 特有的日期格式 `HH24:MI:SS`
3. 字符串拼接 `||` 在达梦中支持，但日期函数不兼容

## 修复方案

### 方案1：使用标准 SQL 函数（推荐）
```sql
-- Oracle 版本
SELECT * FROM PATIENT_INFO 
WHERE CREATE_DATE >= TO_DATE(?,'YYYY-MM-DD HH24:MI:SS')
AND NAME LIKE '%' || ? || '%'

-- 达梦版本
SELECT * FROM PATIENT_INFO 
WHERE CREATE_DATE >= CAST(? AS DATETIME)
AND NAME LIKE CONCAT(CONCAT('%', ?), '%')
```

### 方案2：MyBatis 动态 SQL 适配
```xml
<!-- 原 Mapper -->
<select id="search" resultType="Patient">
    SELECT * FROM PATIENT_INFO 
    WHERE CREATE_DATE >= TO_DATE(#{startDate},'YYYY-MM-DD HH24:MI:SS')
    AND NAME LIKE '%' || #{name} || '%'
</select>

<!-- 适配后 Mapper -->
<select id="search" resultType="Patient">
    SELECT * FROM PATIENT_INFO 
    <choose>
        <when test="_databaseId == 'oracle'">
            WHERE CREATE_DATE >= TO_DATE(#{startDate},'YYYY-MM-DD HH24:MI:SS')
            AND NAME LIKE '%' || #{name} || '%'
        </when>
        <otherwise>
            WHERE CREATE_DATE >= CAST(#{startDate} AS DATETIME)
            AND NAME LIKE CONCAT(CONCAT('%', #{name}), '%')
        </otherwise>
    </choose>
</select>
```

### 方案3：使用 MyBatis-Plus 条件构造器
```java
public List<Patient> search(String startDate, String name) {
    LambdaQueryWrapper<Patient> wrapper = new LambdaQueryWrapper<>();
    wrapper.ge(Patient::getCreateDate, LocalDateTime.parse(startDate, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
    wrapper.like(Patient::getName, name);
    return patientMapper.selectList(wrapper);
}
```

## 结论
**一句话结论**：达梦数据库不支持 Oracle 的 TO_DATE 函数和 HH24 日期格式，需修改为达梦兼容语法。

**关键证据**：
1. HTTP 日志显示 patient-service 报错 BadSqlGrammarException
2. SQL 日志显示使用了 Oracle 特有的 TO_DATE 函数
3. 普通日志显示达梦解析器在 HH24 附近报错

**修复建议**：
1. 修改 SQL 使用 CAST 代替 TO_DATE
2. 使用 CONCAT 代替 || 进行字符串拼接
3. 考虑使用 MyBatis 多数据库适配或条件构造器
