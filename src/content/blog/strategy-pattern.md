---
title: '设计模式之策略模式实战'
description: '从一个 if-else 爆炸的订单分润重构说起,讲透策略 + 工厂、Spring 注入策略、枚举策略三种落地姿势,以及什么时候该用、什么时候别硬上。'
pubDate: 2025-11-16
category: '后端'
tags: ['设计模式', 'Java']
---

接手过一个订单结算模块,里面有个「计算分润」的方法,长到需要往下滚好几屏才能看到结尾。核心逻辑大概长这样:

```java
public BigDecimal settle(Order order) {
    if ("KA".equals(order.getChannel())) {
        // 大客户:固定折扣 + 阶梯返点,约 60 行
    } else if ("AGENT".equals(order.getChannel())) {
        // 代理商:按等级抽成,约 80 行
    } else if ("DIRECT".equals(order.getChannel())) {
        // 直营:内部价,约 40 行
    } else if ("TRIAL".equals(order.getChannel())) {
        // 试用期:白名单校验,约 50 行
    } else {
        // 兜底:默认规则,约 20 行
    }
}
```

每次上线一个新渠道,就得在这个方法里再塞一个 `else if`。改一次,提心吊胆一次——因为谁也不敢保证,新加的分支不会碰到前面某个分支里悄悄共享的局部变量。这就是典型的**「if-else 爆炸」**,也是策略模式最该登场的地方。

## 一、策略模式在解决什么

它的定义一句话:**把一系列可互相替换的算法封装起来,让算法独立于使用它的客户端而变化**。

落到分润场景上,「不同的渠道规则」就是不同的算法。与其把它们揉在一个几百行的方法里,不如每个渠道一个类,各自管好自己那一摊:

```java
// 1. 定义策略接口
public interface SettleStrategy {
    String channel();                 // 这个策略认领哪个渠道
    BigDecimal settle(Order order);   // 具体的分润算法
}
```

每个实现就是一个独立策略,互不干扰:

```java
public class KaSettleStrategy implements SettleStrategy {
    public String channel() { return "KA"; }
    public BigDecimal settle(Order order) {
        // 大客户:固定折扣 + 阶梯返点
        return order.getAmount()
            .multiply(order.getKaDiscount())
            .subtract(rebate(order));
    }
    private BigDecimal rebate(Order order) { /* ... */ }
}
```

单看这一步,收益已经很明显:**每个分支的复杂度被锁进了各自的类里**,主流程再也看不见那一大坨条件判断。

## 二、光有策略不够,还得有「工厂」

策略模式单独用,有个尴尬:调用方还是得先判断「该用哪个策略」,等于把 if-else 挪了个位置,没解决根本问题。这时候就得上**工厂模式**,把「选策略」这件事也收拢起来。

工厂最朴素、也最容易被忽视的写法,是**用构造器把策略收集进一个 Map**:

```java
public class SettleStrategyFactory {
    private final Map<String, SettleStrategy> registry = new HashMap<>();

    // 传入全部策略实现,按 channel 登记进 Map
    public SettleStrategyFactory(List<SettleStrategy> strategies) {
        for (SettleStrategy s : strategies) {
            registry.put(s.channel(), s);
        }
    }

    public SettleStrategy get(String channel) {
        SettleStrategy s = registry.get(channel);
        if (s == null) {
            throw new IllegalArgumentException("未找到渠道策略: " + channel);
        }
        return s;
    }
}
```

调用方从此一行到底:

```java
return factory.get(order.getChannel()).settle(order);
```

新增渠道时,**只加一个类、不改任何旧代码**——这就是开闭原则最直接的落地。

> 一个基本原则:工厂里 `get` 拿不到策略时,**该抛异常就抛**。见过不少用 `null` 兜底、再让调用方判空的写法,把「未知渠道」这个本该在工厂层暴露的问题,悄悄下沉到了业务代码里,排查起来更费劲。

## 三、Spring 注入策略,一行都不用多写

