---
title: 'Java 多线程实战：从 ForkJoin 到自定义线程池的完整指南'
description: 'ForkJoinPool 的 work-stealing 怎么工作？CompletableFuture 的链式编排怎么写？自定义线程池的 7 个参数怎么配？线程池满了怎么办？从原理到坑到生产配置，不讲教科书定义，只讲真正会踩的坑。'
pubDate: 2025-11-02
category: '后端'
tags: ['Java', '多线程', '线程池', 'ForkJoin', 'CompletableFuture']
---

> Java 多线程是面试必问、生产必踩的领域。很多人背得出线程池的 7 个参数，但不知道 `corePoolSize=0` 会导致空闲线程全部死亡；很多人用 `CompletableFuture` 写链式调用，但不知道默认用 `ForkJoinPool.commonPool()` 会被慢任务拖死。这篇文章从原理到实战，覆盖每一个会踩的坑。

## 一、线程池的核心：不是创建线程，是管理线程

### 1.1 为什么不用 new Thread

```java
// ❌ 每次请求 new Thread
for (Request req : requests) {
    new Thread(() -> process(req)).start();
}
// 问题：
//   1. 线程创建/销毁开销 ~1ms/次，高并发下成为瓶颈
//   2. 10000 并发 = 10000 线程 → 每个线程 1MB 栈 → 10GB 内存 → OOM
//   3. 无线程数控制 → 系统负载不可控
```

### 1.2 ThreadPoolExecutor 的 7 个参数

```java
ThreadPoolExecutor executor = new ThreadPoolExecutor(
    5,              // corePoolSize：核心线程数（不被回收）
    10,             // maximumPoolSize：最大线程数
    60,             // keepAliveTime：非核心线程空闲存活时间
    TimeUnit.SECONDS,
    new LinkedBlockingQueue<>(100),  // workQueue：任务队列
    new ThreadFactoryBuilder().setNameFormat("biz-%d").build(),  // threadFactory
    new CallerRunsPolicy()  // handler：拒绝策略
);
```

| 参数 | 作用 | 踩坑点 |
|------|------|--------|
| `corePoolSize` | 常驻线程数 | 设 0 会导致空闲时所有线程死亡，新任务要重新创建 |
| `maximumPoolSize` | 线程数上限 | 只有队列满了才会创建非核心线程 |
| `keepAliveTime` | 非核心线程空闲超时 | 对核心线程无效（除非 `allowCoreThreadTimeOut=true`） |
| `workQueue` | 任务缓冲队列 | `LinkedBlockingQueue` 无界 → 内存 OOM；`SynchronousQueue` 不缓冲 → 直接创建线程 |
| `threadFactory` | 线程命名 | 不命名 → 排查时全是 `pool-1-thread-3`，分不清哪个业务 |
| `handler` | 拒绝策略 | 默认 `AbortPolicy` 抛异常 → 请求丢失 |

### 1.3 任务提交流程（面试必考）

```
submit(task)
  → 当前线程数 < corePoolSize？
    → 是 → 创建核心线程执行
    → 否 → 队列满了吗？
      → 否 → 放入队列等待
      → 是 → 当前线程数 < maximumPoolSize？
        → 是 → 创建非核心线程执行
        → 否 → 执行拒绝策略
```

**关键理解**：队列是「核心线程」和「最大线程」之间的缓冲。不是线程不够了才排队——是核心线程都在忙，才排队。队列满了，才考虑创建更多线程。

## 二、ForkJoinPool：分治法的工程实现

### 2.1 Work-Stealing 算法

```
ForkJoinPool 的每个线程有自己的双端队列（Deque）：

Thread A: [task1, task2, task3, task4]  ← 自己从尾部取（LIFO）
Thread B: []  ← 空闲了，从 Thread A 的头部偷（FIFO）

为什么自己 LIFO、偷窃 FIFO？
  - 自己 LIFO：最近 Fork 的子任务大概率还没执行，数据在缓存里，快
  - 偷窃 FIFO：偷最老的任务，避免和主人抢最近的任务（减少竞争）
```

### 2.2 递归拆分

```java
/**
 * 并行归并排序：ForkJoin 的经典场景。
 * 大数组 → 拆成两半 → 分别排序 → 合并。
 */
public class ParallelMergeSort extends RecursiveAction {

    private final int[] array;
    private final int start, end;
    private static final int THRESHOLD = 1000;  // 小于此值直接排序

    @Override
    protected void compute() {
        if (end - start <= THRESHOLD) {
            Arrays.sort(array, start, end);  // 小数组直接排序
            return;
        }

        int mid = (start + end) / 2;
        ParallelMergeSort left = new ParallelMergeSort(array, start, mid);
        ParallelMergeSort right = new ParallelMergeSort(array, mid, end);

        // Fork：把子任务投入线程池
        left.fork();
        right.compute();  // 当前线程执行右边（不 fork，减少一次调度）
        left.join();      // 等待左边完成

        merge(array, start, mid, end);  // 合并
    }
}

// 使用
ForkJoinPool pool = new ForkJoinPool(Runtime.getRuntime().availableProcessors());
pool.invoke(new ParallelMergeSort(array, 0, array.length));
```

**适用场景**：任务可以递归拆分，且子任务相互独立。归并排序、快速排序、大文件并行解析、树形结构遍历。

