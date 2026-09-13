---
title: 'Java 并发编程实战:线程池的正确打开方式'
description: '从一次线上 OOM 说起,拆解 ThreadPoolExecutor 的底层原理、参数配法、踩过的坑,以及为什么你该远离 Executors 那几个快捷方法。'
pubDate: 2025-11-23
category: '后端'
tags: ['Java', '并发']
---

前阵子我们有个下单服务隔三差五就内存告警,OOM 之后重启又能撑几天,反反复复。一开始以为是慢 SQL 或者大对象,抓了堆 dump 一看,罪魁祸首是内存里堆了**几十万个待执行的 Runnable**,而它们的主人,是一个看起来人畜无害的调用:

```java
ExecutorService pool = Executors.newFixedThreadPool(100);
```

就是这一行,让任务的**堆积速度远远超过了消费速度**,队列里越积越多,最后把堆撑爆。

这次事故之后,把线程池从头到尾啃了一遍。这篇文章,就把踩过的坑、搞懂的底层原理,一次讲清楚。

## 一、线程池为什么存在

直觉上,"要并发就 new Thread" 不就行了?但线程是有成本的,而且不便宜:

- **创建/销毁慢**:线程要分配内核资源,栈空间默认 1M,频繁创建销毁开销很大
- **数量不可控**:请求高峰一来,如果来一个任务就 new 一个线程,分分钟把 CPU 和内存打满
- **缺少统一管理**:没有队列缓冲、没有超时回收、没有拒绝策略

线程池的本质,就是**用固定的一批线程,循环消费队列里的任务**,把"线程的创建销毁"这个昂贵的动作,摊薄到每一个任务上。

## 二、一个任务提交后,到底发生了什么

看源码比背概念有用。`ThreadPoolExecutor.execute()` 的流程,精简下来是这样的:

```java
public void execute(Runnable command) {
    int c = ctl.get();
    // 1. 核心线程没满,直接新建 Worker 干活
    if (workerCountOf(c) < corePoolSize) {
        if (addWorker(command, true)) return;
        c = ctl.get();
    }
    // 2. 核心线程满了,尝试入队
    if (isRunning(c) && workQueue.offer(command)) {
        int recheck = ctl.get();
        if (!isRunning(recheck) && remove(command))
            reject(command);
        else if (workerCountOf(recheck) == 0)
            addWorker(null, false);   // 队列有活但没线程,补一个
    }
    // 3. 入队也失败(队列满了),尝试扩容到最大线程数
    else if (!addWorker(command, false))
        reject(command);              // 4. 还是不行,拒绝
}
```

一句话概括执行顺序:**核心线程 → 队列 → 最大线程 → 拒绝**。

这里有个反直觉的点:**队列是在"核心线程满了"和"最大线程扩容"之间的缓冲**,所以你的队列是什么类型,直接决定了整个线程池的行为。

## 三、那几个参数,别只会背

`ThreadPoolExecutor` 的 7 个参数,最关键的其实就 4 个:

```java
new ThreadPoolExecutor(
    corePoolSize,      // 核心线程数:常驻线程,空闲也不回收
    maximumPoolSize,   // 最大线程数:只有队列满了才会扩到这么多
    keepAliveTime,     // 非核心线程空闲多久回收
    unit,
    workQueue,         // 任务队列(重点!)
    threadFactory,     // 线程工厂
    handler            // 拒绝策略
);
```

**参数怎么定**,一般分两步:

第一步,判断任务类型,给一个起步值:

```java
int cores = Runtime.getRuntime().availableProcessors();
// CPU 密集型(计算为主):线程数 ≈ CPU 核数 + 1,再多只会互相抢 CPU
// IO 密集型(等待为主):线程数 ≈ CPU 核数 * 2,或核数 / (1 - 阻塞系数)
```

第二步,也是更重要的:**拿这个值去压测,再调整**。公式只是起点,不是答案。就见过照着公式配 32 个线程、压测发现 16 个就到顶了的场景——因为瓶颈根本不在线程数,而在下游数据库。

## 四、踩过的三个坑

### 坑一:无界队列 = 定时炸弹

