---
title: 'Doris 底层原理：从 MPP 到 Unique Key 的实时 OLAP 新贵'
description: 'Doris 为什么能在保持 MySQL 协议兼容的同时做到亚秒级 OLAP？MPP 并行查询、列存 + ZSTD 压缩、物化视图自动加速、Unique Key 模型支持实时更新。对比 ClickHouse 和 Hive，Doris 的差异化优势在哪。'
pubDate: 2024-11-17
category: '数据库与中间件'
tags: ['Doris', 'OLAP', 'MPP', '实时数仓', '物化视图']
---

> Doris（原 Apache Palo，百度开源）是近两年最火的 OLAP 数据库之一。它在 ClickHouse 的单表极速和 Hive 的生态兼容之间找到了一个甜蜜点——亚秒级的查询延迟、MySQL 协议兼容、支持 JOIN、支持实时更新、运维简单（无外部依赖）。但 Doris 也不是银弹。

## 一、架构：FE + BE 的极简设计

### 1.1 两层架构

```
┌─────────────┐     ┌─────────────┐
│  FE (Frontend)  │     │  FE (Frontend)  │
│  - 元数据管理    │     │  - 查询解析      │
│  - 查询规划      │──▶│  - 负载均衡      │
│  - 集群管理      │     │                 │
└───────┬─────┘     └─────────────┘
        │
───────┴─────────────────────────────┐
│           BE (Backend) 集群           │
│  BE 1    BE 2    BE 3    BE 4        │
│  - 数据存储（列存）                    │
│  - 查询执行（MPP 并行）               │
│  - Compaction                        │
─────────────────────────────────────┘
```

**对比 ClickHouse**：ClickHouse 需要 ZooKeeper 管理副本，Doris 不需要——FE 通过 BDB JE（Berkeley DB Java Edition）做元数据高可用，BE 之间通过心跳和副本机制保证数据高可用。

**运维优势**：Doris 只有两个进程（FE + BE），没有 Hadoop、没有 ZooKeeper、没有 Spark 依赖。部署 = 解压 + 改配置 + 启动。

### 1.2 MPP 并行查询

```
查询：SELECT city, SUM(amount) FROM orders WHERE year = 2024 GROUP BY city

FE 生成执行计划 → 分发到所有 BE 并行执行：

BE 1: 扫描本地数据 → 局部聚合 (city=北京, sum=100万)
BE 2: 扫描本地数据 → 局部聚合 (city=上海, sum=80万)
BE 3: 扫描本地数据 → 局部聚合 (city=北京, sum=50万)
BE 4: 扫描本地数据 → 局部聚合 (city=广州, sum=60万)

FE 汇总：
  北京: 100 + 50 = 150万
  上海: 80万
  广州: 60万

N 个 BE = N 倍查询吞吐。
```

## 二、三种数据模型

### 2.1 模型对比

| 模型 | 行为 | 适用场景 |
|------|------|---------|
| **Duplicate Key** | 保留所有行（含重复） | 日志、明细数据 |
| **Aggregate Key** | 相同 Key 自动聚合（SUM/MAX/MIN/REPLACE） | 预聚合报表 |
| **Unique Key** | 相同 Key 只保留最新一条 | 实时更新（订单状态变更） |

### 2.2 Unique Key 的实现

```sql
CREATE TABLE orders (
  order_id BIGINT,
  user_id BIGINT,
  status VARCHAR(20),
  amount DECIMAL(10,2),
  updated_at DATETIME
) UNIQUE KEY(order_id, user_id)
DISTRIBUTED BY HASH(order_id) BUCKETS 10
PROPERTIES ("replication_num" = "3");

-- 写入相同 order_id 的两条记录
INSERT INTO orders VALUES (1, 100, 'CREATED', 500.00, '2024-01-01 10:00:00');
INSERT INTO orders VALUES (1, 100, 'PAID', 500.00, '2024-01-01 10:05:00');

-- 查询只返回最新一条
SELECT * FROM orders WHERE order_id = 1;
-- 返回：(1, 100, 'PAID', 500.00, '2024-01-01 10:05:00)
```

**实现原理**：Unique Key 用「标记删除 + 版本合并」实现。新写入带版本号，查询时只返回最新版本。Compaction 时物理清理旧版本。