**不适用**：IO 密集型任务（ForkJoinPool 的线程被 IO 阻塞 → work-stealing 无法弥补）。

## 三、CompletableFuture：异步编排的瑞士军刀

### 3.1 从 Future 到 CompletableFuture

```java
// ❌ 传统 Future：阻塞等待
Future<String> future = executor.submit(() -> callRemoteAPI());
String result = future.get();  // 阻塞！不知道什么时候完成

// ✅ CompletableFuture：链式异步编排
CompletableFuture<String> future = CompletableFuture
    .supplyAsync(() -> callRemoteAPI())     // 异步执行
    .thenApply(result -> parseJSON(result))  // 完成后处理
    .thenCompose(parsed -> fetchDetail(parsed.getId()))  // 链式调用
    .exceptionally(ex -> { log.error(ex); return "fallback"; });  // 异常处理
```

### 3.2 多任务组合

```java
// 并行查询三个服务，全部完成后汇总
CompletableFuture<UserInfo> userInfo = CompletableFuture.supplyAsync(() -> getUser(userId));
CompletableFuture<List<Order>> orders = CompletableFuture.supplyAsync(() -> getOrders(userId));
CompletableFuture<List<Address>> addresses = CompletableFuture.supplyAsync(() -> getAddresses(userId));

// allOf：等待全部完成
CompletableFuture<Void> all = CompletableFuture.allOf(userInfo, orders, addresses);
all.thenRun(() -> {
    UserDetail detail = new UserDetail(
        userInfo.join(),    // join = get，但 here 一定已完成，不会阻塞
        orders.join(),
        addresses.join()
    );
    // 返回汇总结果
});

// anyOf：任何一个完成就返回（最快的那个）
CompletableFuture<Object> fastest = CompletableFuture.anyOf(serviceA, serviceB, serviceC);
```

### 3.3 致命陷阱：默认线程池

```java
// ❌ 不指定线程池 → 用 ForkJoinPool.commonPool()
CompletableFuture.supplyAsync(() -> slowIOOperation());
// commonPool 的线程数 = CPU 核数 - 1
// 一个慢 IO 任务阻塞一个线程 → 其他所有异步任务都被拖慢

// ✅ 指定业务线程池
ExecutorService bizPool = new ThreadPoolExecutor(
    10, 20, 60, TimeUnit.SECONDS,
    new LinkedBlockingQueue<>(1000),
    new ThreadFactoryBuilder().setNameFormat("async-biz-%d").build()
);

CompletableFuture.supplyAsync(() -> slowIOOperation(), bizPool);
```

**生产教训**：IO 密集型任务用自定义线程池（线程数 = 2×CPU 核数或更多）；CPU 密集型任务用 `ForkJoinPool.commonPool()` 或 `Executors.newWorkStealingPool()`。

## 四、虚拟线程：Java 21 的范式转变

```java
// Java 21 虚拟线程（Project Loom）
Thread.startVirtualThread(() -> {
    String result = callRemoteAPI();  // 阻塞？没关系，虚拟线程自动挂起
    process(result);
});

// 或用 ExecutorService
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    for (Request req : requests) {
        executor.submit(() -> process(req));  // 百万并发也不 OOM
    }
}
```

**虚拟线程 vs 平台线程**：

| 维度 | 平台线程 | 虚拟线程 |
|------|---------|---------|
| 映射 | 1:1 OS 线程 | M:N 多路复用 |
| 阻塞 | 阻塞 OS 线程 | 自动挂起，不占 OS 线程 |
| 数量 | 几千就 OOM | 百万级 |
| 适用 | CPU 密集 | IO 密集（HTTP 调用、DB 查询） |
| JDK 版本 | 所有版本 | 21+（正式） |

**架构师的判断**：Java 21+ 的 IO 密集型服务，优先用虚拟线程替代线程池。CPU 密集型任务仍然用平台线程池。

## 五、生产配置清单

| 场景 | corePoolSize | maxPoolSize | 队列类型 | 队列大小 |
|------|-------------|-------------|---------|---------|
| CPU 密集（计算） | CPU 核数 | CPU 核数 | 有界 | 0（SynchronousQueue） |
| IO 密集（HTTP 调用） | CPU×2 | CPU×4 | 有界 | 200 |
| 混合负载 | CPU×2 | CPU×8 | 有界 | 500 |
| 定时任务 | 1 | 1 | 无界 | — |
| 虚拟线程（Java 21+） | — | — | — | `newVirtualThreadPerTaskExecutor()` |

**拒绝策略选择**：

| 策略 | 行为 | 适用 |
|------|------|------|
| `AbortPolicy`（默认） | 抛 RejectedExecutionException | 不能丢任务的场景（配合重试） |
| `CallerRunsPolicy` | 调用者线程执行 | 允许背压的场景（自然限流） |
| `DiscardPolicy` | 静默丢弃 | 日志、监控等允许丢的场景 |
| `DiscardOldestPolicy` | 丢弃最老的任务 | 新数据比旧数据重要的场景 |

## 结语

线程池不是「配几个参数就完事」的组件。

> ForkJoinPool 的 work-stealing 让 CPU 密集型任务自动负载均衡，CompletableFuture 让异步编排从嵌套回调变成链式调用，但默认线程池的陷阱能让整个系统被一个慢任务拖死，虚拟线程则从根本上改变了 IO 密集型任务的编程模型。

理解每种线程模型的适用边界，比记住 API 更重要。
