---
title: 'JVM 调优实战：从 GC 日志分析到线上 OOM 排查的完整手册'
description: 'GC 日志每一行代表什么？jstat/jmap/jstack 怎么组合使用？CPU 飙高怎么定位到具体线程？内存泄漏怎么找？Young GC 正常但 Full GC 频繁怎么调？不讲理论，只讲生产环境真正用的到的排查流程。'
pubDate: 2025-10-26
category: '后端'
tags: ['JVM', 'GC', '调优', '排查', 'OOM']
---

> JVM 调优不是背参数。是拿到一个 CPU 飙高、内存泄漏、频繁 Full GC 的线上服务，用一套标准化流程在 30 分钟内定位根因。这篇文章不讲 G1 和 CMS 的算法原理——那些教科书都有。讲的是：GC 日志怎么看、JDK 工具怎么组合用、线上问题怎么一步步缩小范围。

## 一、先看懂 GC 日志

### 1.1 开启 GC 日志

```bash
# Java 8（CMS/Parallel）
-XX:+PrintGCDetails -XX:+PrintGCDateStamps -Xloggc:/data/logs/gc.log

# Java 11+（统一日志框架，所有 GC 通用）
-Xlog:gc*=info:file=/data/logs/gc.log:time,level,tags:filecount=5,filesize=100M
```

### 1.2 一条 GC 日志的完整解读

```
2025-01-15T10:30:45.123+0800: [GC (Allocation Failure) [PSYoungGen: 524288K->65536K(614400K)]
 1048576K->655360K(2048000K), 0.0234567 secs] [Times: user=0.12 sys=0.03, real=0.02 secs]

解读：
  2025-01-15T10:30:45.123+0800  → 时间戳
  GC (Allocation Failure)        → GC 原因：新生代空间不足，触发 Young GC
  PSYoungGen: 524288K->65536K(614400K)
    → 新生代：GC 前 512MB → GC 后 64MB（总容量 600MB）
    → 回收了 448MB，存活 64MB
  1048576K->655360K(2048000K)
    → 堆总量：GC 前 1GB → GC 后 640MB（总容量 2GB）
    → 注意：老年代从 512MB 增长到了 576MB（640-64），说明有对象晋升
  0.0234567 secs → GC 耗时 23ms（正常，<50ms 可接受）
  user=0.12 sys=0.03 → 用户态 120ms + 内核态 30ms = 150ms CPU 时间
    → 如果是并行 GC，user > real 是正常的（多线程并行）
```

### 1.3 哪些指标异常需要告警

| 指标 | 正常值 | 告警阈值 | 可能原因 |
|------|--------|---------|---------|
| Young GC 耗时 | <50ms | >100ms | 大对象、晋升过多 |
| Full GC 频率 | 几天一次 | >1 次/小时 | 内存泄漏、堆太小 |
| Full GC 耗时 | <1s | >5s | 堆太大、碎片化 |
| 老年代增长率 | 稳定 | 持续增长不降 | 内存泄漏 |
| GC 后存活对象 | <新生代 50% | >80% | 对象生命周期长，Young Gen 太小 |

## 二、JDK 工具组合拳

### 2.1 问题定位流程

```
线上告警 → CPU 飙高 / 内存泄漏 / 频繁 GC / 线程死锁
  → Step 1: 确认现象（jstat / top）
  → Step 2: 定位线程/对象（jstack / jmap）
  → Step 3: 分析根因（MAT / Arthas）
  → Step 4: 修复 + 验证
```

### 2.2 CPU 飙高排查

