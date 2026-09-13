---
title: '高可用架构设计：从同城双活到异地多活的实战指南'
description: '单机故障怎么处理？机房故障怎么容灾？城市故障怎么多活？RTO 和 RPO 怎么定义？混沌工程怎么做故障演练？从故障模型到多活架构，高可用设计的完整方法论。'
pubDate: 2025-07-21
category: '架构'
tags: ['高可用', '多活架构', '容灾', '混沌工程', 'RTO', 'RPO']
---

> 高可用不是「多部署几个节点」——是对故障模型的系统性思考。单机故障、机房故障、城市故障、网络分区、数据损坏——每种故障有不同的应对策略。RTO 和 RPO 定义了业务能容忍的极限，架构设计围绕这两个指标展开。

## 一、故障模型与可用性等级

### 1.1 几个 9 意味着什么

| 可用性 | 年停机时间 | 月停机时间 | 典型场景 |
|--------|-----------|-----------|---------|
| 99%（2 个 9） | 3.65 天 | 7.2 小时 | 内部系统 |
| 99.9%（3 个 9） | 8.76 小时 | 43 分钟 | 一般互联网服务 |
| 99.99%（4 个 9） | 52 分钟 | 4.3 分钟 | 电商核心、支付 |
| 99.999%（5 个 9） | 5.2 分钟 | 26 秒 | 电信、金融核心 |
| 99.9999%（6 个 9） | 31.5 秒 | 2.6 秒 | 几乎不可能达到 |

**每多一个 9，成本增加 10 倍**。4 个 9 到 5 个 9 不是技术升级——是架构重构。

### 1.2 故障分类

| 故障类型 | 频率 | 影响范围 | 应对策略 |
|---------|------|---------|---------|
| 进程崩溃 | 高 | 单实例 | 进程守护 + 自动重启 |
| 单机故障 | 中 | 单节点 | 多副本 + 故障转移 |
| 机房故障 | 低 | 单机房 | 同城双活/多活 |
| 城市故障 | 极低 | 单城市 | 异地多活 |
| 网络分区 | 中 | 部分节点 | 分区容忍 + 降级 |
| 数据损坏 | 极低 | 数据层 | 备份 + 恢复 |

## 二、RTO 与 RPO：高可用的两个指标

```
RTO（Recovery Time Objective）：从故障到恢复的时间
  → 业务能容忍多久不能用？
  → RTO = 0 → 需要实时故障转移（多活）
  → RTO = 分钟级 → 自动故障转移（主从切换）
  → RTO = 小时级 → 人工恢复（备份恢复）

RPO（Recovery Point Objective）：允许丢失多少数据
  → 业务能容忍丢多少数据？
  → RPO = 0 → 同步复制（性能代价大）
  → RPO = 秒级 → 异步复制 + WAL
  → RPO = 小时级 → 定时备份

示例：
  支付系统：RTO < 30s, RPO = 0（不能丢钱）
  日志系统：RTO < 5min, RPO = 1h（丢 1 小时日志可接受）
  内部工具：RTO < 1h, RPO = 24h（丢一天数据可接受）
```

## 三、高可用架构的四种模式

### 3.1 主从模式（Active-Standby）

```
Master（读写）←→ Slave（只读 + 热备）

故障转移：
  Master 挂了 → Slave 提升为新 Master
  RTO：秒~分钟级（自动切换）
  RPO：取决于同步方式
    - 同步复制：RPO = 0（但写延迟高）
    - 异步复制：RPO > 0（可能丢最近的数据）

适用：RTO 分钟级、RPO 秒级的场景
组件：MySQL 主从、Redis Sentinel、ES 主从
```

### 3.2 双活模式（Active-Active）

```
机房 A（读写）←→ 机房 B（读写）
  ↕ 数据同步（双向）

故障转移：
  机房 A 挂了 → 机房 B 继续服务（零切换）
  RTO ≈ 0
  RPO ≈ 0（同步复制）

挑战：
  - 数据冲突（两边同时写同一行）
  - 同步延迟（异地双活的网络延迟）
  - 脑裂（网络分区时两边都认为自己是主）

适用：RTO = 0、RPO = 0 的核心系统
组件：TiDB 多机房、MySQL Group Replication
```

### 3.3 多活模式（Multi-Active）

```
城市 A（完整服务）←→ 城市 B（完整服务）←→ 城市 C（完整服务）
  ↕ 数据同步（异步 + 冲突解决）

每个城市能独立服务本城市用户 → 城市故障不影响其他城市

核心挑战：
  - 用户路由（用户请求到哪个城市？）
  - 数据同步（跨城市延迟 10-50ms）
  - 数据一致性（异步复制 → 最终一致）

适用：超大流量、城市级容灾
代表：阿里单元化架构、字节多活架构
```

### 3.4 异地多活的关键技术

```
1. 用户路由
   → DNS 调度：按用户 IP 就近路由
   → CDN 调度：静态资源就近
   → 应用层路由：API Gateway 按用户 ID 哈希路由

2. 数据同步
   → 按用户分片：同一用户的数据在一个城市
   → 跨城市同步：异步复制 + 冲突解决（Last-Write-Wins / CRDT）

3. 降级预案
   → 城市故障 → 流量切到其他城市
   → 降级非核心功能（推荐、个性化）保核心功能（交易、支付）
   → 限流保护（故障恢复后流量回涌）
```

