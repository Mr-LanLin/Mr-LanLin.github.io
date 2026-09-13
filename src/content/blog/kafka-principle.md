---
title: 'Kafka 底层原理：从 Page Cache 到 Exactly-Once 的生产避坑指南'
description: 'Kafka 为什么能扛百万级 TPS？顺序写 + Page Cache + 零拷贝。但高吞吐的代价是消息可能丢、可能重复、可能乱序。acks 怎么选？ISR 缩水怎么办？消费者 Rebalance 为什么会导致重复消费？架构师视角的 Kafka 全景。'
pubDate: 2025-02-02
category: '数据库与中间件'
tags: ['Kafka', '消息队列', '底层原理', '高吞吐', '一致性']
---

> 用 Kafka 的团队很多，真正理解 Kafka 的团队很少。知道 `acks=all` 最安全但不知道它会慢 10 倍；知道消费者 Rebalance 会暂停消费但不知道它会导致重复消息；知道 ISR 机制但不知道网络抖动会让 ISR 缩成一个节点。Kafka 的坑不在「能不能用」，在「出了问题能不能定位」。

## 一、Kafka 为什么快：三个工程决策

### 1.1 顺序写磁盘

Kafka 不追求随机读写，它把消息**追加写入**日志文件末尾。顺序写的速度接近内存写入——因为磁盘磁头不需要寻道。

```
随机写：磁头移动 ~10ms/次 → 100 IOPS
顺序写：磁头不移动 ~0.1ms/次 → 10,000 IOPS

差距 100 倍。
```

### 1.2 Page Cache + 零拷贝

Kafka 不用应用层缓冲区——直接用操作系统的 Page Cache。

```
传统 IO（4 次拷贝）：
  磁盘 → 内核 Buffer → 用户 Buffer → Socket Buffer → 网卡
  ↑ CPU 参与 ↑ CPU 参与

Kafka 零拷贝（2 次拷贝）：
  磁盘 → Page Cache → 网卡（DMA 直接传输）
  ↑ CPU 不参与数据传输
```

`sendfile` 系统调用让数据从 Page Cache 直接到网卡，跳过用户空间。这就是 Kafka 单机能到 GB/s 吞吐的原因。

### 1.3 分区的并行

```
Topic: orders
  Partition 0 → Broker 1 → Consumer A
  Partition 1 → Broker 2 → Consumer B
  Partition 2 → Broker 3 → Consumer C

每个分区独立追加写入、独立消费。
N 个分区 = N 倍吞吐。
```

**关键约束**：同一个 Consumer Group 内，一个分区只能被一个消费者消费。所以消费者数量不能超过分区数——多出来的消费者空闲。

## 二、可靠性三选二：CAP 在消息队列里的体现

### 2.1 acks 的三种模式

```java
// Producer 配置
Properties props = new Properties();
props.put("bootstrap.servers", "broker1:9092");
props.put("acks", "???");  // 关键配置

props.put("retries", 3);           // 重试次数
props.put("enable.idempotence", "true");  // 幂等性（防重试导致重复）
```

| acks | 含义 | 丢消息风险 | 性能 | 适用场景 |
|------|------|-----------|------|---------|
| `0` | 发完不管 | 极高（网络丢了都不知道） | 最快 | 日志采集（允许丢） |
| `1` | Leader 确认即可 | 中（Leader 挂了且未同步到 Follower） | 快 | 普通业务 |
| `all` | ISR 全部确认 | 极低（但 ISR=1 时退化为 acks=1） | 慢 5-10x | 金融、交易 |

**生产教训**：`acks=all` + `min.insync.replicas=2` 才是真正的安全配置。如果只设 `acks=all` 但 `min.insync.replicas=1`，ISR 缩水到只剩 Leader 时，`acks=all` 退化为 `acks=1`——你以为安全了，其实没有。

### 2.2 ISR：同步副本集合

```
ISR = {Broker 1 (Leader), Broker 2, Broker 3}
  → acks=all 需要 3 个都确认

网络抖动 → Broker 3 超时
ISR = {Broker 1, Broker 2}
  → acks=all 只需 2 个确认（降级）

Broker 2 也超时
ISR = {Broker 1}
  → acks=all 退化为 acks=1！
```

**监控指标**：`UnderReplicatedPartitions`——ISR 缩水的分区数。这个值 > 0 就要告警。

### 2.3 幂等 Producer

```
acks=all + 重试 → 可能同一条消息发两次 → 消费者收到重复消息

幂等性解决：Producer 维护 (PID, Partition, SequenceNumber) 三元组。
Broker 端去重：相同三元组的消息只接受第一条。

限制：幂等性只对「同一个 Producer 实例、同一个分区」有效。
跨分区、跨 Producer 的重复，幂等性管不了。
```

## 三、消费者：Rebalance 的代价

### 3.1 Rebalance 什么时候触发

| 触发条件 | 行为 |
|---------|------|
| 消费者加入 Group | 重新分配分区 |
| 消费者退出 Group（崩溃/超时） | 重新分配分区 |
| 分区数变化（扩容） | 重新分配分区 |
| 订阅的 Topic 变化 | 重新分配分区 |

### 3.2 Rebalance 导致的问题

```
Consumer A 正在处理分区 0 的第 100 条消息（offset=100，未提交）
  → Consumer A 心跳超时
  → Group 触发 Rebalance
  → 分区 0 分配给 Consumer B
  → Consumer B 从最后提交的 offset（假设 80）开始消费
  → 第 81-100 条消息被重复消费！
```

### 3.3 解法

