---
title: '分布式系统设计模式：从分布式锁到一致性哈希的实战选型'
description: '分布式锁用 Redis 还是 ZK？一致性哈希怎么解决数据迁移？分布式 ID 用雪花算法还是号段模式？Raft 共识怎么工作？分布式调度怎么避免重复执行？分布式系统核心设计模式的实战选型指南。'
pubDate: 2025-08-04
category: '架构'
tags: ['分布式', '分布式锁', '一致性哈希', 'Raft', '分布式ID', '设计模式']
---

> 分布式系统的难点不在单个组件——在组件之间的协作。分布式锁保证互斥，一致性哈希保证数据均匀分布，Raft 保证共识，分布式 ID 保证全局唯一。每个模式都解决一类问题，每个选择都有 trade-off。这篇文章不讲理论推导——讲每种模式在什么场景用什么实现、有什么坑、怎么避。

## 一、分布式锁

### 1.1 三种实现对比

| 方案 | 原理 | 性能 | 可靠性 | 适用场景 |
|------|------|------|--------|---------|
| **Redis** | SETNX + 过期时间 | 极高（亚毫秒） | 中（主从切换可能丢锁） | 高并发、允许偶尔失效 |
| **ZooKeeper** | 临时有序节点 | 中（毫秒级） | 高（CP 系统） | 强一致性要求 |
| **数据库** | 唯一约束 / 排他锁 | 低（毫秒级） | 高 | 低频、已有 DB 不想引入新组件 |

### 1.2 Redis 分布式锁的正确写法

```java
/**
 * Redis 分布式锁：SETNX + 过期时间 + Lua 原子释放。
 *
 * 常见错误：
 *   1. 设置过期时间和 SETNX 不是原子操作 → 中间崩溃 → 死锁
 *   2. 释放锁时不检查是不是自己的锁 → 误删别人的锁
 *   3. 业务执行时间超过锁过期时间 → 锁自动释放 → 并发问题
 */
@Component
public class RedisDistributedLock {

    private static final String LOCK_SCRIPT = """
        if redis.call('get', KEYS[1]) == ARGV[1] then
            return redis.call('del', KEYS[1])
        else
            return 0
        end
        """;

    private final RedisTemplate<String, String> redis;

    public boolean tryLock(String lockKey, String requestId, long expireMs) {
        // SETNX + 过期时间（原子操作，Redis 2.6.12+）
        Boolean success = redis.opsForValue()
            .setIfAbsent(lockKey, requestId, expireMs, TimeUnit.MILLISECONDS);
        return Boolean.TRUE.equals(success);
    }

    public boolean unlock(String lockKey, String requestId) {
        // Lua 脚本原子执行：检查 + 删除
        Long result = redis.execute(
            new DefaultRedisScript<>(LOCK_SCRIPT, Long.class),
            List.of(lockKey), requestId);
        return result == 1L;
    }
}
```

### 1.3 Redis 锁的终极问题：主从切换

```
Client A 在 Master 上获得锁
  → Master 还没同步到 Slave 就挂了
  → Slave 升为 Master
  → Client B 在新 Master 上获得同一把锁
  → 两个客户端同时持有锁 → 互斥失效

解法：
  1. RedLock（Redis 作者提出）：在 N 个独立 Redis 实例上同时加锁
     → 代价：性能下降，实现复杂，争议大
  2. 接受风险：如果业务允许偶尔失效 → Redis 锁够用
  3. 不能接受 → 用 ZooKeeper（CP 系统，不会丢锁）
```

### 1.4 ZooKeeper 分布式锁

```java
/**
 * ZooKeeper 分布式锁：临时有序节点 + Watch 机制。
 * 每个客户端在 /locks 下创建临时有序节点 /locks/lock-000001
 * 获取锁：判断自己是不是序号最小的节点
 * 等待锁：如果不是最小的，Watch 前一个节点（前一个释放时通知）
 * 释放锁：删除自己的节点
 *
 * 优势：ZK 是 CP 系统，主从切换不会丢锁
 * 劣势：性能比 Redis 低 10-100x
 */
```

## 二、一致性哈希

