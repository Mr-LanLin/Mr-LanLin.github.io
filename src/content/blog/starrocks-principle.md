---
title: 'StarRocks 底层原理：从 CBO 优化器到 Pipeline 执行的极速 OLAP 引擎'
description: 'StarRocks 为什么能在 SSB 和 TPC-H 基准测试中碾压 ClickHouse？向量化执行 + CBO 优化器 + Pipeline 引擎 + 物化视图自动改写。和 Doris 分叉后的独立演进路线、Unique Key 的 Primary Key 模型、External Catalog 联邦查询能力。'
pubDate: 2024-11-03
category: '数据库与中间件'
tags: ['StarRocks', 'OLAP', 'CBO', '向量化', '物化视图', '联邦查询']
---

> StarRocks（原 DorisDB，2021 年从 Apache Doris 分叉独立）是近两年 OLAP 领域最激进的性能挑战者。它在 SSB 和 TPC-H 基准测试中全面超越 ClickHouse 和 Doris，核心武器不是更简单的架构——而是一个真正的 CBO（基于代价的优化器）和 Pipeline 执行引擎。理解 StarRocks 的设计哲学，才能知道它和 Doris、ClickHouse 的本质差异。

## 一、和 Doris 分叉后的独立演进

### 1.1 分叉的背景

```
2020 年：Doris 在百度内部孵化，开源为 Apache Doris
2021 年：核心团队分叉 → StarRocks（鼎复科技商业化）
  分叉原因：Doris 社区偏向稳定保守，StarRocks 团队追求极致性能

分叉后的差异化路线：
  Doris：均衡路线（MySQL 兼容 + 简单易用 + 社区驱动）
  StarRocks：性能路线（CBO 优化器 + Pipeline 引擎 + 极速 JOIN）
```

**架构对比**：

| 维度 | StarRocks | Doris |
|------|-----------|-------|
| **查询优化器** | CBO（基于统计信息的代价模型） | RBO（基于规则的优化） |
| **执行引擎** | Pipeline（Volcano 模型） | MPP 批执行 |
| **JOIN 策略** | 5 种（Broadcast/Shuffle/Colocate/Bucket/Pre-aggregate） | 3 种（Broadcast/Shuffle/Colocate） |
| **物化视图** | 异步刷新 + 自动查询改写 | 同步刷新 + 手动命中 |
| **External Catalog** | 支持（Hive/Iceberg/Hudi/Delta/MySQL/ES） | 支持（多源） |
| **Primary Key** | 行存 + 列存混合（UPDATE 快） | 列存（UPDATE 慢） |
| **社区/商业化** | 开源 + 商业化并行 | Apache 基金会 |

### 1.2 三层架构

```
┌──────────────────────────────────────┐
│          FE (Frontend)               │
│  - 元数据管理（BDB JE 高可用）         │
│  - 查询解析 + CBO 优化器              │
│  - 查询计划生成                       │
└────────────────┬─────────────────────┘
                 │
┌────────────────┴─────────────────────┐
│          BE (Backend)                │
│  - 数据存储（列存 + 行存混合）          │
│  - Pipeline 执行引擎                  │
│  - 向量化计算                         │
│  - Compaction                         │
└──────────────────────────────────────┘
```

和 Doris 一样，只有 FE + BE 两个进程，无外部依赖。部署极简。

## 二、CBO 优化器：StarRocks 的核心武器

### 2.1 RBO vs CBO

```
RBO（基于规则，Doris/ClickHouse 用）：
  规则 1：谓词下推 → 尽早过滤
  规则 2：JOIN  reorder → 小表驱动大表
  规则 3：投影下推 → 减少列读取
  问题：规则是固定的，不考虑数据实际分布

CBO（基于代价，StarRocks 用）：
  1. 收集表的统计信息（行数、基数、NDV、空值率、直方图）
  2. 枚举所有可能的执行计划（JOIN 顺序、JOIN 算法）
  3. 用代价模型估算每个计划的成本（CPU + IO + 网络）
  4. 选代价最低的计划

效果：同样一个 5 表 JOIN，RBO 可能选错 JOIN 顺序导致 10x 性能差距，
     CBO 能自动选出最优顺序。
```

### 2.2 统计信息收集