```java
/**
 * 消费者配置：平衡吞吐量和 Rebalance 影响。
 */
Properties consumerProps = new Properties();

// 心跳间隔：太小→频繁误判超时，太大→Rebalance 延迟
consumerProps.put("heartbeat.interval.ms", 3000);    // 默认 3s

// Session 超时：超过这个时间没心跳就被踢出 Group
consumerProps.put("session.timeout.ms", 30000);      // 默认 30s

// Max poll 间隔：两次 poll 的最大间隔，超过被认为消费者挂了
consumerProps.put("max.poll.interval.ms", 300000);   // 默认 5min

// 手动提交 offset：处理完消息再提交，而不是 poll 后自动提交
consumerProps.put("enable.auto.commit", "false");

// 消费逻辑
while (true) {
    ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
    for (ConsumerRecord<String, String> record : records) {
        process(record);  // 处理消息（可能失败、可能耗时）
    }
    // 处理完一批再提交 offset
    consumer.commitSync();  // 同步提交（确保提交成功）
}
```

**关键**：`enable.auto.commit=false` + 处理完后 `commitSync()`。这样即使 Rebalance 发生，新消费者也从「已处理完的最后位置」开始，不会重复。代价是吞吐量略降（同步提交的等待时间）。

## 四、Exactly-Once：消息队列的圣杯

### 4.1 三种语义

| 语义 | 含义 | 实现难度 |
|------|------|---------|
| At-most-once | 最多一次（可能丢） | 简单：acks=0 |
| At-least-once | 至少一次（可能重复） | 中等：acks=all + 手动提交 |
| Exactly-once | 精确一次 | 复杂：事务 + 幂等 |

### 4.2 Kafka 事务

```java
// Producer 开启事务
props.put("transactional.id", "my-transaction");
props.put("enable.idempotence", "true");

producer.initTransactions();

// 事务内：读 → 处理 → 写，原子完成
producer.beginTransaction();
try {
    // 1. 读上游 Topic
    ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));

    // 2. 处理 + 写下游 Topic
    for (ConsumerRecord<String, String> record : records) {
        String result = process(record.value());
        producer.send(new ProducerRecord<>("output-topic", record.key(), result));
    }

    // 3. 提交消费 offset + Producer 消息（原子操作）
    Map<TopicPartition, OffsetAndMetadata> offsets = currentOffsets(consumer);
    producer.sendOffsetsToTransaction(offsets, consumer.groupMetadata());
    producer.commitTransaction();  // 原子提交！
} catch (Exception e) {
    producer.abortTransaction();  // 回滚
}
```

**限制**：事务 Producer 的 `transactional.id` 必须全局唯一。同一个 `transactional.id` 的 Producer 实例只能有一个活跃——新实例启动会「杀死」旧实例（fence old producer）。

## 五、消息积压：生产最常见的告警

### 5.1 积压的原因

| 原因 | 特征 | 解法 |
|------|------|------|
| 消费速度慢于生产速度 | 持续增长 | 增加消费者/分区 |
| 消费者异常（死锁/OOM） | 突然停止增长 | 重启消费者 |
| 大消息 | 偶发尖峰 | 限制消息大小 |
| Rebalance 频繁 | 周期性波动 | 调大 session.timeout |

### 5.2 紧急处理方案

```
积压 100 万条，正常消费要 10 小时 → 等不了

方案：临时扩容消费者
1. 创建一个新 Consumer Group（比如原 group 叫 "order-processor"，新建 "order-processor-urgent"）
2. 新 Group 的消费者只做转发：读积压消息 → 写到新 Topic（多分区）
3. 原消费者 Group 从新 Topic 消费（分区更多 = 并行度更高）
4. 积压消化完后，切回原链路

或者更简单：
临时把原 Topic 的分区数从 10 扩到 50，消费者从 5 扩到 50。
注意：分区扩容后，旧消息的分区不会变——只有新消息按新分区数分配。
所以扩容分区对消化积压帮助有限，扩消费者 Group 更直接。
```

## 六、Kafka vs RocketMQ vs RabbitMQ 选型

| 维度 | Kafka | RocketMQ | RabbitMQ |
|------|-------|----------|----------|
| **吞吐** | 百万级 TPS | 十万级 TPS | 万级 TPS |
| **延迟** | 毫秒级（批量刷盘） | 毫秒级 | 微秒级 |
| **消息可靠性** | 高（acks=all + ISR） | 高（同步刷盘） | 高（确认机制） |
| **消息顺序** | 分区内有序 | 分区内有序 | 队列内有序 |
| **消息堆积能力** | 极强（磁盘存储） | 强 | 弱（内存为主） |
| **事务消息** | 不支持（有 Producer 事务） | 支持（半消息机制） | 不支持 |
| **适用场景** | 日志、数据管道、事件溯源 | 交易、订单、金融 | 任务队列、RPC |

**架构师的判断**：
- 数据管道/日志/大数据 → Kafka（吞吐为王）
- 交易/订单/需要事务消息 → RocketMQ（事务消息是杀手锏）
- 轻量级任务分发/微服务通信 → RabbitMQ（简单、延迟低）

## 结语

Kafka 不是「装了就能用」的消息队列。

> 顺序写 + Page Cache + 零拷贝给了 Kafka 百万级 TPS 的能力，但这份能力的代价是：ack 配置错了会丢消息、Rebalance 没处理好会重复消费、ISR 缩水了会静默降级、事务用错了会阻塞整个 Producer。

每一个配置项都是吞吐、延迟、可靠性之间的取舍。知道 Kafka 为什么快，更要知道它在什么情况下会慢、什么情况下会丢消息——这才是架构师该关心的事。