```bash
# Step 1: 找到 CPU 最高的 Java 进程
top -c  # 找到 PID，比如 12345

# Step 2: 找到进程内 CPU 最高的线程
top -Hp 12345  # 列出所有线程
# 找到 CPU 最高的线程，比如 TID = 12400

# Step 3: 将线程 ID 转为十六进制
printf "%x\n" 12400  # → 0x3070

# Step 4: 用 jstack 导出线程快照，搜十六进制线程 ID
jstack 12345 | grep -A 20 "0x3070"

# 输出示例：
# "http-nio-8080-exec-15" #12400 daemon prio=5 os_prio=0 tid=0x00007f...
#    java.lang.Thread.State: RUNNABLE
#     at com.example.service.OrderService.calculate(OrderService.java:42)
#     at com.example.controller.OrderController.detail(OrderController.java:28)
#
# 根因定位：OrderService.calculate() 第 42 行，可能是死循环或复杂计算
```

### 2.3 内存泄漏排查

```bash
# Step 1: 确认内存持续增长
jstat -gc 12345 1000 10  # 每秒采样，采 10 次
# 观察 O（Old Gen）列：如果持续增长 → 疑似泄漏

# Step 2: dump 堆内存（会触发 Full GC，有停顿！）
# 生产环境用 -live 只 dump 存活对象，减小文件体积
jmap -dump:live,format=b,file=/tmp/heap.hprof 12345

# Step 3: 用 MAT（Eclipse Memory Analyzer）分析
#   1. 打开 heap.hprof
#   2. Leak Suspects Report → 自动分析可疑泄漏
#   3. Dominator Tree → 按对象大小排序
#   4. 找到最大对象 → 查看 GC Roots 引用链
#   5. 确定是哪个集合/缓存/静态变量持有大量对象
```

**MAT 分析套路**：
```
Leak Suspects 报告 → 指出哪个对象占了最多堆
  → 展开 → 看 Dominator Tree
    → 最大对象通常是 HashMap/ArrayList/ConcurrentHashMap
      → 右键 → "Path to GC Roots" → 看是谁持有它
        → 通常是：
          - Spring Bean 的成员变量（缓存没设上限）
          - ThreadLocal 没 remove
          - 静态集合只增不删
          - 监听器/回调没注销
```

### 2.4 线程死锁排查

```bash
# jstack 直接检测死锁
jstack 12345 | grep -A 10 "deadlock\|Found one Java-level deadlock"

# 输出示例：
# Found one Java-level deadlock:
# "Thread-A": waiting to lock Monitor@0x00007f... (object 0x00000007ab...)
#   which is held by "Thread-B"
# "Thread-B": waiting to lock Monitor@0x00007f... (object 0x00000007cd...)
#   which is held by "Thread-A"
#
# 根因：Thread-A 持有 lock1 等 lock2，Thread-B 持有 lock2 等 lock1 → 死锁
```

## 三、Arthas：线上诊断利器

### 3.1 为什么用 Arthas 而不是 JDK 工具

| 能力 | JDK 工具 | Arthas |
|------|---------|--------|
| 实时方法耗时 | ❌ | ✅ `trace` |
| 方法入参/返回值 | ❌ | ✅ `watch` |
| 热更新代码 | ❌ | ✅ `redefine` |
| 线程 CPU 占用 | 需手动换算 | ✅ `thread -n 3` |
| 类加载冲突 | 需手动分析 | ✅ `classloader` + `sc` |

### 3.2 常用命令

```bash
# 启动 Arthas
java -jar arthas-boot.jar  # 选择目标 Java 进程

# 查看最耗 CPU 的 3 个方法
trace com.example.service.OrderService '*' -n 3

# 监控方法入参和返回值
watch com.example.service.OrderService calculate '{params, returnObj}' -x 3

# 查看方法调用链路
stack com.example.service.OrderService calculate

# 热更新：替换某个类（不改代码、不重启）
redefine /tmp/OrderService.class

# 查看线程 CPU 占用
thread -n 3

# 查看类加载信息
sc -d com.example.service.OrderService
```

## 四、JVM 参数调优

### 4.1 堆大小

```bash
# 原则：堆 = 老年代峰值 × 1.5 ~ 2（留 GC 空间）
# 不是越大越好——堆越大，Full GC 越慢

# 推荐配置（8GB 内存的机器）
-Xms4g -Xmx4g           # 堆固定 4GB（避免动态扩缩的开销）
-XX:MetaspaceSize=256m  # 元空间（类信息）
-XX:MaxMetaspaceSize=512m
```