上面那个 `List<SettleStrategy>` 从哪来?如果用了 Spring,根本不用手动 new——**Spring 会自动把容器里所有实现了该接口的 Bean 注入进 List**:

```java
@Component
public class SettleStrategyFactory {
    private final Map<String, SettleStrategy> registry;

    public SettleStrategyFactory(List<SettleStrategy> strategies) {  // 自动收集所有实现
        this.registry = strategies.stream()
            .collect(Collectors.toMap(SettleStrategy::channel, s -> s));
    }

    public SettleStrategy get(String channel) {
        SettleStrategy s = registry.get(channel);
        if (s == null) {
            throw new IllegalArgumentException("未找到渠道策略: " + channel);
        }
        return s;
    }
}
```

配合 `@Component`,每个策略类自己就是 Spring Bean,天然支持依赖注入——大客户策略里要注入一个价格服务,直接 `@Autowired` 进来就行,工厂完全不用关心。

这是生产里最常见的组合:**策略(封装算法) + 工厂(负责选择) + Spring(自动装配)**。

## 四、策略少且固定,枚举策略更轻

如果渠道就那么三五个,而且几年不会变,上整套「接口 + 工厂 + Spring」反而有点重。这时候**枚举策略**是更讨巧的写法:

```java
public enum Channel {
    KA {
        BigDecimal settle(Order o) { return o.getAmount().multiply(o.getKaDiscount()); }
    },
    AGENT {
        BigDecimal settle(Order o) { return o.getAmount().multiply(new BigDecimal("0.9")); }
    },
    DIRECT {
        BigDecimal settle(Order o) { return o.getAmount().multiply(new BigDecimal("0.85")); }
    };

    abstract BigDecimal settle(Order o);

    public static Channel of(String name) {
        for (Channel c : values()) {
            if (c.name().equalsIgnoreCase(name)) return c;
        }
        throw new IllegalArgumentException("未知渠道: " + name);
    }
}
```

调用就一句 `Channel.of(order.getChannel()).settle(order)`。枚举天然单例、线程安全、还能直接和 DB 里的字符串对应,写起来快,读起来也直白。

但它的边界也要清楚:**枚举里塞得下小逻辑,塞不下会持续膨胀的大逻辑**。如果某个渠道的 settle 开始上百行、还要注入外部服务,就该老老实实切回「接口 + 工厂」,而不是硬在枚举里堆。

## 五、什么时候该用,什么时候别硬上

策略模式不是银弹。一个简单的判断表:

| 信号 | 要不要上策略 |
|------|-------------|
| `if-else` 超过 3 个且还在增长 | 上 |
| 各分支逻辑独立、可能单独演进 | 上 |
| 需要运行时按配置/枚举动态选择 | 上 |
| 分支就两三个、逻辑几行且稳定 | **别上**,if-else 更清晰 |
| 只有一处判断、没复用 | 别上,为抽象而抽象 |

最容易踩的坑,是**为了「消除 if-else」而消除 if-else**。见过一个只有两个分支、各一行逻辑的场景,硬套了接口 + 工厂 + 枚举,结果代码量翻了五倍,新人追一个 `get` 要跳四五个类。那才是本末倒置。

另一个常见的坑是**策略之间偷偷共享状态**。策略类里若放了可变的成员变量(比如一个累计计数器),多个请求并发进来会互相污染。一个基本原则:**策略应该无状态**,需要数据就通过方法参数传进去。

## 写在最后

回到开头那个分润方法。重构之后,新增「集团采购」渠道只做了两件事:写一个 `GroupPurchaseSettleStrategy`,再在枚举/工厂里登记一下。主流程一行没动,回归测试的范围也清清楚楚。

回头看,策略模式真正值钱的不是「消灭了 if-else」,而是**把「选择」和「执行」分开,让每一段逻辑都能独立生长、独立测试、独立下线**。至于用接口 + 工厂、还是枚举、还是干脆就写个 if-else,答案永远看复杂度本身——**模式不是目的,清晰才是**。