### 2.1 为什么需要一致性哈希

```
普通哈希取模：hash(key) % N
  N 个节点 → key 均匀分布
  加一个节点（N+1）→ 几乎所有 key 的映射都变了 → 大量数据迁移

一致性哈希：hash(key) 和 hash(node) 映射到同一个环上
  key 顺时针找到第一个 node → 存储
  加节点 → 只影响新节点和它前一个节点之间的 key → 1/N 的数据迁移
```

### 2.2 虚拟节点

```
问题：节点少时，数据分布不均匀
解法：每个物理节点映射 M 个虚拟节点到环上
  → 3 个物理节点 × 150 虚拟节点 = 450 个虚拟节点
  → 数据分布更均匀

虚拟节点数选择：
  太少 → 分布不均匀
  太多 → 环上查找慢
  经验值：150-200 个虚拟节点 / 物理节点
```

### 2.3 适用场景

| 场景 | 为什么用一致性哈希 |
|------|-------------------|
| 分布式缓存（Redis Cluster） | 加/减节点时最小化缓存失效 |
| 分布式数据库分片 | 加/减分片时最小化数据迁移 |
| 负载均衡 | 同一用户的请求路由到同一服务器（会话保持） |
| 分布式 ID 生成 | 同一机器生成的 ID 在时间上连续 |

## 三、分布式 ID 生成

### 3.1 三种方案对比

| 方案 | 原理 | 性能 | 趋势性 | 唯一性保证 |
|------|------|------|--------|-----------|
| **UUID** | 随机 128 位 | 极高 |  无序 | 概率唯一 |
| **雪花算法** | 时间戳 + 机器ID + 序列号 | 极高（百万级/秒） | ✅ 递增 | 依赖时钟 |
| **号段模式** | 数据库批量取号 | 中（万级/秒） | ✅ 递增 | 强一致 |

### 3.2 雪花算法

```java
/**
 * 雪花算法：64 位 ID = 1 bit(符号) + 41 bit(时间戳) + 10 bit(机器ID) + 12 bit(序列号)
 *
 * 41 bit 时间戳 → 可用 69 年（2024-2093）
 * 10 bit 机器ID → 1024 台机器
 * 12 bit 序列号 → 每毫秒 4096 个 ID
 *
 * 总吞吐：1024 × 4096 × 1000 = 41 亿 ID/秒
 */
public class SnowflakeIdGenerator {

    private final long workerId;
    private final long datacenterId;
    private long lastTimestamp = -1L;
    private long sequence = 0L;

    // 时间戳位数、机器ID位数等常量...

    public synchronized long nextId() {
        long timestamp = System.currentTimeMillis();

        // 时钟回拨检测
        if (timestamp < lastTimestamp) {
            throw new RuntimeException("时钟回拨！拒绝生成 ID");
        }

        if (timestamp == lastTimestamp) {
            sequence = (sequence + 1) & sequenceMask;
            if (sequence == 0) {
                // 同一毫秒序列号用尽 → 等下一毫秒
                timestamp = waitNextMillis(lastTimestamp);
            }
        } else {
            sequence = 0L;
        }

        lastTimestamp = timestamp;
        return ((timestamp - epoch) << timestampLeftShift)
             | (datacenterId << datacenterLeftShift)
             | (workerId << workerIdShift)
             | sequence;
    }
}
```

**坑**：时钟回拨。服务器 NTP 同步可能导致时钟回拨几毫秒。解法：
- 容忍小幅度回拨（< 5ms）→ 用上一毫秒的序列号继续生成
- 大幅度回拨 → 报警 + 拒绝服务，等时钟追上

### 3.3 号段模式（Leaf）

```
美团 Leaf 方案：
  1. 从数据库取一个号段（如 1-1000）
  2. 在内存中分配（1, 2, 3...1000）
  3. 用完 80% 时异步取下一个号段（1001-2000）
  4. 双 Buffer：当前号段 + 预取号段，无缝切换

优势：
  - ID 递增（对数据库索引友好）
  - 不依赖时钟
  - 数据库压力小（每 1000 个 ID 才访问一次 DB）

劣势：
  - 需要数据库（有单点风险）
  - 号段用完前的瞬间可能阻塞
```