### 4.2 新生代比例

```bash
# 新生代太小 → 对象过早晋升到老年代 → Full GC 频繁
# 新生代太大 → Young GC 耗时长

# 经验值：新生代 = 堆的 1/3 ~ 1/2
-XX:NewRatio=2          # 新生代:老年代 = 1:2（新生代占 1/3）
-XX:SurvivorRatio=8     # Eden:Survivor = 8:1:1
```

### 4.3 GC 选择

| GC | 适用 JDK | 特点 | 推荐场景 |
|-----|---------|------|---------|
| **Parallel** | 8+（默认） | 吞吐优先，STW 长 | 批处理、后台任务 |
| **CMS** | 8（已废弃） | 低延迟，碎片化 | 老系统（逐步迁移） |
| **G1** | 8+ | 平衡吞吐和延迟，可预测暂停 | 大部分应用（推荐） |
| **ZGC** | 15+（生产） | 亚毫秒暂停，几乎无 STW | 低延迟要求极高 |
| **Shenandoah** | 15+ | 类似 ZGC，Red Hat 主导 | 低延迟要求极高 |

```bash
# G1（Java 8+ 推荐）
-XX:+UseG1GC
-XX:MaxGCPauseMillis=100     # 目标最大暂停时间（不是保证值）
-XX:G1HeapRegionSize=4m      # Region 大小（默认自适应，一般不用改）
-XX:InitiatingHeapOccupancyPercent=45  # 触发并发标记的堆占比

# ZGC（Java 21+ 推荐，如果延迟要求极高）
-XX:+UseZGC
-XX:+ZGenerational         # Java 21 分代 ZGC
-XX:MaxGCPauseMillis=10    # ZGC 可以轻松达到 10ms 以下
```

## 五、生产调优 Checklist

### 5.1 上线前

- [ ] `-Xms` = `-Xmx`（避免动态扩缩）
- [ ] 选对 GC（8→G1，21→ZGC 或 G1）
- [ ] GC 日志开启（`-Xlog:gc*`）
- [ ] OOM 时自动 dump（`-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/data/heap/`）
- [ ] 线程命名（`ThreadFactory.setNameFormat("biz-%d")`）

### 5.2 运行时监控

- [ ] JMX 监控：堆使用率、GC 频率/耗时、线程数
- [ ] 告警阈值：Full GC > 1 次/小时、堆使用率 > 80%、线程数 > 500
- [ ] 定期 heap dump 对比（每周一次，观察趋势）

### 5.3 紧急响应

```
Full GC 频繁（>1 次/分钟）：
  1. jstat -gc <pid> 1000 → 看哪个区在涨
  2. 老年代涨 → heap dump → MAT 分析泄漏
  3. 元空间涨 → 动态类加载过多（Groovy/反射）
  4. 无法 dump → 先扩容 -Xmx 应急，再排查

CPU 100%：
  1. top -Hp → 找线程
  2. jstack → 找代码行
  3. 常见原因：死循环、频繁 GC、锁竞争

线程堆积：
  1. jstack → grep "TIMED_WAITING\|BLOCKED" | wc -l
  2. 找 BLOCKED 的线程 → 看等哪个锁
  3. 常见原因：数据库连接池耗尽、下游超时、锁粒度过大
```

## 结语

JVM 调优不是调参数——是建立一套从告警到根因的排查体系。

> GC 日志告诉你「发生了什么」，jstat/jmap/jstack 告诉你「在哪里」，Arthas 让你「实时看」，MAT 帮你「找到根因」。参数调优是最后一步——先搞清楚为什么慢、为什么泄漏，再决定调哪个参数。

每一次线上事故都是一次学习机会。把排查流程标准化，下次遇到同样的问题，30 分钟内定位。
