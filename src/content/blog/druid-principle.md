---
title: 'Apache Druid 底层原理：实时 OLAP 的亚秒级多维分析引擎'
description: 'Druid 为什么能在流式写入的同时做到亚秒级查询？Segment 不可变设计、Rollup 预聚合、Bitmap 索引、Broker-Historical-Coordinator 三层架构。Druid 和 ClickHouse、Doris 的差异在哪，什么场景该选 Druid。'
pubDate: 2024-11-10
category: '数据库与中间件'
tags: ['Druid', 'OLAP', '实时分析', 'Bitmap索引', 'Rollup']
---

> Apache Druid 是一个容易被低估的 OLAP 数据库——它在「实时写入 + 亚秒级多维分析」这个场景上几乎无人能敌。ClickHouse 擅长单表极速查询但实时写入体验一般，Doris 均衡但并发有限，Druid 则在「边写边查」的场景下做到了极致。

## 一、架构：三层分离

```
┌─────────────────────────────────────────┐
│              Broker（查询层）              │
│  - 接收查询请求                           │
│  - 将查询分发到 Historical + Realtime     │
│  - 合并结果返回                           │
│  - 无状态，可水平扩展                      │
└──────────────────┬──────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
┌──────────────    ┌──────────────────┐
│  Historical   │    │  MiddleManager   │
│  (历史数据层)  │    │  (实时摄入层)     │
│  - 加载完整    │    │  - 接收实时流     │
│    Segment    │    │  - 生成 Segment   │
│  - 响应查询    │    │  - 定期 Handoff   │
│  - 缓存热数据  │    │    到 Historical  │
──────────────┘    └──────────────────┘
        │                     │
        ▼                     ▼
┌─────────────────────────────────────────┐
│         Coordinator + Overlord           │
│  - Coordinator：管理 Segment 分配和负载均衡  │
│  - Overlord：管理 MiddleManager 的任务调度   │
─────────────────────────────────────────┘
```

**关键设计**：查询层（Broker）和数据层（Historical/MiddleManager）分离——查询不影响写入，写入不影响查询。这是 Druid 能「边写边查」的架构基础。

## 二、Segment：不可变的数据单元

### 2.1 Segment 的生命周期

```
实时写入流（Kafka/HTTP）
  → MiddleManager 接收
  → 按时间窗口切分（默认 1 小时一个 Segment）
  → Segment 在内存中构建索引
  → 时间窗口结束 → Segment 持久化到深度存储（HDFS/S3）
  → Historical 加载 Segment → 对外可查
```

**Segment 是不可变的**——一旦生成就不会修改。UPDATE/DELETE 通过生成新版本 Segment 实现（类似 LSM-Tree 的 Compaction）。

### 2.2 Segment 的内部结构

```
一个 Segment 文件包含：
  1. 列数据（按列存储，ZSTD/LZ4 压缩）
  2. 字典编码（字符串列去重后存索引）
  3. Bitmap 索引（高基数列的等值查询加速）
  4. 时间戳（按时间排序，时间范围查询极快）
```

### 2.3 Rollup：写入时的预聚合

```
原始数据（写入前）：
  {timestamp: "10:00:01", city: "北京", revenue: 100}
  {timestamp: "10:00:02", city: "北京", revenue: 150}
  {timestamp: "10:00:03", city: "北京", revenue: 200}

开启 Rollup 后（按 city + 小时 聚合）：
  {timestamp: "10:00:00", city: "北京", revenue: 450, count: 3}

效果：
  - 存储空间减少 90%+（1 亿条 → 100 万条）
  - 查询时直接读聚合结果，不需要实时 GROUP BY
  - 代价：丢失明细数据（只能查到聚合后的值）
```

**Rollup 是 Druid 的核心竞争力**——在写入时就完成预聚合，查询时直接返回结果。ClickHouse 需要手动建 SummingMergeTree 表实现类似功能，Druid 是原生支持。

## 三、Bitmap 索引：多维分析的加速器

### 3.1 原理