**限制**：Unique Key 的写入性能低于 Duplicate Key（需要维护版本信息）。高频 UPDATE 场景需要评估 Compaction 压力。

## 三、查询加速：物化视图与索引

### 3.1 自动物化视图

```sql
-- 创建物化视图（预聚合）
CREATE MATERIALIZED VIEW orders_by_city AS
SELECT city, SUM(amount) as total_amount, COUNT(*) as order_count
FROM orders
GROUP BY city;

-- 查询自动命中物化视图
SELECT city, total_amount FROM orders_by_city;
-- 或者直接查原表，优化器自动路由到物化视图
SELECT city, SUM(amount) FROM orders GROUP BY city;
-- FE 优化器发现物化视图可以加速 → 自动改写查询
```

**对比 ClickHouse**：ClickHouse 需要手动维护预聚合表（SummingMergeTree），Doris 的物化视图对查询透明——用户查原表，优化器自动选择最快的路径。

### 3.2 前缀索引 + ZoneMap + BloomFilter

```
Doris 的三级数据跳过机制：

1. 前缀索引（Prefix Index）：
   - 每个数据块的前 36 字节建立稀疏索引
   - 按 ORDER BY 字段的前缀快速定位数据块
   - 免费（自动创建）

2. ZoneMap（块级统计）：
   - 每个数据块保存 min/max/null_count
   - 查询条件不满足 → 跳过整个块
   - 免费（自动创建）

3. BloomFilter 索引：
   - 手动为高基数列创建
   - 等值查询时快速判断 Key 是否存在
   - CREATE INDEX idx_user ON orders(user_id) USING BITMAP;
```

## 四、Doris vs ClickHouse vs Hive

| 维度 | Doris | ClickHouse | Hive |
|------|-------|-----------|------|
| **单表查询** | 快（亚秒级） | 极快（毫秒级） | 慢（分钟级） |
| **JOIN** | 强（CBO + Colocate JOIN） | 弱（右表需内存） | 中（Shuffle） |
| **实时更新** | Unique Key 原生支持 | 异步重写 | 不支持 |
| **物化视图** | 自动命中 | 手动维护 | 手动 |
| **并发** | 中高（~1000 QPS） | 低（~100 QPS） | 低 |
| **MySQL 兼容** | 协议 + 语法高度兼容 | 协议兼容，语法有差异 | 不兼容 |
| **运维** | 极简（FE+BE，无外部依赖） | 中（ZooKeeper 可选） | 复杂（Hadoop 生态） |
| **生态** | Flink/CDC 实时写入 | Kafka 接入 | Spark/MapReduce |
| **适合场景** | 实时报表、即席查询、多维分析 | 单表大查询、日志分析 | T+1 离线 ETL |

### 4.1 选型决策

```
需要实时更新 + JOIN + 即席查询？
  → 是 → Doris（Unique Key + CBO 优化器）
  → 否 → 只查单表、追求极致性能？
    → 是 → ClickHouse
    → 否 → 离线 T+1、数据量 PB 级？
      → 是 → Hive/Spark
      → 否 → 数据量 < 100GB → MySQL
```

## 五、生产调优

| 调优项 | 默认值 | 推荐 | 说明 |
|--------|--------|------|------|
| `compaction_thread_num` | 4 | CPU 核数 | 加速 Compaction |
| `max_compaction_threads` | 3 | CPU 核数/2 | 防止 Compaction 占满 CPU |
| `storage_root_path` | 单盘 | 多盘（SSD+HDD 混部） | IO 分散 |
| `query_timeout` | 300s | 按需调整 | 防止慢查询拖垮集群 |
| `batch_size` | 1024 | 4096 | 批量导入提速 |
| `replication_num` | 3 | 3（生产）/ 1（测试） | 数据可靠性 |

## 结语

Doris 在 OLAP 市场找到了一个独特的定位——不是最快的（ClickHouse 单表更快），不是最大的（Hive 能存 PB），但是最均衡的。

> MPP 并行给了 Doris 查询吞吐，列存 + 压缩给了存储效率，Unique Key 给了实时更新能力，物化视图给了查询加速，MySQL 兼容给了迁移便利，极简架构给了运维友好。

在「实时报表 + 即席查询 + 多维分析」这个场景上，Doris 是目前综合体验最好的选择。
