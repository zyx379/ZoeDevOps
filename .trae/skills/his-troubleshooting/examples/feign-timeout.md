# 案例：Feign 调用下游服务超时

## 问题描述
收费保存接口响应慢，经常超时，用户体验差

## Trace ID
`b2c3d4e5f6g7h8i9j0k1`

## 排查过程

### 1. 查询 HTTP 日志
```
query_log(traceId: "b2c3d4e5f6g7h8i9j0k1")
```
结果：
- 服务：charge-service
- 响应时间：15000ms（超时）
- 状态码：200（但业务超时）

### 2. 查询 RPC 日志
```
query_rpc_log(traceId: "b2c3d4e5f6g7h8i9j0k1")
```
结果：
- 调用链：charge-service -> inventory-service
- 方法：InventoryClient.checkStock
- 耗时：12000ms
- 状态：成功但慢

### 3. 查询下游服务 SQL 日志
```
query_sql_log(traceId: "b2c3d4e5f6g7h8i9j0k1", sqlId: "InventoryMapper.checkStock")
```
结果：
```sql
SELECT * FROM INVENTORY 
WHERE DRUG_CODE IN (SELECT DRUG_CODE FROM CHARGE_ITEM WHERE CHARGE_ID = ?)
```
耗时：11500ms

### 4. 数据验证
```
query_business_data(
  sql: "SELECT COUNT(*) as cnt FROM CHARGE_ITEM WHERE CHARGE_ID = 'C20240001'",
  description: "查询收费单药品数量"
)
```
结果：cnt = 1500（该收费单包含1500个药品）

```
query_business_data(
  sql: "EXPLAIN PLAN FOR SELECT * FROM INVENTORY WHERE DRUG_CODE IN (SELECT DRUG_CODE FROM CHARGE_ITEM WHERE CHARGE_ID = 'C20240001')",
  description: "查看执行计划"
)
```
结果：全表扫描 INVENTORY 表，未使用索引

## 根因分析
1. 收费单包含 1500 个药品，IN 子查询导致大量数据扫描
2. INVENTORY 表未对 DRUG_CODE 建立索引
3. 单次 Feign 调用耗时 12 秒，超过超时阈值

## 修复方案

### 方案1：添加索引（立即生效）
```sql
CREATE INDEX idx_inventory_drug_code ON INVENTORY(DRUG_CODE);
```

### 方案2：优化查询逻辑（推荐）
```java
// 原代码：一次性查询所有库存
@FeignClient("inventory-service")
public interface InventoryClient {
    @PostMapping("/checkStock")
    List<StockResult> checkStock(List<String> drugCodes);
}

// 优化后：分批查询
public List<StockResult> checkStockBatch(List<String> drugCodes) {
    List<StockResult> results = new ArrayList<>();
    int batchSize = 100;
    for (int i = 0; i < drugCodes.size(); i += batchSize) {
        List<String> batch = drugCodes.subList(i, Math.min(i + batchSize, drugCodes.size()));
        results.addAll(inventoryClient.checkStock(batch));
    }
    return results;
}
```

### 方案3：调整 Feign 超时配置
```yaml
feign:
  client:
    config:
      inventory-service:
        connectTimeout: 5000
        readTimeout: 30000  # 从 10s 调整为 30s
```

### 方案4：增加缓存
```java
@Cacheable(value = "inventory", key = "#drugCode")
public StockResult getStock(String drugCode) {
    return inventoryMapper.getStock(drugCode);
}
```

## 结论
**一句话结论**：Feign 调用 inventory-service 查询库存时，因 IN 子查询数据量大且无索引导致 12 秒超时。

**关键证据**：
1. HTTP 日志显示 charge-service 响应 15 秒超时
2. RPC 日志显示 InventoryClient.checkStock 耗时 12 秒
3. SQL 日志显示 INVENTORY 表全表扫描
4. 数据验证显示收费单包含 1500 个药品

**修复建议**：
1. 立即添加 DRUG_CODE 索引
2. 优化查询逻辑，分批查询库存
3. 增加库存缓存减少数据库压力
