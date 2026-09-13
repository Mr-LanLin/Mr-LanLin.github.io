---
title: 'Java 对象内存模型：从对象头到 GC Roots 的完整生命周期'
description: 'new 一个对象时 JVM 做了什么？对象头的 Mark Word 和 Klass Pointer 存了什么？指针压缩怎么省内存？对象的初始化顺序是什么？从创建到 GC 回收，一个 Java 对象的完整一生。'
pubDate: 2025-10-05
category: '后端'
tags: ['Java', '对象内存', '对象头', 'GC Roots', '指针压缩', 'JVM']
---

> 每个 Java 开发者每天都在 `new Object()`，但很少有人知道这一个操作背后 JVM 做了什么：检查类是否加载、计算对象大小、TLAB 分配、零值初始化、对象头设置、`<init>` 方法调用——六步走完，对象才真正可用。理解对象在内存中的布局，是理解 GC、锁升级、内存泄漏的基础。

## 一、对象的内存布局

### 1.1 三部分结构

```
┌──────────────────────────────────────────┐
│              Java 对象（堆内存）           │
│                                          │
│  ┌─ Object Header（对象头）─┐            │
│  │  Mark Word    (64 bit)   │ ← 锁状态、哈希码、GC 分代年龄  │
│  │  Klass Pointer (32/64bit)│ ← 指向方法区的类元数据         │
│  └──────────────────────────┘            │
│  ┌─ Instance Data（实例数据）─┐          │
│  │  int age        (32 bit)  │            │
│  │  String name    (64 bit*) │ ← 实际是引用（4/8 byte）     │
│  │  boolean active (8 bit)   │            │
│  └──────────────────────────┘            │
│  ┌─ Padding（对齐填充）─┐                │
│  │  补到 8 字节对齐       │ ← 空对象也要 16 字节              │
│  └──────────────────────┘                │
└──────────────────────────────────────────┘

* 引用类型在开启指针压缩后是 4 字节，否则是 8 字节
```

### 1.2 Mark Word 的多种形态

```
64 位 JVM 的 Mark Word（56 bit 可用 + 8 bit 标记）：

无锁状态：
  [HashCode(31) | 分代年龄(4) | 偏向锁标记(1) | 锁标记(2)] = 01

偏向锁状态：
  [线程ID(54) | Epoch(2) | 分代年龄(4) | 偏向锁标记(1) | 锁标记(2)] = 01

轻量级锁状态：
  [指向栈帧 Lock Record 的指针(62) | 锁标记(2)] = 00

重量级锁状态：
  [指向 Monitor 对象的指针(62) | 锁标记(2)] = 10

GC 标记状态：
  [标记指针(62) | 锁标记(2)] = 11
```

**关键洞察**：同一个 64 位的 Mark Word，在不同锁状态下存储完全不同的信息。锁升级的本质就是 Mark Word 的内容变化。

### 1.3 对象大小计算

```java
// 空对象的大小
new Object()
  → Mark Word (8) + Klass Pointer (4, 指针压缩) + Padding (4)
  = 16 bytes

// 简单对象
class User {
    int id;         // 4 bytes
    String name;    // 4 bytes (引用，指针压缩)
    boolean active; // 1 byte + 3 bytes padding
}
→ Object Header (12) + Instance Data (12) + Padding (0)
= 24 bytes

// 指针压缩开启（默认，堆 < 32GB）：引用 4 字节
// 指针压缩关闭（堆 >= 32GB）：引用 8 字节，对象变大
```

**指针压缩**（`-XX:+UseCompressedOops`）：用 32 位引用 + 基址偏移表示 64 位地址，节省 25-50% 堆内存。JDK 6u23+ 默认开启，堆 < 32GB 时有效。

## 二、对象的创建流程

### 2.1 六步创建

```
new User()
  → Step 1: 类加载检查
      User 类是否已加载、链接、初始化？
      → 否 → 执行类加载流程

  → Step 2: 分配内存
      计算 User 对象大小（24 bytes）
      → TLAB（Thread Local Allocation Buffer）分配
        每个线程有自己的 TLAB（默认 Eden 的 1%）
        → TLAB 够用 → 指针碰撞分配（极快，~10ns）
        → TLAB 不够 → CAS 在 Eden 中分配（稍慢）
        → Eden 也不够 → 触发 Young GC

  → Step 3: 零值初始化
      所有字段设为默认值（int=0, ref=null, boolean=false）
      → 保证不用显式初始化也能安全使用

  → Step 4: 设置对象头
      Mark Word = 无锁状态（hash code 延迟计算）
      Klass Pointer → User.class 的元数据

  → Step 5: 执行 <init> 方法
      调用构造方法
      → 父类构造方法 → 实例变量初始化 → 当前构造方法体

  → Step 6: 对象可用
      引用指向新对象
```

