---
title: 'Java 版本特性演进：从 Java 8 到 Java 21 的关键变化'
description: 'Java 8 的 Lambda 和 Stream、Java 11 的 var 和 HTTP Client、Java 17 的 Switch 模式匹配和 Sealed Classes、Java 21 的虚拟线程和 Record Patterns。每个版本的 LTS 特性、发布时间线、升级注意事项。'
pubDate: 2025-09-14
category: '后端'
tags: ['Java', '版本特性', 'Lambda', '虚拟线程', 'LTS', '升级']
---

> Java 的版本发布节奏从「大版本等几年」变成了「每半年一个版本」。LTS（长期支持）版本是 8、11、17、21。理解每个 LTS 版本的核心特性，才能在升级时做出正确的决策——不是为了追新，是为了解决实际的工程问题。

## 一、版本发布节奏与 LTS

| 版本 | 发布日期 | LTS？ | 免费支持到 | 核心特性 |
|------|---------|------|-----------|---------|
| **8** | 2014-03 | ✅ | 2030（商业） | Lambda、Stream、Optional |
| 9 | 2017-09 |  |  | Jigsaw 模块系统 |
| 10 | 2018-03 |  |  | var 局部变量类型推断 |
| **11** | 2018-09 | ✅ | 2026（免费） | var 全局、HTTP Client、ZGC(实验) |
| 12-16 | 2019-2021 |  |  | Switch 表达式、Text Blocks、Record(实验) |
| **17** | 2021-09 | ✅ | 2029（免费） | Sealed Classes、Pattern Matching、ZGC 生产 |
| 18-20 | 2022-2023 |  |  | UTF-8 默认、Foreign Function API |
| **21** | 2023-09 | ✅ | 2031（免费） | 虚拟线程、Record Patterns、Sequenced Collections |
| 22 | 2024-03 |  |  | Unnamed Variables、Foreign Function API（正式） |
| 23 | 2024-09 |  |  | Module Import、Primitive Types in Patterns |
| 24 | 2025-03 |  |  | Scoped Values（正式）、Structured Concurrency |
| **25** | 2025-09 | ✅ | 2033（免费） | 分代 ZGC 默认、Simple Source Files |
| 26 | 2026-03 |  |  | Value Types（Preview）、Universal Generics |

**升级路线建议**：8 → 17（跳版本，收益最大）→ 21（虚拟线程）。不要停在 11——11 到 17 的改进远超 8 到 11。

## 二、Java 8：函数式编程的起点（2014）

### 2.1 Lambda 与 Stream

```java
// 之前：匿名内部类
list.sort(new Comparator<User>() {
    @Override
    public int compare(User a, User b) {
        return a.getAge() - b.getAge();
    }
});

// Java 8：Lambda
list.sort((a, b) -> a.getAge() - b.getAge());

// Stream 链式操作
List<String> names = users.stream()
    .filter(u -> u.getAge() >= 18)
    .sorted(Comparator.comparing(User::getName))
    .map(User::getName)
    .collect(Collectors.toList());
```

**陷阱**：Stream 的 parallel() 不是银弹——ForkJoinPool.commonPool() 默认 CPU 核数-1 个线程，IO 密集型任务用 parallel() 反而更慢。

### 2.2 Optional

```java
// 之前：null 检查
User user = findUser(id);
if (user != null) {
    Order order = user.getOrder();
    if (order != null) { ... }
}

// Java 8：Optional
Optional<User> user = findUser(id);
user.map(User::getOrder)
    .ifPresent(order -> process(order));
```

**陷阱**：不要把 Optional 作为方法参数——Optional 的设计初衷是返回值。

### 2.3 日期时间 API

```java
// 之前：SimpleDateFormat（线程不安全！）
SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");  // 多线程共享 → 崩溃

// Java 8：线程安全的日期 API
LocalDate date = LocalDate.of(2024, 1, 15);
LocalDateTime now = LocalDateTime.now();
DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
```

## 三、Java 11：第一个模块化 LTS（2018）

### 3.1 var 局部变量类型推断

```java
// 之前
HashMap<String, List<User>> userMap = new HashMap<>();

// Java 10+
var userMap = new HashMap<String, List<User>>();

// 限制：只能用于局部变量，不能用于字段、方法参数、返回值
// 适用：类型名很长的场景（如泛型嵌套）
```

