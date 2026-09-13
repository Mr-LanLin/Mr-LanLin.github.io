---
title: 'TiDB 底层原理：分布式数据库的 HTAP 实践与生产踩坑'
description: 'TiDB 怎么做到 MySQL 兼容又水平扩展？计算存储分离、Raft 共识、MVCC 快照隔离、HTAP 行列混存。但 TiDB 不是银弹——小表查询比 MySQL 慢、大事务是性能杀手、TiFlash 同步有延迟。'
pubDate: 2025-01-12
category: '数据库与中间件'
tags: ['TiDB', '分布式数据库', 'HTAP', 'Raft']
---

> MySQL 单库到瓶颈了，分库分表太复杂——TiDB 看起来是完美的解决方案：MySQL 协议兼容、水平扩展、强一致、HTAP。但 TiDB 不是「换个连接地址就完事」的 MySQL 替代品。它的架构决定了它在某些场景下比 MySQL 慢，在某些操作上有 MySQL 没有的限制。

## 一、计算存储分离架构

### 1.1 三层组件

```
┌─────────────────────────────────┐
│         TiDB Server (计算层)      │
│  - SQL 解析、优化、执行           │
│  - 无状态，可水平扩展             │
│  - 不存数据                      │
└─────────────┬───────────────────┘
              │ gRPC (kv 请求)
┌─────────────┴───────────────────┐
│        PD Server (调度层)         │
│  - 元数据管理（哪个 Region 在哪）  │
│  - 时间戳分配（TSO）              │
│  - 调度决策（Region 分裂/迁移）    │
│  - 3 节点 Raft 保证高可用          │
└─────────────┬───────────────────
              │
┌─────────────┴───────────────────┐
│       TiKV Server (存储层)        │
│  - 实际存数据（RocksDB）          │
│  - Region 为单位（默认 96MB）      │
│  - 3 副本 Raft 强一致             │
│  - 可水平扩展                     │
└─────────────────────────────────┘
```

**关键设计**：TiDB Server 无状态——加机器就加吞吐。数据和一致性由 TiKV 层保证。PD 是集群的「大脑」——PD 挂了，集群不能扩缩容但能继续读写（元数据缓存在 TiDB Server）。

### 1.2 为什么小表查询比 MySQL 慢

```
MySQL 查一行数据：
  网络 → MySQL 进程 → InnoDB Buffer Pool → 返回
  延迟：~1ms

TiDB 查一行数据：
  网络 → TiDB Server → PD 查 Region 位置 → TiKV 查数据 → Raft 多数确认 → 返回
  延迟：~3-5ms（多了 PD 元数据查询 + Raft 共识 + 网络跳转）
```

**架构师的判断**：TiDB 的优势不在单条查询的延迟，在**海量数据下的稳定延迟**。MySQL 单表 500 万行后查询开始变慢，TiDB 50 亿行和 500 万行的查询延迟差不多——因为数据分散在多个 TiKV 节点上。

## 二、Raft 共识：强一致的代价

### 2.1 写入链路

```
TiDB Server 写一行：
  1. TiDB 把 key-value 发给对应 Region 的 Leader (TiKV)
  2. Leader 写预写日志（WAL）
  3. Leader 把日志复制给 2 个 Follower
  4. 多数确认（3 副本中 2 个确认）→ 返回成功
  5. Leader 应用到状态机（RocksDB）

延迟 = 网络 RTT × 2（TiDB→TiKV + TiKV Leader→Follower）
```

### 2.2 网络分区的影响

```
3 副本：Leader(A) + Follower(B) + Follower(C)

A-B 网络断开：
  → A 和 C 还能通信 → A 仍然是 Leader（2 票多数）
  → B 无法参与选举 → 不影响写入

A 和 B、C 都断开：
  → A 降级（无法获得多数票）
  → B 和 C 选举新 Leader
  → 整个 Region 短暂不可写（选举期间）
```

**生产教训**：跨机房部署时，确保 Raft 多数派在同一个机房。否则机房级别的故障会导致整个集群不可写。

## 三、MVCC 与快照隔离

### 3.1 TSO：全局时间戳

```
PD Server 的 TSO（Timestamp Oracle）为每个事务分配全局递增的时间戳。

事务 A (ts=100)：BEGIN → 读 ts=100 的快照
事务 B (ts=101)：BEGIN → 读 ts=101 的快照

两个事务看到不同的快照 → 互不干扰
```

### 3.2 GC 与版本清理

