---
title: 'PostgreSQL 底层原理：为什么越来越多的团队从 MySQL 切换到 PG'
description: 'MVCC 的实现差异、JSONB 的原生支持、CTE 与窗口函数的查询能力、逻辑复制与多活架构。PostgreSQL 不是「更好的 MySQL」——是一个不同哲学的数据库。什么场景该选 PG，什么场景该留在 MySQL。'
pubDate: 2025-01-05
category: '数据库与中间件'
tags: ['PostgreSQL', 'MVCC', 'JSONB', '逻辑复制']
---

> MySQL 和 PostgreSQL 的争论持续了十几年。MySQL 赢在互联网的早期（简单、快、生态好），但 PG 正在赢下越来越复杂的业务场景。不是因为 PG「更好」——是因为业务的复杂度到了 MySQL 的舒适区之外。

## 一、MVCC 的实现差异：PG vs MySQL

### 1.1 两种 MVCC 策略

| 特性 | MySQL (InnoDB) | PostgreSQL |
|------|---------------|------------|
| 旧版本存储 | undo log（独立日志） | 同一数据页（Heap Tuple） |
| 垃圾回收 | 后台线程清理 undo | VACUUM（手动或 autovacuum） |
| 长事务影响 | undo log 膨胀 | 死元组堆积，表膨胀 |
| 读性能 | 读 undo 需要回溯 | 直接读页内版本，更快 |

### 1.2 PG 的 VACUUM 问题

```
UPDATE 一行 → 旧版本标记为 dead → 新版本写入
VACUUM → 标记 dead 的空间可重用（不释放磁盘空间）
VACUUM FULL → 重写整个表，释放空间（锁表！）

问题：
  频繁 UPDATE 的表 → 大量 dead tuples → 表膨胀
  autovacuum 来不及清理 → 查询变慢（要扫描更多 dead tuples）
  极端情况：表膨胀 10 倍
```

**监控指标**：`n_dead_tup / n_live_tup` 比例。超过 20% 就需要手动 VACUUM。对于频繁更新的表，调低 `autovacuum_vacuum_scale_factor`（默认 0.2 → 改为 0.05）。

### 1.3 长事务是 PG 的头号杀手

```
长事务不结束 → VACUUM 不能清理它之后的 dead tuples
→ 表持续膨胀 → 查询越来越慢 → 最终 OOM

解法：
  1. 设置 statement_timeout = '30s'（强制终止慢查询）
  2. 设置 idle_in_transaction_session_timeout = '60s'（空闲事务超时）
  3. 监控 pg_stat_activity 中 state='idle in transaction' 的会话
```

## 二、JSONB：半结构化数据的原生支持

### 2.1 为什么 PG 的 JSONB 比 MySQL 的 JSON 强

```sql
-- MySQL：JSON 存为文本，查询时解析
SELECT * FROM t WHERE JSON_EXTRACT(data, '$.name') = '张三';  -- 每次解析

-- PG：JSONB 存为二进制，预解析 + 可建 GIN 索引
SELECT * FROM t WHERE data @> '{"name": "张三"}';  -- 二进制匹配，快 10x
CREATE INDEX idx_data ON t USING GIN(data);       -- GIN 倒排索引
```

**适用场景**：
- 商品属性（不同品类字段不同）→ JSONB
- 配置存储（schema 不固定）→ JSONB
- 事件数据（字段随版本变化）→ JSONB

**不适用**：
- 需要频繁 JOIN 的关联字段 → 还是用普通列 + 外键
- 需要强类型约束的数据 → JSONB 没有 Schema 校验

### 2.2 JSONB 的性能陷阱

```sql
--  在 JSONB 上做大范围扫描
SELECT * FROM products WHERE data->>'category' = 'electronics';
-- 全表扫描 + 逐行解析 JSONB

-- ✅ 建表达式索引
CREATE INDEX idx_category ON products ((data->>'category'));
-- B-tree 索引，等值查询 O(log N)

-- ✅ 大表用 GIN 索引
CREATE INDEX idx_data_gin ON products USING GIN(data);
-- 适合 @> 包含查询、? 键存在查询
```

## 三、CTE 与窗口函数：复杂查询的利器