## 四、Raft 共识算法

### 4.1 为什么需要共识

```
分布式系统的数据需要在多个节点间保持一致。
但网络会分区、节点会宕机、时钟会漂移。

共识算法回答：在不可靠的网络上，多个节点怎么就「某个值」达成一致？
```

### 4.2 Raft 的三个子问题

```
1. Leader 选举
   → 节点有三种角色：Leader / Follower / Candidate
   → Follower 超时没收到 Leader 心跳 → 变成 Candidate → 发起选举
   → 获得多数票 → 成为 Leader

2. 日志复制
   → Leader 接收写请求 → 追加到本地日志
   → 并行复制给所有 Follower
   → 多数节点确认 → 提交（Commit）→ 应用到状态机

3. 安全性
   → 只有包含所有已提交日志的 Candidate 才能当选
   → Leader 不会覆盖自己的日志（只追加不修改）
```

### 4.3 Raft 在工业界的应用

| 系统 | 用 Raft 做什么 |
|------|---------------|
| etcd | 分布式 KV 存储（K8s 的元数据存储） |
| Consul | 服务发现 + 配置管理 |
| TiDB (PD) | 元数据管理 + TSO 时间戳分配 |
| ZooKeeper (ZAB) | 类似 Raft 的 ZAB 协议 |
| Redis Sentinel | 哨兵选举（非严格 Raft） |

## 五、分布式调度

### 5.1 问题：怎么保证任务不重复执行

```
定时任务 "每天凌晨 2 点生成报表"
  → 3 台服务器 → 每台都执行 → 报表生成 3 次

解法：
  1. 数据库锁：执行前 INSERT 一条记录（唯一约束防重）
  2. 分布式锁：执行前抢 Redis 锁，抢到才执行
  3. 调度框架：XXL-Job / ElasticJob 自动选主执行
```

### 5.2 XXL-Job 的核心设计

```
调度中心（Admin）：
  - 管理任务配置（cron 表达式、执行器、路由策略）
  - 按 cron 触发 → 选择执行器 → 发送执行指令

执行器（Executor）：
  - 注册到调度中心
  - 接收执行指令 → 执行任务 → 回报结果

路由策略：
  - 第一个：固定发到一个执行器
  - 轮询：轮流发到各执行器
  - 随机：随机选
  - 一致性哈希：同一任务总是发到同一执行器（有状态任务）
  - 故障转移：主执行器挂了自动切备
```

## 六、CQRS + Event Sourcing

### 6.1 CQRS（命令查询职责分离）

```
传统：同一个模型既处理写又处理读

CQRS：写模型（Command）和读模型（Query）分离

写模型：
  - 处理业务逻辑，保证一致性
  - 写入事件日志（Event Store）

读模型：
  - 订阅事件日志，异步更新读模型
  - 可以针对不同查询建不同的读模型（甚至用不同的数据库）

优势：读写独立优化、读模型可以高度非范式化
代价：最终一致性、架构复杂度增加
```

### 6.2 Event Sourcing

```
不存当前状态，存所有变更事件：

  OrderCreated → OrderItemAdded → OrderItemAdded → OrderPaid → OrderShipped

  当前状态 = 从头回放所有事件

优势：
  - 完整的审计日志（天然就有）
  - 可以回放任意时间点的状态
  - 可以衍生出新的读模型（加一个订阅者就行）

代价：
  - 事件量大时需要快照（Snapshot）优化回放性能
  - 事件 Schema 变更需要版本管理
  - 调试困难（需要理解事件流）
```

## 结语

分布式系统设计模式不是「背下来面试用」——是**每个模式都对应一类真实的生产问题**。

> 分布式锁解决互斥，一致性哈希解决数据分布，雪花算法解决全局唯一，Raft 解决共识，分布式调度解决重复执行，CQRS 解决读写冲突。每个模式都有自己的适用边界和代价——选对了事半功倍，选错了灾难现场。

理解每个模式的 trade-off，比记住实现细节更重要。