### 3.2 HTTP Client（正式）

```java
// 之前：HttpURLConnection（难用）或 Apache HttpClient（第三方）
// Java 11：标准库 HTTP Client
HttpClient client = HttpClient.newHttpClient();
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create("https://api.example.com/data"))
    .GET()
    .build();
HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
```

### 3.3 String 新方法

```java
"  hello  ".isBlank();         // true（比 isEmpty 更严格，空格也算）
"hello\nworld".lines().count(); // 2（按行分割）
"abc".repeat(3);               // "abcabcabc"
```

## 四、Java 17：最实用的 LTS（2021）

### 4.1 Sealed Classes（密封类）

```java
// 限制谁可以继承/实现这个类
public sealed interface Shape permits Circle, Rectangle, Triangle {}

public record Circle(double radius) implements Shape {}
public record Rectangle(double width, double height) implements Shape {}
public record Triangle(double a, double b, double c) implements Shape {}

// 好处：编译器知道只有这三种实现 → Switch 可以穷举（不需要 default）
public double area(Shape shape) {
    return switch (shape) {
        case Circle c -> Math.PI * c.radius() * c.radius();
        case Rectangle r -> r.width() * r.height();
        case Triangle t -> heron(t.a(), t.b(), t.c());
        // 不需要 default —— 编译器保证穷举
    };
}
```

### 4.2 Pattern Matching for instanceof

```java
// 之前
if (obj instanceof String) {
    String s = (String) obj;
    System.out.println(s.length());
}

// Java 16+
if (obj instanceof String s) {
    System.out.println(s.length());  // 自动转型 + 变量绑定
}
```

### 4.3 Text Blocks

```java
// 之前
String json = "{\n" +
    "  \"name\": \"张三\",\n" +
    "  \"age\": 30\n" +
    "}";

// Java 15+
String json = """
    {
      "name": "张三",
      "age": 30
    }
    """;
```

### 4.4 Record（正式）

```java
// 之前：写 getter/equals/hashCode/toString
public class User {
    private final String name;
    private final int age;
    // 100 行 getter/equals/hashCode/toString...
}

// Java 16+
public record User(String name, int age) {}
// 自动生成：构造器、getter、equals、hashCode、toString
// 不可变（所有字段 final）
```

**适用**：DTO、数据传输对象、不可变值对象。**不适用**：需要继承、需要可变状态、需要自定义序列化逻辑。

## 五、Java 21：虚拟线程的时代（2023）

### 5.1 虚拟线程（Virtual Threads）

```java
// 之前：线程池——IO 密集型服务 10000 并发要排队
ExecutorService pool = Executors.newFixedThreadPool(200);
for (Request req : requests) {
    pool.submit(() -> {
        HttpResponse<String> resp = httpClient.send(request);  // 阻塞 ~200ms
        process(resp.body());
    });
}
// 200 线程处理 10000 请求 → RT = 200ms × 50 = 10 秒

// Java 21：虚拟线程——一个请求一个虚拟线程
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    for (Request req : requests) {
        executor.submit(() -> {
            HttpResponse<String> resp = httpClient.send(request);  // 阻塞？自动挂起
            process(resp.body());
        });
    }
}
// 10000 虚拟线程 → 底层几十个平台线程 → 全部并行 → RT = 200ms
```

**核心机制**：虚拟线程阻塞时（IO/sleep/锁），JVM 自动把它从平台线程卸载（unmount），平台线程去执行其他虚拟线程。阻塞结束时重新挂载（mount）。

### 5.2 虚拟线程的四个坑

```java
// ❌ 坑 1：synchronized 会 pin 虚拟线程到平台线程
synchronized (lock) { doIO(); }  // 虚拟线程被固定，无法卸载
// 解法：用 ReentrantLock 替代。启动参数 -Djdk.tracePinnedThreads=full 定位 pinned 位置

// ❌ 坑 2：CPU 密集型任务用虚拟线程没有收益
// 虚拟线程的优势是 IO 阻塞时让出平台线程，CPU 密集没有阻塞 → 和平台线程一样
// 解法：CPU 密集用 FixedThreadPool，IO 密集用虚拟线程

// ❌ 坑 3：ThreadLocal 在百万虚拟线程中内存爆炸
// 每个虚拟线程一份 ThreadLocal 副本 → 百万线程 × 几百字节 = 几百 MB
// 解法：虚拟线程中少用 ThreadLocal，或用 Scoped Values（Preview）

// ❌ 坑 4：线程池 + 虚拟线程 = 反模式
// 虚拟线程的设计目标是「一个请求一个虚拟线程」，不需要线程池限制并发
// 解法：用 newVirtualThreadPerTaskExecutor()
```