```sql
-- 手动收集统计信息
ANALYZE TABLE orders COMPUTE STATISTICS;

-- 自动收集（StarRocks 2.4+）
SET GLOBAL enable_auto_analyze = true;

-- 查看统计信息
SHOW ANALYZE STATUS;

-- 关键指标：
-- Cardinality（基数）：列的不同值数量
-- NDV（Number of Distinct Values）：影响 JOIN 策略选择
-- 直方图：数据分布，影响过滤率估算
```

**生产教训**：CBO 的效果依赖统计信息的准确性。大表数据变化后要及时 `ANALYZE`——否则 CBO 基于过时的统计信息选了错误的执行计划，反而比 RBO 更慢。

## 三、Pipeline 执行引擎

### 3.1 Volcano 模型 vs Pipeline

```
传统 MPP 批执行（Doris/ClickHouse）：
  Operator A 产生全部结果 → 传给 Operator B → B 产生全部结果 → ...
  问题：中间结果全部物化到内存/磁盘，大结果集 OOM

Pipeline 模型（StarRocks）：
  Operator A 产生一块数据 → 传给 B → B 处理一块 → 传给 C → ...
  数据像流水线一样流动，每个 Operator 只持有一小块数据
  内存占用 = O(单块大小)，不是 O(全量结果集)

效果：
  - 复杂查询内存占用减少 50-80%
  - 支持更大的并发（不互相抢占内存）
  - 第一个结果更快返回（不用等全部计算完）
```

### 3.2 并行度控制

```
Pipeline 的并行度 = 数据分片数 × 每个分片的并发线程数

BE 节点数: 4
每个 BE 的分片数: 10
并发线程数: 4

总并行度 = 4 × 10 × 4 = 160 个 Pipeline 并行执行

调优：
  SET GLOBAL pipeline_dop = 4;  -- 每个算子的并行度
  SET GLOBAL pipeline_exec_mem_ratio = 0.6;  -- Pipeline 内存占比
```

## 四、Primary Key 模型：实时更新的正确姿势

### 4.1 列存 vs 行存

```
Doris 的 Unique Key（列存）：
  UPDATE 一行 → 写入新版本 → Compaction 时合并
  代价：每次 UPDATE 要写整个列块 → 写入放大严重

StarRocks 的 Primary Key（行存 + 列存混合）：
  UPDATE 一行 → 只写这一行（行存）
  查询时 → 行存 + 列存合并返回
  代价：行存占用更多空间，但 UPDATE 极快
```

### 4.2 适用场景

| 场景 | 推荐模型 | 原因 |
|------|---------|------|
| 订单状态频繁变更 | Primary Key | 行存 UPDATE 快 |
| 用户画像标签更新 | Primary Key | 单行更新常见 |
| 日志追加写入 | Duplicate Key | 列存写入效率高 |
| 预聚合报表 | Aggregate Key | 自动聚合 |

```sql
-- Primary Key 表
CREATE TABLE orders (
  order_id BIGINT,
  user_id BIGINT,
  status VARCHAR(20),
  amount DECIMAL(10,2),
  updated_at DATETIME
) PRIMARY KEY(order_id)
DISTRIBUTED BY HASH(order_id) BUCKETS 10
PROPERTIES (
  "replication_num" = "3",
  "enable_persistent_index" = "true"  -- 持久化索引，加速点查
);

-- 实时更新
UPDATE orders SET status = 'SHIPPED' WHERE order_id = 12345;
-- 行存直接定位 → 毫秒级完成
```

## 五、物化视图：自动查询改写

### 5.1 异步刷新 + 透明命中

```sql
-- 创建异步物化视图
CREATE MATERIALIZED VIEW orders_daily
REFRESH ASYNC EVERY(INTERVAL 1 HOUR)
AS
SELECT date_trunc('day', created_at) as day,
       city, SUM(amount) as total_amount,
       COUNT(*) as order_count
FROM orders
GROUP BY date_trunc('day', created_at), city;

-- 查询原表 → 优化器自动改写为查物化视图
SELECT city, SUM(amount) FROM orders
WHERE created_at >= '2024-01-01'
GROUP BY city;
-- FE 发现 orders_daily 可以覆盖这个查询
-- 自动改写：从 orders_daily 查（数据量小 1000x）
```

**对比 Doris**：Doris 的物化视图需要手动指定查询走哪个视图。StarRocks 的优化器自动判断——用户不需要知道物化视图的存在。

### 5.2 增量刷新

