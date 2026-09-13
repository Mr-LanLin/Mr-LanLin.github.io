---
title: 'ClickHouse 底层原理：从列存到向量化的极速 OLAP 引擎'
description: 'ClickHouse 单表查询为什么比 Hive 快 100 倍？列存 + 向量化执行 + 数据跳过索引 + MergeTree 分区。但 ClickHouse 不擅长 JOIN、不支持事务、更新是反模式。知道它擅长什么，比知道它有什么功能更重要。'
pubDate: 2024-12-01
category: '数据库与中间件'
tags: ['ClickHouse', 'OLAP', '列存', 'MergeTree', '向量化']
---

> ClickHouse 的 benchmark 很唬人——「1 秒查 10 亿行」。但大多数团队用 ClickHouse 的体验是：单表查询确实快，一 JOIN 就拉胯，UPDATE 不支持，DELETE 是异步的，并发一高就 OOM。ClickHouse 不是万能的 OLAP——它有非常明确的擅长和不擅长的边界。

## 一、ClickHouse 为什么快：四个工程决策

### 1.1 列式存储

```
查询：SELECT SUM(salary) FROM employees WHERE dept = '工程'

行存（MySQL）：
  读整行 → 检查 dept → 匹配则累加 salary → 不匹配跳过
  IO 浪费：读了 name、id 等不需要的列

列存（ClickHouse）：
  只读 salary 列和 dept 列的文件
  IO 减少：10 列的表只读 2 列 = 80% IO 节省
```

### 1.2 向量化执行

```
传统逐行执行（Hive/MySQL）：
  for row in rows:
    if row.dept == '工程':     # 每次一个 if 判断
      sum += row.salary        # 每次一个加法

向量化执行（ClickHouse）：
  # 一次处理 8192 行（一个 block）
  dept_column == '工程'        # SIMD 批量比较
  salary_column.filter(mask)   # 批量过滤
  sum(filtered_salary)         # 批量累加

CPU 指令从「一次处理 1 个值」变成「一次处理 8192 个值」。
```

### 1.3 数据跳过索引

```
每个列存文件（part）保存 min/max 统计信息：

part_1: salary [5000, 20000]
part_2: salary [3000, 8000]
part_3: salary [15000, 50000]

查询 WHERE salary > 40000：
  part_1: max=20000 < 40000 → 跳过整个 part
  part_2: max=8000 < 40000 → 跳过
  part_3: max=50000 > 40000 → 扫描

1000 个 part 中只需扫描满足条件的几个。
```

### 1.4 MergeTree：写入和查询的平衡

```
写入：
  新数据追加写入 → 生成新的 part（不可变）
  后台合并：小 part 合并成大 part（类似 LSM-Tree）

查询：
  扫描所有 part → 每个 part 用跳过索引裁剪 → 合并结果

优势：
  写入 = 顺序追加（极快）
  查询 = 列存 + 向量化 + 跳过索引（极快）
  代价：UPDATE/DELETE 是异步重写的，不是原地修改
```

## 二、ClickHouse 不擅长什么

### 2.1 JOIN 是弱项

```sql
-- ClickHouse JOIN 限制：
-- 1. 右表必须能放进内存（或指定 JOIN 类型）
-- 2. 不支持多表 JOIN 优化（CBO 弱）
-- 3. JOIN 性能远不如单表

-- ✅ 推荐：宽表预聚合
CREATE TABLE user_order_wide AS
SELECT u.*, o.order_id, o.amount, o.status
FROM users u LEFT JOIN orders o ON u.id = o.user_id;

-- 查询直接查宽表，不做实时 JOIN
SELECT city, SUM(amount) FROM user_order_wide GROUP BY city;
```

**架构师的判断**：ClickHouse 的正确用法是「预先做好宽表」。ETL 阶段把 JOIN 做完，ClickHouse 只负责单表查询和聚合。把 ClickHouse 当 MySQL 用（频繁 JOIN）一定会失望。

### 2.2 不支持事务

```
ClickHouse 的写入语义：
  INSERT → 原子写入一个 part（要么全成功要么全失败）
  但跨多个 part 的写入不是事务

没有：
  - 多行事务（BEGIN/COMMIT）
  - 行级锁
  - 回滚

适用：分析型写入（批量 INSERT），不适用：交易型写入（逐行 UPDATE）
```

### 2.3 UPDATE/DELETE 是反模式

```sql
-- ClickHouse 的 ALTER TABLE ... DELETE 是异步的
ALTER TABLE events DELETE WHERE user_id = 123;
-- 不是立即执行，而是标记 → 后台合并时物理删除
-- 延迟：几秒到几分钟
-- 频繁 DELETE 会导致大量 part → 合并压力 → 查询变慢

-- ✅ 正确做法：用版本字段 + 查询时过滤
-- 写入时带 is_deleted 字段，查询时 WHERE is_deleted = 0
-- 定期批量清理（而不是逐行 DELETE）
```