### 5.3 虚拟线程迁移步骤

```
1. 识别 IO 密集型线程池 → 找 FixedThreadPool / @Async 的 IO 操作
2. 替换为 virtual thread → spring.threads.virtual.enabled=true（Spring Boot 3.2+）
3. 排查 synchronized → 换 ReentrantLock → -Djdk.tracePinnedThreads=full 定位
4. 评估 ThreadLocal 用量 → 百万线程场景考虑替代方案
5. 压测验证 → RT 应显著下降，CPU 略升（调度开销），内存增加（每虚拟线程 ~几 KB）
```

### 5.4 分代 ZGC（Generational ZGC）

```bash
# Java 21 分代 ZGC：Young GC 只扫新生代，Full GC 极少
java -XX:+UseZGC -XX:+ZGenerational -XX:MaxGCPauseMillis=10

# 性能对比（16GB 堆，Web 服务）：
# G1：P99 停顿 ~50ms
# ZGC 非分代（JDK 15-20）：P99 ~2ms，但吞吐低 5-10%
# ZGC 分代（JDK 21+）：P99 ~1ms，吞吐和 G1 持平 ✅
```

| 场景 | 选 ZGC | 选 G1 |
|------|--------|-------|
| P99 延迟 < 10ms | ✅ | ❌ |
| 堆 > 32GB | ✅ | （Full GC 慢） |
| CPU 资源充足 | ✅ | — |
| 堆 < 4GB 且延迟不敏感 | ❌ | ✅ |

### 5.5 Record Patterns + Switch 模式匹配

```java
// 嵌套 Record 解构
record Point(int x, int y) {}
record ColoredPoint(Point p, String color) {}

// Switch 模式匹配 + 守卫条件
String format(Object obj) {
    return switch (obj) {
        case ColoredPoint(Point(int x, int y), String color) when x > 0
            -> "正象限点(" + x + "," + y + ") 颜色 " + color;
        case Point(int x, int y) -> "点(" + x + "," + y + ")";
        case Integer i when i > 0 -> "正整数: " + i;
        case Integer i -> "非正整数: " + i;
        case String s when s.length() > 10 -> "长字符串";
        case null -> "空";
        default -> "未知: " + obj;
    };
}
```

### 5.6 Sequenced Collections

```java
// 之前：不同集合的首尾方法名不统一
// ArrayList: get(0)/get(size-1), LinkedList: getFirst()/getLast(), TreeSet: first()/last()

// Java 21：统一接口
SequencedCollection<String> list = new ArrayList<>(List.of("a", "b", "c"));
list.getFirst();    // "a"
list.getLast();     // "c"
list.reversed();    // ["c", "b", "a"]
list.addFirst("z"); // 头部添加
```

### 5.7 String Templates（Preview → 撤回）

```java
// Java 21 Preview，但 JEP 459 在 Java 22 被撤回
// 原因：安全问题（注入攻击）、设计不够成熟
String name = "张三";
String info = STR."Hello, \{name}!";  // ❌ 不要在生产用

// 安全方案
String info = String.format("Hello, %s!", name);
```

## 六、Java 22-26：持续演进（2024-2026）

Java 每半年一个版本，非 LTS 版本积累特性，LTS 版本（21 → 下一个 25）固化成熟特性。

| 版本 | 发布时间 | 关键特性 |
|------|---------|---------|
| **22** | 2024-03 | Unnamed Variables（`_`）、Foreign Function & Memory API（正式） |
| **23** | 2024-09 | Module Import Declarations、Primitive Types in Patterns（Preview） |
| **24** | 2025-03 | Scoped Values（正式）、Structured Concurrency（正式） |
| **25** | 2025-09 | **LTS**、分代 ZGC 默认启用、Simple Source Files |
| **26** | 2026-03 | Value Types（Preview）、Universal Generics（Preview） |

