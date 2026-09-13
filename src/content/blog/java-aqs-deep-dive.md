---
title: 'AQS 深度拆解：Java 并发包的基石'
description: 'ReentrantLock、CountDownLatch、Semaphore、ArrayBlockingQueue——它们的底层都是 AQS。state 变量 + CLH 队列 + 模板方法模式，三个核心组件如何实现公平锁、非公平锁、共享锁、独占锁。理解了 AQS，就理解了整个 java.util.concurrent。'
pubDate: 2025-10-12
category: '后端'
tags: ['Java', 'AQS', '并发', 'ReentrantLock', 'CLH队列']
---

> `java.util.concurrent` 包里的十几个并发工具类，底层全是 AQS（AbstractQueuedSynchronizer）。ReentrantLock 是独占锁，CountDownLatch 是共享锁，Semaphore 是计数信号量——它们只是 AQS 的不同实现。理解 AQS 的 state + CLH 队列 + 模板方法，就理解了整个 JUC 并发包。

## 一、AQS 的三根支柱

```
┌─────────────────────────────────────┐
│           AQS 核心组件               │
│                                     │
│  1. state（volatile int）            │
│     - 同步状态：0=无锁，1=有锁        │
│     - ReentrantLock：重入次数         │
│     - Semaphore：剩余许可数           │
│     - CountDownLatch：剩余计数        │
│                                     │
│  2. CLH 队列（双向链表）              │
│     - 等待锁的线程排成队列             │
│     - 每个节点 = 线程 + 等待状态       │
│     - 队列头 = 当前持有锁的线程        │
│                                     │
│  3. 模板方法                          │
│     - tryAcquire()：尝试获取锁        │
│     - tryRelease()：尝试释放锁        │
│     - acquireShared()：共享模式获取    │
│     - releaseShared()：共享模式释放    │
│     子类只需实现这些方法               │
└─────────────────────────────────────┘
```

## 二、state 变量：一切同步的根源

```java
// AQS 的核心就是一个 volatile int
private volatile int state;

// 不同工具对 state 的不同含义：

// ReentrantLock（独占）：
//   state = 0 → 无锁
//   state = 1 → 被某线程持有
//   state = N → 被同一线程重入 N 次

// Semaphore（共享）：
//   state = N → 还剩 N 个许可
//   state = 0 → 所有许可被占用

// CountDownLatch（共享）：
//   state = N → 还有 N 个线程未完成
//   state = 0 → 全部完成，await 放行
```

## 三、CLH 队列：线程排队的工程实现

### 3.1 节点结构

```java
// AQS 队列中的每个节点
static final class Node {
    volatile int waitStatus;  // 等待状态
    volatile Node prev;       // 前驱
    volatile Node next;       // 后继
    volatile Thread thread;   // 关联的线程

    // waitStatus 值：
    //   0       → 初始状态
    //  -1 (SIGNAL) → 后继线程需要被唤醒
    //  -2 (CONDITION) → 在 Condition 队列中
    //  -3 (PROPAGATE) → 共享模式下需要传播唤醒
    //  >0 (CANCELLED) → 线程已取消（超时/中断）
}
```

### 3.2 入队流程

```
线程 A 获取锁失败 → 封装成 Node → 加入 CLH 队列尾部

tail → [Head(NodeA)] → [NodeB(thread=B, waitStatus=0)] → null

1. 创建 Node，thread = 当前线程
2. CAS 尝试把 Node 设为 tail
3. 如果失败（其他线程也在入队）→ 自旋重试
4. 入队后 → 检查前驱节点
   - 前驱是 Head → 再试一次获取锁（可能 Head 刚释放）
   - 前驱不是 Head → park() 阻塞等待
```

### 3.3 唤醒流程

```
线程 A 释放锁 → unparkSuccessor(h)

Head → [NodeA(已释放)] → [NodeB(thread=B, waitStatus=SIGNAL)] → [NodeC]

1. 找到 Head 的下一个有效节点（跳过 CANCELLED 的）
2. LockSupport.unpark(nodeB.thread) → 唤醒线程 B
3. 线程 B 醒来 → 尝试获取锁 → 成功 → 把自己设为新的 Head
```

**为什么用 CLH 而不是自旋？** 自旋在锁持有时间短时高效（不需要线程切换），但在锁竞争激烈时浪费 CPU。AQS 的策略是：先自旋几次，拿不到再入队阻塞——兼顾了两种场景。