## 四、降级、熔断、限流

### 4.1 三者的区别

| 机制 | 触发条件 | 行为 | 目的 |
|------|---------|------|------|
| **降级** | 非核心服务不可用 | 返回默认值/缓存/简化逻辑 | 保核心功能 |
| **熔断** | 下游服务连续失败 | 快速失败，不再调用 | 防止雪崩 |
| **限流** | 流量超过系统容量 | 拒绝多余请求 | 保护系统 |

### 4.2 降级预案设计

```java
/**
 * 降级策略：核心链路优先保证，非核心功能可降级。
 *
 * 降级层级：
 *   L0：不降级（核心功能必须可用）
 *   L1：功能降级（返回缓存/默认值）
 *   L2：服务降级（跳过非核心依赖）
 *   L3：全站降级（只保留最核心功能）
 */
public class DegradationManager {

    private final CircuitBreaker paymentCircuit;   // 支付熔断器
    private final CircuitBreaker recommendCircuit; // 推荐熔断器

    public OrderDetail getOrderWithDegradation(String orderId) {
        OrderDetail detail = orderRepo.findById(orderId);  // L0 不降级

        // 支付信息：L0 不降级，但熔断后返回缓存
        if (paymentCircuit.isOpen()) {
            detail.setPaymentInfo(getCachedPayment(orderId));  // L1 降级
        } else {
            detail.setPaymentInfo(paymentService.query(orderId));
        }

        // 推荐商品：L2 可直接跳过
        if (!recommendCircuit.isOpen()) {
            try {
                detail.setRecommendations(recommendService.query(orderId));
            } catch (Exception e) {
                detail.setRecommendations(Collections.emptyList());  // L2 降级
            }
        }

        return detail;
    }
}
```

### 4.3 限流算法

```java
/**
 * 令牌桶限流：恒定速率放入令牌，请求消耗令牌。
 * 允许突发流量（桶里有存量令牌时）。
 */
@Component
public class TokenBucketRateLimiter {

    private final int capacity;         // 桶容量（最大突发）
    private final int refillRate;       // 每秒放入令牌数
    private int tokens;
    private long lastRefillTime;

    public synchronized boolean tryAcquire() {
        refill();
        if (tokens > 0) {
            tokens--;
            return true;
        }
        return false;  // 限流：拒绝请求
    }

    private void refill() {
        long now = System.currentTimeMillis();
        long elapsed = now - lastRefillTime;
        int newTokens = (int) (elapsed / 1000 * refillRate);
        tokens = Math.min(capacity, tokens + newTokens);
        lastRefillTime = now;
    }
}
```

## 五、混沌工程：主动故障演练

### 5.1 为什么需要混沌工程

```
高可用设计得再好，不演练 = 不知道管不管用。

混沌工程的核心：主动注入故障 → 验证系统的韧性

不是「搞破坏」——是在可控环境下验证：
  1. 故障检测是否及时？
  2. 故障转移是否自动？
  3. 降级预案是否生效？
  4. 恢复后数据是否一致？
```

### 5.2 故障注入场景

| 故障类型 | 注入方式 | 验证目标 |
|---------|---------|---------|
| 进程杀死 | kill Pod | 自动重启 + 流量切换 |
| 网络延迟 | tc delay | 超时处理 + 熔断 |
| 网络分区 | iptables drop | 分区容忍 + 数据一致性 |
| CPU 打满 | stress --cpu | 限流 + 降级 |
| 磁盘满 | dd if=/dev/zero | 监控告警 + 清理策略 |
| 依赖挂了 | 关闭下游服务 | 降级预案 |

### 5.3 混沌工程四原则

```
1. 建立稳态假设：系统在正常情况下的指标基线是什么？
2. 多样化真实世界：注入的故障要模拟真实故障（不是随便 kill 进程）
3. 在生产环境运行：预演环境和生产环境的差异会导致演练结果不可信
4. 持续自动化：混沌工程不是一次性的——是持续集成的一部分
```

## 六、备份与恢复

### 6.1 3-2-1 备份规则

```
3 份数据副本
2 种不同存储介质（磁盘 + 磁带 / 本地 + 云端）
1 份异地备份

示例：
  MySQL 主从（2 份）+ 每日全量备份到 OSS（第 3 份，异地）
  Redis RDB + AOF（2 份）+ 每日快照到 OSS（第 3 份）
```

### 6.2 恢复演练

```
备份不验证 = 没有备份。

每季度做一次恢复演练：
  1. 从备份恢复到一个新实例
  2. 验证数据完整性
  3. 记录恢复时间（对比 RTO 目标）
  4. 记录数据丢失量（对比 RPO 目标）
  5. 如果不达标 → 调整备份策略
```

## 结语

高可用不是「保证不出故障」——是**故障发生时系统还能继续服务**。

> 主从解决单机故障，双活解决机房故障，多活解决城市故障。降级保核心功能，熔断防雪崩，限流保系统不被冲垮。混沌工程验证设计是否真的有效，备份恢复是最后的底线。

每一个 9 都是钱堆出来的。架构师的工作是帮业务决定：哪个系统值得几个 9。