### 6.1 Scoped Values（Java 24 正式）：ThreadLocal 的替代品

```java
// ThreadLocal 的问题：可变、继承混乱、百万虚拟线程内存爆炸
static final ThreadLocal<String> USER = new ThreadLocal<>();

// Scoped Values：不可变、作用域明确、虚拟线程友好
static final ScopedValue<String> USER = ScopedValue.newInstance();

ScopedValue.callWhere(USER, "张三", () -> {
    System.out.println(USER.get());  // "张三"
    // 离开作用域后自动清理——不需要 finally { threadLocal.remove() }
});
```

### 6.2 Structured Concurrency（Java 24 正式）：替代 CompletableFuture 的编排

```java
// 之前：CompletableFuture 编排复杂，异常处理分散
CompletableFuture<User> user = CompletableFuture.supplyAsync(() -> getUser(id));
CompletableFuture<Order> order = CompletableFuture.supplyAsync(() -> getOrder(id));
CompletableFuture.allOf(user, order).join();  // 异常处理痛苦

// Java 24：Structured Concurrency
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    StructuredTaskScope.Subtask<User> userTask = scope.fork(() -> getUser(id));
    StructuredTaskScope.Subtask<Order> orderTask = scope.fork(() -> getOrder(id));
    scope.join().throwIfFailed();  // 任何一个失败 → 取消所有子任务

    User user = userTask.get();
    Order order = orderTask.get();
}
// 结构化：子任务的生命周期绑定在 scope 块内，不会泄漏
```

### 6.3 下一个 LTS：Java 25（2025-09）

```
Java 25 是 Java 21 之后的下一个 LTS 版本。
主要关注：
  - 分代 ZGC 成为默认 GC（G1 退居次选）
  - Simple Source Files：单文件程序不需要 javac 编译，java Hello.java 直接运行
  - Module Import Declarations：简化模块声明

升级建议：
  用 Java 21 的团队 → 等 Spring Boot 4.0 稳定后评估 Java 25
  用 Java 17 的团队 → 直接跳到 Java 21（收益最大）
```

### 6.4 Java 26 Preview：Value Types

```java
// Value Types（JEP 499 Preview）：像基本类型一样高效的对象
// 没有对象头、没有引用、栈上分配、自动内联
public value class Money {
    private final BigDecimal amount;
    private final Currency currency;
    // 没有 identity（不能用 == 比较引用），只有值相等
    // 内存布局紧凑，GC 压力极小
}

// 还在 Preview 阶段，生产不要使用。
// 但这是 Java 性能的一次重大飞跃——消除了「对象」的开销，保留了「类」的抽象。
```

## 七、升级注意事项

### 7.1 8 → 17 的破坏性变更

| 变更 | 影响 | 解法 |
|------|------|------|
| 模块化（Jigsaw） | `sun.misc.Unsafe` 等内部 API 被限制 | 用 `--add-opens` 或迁移到标准 API |
| 移除 Java EE 模块 | `javax.xml.bind`（JAXB）等被移除 | 添加第三方依赖（`jaxb-api`） |
| 移除 Nashorn | JavaScript 引擎移除 | 用 GraalVM 或 Node.js |
| 强封装 JDK 内部 API | 反射访问 `java.*` 包报错 | `--add-opens` 或重构代码 |

### 7.2 升级检查清单

```bash
# 1. 用 jdeps 检查内部 API 依赖
jdeps --jdk-internals my-app.jar

# 2. 编译时加 --release 17
mvn compile -Dmaven.compiler.release=17

# 3. 运行时加迁移参数（临时）
java --add-opens java.base/java.lang=ALL-UNNAMED

# 4. 跑全量测试（重点关注反射、序列化、类加载相关）
```

## 结语

Java 的演进不是「加了一堆语法糖」——是工程实践驱动的语言进化。

> Lambda 让函数式编程成为可能，Stream 让集合操作声明式化，var 减少了类型噪声，Record 消灭了样板代码，Sealed Classes 让类型系统更精确，虚拟线程改变了并发编程的范式。

每一次 LTS 升级都是一次技术投资。不是为了追新——是为了解决老版本解决不了的问题。