### 3.1 递归 CTE

```sql
-- 组织架构：查某个节点的所有子节点
WITH RECURSIVE org_tree AS (
  -- 基础查询：从目标节点开始
  SELECT id, name, parent_id, 1 AS level
  FROM org WHERE id = 100

  UNION ALL

  -- 递归查询：找子节点
  SELECT o.id, o.name, o.parent_id, t.level + 1
  FROM org o
  JOIN org_tree t ON o.parent_id = t.id
)
SELECT * FROM org_tree ORDER BY level;
```

MySQL 8.0 也支持 CTE，但 PG 的优化器对 CTE 的处理更灵活——MySQL 8.0 以下版本把 CTE 物化为临时表（无法下推优化），PG 可以选择内联或物化。

### 3.2 窗口函数

```sql
-- 每个部门的工资排名
SELECT name, department, salary,
  RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS rank,
  AVG(salary) OVER (PARTITION BY department) AS dept_avg
FROM employees;

-- 连续登录天数（经典面试题）
SELECT user_id, COUNT(*) AS consecutive_days
FROM (
  SELECT user_id, login_date,
    login_date - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) AS grp
  FROM logins
) t
GROUP BY user_id, grp
HAVING COUNT(*) >= 7;
```

这些查询在 MySQL 里需要写复杂的子查询或临时表——PG 用窗口函数一条 SQL 搞定。

## 四、逻辑复制与多活架构

### 4.1 物理复制 vs 逻辑复制

| 特性 | 物理复制（Streaming Replication） | 逻辑复制 |
|------|------|------|
| 粒度 | 整个实例 | 按表/库 |
| 版本要求 | 主从版本一致 | 可以跨版本 |
| 用途 | 高可用、读扩展 | 数据同步、迁移、多活 |
| Standby 可写 | 否（只读） | 订阅端可独立写入 |

### 4.2 双向复制（BDR）的坑

```
Node A → 逻辑复制 → Node B
Node B → 逻辑复制 → Node A

问题：
  A 更新一行 → 复制到 B → B 再复制回 A → 无限循环

解法：
  1. 设置 session_replication_role = 'local'（不复制本地写入）
  2. 用触发器过滤（检查 origin 不是自己才复制）
  3. 或用 PgBouncer + 应用层路由（读写分离，单向复制）
```

**架构师的判断**：PG 的双向复制远不如 MySQL 的组复制成熟。需要多活的场景，考虑应用层分片（不同用户路由到不同节点）+ 单向复制，而不是双向复制。

## 五、PG vs MySQL 选型

| 维度 | PostgreSQL | MySQL |
|------|-----------|-------|
| **复杂查询** | 强（窗口函数、CTE、GIN 索引） | 中（8.0 改善） |
| **JSON/半结构化** | JSONB + GIN 索引 | JSON（弱） |
| **全文搜索** | tsvector + GIN | 基础全文索引 |
| **GIS** | PostGIS（业界最强） | 基础空间函数 |
| **事务隔离** | 只有 Serializable（真正 MVCC） | RC/RR（RR 有幻读问题） |
| **复制** | 逻辑复制灵活，双向弱 | 主从成熟，组复制强 |
| **生态/社区** | 偏学术、文档质量高 | 偏互联网、工具链多 |
| **云厂商支持** | RDS 都有 | 所有云都支持 |
| **适合场景** | 复杂业务、GIS、数据仓库 | 互联网 CRUD、高并发读 |

**决策树**：
```
需要 GIS / 复杂分析 / JSONB 高频查询？
  → 是 → PostgreSQL
  → 否 → 团队更熟悉哪个？
    → MySQL → MySQL
    → PG → PG
    → 都差不多 → 互联网高并发读 → MySQL；复杂业务逻辑 → PG
```

## 结语

PostgreSQL 不是「更好的 MySQL」——它是一个不同哲学的数据库。

> MVCC 用页内版本换读性能但需要 VACUUM 维护，JSONB 给半结构化数据开了后门但需要小心索引，窗口函数让复杂查询变得优雅但学习曲线陡，逻辑复制给了灵活性但多活是坑。

选 PG 不是因为它「功能更多」——是因为业务复杂度到了需要这些功能的程度。