### 2.2 TLAB：线程级别的内存分配

```
每个线程的 TLAB 大小 ≈ Eden 空间 / 线程数

默认：TLAB = Eden 的 1%，最小 2KB

好处：
  - 线程分配内存不需要 CAS（自己的 TLAB 独占）
  - 分配速度 ~10ns（指针前移）
  - 减少多线程竞争

问题：
  - TLAB 浪费：线程 A 的 TLAB 用了 80%，剩余 20% 浪费
  - 调优：-XX:TLABSize=256k（手动指定大小）
```

## 三、对象的访问方式

### 3.1 句柄 vs 直接指针

```
句柄访问（稳定，但多一次间接引用）：
  reference → 句柄池 → [instance data pointer, class data pointer] → 堆对象
  GC 移动对象时只需改句柄，reference 不变

直接指针（快速，HotSpot 默认）：
  reference → 堆对象（含 Klass Pointer）→ 方法区类数据
  少一次间接引用，访问更快
  GC 移动对象时需要更新所有 reference（但 HotSpot 用 GC 日志统一更新）
```

HotSpot 用**直接指针**——少一次内存访问，在高频对象访问的场景下性能差异显著。

## 四、对象的引用类型

### 4.1 四种引用

| 引用类型 | GC 行为 | 适用场景 |
|---------|--------|---------|
| **强引用** | 永远不回收 | 普通变量 |
| **软引用** | 内存不足时回收 | 缓存（内存敏感） |
| **弱引用** | 下次 GC 就回收 | WeakHashMap、监听器 |
| **虚引用** | 随时可能回收，无法通过虚引用获取对象 | 跟踪对象被回收的时机 |

### 4.2 软引用缓存的坑

```java
// ❌ 用软引用做缓存 → 经常被 GC 掉，命中率极低
Map<String, SoftReference<byte[]>> cache = new HashMap<>();
cache.put("key", new SoftReference<>(largeData));
// JVM 参数 -XX:SoftRefLRUPolicyMSPerMB=1000（默认）
// 意味着：每 MB 可用堆内存，软引用存活 1 秒
// 4GB 堆 → 软引用存活 ~4 秒 → 缓存几乎无效

// ✅ 正确做法：用 LRU 缓存（如 Caffeine）+ 固定大小上限
Cache<String, byte[]> cache = Caffeine.newBuilder()
    .maximumSize(10000)
    .expireAfterWrite(10, TimeUnit.MINUTES)
    .build();
```

## 五、GC Roots：什么对象不会被回收

```
GC Roots（根对象）：
  1. 虚拟机栈中的局部变量
  2. 方法区中的静态变量
  3. 方法区中的常量引用
  4. 本地方法栈中的 JNI 引用
  5. 同步锁持有的对象（synchronized）
  6. JVM 内部引用（基本类型 Class 对象、异常对象、系统类加载器）

可达性分析：
  从 GC Roots 出发，沿引用链遍历
  → 能到达的对象 = 存活
  → 不能到达的对象 = 可回收

注意：被回收不等于立即释放内存
  → 如果对象重写了 finalize()，会被放入 F-Queue
  → 低优先级线程执行 finalize()
  → finalize 中自救（把 this 赋给某个引用）→ 对象复活！
  → JDK 9+ 已不推荐 finalize()，用 Cleaner 替代
```

## 六、内存泄漏的常见模式

```java
// 1. 静态集合只增不删
static List<User> cache = new ArrayList<>();
cache.add(user);  // 永远不会被 GC

// 2. ThreadLocal 没 remove
ThreadLocal<User> holder = new ThreadLocal<>();
holder.set(user);
// 线程池中线程复用 → ThreadLocal 里的 user 永远不被回收
// 解法：finally { holder.remove(); }

// 3. 内部类持有外部类引用
class Outer {
    class Inner { }  // Inner 隐式持有 Outer.this
    // 如果 Inner 的生命周期 > Outer，Outer 无法被 GC
}

// 4. 监听器/回调没注销
eventSource.addListener(listener);
// eventSource 是全局单例 → listener 永远不被 GC
// 解法：用 WeakReference 包装 listener，或手动 removeListener

// 5. 未关闭的资源
InputStream is = new FileInputStream("file");
// 没 close → 文件句柄泄漏 + 缓冲区内存泄漏
// 解法：try-with-resources
```

## 结语

Java 对象不是「new 了就完事」的——它在内存中有精确的布局、有完整的生命周期、有明确的回收规则。

> 对象头里的 Mark Word 决定了锁的状态，TLAB 决定了分配的速度，指针压缩决定了内存的利用率，GC Roots 决定了谁能活下来。理解这些，GC 调优、锁升级分析、内存泄漏排查——都不再是黑盒。