```
列 city 的 Bitmap 索引：
  北京: 1 0 1 0 0 1 0 0 ...  (第 1、3、6 行的 city = 北京)
  上海: 0 1 0 0 1 0 0 0 ...
  广州: 0 0 0 1 0 0 1 0 ...

查询 WHERE city = '北京' AND status = '已完成'：
  北京:     1 0 1 0 0 1 0 0
  AND 已完成: 1 1 0 0 0 1 0 1
  =         1 0 0 0 0 1 0 0  → 只有第 1、6 行满足

Bitmap AND 操作是位运算，CPU 指令级别的速度。
```

### 3.2 适用与不适用

| 适用 | 不适用 |
|------|--------|
| 低基数列（状态、类型、城市） | 高基数列（用户ID、订单号） |
| 等值查询（city = '北京'） | 范围查询（amount > 100） |
| 多条件 AND/OR | 全文搜索 |

**高基数列的处理**：用字典编码 + Roaring Bitmap——先映射为整数 ID，再建 Bitmap。Roaring Bitmap 比普通 Bitmap 节省 50-80% 内存。

## 四、实时写入 vs 查询：互不干扰的秘密

### 4.1 写入不影响查询

```
MiddleManager 写入新 Segment：
  → 新 Segment 在 MiddleManager 本地构建
  → 构建期间，Historical 的旧 Segment 正常服务查询
  → Segment 构建完成 → Handoff 给 Historical
  → Historical 加载新 Segment → 新数据可查

整个过程，查询链路不受影响。
```

### 4.2 查询不影响写入

```
Broker 收到查询：
  → 同时查询 Historical（历史数据）和 MiddleManager（实时数据）
  → 合并结果 → 返回
  → 不涉及写入路径

写入链路（MiddleManager → 深度存储）和查询链路（Broker → Historical/MiddleManager）完全独立。
```

## 五、Druid vs ClickHouse vs Doris

| 维度 | Druid | ClickHouse | Doris |
|------|-------|-----------|-------|
| **实时写入** | 强（Kafka 原生集成） | 中（批量 INSERT） | 中（Stream Load） |
| **边写边查** | ✅ 写入不影响查询 | ️ 写入期间查询可能慢 | ✅ 支持 |
| **Rollup 预聚合** | ✅ 原生写入时聚合 | SummingMergeTree（手动） | Aggregate Key（自动） |
| **多维分析** | 强（Bitmap 索引） | 中（无 Bitmap） | 中（前缀索引） |
| **JOIN** | 弱（Lookup 表） | 弱 | 强 |
| **并发查询** | 高（~1000 QPS） | 低（~100 QPS） | 中（~500 QPS） |
| **运维** | 中（需要 ZK + 深度存储） | 低 | 极简 |
| **适合场景** | 实时多维分析、监控看板 | 单表极速查询、日志分析 | 即席查询、报表 |

### 5.1 选型决策

```
需要实时写入 + 多维分析（按多个维度 filter + group by）？
  → 是 → Druid（Rollup + Bitmap 是杀手锏）
  → 否 → 只查单表、追求极致延迟？
    → 是 → ClickHouse
    → 否 → 需要 JOIN + 实时更新？
      → 是 → Doris（Unique Key + CBO）
      → 否 → 离线 T+1 → Hive/Spark
```

## 六、生产调优

| 调优项 | 默认值 | 推荐 | 说明 |
|--------|--------|------|------|
| `druid.processing.numThreads` | CPU-1 | CPU-2 | 留 1-2 核给 GC |
| `druid.segmentCache.locations` | 单盘 | 多 SSD | IO 分散 |
| `druid.cache.sizeInBytes` | 0 | 物理内存 20% | 开启缓存 |
| Rollup 粒度 | 无 | 按业务最粗粒度 | 存储和查询性能的关键 |
| Segment 时间窗口 | 1 小时 | 按查询模式调整 | 高频查最近 → 小窗口 |

## 结语

Druid 在「实时多维分析」这个细分赛道上几乎没有对手。

> Segment 不可变设计让写入和查询完全解耦，Rollup 在写入时完成预聚合避免了查询时的计算开销，Bitmap 索引让多维过滤变成 CPU 位运算，三层架构让查询层和数据层独立扩展。

ClickHouse 赢在单表极速，Doris 赢在功能均衡，Druid 赢在实时多维分析。理解每个引擎的设计哲学，才能在正确的场景选择正确的工具。