## 四、独占锁 vs 共享锁

### 4.1 独占锁（ReentrantLock）

```java
// acquire() 的简化流程
public final void acquire(int arg) {
    if (!tryAcquire(arg)) {           // 1. 尝试获取锁
        addWaiter(Node.EXCLUSIVE);    // 2. 失败 → 入队
        acquireQueued(addWaiter(Node.EXCLUSIVE), arg);  // 3. 阻塞等待
    }
}

// tryAcquire 的实现（ReentrantLock.NonfairSync）
protected boolean tryAcquire(int acquires) {
    int c = getState();
    if (c == 0) {  // 无锁
        if (compareAndSetState(0, acquires)) {  // CAS 抢锁
            setExclusiveOwnerThread(current);   // 标记持有者
            return true;
        }
    } else if (current == getExclusiveOwnerThread()) {
        // 重入：同一线程再次获取
        setState(c + acquires);
        return true;
    }
    return false;
}
```

### 4.2 共享锁（CountDownLatch）

```java
// CountDownLatch.await() → acquireSharedInterruptibly(1)
protected boolean tryReleaseShared(int releases) {
    for (;;) {
        int c = getState();
        if (c == 0) return false;  // 已经为 0，无需再释放
        int nextc = c - 1;
        if (compareAndSetState(c, nextc)) {
            return nextc == 0;  // 减到 0 → 唤醒所有等待线程
        }
    }
}

// 当 state 减到 0 时：
// doReleaseShared() → 唤醒队列中所有共享模式的节点
// → 所有 await() 的线程同时放行
```

**关键区别**：独占锁唤醒一个线程，共享锁唤醒所有线程。这就是为什么 `CountDownLatch.countDown()` 到最后一次时，所有 `await()` 的线程同时被唤醒。

## 五、AQS 的子类全景

| 工具类 | 锁模式 | state 含义 | tryAcquire/Release |
|--------|--------|-----------|-------------------|
| **ReentrantLock** | 独占 | 重入次数 | CAS state 0→1，可重入累加 |
| **ReentrantReadWriteLock.ReadLock** | 共享 | 读线程计数 | 无写锁时可多读 |
| **ReentrantReadWriteLock.WriteLock** | 独占 | 写锁持有 | 无读写锁时可写 |
| **CountDownLatch** | 共享 | 剩余计数 | 递减到 0 放行 |
| **Semaphore** | 共享 | 剩余许可数 | 有许可则减 1 |
| **ArrayBlockingQueue** | 独占（两把锁） | 空/满 | put 锁 + take 锁分离 |

## 六、手写一个简化版 AQS

```java
/**
 * 简化版独占锁：帮助理解 AQS 的核心流程。
 * 省略了 CLH 队列的完整实现（用 synchronized 代替排队）。
 */
public class SimpleMutex {

    private volatile int state = 0;
    private Thread owner = null;

    public void lock() {
        // 1. 快速路径：CAS 抢锁
        if (compareAndSwapState(0, 1)) {
            owner = Thread.currentThread();
            return;
        }
        // 2. 慢速路径：自旋等待
        while (!compareAndSwapState(0, 1)) {
            LockSupport.parkNanos(1000);  // 自旋 + 短暂挂起
        }
        owner = Thread.currentThread();
    }

    public void unlock() {
        if (Thread.currentThread() != owner)
            throw new IllegalMonitorStateException();
        owner = null;
        state = 0;  // volatile 写，对其他线程可见
        LockSupport.unpark(nextThreadInQueue());  // 唤醒等待线程
    }

    private boolean compareAndSwapState(int expected, int update) {
        // 实际用 Unsafe.compareAndSwapInt
        return UNSAFE.compareAndSwapInt(this, stateOffset, expected, update);
    }
}
```

## 结语

AQS 不是「一个类」——是一个**并发编程的框架**。

> state 变量定义了「什么是锁」，CLH 队列定义了「拿不到锁怎么办」，模板方法定义了「子类怎么定制锁的行为」。ReentrantLock、CountDownLatch、Semaphore 只是 AQS 的三种「配置」——改变 state 的含义和 tryAcquire 的逻辑，就得到了完全不同的并发工具。

理解了 AQS，`java.util.concurrent` 包就不再是十几个孤立的类——而是一棵以 AQS 为根的树。