`Executors.newFixedThreadPool(n)` 和 `newSingleThreadExecutor()` 底层用的都是 **无界的 `LinkedBlockingQueue`**。这意味着:

> 只要任务生产速度 > 消费速度,队列就会无限堆积,直到 OOM。`maximumPoolSize` 在这个场景下**根本不生效**,因为队列永远塞不满。

那次 OOM,就是栽在这。所以一条基本的原则是:**生产环境,一律显式用 `ArrayBlockingQueue`(有界),并且把队列容量当成一个必须想清楚的参数**,而不是默认。

### 坑二:corePoolSize 配太大

有次优化,同事觉得"线程越多越快",把 `corePoolSize` 从 8 调到 200。结果服务没变快,反而**线程频繁上下文切换,CPU 被打满**,正常请求的响应时间反而涨了。

线程不是免费的,常驻线程多了,光上下文切换就能吃掉不少 CPU。

### 坑三:拒绝策略用错,静默丢数据

默认的 `AbortPolicy` 会抛 `RejectedExecutionException`,但这异常**不一定有人接**。如果上层没 catch,任务就"悄悄"没了。有一次对账发现少了一批数据,追了半天,就是拒绝策略把任务丢了还没人知道。

## 五、拒绝策略怎么选

队列满、线程也满时,四种内置策略:

| 策略 | 行为 | 评价 |
|------|------|---------|
| `AbortPolicy`(默认) | 抛异常 | 最诚实,但要保证上层能接住异常 |
| `CallerRunsPolicy` | 交给提交线程自己跑 | **天然背压**,线上最常用 |
| `DiscardPolicy` | 静默丢弃 | 危险,丢了都不知道 |
| `DiscardOldestPolicy` | 丢最老的 | 更危险,可能丢关键任务 |

更推荐的做法是**用 `CallerRunsPolicy`**:当线程池扛不住时,让提交方(往往就是业务线程)自己执行,相当于把压力反推回去,形成天然的限流,而不是默默把任务吞掉。

## 六、一个能直接抄的生产配置

综合上面的坑,一个能直接抄的模板长这样:

```java
AtomicInteger seq = new AtomicInteger();
ThreadFactory factory = r -> new Thread(r, "order-pool-" + seq.incrementAndGet());

ThreadPoolExecutor pool = new ThreadPoolExecutor(
    Runtime.getRuntime().availableProcessors() * 2,  // core
    Runtime.getRuntime().availableProcessors() * 4,  // max
    60, TimeUnit.SECONDS,
    new ArrayBlockingQueue<>(1000),                  // 有界队列,必须
    factory,                                         // 原生线程工厂,零第三方依赖
    new ThreadPoolExecutor.CallerRunsPolicy()         // 背压
);

// 允许核心线程也超时回收,避免空闲常驻
pool.allowCoreThreadTimeOut(true);
```

注意两点:`ArrayBlockingQueue` 有界 + `CallerRunsPolicy` 兜底,这是踩过 OOM 之后留下的肌肉记忆。

## 七、配好了,还得看得见

线程池不是配完就完了,还得**监控**。至少要看两个指标:队列深度(堆积了多少任务)和活跃线程数。可以用一个定时任务把这两个值打出来:

```java
ScheduledExecutorService monitor = Executors.newSingleThreadScheduledExecutor();
monitor.scheduleAtFixedRate(() -> {
    log.info("queue={}, active={}, completed={}",
        pool.getQueue().size(),      // 队列里堆积的任务
        pool.getActiveCount(),       // 正在干活的线程
        pool.getCompletedTaskCount());
}, 10, 10, TimeUnit.SECONDS);
```

一旦发现**队列深度持续上涨**,说明生产速度超过了消费速度,不用等 OOM,现在就该拉响警报去排查了。

## 写在最后

线程池这东西,门槛不高,但坑很深。回头看,真正值得记住的就三句话:

1. **别用 `Executors` 那几个快捷方法**,无界队列是 OOM 的温床
2. **队列容量、拒绝策略、线程数,每个都要显式想清楚**,而不是用默认
3. **配上监控**,在堆爆之前就发现堆积

别只背那几个公式,去读一遍 `execute()` 的源码,你会比背十遍参数更懂它。