```
全量刷新：重新计算整个物化视图（慢）
增量刷新：只计算新数据的部分（快）

StarRocks 支持增量刷新：
  1. 记录物化视图的上次刷新时间点
  2. 只扫描新增/修改的数据
  3. 增量合并到物化视图

条件：物化视图的聚合函数必须支持增量计算（SUM/COUNT/MAX/MIN 支持，COUNT DISTINCT 不支持）
```

## 六、External Catalog：联邦查询

### 6.1 不搬数据，直接查

```sql
-- 创建 Hive Catalog（不搬数据，直接查 Hive 表）
CREATE EXTERNAL CATALOG hive_catalog
PROPERTIES (
  "type" = "hive",
  "hive.metastore.uris" = "thrift://metastore:9083"
);

-- 直接查询 Hive 表（和查 StarRocks 表一样的语法）
SELECT city, SUM(amount)
FROM hive_catalog.warehouse.orders
WHERE year = 2024
GROUP BY city;

-- JOIN StarRocks 表和 Hive 表
SELECT s.city, h.region_name, SUM(s.amount)
FROM starrocks_db.sales s
JOIN hive_catalog.dim.region h ON s.region_id = h.id
GROUP BY s.city, h.region_name;
```

**支持的 External Catalog**：Hive、Iceberg、Hudi、Delta Lake、MySQL、PostgreSQL、Elasticsearch、Oracle、SQL Server。

**性能**：查 External Catalog 比查本地表慢 5-10x（要读远端数据）。适合「低频大查询」（跑一次报表），不适合「高频小查询」。

### 6.2 数据湖 + 数据仓库的统一

```
架构：
  热数据 → StarRocks 本地表（毫秒级查询）
  温数据 → External Catalog（秒级查询，不占存储）
  冷数据 → Hive/Iceberg（分钟级查询，最便宜）

一个 SQL 引擎统一查询三层数据，用户不需要关心数据在哪。
```

## 七、StarRocks vs Doris vs ClickHouse

| 维度 | StarRocks | Doris | ClickHouse |
|------|-----------|-------|-----------|
| **JOIN 性能** | 极强（CBO + 5 种 JOIN 策略） | 强（3 种 JOIN 策略） | 弱 |
| **查询优化** | CBO（自适应） | RBO（固定规则） | 简单规则 |
| **实时更新** | Primary Key（行存，极快） | Unique Key（列存，慢） | 不支持 |
| **物化视图** | 异步 + 自动改写 | 同步 + 手动 | 手动 |
| **联邦查询** | 强（10+ 数据源） | 中（多源） | 弱 |
| **并发** | 高（Pipeline 内存隔离） | 中 | 低 |
| **运维** | 极简（FE+BE） | 极简（FE+BE） | 中（ZK 可选） |
| **MySQL 兼容** | 高度兼容 | 高度兼容 | 协议兼容 |
| **适合场景** | 全场景 OLAP | 均衡 OLAP | 单表极速 |

### 7.1 选型决策

```
需要复杂 JOIN（5 表以上）？
  → 是 → StarRocks（CBO 优化器是刚需）
  → 否 → 需要高频 UPDATE？
    → 是 → StarRocks（Primary Key 行存）
    → 否 → 追求运维极简 + 社区稳定？
      → 是 → Doris
      → 否 → 单表查询为主、追求极致延迟？
        → 是 → ClickHouse
        → 否 → 数据量 PB 级 + 离线？
          → Hive/Spark
```

## 八、生产调优

| 调优项 | 默认值 | 推荐 | 说明 |
|--------|--------|------|------|
| `pipeline_dop` | 0（自动） | 2-4 | 过高抢 CPU |
| `stats_cache_ttl` | 86400 | 3600 | 大表变化频繁时缩短 |
| `enable_query_cache` | false | true（报表场景） | 重复查询命中缓存 |
| `compaction_max_threads` | CPU 核数 | CPU 核数 × 0.5 | 留资源给查询 |
| `write_buffer_size` | 128MB | 256MB（写入量大时） | 减少 flush 频率 |

## 结语

StarRocks 证明了「极致性能」不是靠简化架构——而是靠更深的工程投入。

> CBO 优化器让 JOIN 不再需要人工调优，Pipeline 引擎让复杂查询不再 OOM，Primary Key 行存让实时更新不再痛苦，物化视图自动改写让用户不需要关心预聚合，External Catalog 让数据湖和数据仓库在同一个 SQL 引擎里统一。

它不是 Doris 的替代品——是在 Doris 的均衡路线之外，走了一条追求极致性能的技术路线。两条路线各有价值，关键是理解差异，在正确的场景选正确的引擎。