## 三、表引擎选择

| 引擎 | 用途 | 特点 |
|------|------|------|
| **MergeTree** | 通用 OLAP | 支持分区、排序、采样、跳过索引 |
| **ReplacingMergeTree** | 去重 | 按 ORDER BY 去重（异步，不保证实时） |
| **SummingMergeTree** | 预聚合 | 相同 Key 的行自动求和 |
| **Distributed** | 分布式查询 | 不存数据，路由到集群各节点 |
| **Kafka** | 数据接入 | 消费 Kafka Topic 写入 ClickHouse |
| **MySQL** | 外表 | 直接查询 MySQL 表（慢，适合小表） |

### 3.1 ReplacingMergeTree 的坑

```sql
CREATE TABLE events (
  event_id UInt64,
  user_id UInt64,
  amount Float64,
  created_at DateTime,
  version UInt64  -- 版本号
) ENGINE = ReplacingMergeTree(version)
ORDER BY (event_id);

INSERT INTO events VALUES (1, 100, 50.0, '2024-01-01', 1);
INSERT INTO events VALUES (1, 100, 55.0, '2024-01-02', 2);  -- 更新

-- 查询（合并前）：
SELECT * FROM events WHERE event_id = 1;
-- 返回 2 行！（去重还没发生）

-- OPTIMIZE TABLE events FINAL;  -- 强制合并
SELECT * FROM events WHERE event_id = 1;
-- 返回 1 行（version=2 的那条）
```

**坑**：ReplacingMergeTree 的去重是异步的（后台合并时才发生）。查询时不保证去重。如果需要强去重，用 `SELECT ... FINAL`（强制合并后查询）——但 FINAL 非常慢，大表不可用。

## 四、分布式集群

### 4.1 分片 + 副本

```
Cluster: cluster_3shards_2replicas
  Shard 1: Node A (本地表) ←→ Node B (副本)
  Shard 2: Node C (本地表) ←→ Node D (副本)
  Shard 3: Node E (本地表) ←→ Node F (副本)

Distributed 表（不存数据，路由查询）：
  CREATE TABLE events_distributed ON CLUSTER cluster_3shards_2replicas
  AS events
  ENGINE = Distributed(cluster_3shards_2replicas, default, events, rand());

查询 Distributed 表 → 自动路由到 3 个 Shard → 并行查询 → 合并结果
```

### 4.2 写入一致性

```
写入 Distributed 表 → 随机路由到一个 Shard 的本地表
  → 如果该节点挂了 → 写入失败（Distributed 表不保证写入高可用）

✅ 生产实践：直接写每个 Shard 的本地表（跳过 Distributed 表）
  → 用 Kafka 引擎或外部调度保证数据均匀分布
  → 避免单点写入瓶颈
```

## 五、ClickHouse vs 其他 OLAP

| 维度 | ClickHouse | Doris | Hive |
|------|-----------|-------|------|
| **单表查询** | 极快（毫秒级） | 快（秒级） | 慢（分钟级） |
| **JOIN** | 弱（右表需内存） | 强（CBO 优化） | 中（Shuffle JOIN） |
| **并发** | 低（~100 QPS） | 高（~1000 QPS） | 低 |
| **实时写入** | 支持（批量 INSERT） | 支持（Stream Load） | 不支持 |
| **UPDATE/DELETE** | 异步重写 | 支持（Unique Key） | 不支持 |
| **运维复杂度** | 中（ZooKeeper 依赖） | 低（无外部依赖） | 高（Hadoop 生态） |
| **适合场景** | 日志分析、单表大查询 | 即席查询、报表 | T+1 离线 ETL |

## 六、生产调优清单

| 调优项 | 默认值 | 推荐值 | 效果 |
|--------|--------|--------|------|
| `max_memory_usage` | 10GB | 按物理内存 60% | 防止 OOM |
| `max_threads` | CPU 核数 | CPU 核数 × 0.75 | 留资源给 OS |
| `insert_quorum` | 0 | 2（3 副本集群） | 写入强一致 |
| `merge_with_ttl_timeout` | 86400 | 3600 | 加速 TTL 清理 |
| `background_pool_size` | 16 | CPU 核数 | 加速后台合并 |

## 结语

ClickHouse 是一个极端的优化——把单表查询做到极致，代价是放弃 JOIN、事务和高并发。

> 列存 + 向量化 + 跳过索引 + MergeTree 给了 ClickHouse 单表查询的极致性能，但也决定了它不擅长 JOIN、不支持事务、UPDATE 是异步的、并发有限。用 ClickHouse 的正确姿势是：ETL 阶段做好宽表，ClickHouse 只做单表查询和聚合。

把它当 MySQL 用一定会失望，把它当分析引擎用会惊叹。