```
TiDB 保留历史版本（MVCC），但磁盘空间有限 → 需要 GC。

GC 机制：
  1. 找到所有活跃事务的最小 ts（safe point）
  2. 删除 safe point 之前的所有旧版本
  3. 默认 GC 间隔 10 分钟

长事务的代价：
  一个运行了 1 小时的查询 → safe point 不能推进 → 1 小时内的所有旧版本都不能清理
  → 磁盘空间暴涨
  → 查询性能下降（要扫描更多版本）
```

**监控指标**：`tidb_gc_life_time`——长事务检测告警。超过 1 小时的事务应该被强制终止。

## 四、HTAP：行列混存

### 4.1 TiFlash：列存引擎

```
TiKV（行存）：适合点查、事务
  → 写入快、点查快、范围查一般

TiFlash（列存）：适合分析
  → 同步 TiKV 的数据（Raft Learner，不影响主链路）
  → 列存 + MPP 并行计算 → 聚合分析快 10-100x

数据流：
  TiKV Leader → Raft Learner → TiFlash
  同步延迟：秒级
```

### 4.2 自动路由

```sql
-- 简单查询 → 走 TiKV（行存）
SELECT * FROM orders WHERE id = 123;

-- 分析查询 → 自动走 TiFlash（列存）
SELECT region, SUM(amount) FROM orders GROUP BY region;

-- 也可以手动指定
SELECT /*+ READ_FROM_STORAGE(TIKV) */ * FROM orders WHERE id = 123;
SELECT /*+ READ_FROM_STORAGE(TIFLASH) */ region, SUM(amount) FROM orders GROUP BY region;
```

**注意**：TiFlash 同步有延迟（秒级）。刚写入的数据在 TiFlash 里可能查不到——需要等同步完成。对实时性要求高的分析查询要注意这个窗口。

## 五、大事务：TiDB 的性能杀手

### 5.1 为什么大事务危险

```
TiDB 的事务是乐观事务（Percolator 模型）：
  1. 预写阶段：写所有 key 的 lock
  2. 提交阶段：写所有 key 的 commit 记录
  3. 清理阶段：异步清理 lock

大事务（一次更新 10 万行）的问题：
  - 预写阶段持有 10 万个 lock → 阻塞其他事务
  - 提交阶段要写 10 万个 commit → 耗时长
  - 如果中途失败，回滚 10 万个 lock → 更慢
```

**限制**：TiDB 默认限制事务大小为 100MB（`txn-total-size-limit`）。超过会报错。

### 5.2 解法：分批提交

```java
// ❌ 错误：一次更新 10 万行
@Transactional
public void updateAllOrders() {
    List<Order> orders = orderRepo.findAll();  // 10 万条
    for (Order o : orders) {
        o.setStatus("processed");
        orderRepo.save(o);  // 同一个事务
    }
}

// ✅ 正确：分批提交，每批 1000 条
public void updateAllOrders() {
    List<Order> orders = orderRepo.findAll();
    int batchSize = 1000;
    for (int i = 0; i < orders.size(); i += batchSize) {
        List<Order> batch = orders.subList(i, Math.min(i + batchSize, orders.size()));
        transactionTemplate.execute(status -> {
            batch.forEach(o -> { o.setStatus("processed"); orderRepo.save(o); });
            return null;
        });
    }
}
```

## 六、TiDB vs MySQL 选型

| 维度 | TiDB | MySQL |
|------|------|-------|
| **单表上限** | 无（水平扩展） | 500 万行开始优化 |
| **单条查询延迟** | 3-5ms | 1ms |
| **海量数据查询** | 稳定 | 退化 |
| **水平扩展** | 原生支持 | 分库分表 |
| **HTAP** | 支持（TiFlash） | 不支持 |
| **运维复杂度** | 高（多组件） | 低（单进程） |
| **MySQL 兼容** | 协议兼容，语法 95% | 原生 |
| **适合规模** | >100GB 数据 | <100GB 数据 |

**决策树**：
```
数据量 < 100GB？
  → 是 → MySQL（简单、成熟、便宜）
  → 否 → 需要分库分表吗？
    → 不想分 → TiDB
    → 已经分了且跑得稳定 → 继续 MySQL + 中间件
```

## 结语

TiDB 解决了 MySQL 分库分表的痛苦，但引入了分布式系统的复杂性。

> 计算存储分离给了 TiDB 水平扩展的能力，Raft 给了它强一致，MVCC 给了它快照隔离，TiFlash 给了它分析能力。但每一次网络跳转都有延迟代价，每一个大事务都可能阻塞集群，HTAP 的同步延迟需要业务容忍。

TiDB 不是 MySQL 的「升级版」——是一个不同架构的数据库。理解它的架构，才能在合适的场景用好它。
