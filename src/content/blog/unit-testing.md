---
title: '单元测试的正确姿势'
description: '从一次金额算错的线上事故说起,讲清楚什么值得测、怎么用 JUnit 和 Mock 写出不脆弱的单测,以及测试金字塔为什么别反着盖。'
pubDate: 2026-01-11
category: '工程实践'
tags: ['测试', '工程']
---

有次线上出过一个很典型的事故:一个订单拆单接口,把"按比例分摊运费"的逻辑改了一版,自测没问题就上线了。结果几天后财务对账,发现**尾差永远少一分钱**——因为改了四舍五入的位置,导致每一单尾数都往下抹。追了一下午才定位到那一行 `Math.round` 放错了地方。

问题是:这个改动,一行单元测试都没有。当时如果有一段"分摊之后各笔之和必须等于总额"的断言,这个 bug 根本活不到上线。

这就是单元测试最朴素的价值:**它不是写给领导看的覆盖率,是写给三个月后的自己和接手同事看的护栏**。

## 一、先说清楚:什么值得测

单测是有成本的,写一堆没营养的测试,反而会拖慢节奏。见过太多"覆盖率 90% 但全是空断言"的项目,真出问题一个都拦不住。

一句话判断标准:**这段逻辑错了,会造成什么后果?**

按这个标准,值得测的东西很清楚:

| 值不值得测 | 典型代码 | 说明 |
|-----------|---------|------|
| 必须测 | 金额计算、状态流转、权限判断、边界条件 | 错了就是钱、就是事故 |
| 值得测 | 复杂分支、异常兜底、重试/降级逻辑 | 逻辑绕,容易改坏 |
| 没必要测 | 纯 getter/setter、纯转发 Controller、配置类 | 没有逻辑,测了也是白测 |

一个更直接的说法:**测的是"逻辑",不是"代码"**。一行 `amount * rate` 值得测,一行 `return user.getName()` 不值得测。

## 二、一个能直接跑的断言示例

JUnit 5 的常规写法,不依赖任何小众库,把上面那个运费分摊的场景写出来就是:

```java
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class FreightSplitterTest {

    private final FreightSplitter splitter = new FreightSplitter();

    @Test
    void shouldKeepTotalAfterSplit() {
        // 3 笔子单,总额 100 元,按 1:1:1 分摊
        var result = splitter.split(100_00, new int[]{1, 1, 1});

        int sum = result.stream().mapToInt(Integer::intValue).sum();
        assertEquals(100_00, sum, "分摊后各笔之和必须等于总额");
    }

    @Test
    void shouldRejectNegativeAmount() {
        assertThrows(IllegalArgumentException.class,
            () -> splitter.split(-1, new int[]{1}));
    }

    @Test
    void shouldHandleLastPennyCorrectly() {
        // 33.33 三笔是分不尽的,尾差必须落到某一笔,而不是被吞掉
        var result = splitter.split(100_00, new int[]{1, 1, 1});
        assertEquals(3, result.size());
        assertEquals(100_00, result.stream().mapToInt(Integer::intValue).sum());
    }
}
```

三条断言,对应的正是那类最容易被改坏的场景:**总额守恒、非法输入、尾差处理**。

## 三、依赖怎么处理:别连真实数据库

单测要**快、隔离、可重复**。一条测试要连数据库、连 Redis、连外部接口,跑一次几十秒,久而久之就没人愿意跑了。

所以外部依赖要 mock 掉。常规做法是 JUnit 5 配合 Mockito:

```java
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock OrderRepository repository;
    OrderService service;

    @Test
    void shouldReturnOrder() {
        service = new OrderService(repository);
        when(repository.findById(1L))
            .thenReturn(Optional.of(new Order(1L, "PENDING")));

        Order order = service.get(1L);

        assertNotNull(order);
        assertEquals("PENDING", order.getStatus());
        verify(repository).findById(1L);
    }
}
```

两个要点值得强调:

1. **mock 的是"边界"**:数据库、网络、时间、随机数这类不受控的东西,而不是你正在测的逻辑本身。
2. **构造注入比字段注入好**:上面用构造函数把 `repository` 传进去,而不是 `@Autowired` 到私有字段——这样被测对象自己就能 new 出来,不需要 spring 容器。

## 四、别让测试变得脆弱

有一种很常见的坏味道:测试写了一堆 `assertNotNull`,或者断言了内部实现细节。这类测试有两个毛病:

- **挡不住 bug**:`assertNotNull` 测不出金额算错。
- **一改就挂**:断言了内部私有方法调用次数,重构一次就红一片,最后大家干脆删掉测试。

> 好的测试测的是**行为**,不是**实现**。改了内部实现、测试仍然通过,这才是健康的测试。

一个基本原则:**测试应该关心"给定输入,产出什么",而不是"内部调用了谁"**。`verify` 只在真正需要验证副作用(比如发消息、落库)时才用,别到处滥用。

## 五、测试金字塔:别把力气用错地方

关于测试分层,有个经典的"测试金字塔":

```
        /\
       /E2E\     端到端测试:少而慢,验证主干流程
      /------\
     /  集成  \   集成测试:验证组件之间协作
    /----------\
   /   单元测试  \  单元测试:多而快,验证核心逻辑
  /--------------\
```

三层的关系一目了然:**底层单元测试应该最多,顶层端到端最少**。但现实里经常反过来——团队把力气全花在端到端和 UI 自动化上,核心逻辑反而裸奔。

常见做法是守住这个比例:

- **大量单元测试**:毫秒级,覆盖业务逻辑和边界
- **少量集成测试**:验证和数据库、中间件真的能对上
- **极少量端到端测试**:只测一条最关键的黄金路径

反着盖金字塔的代价很明显:**E2E 又慢又脆,跑一次十几分钟,稍微改点 UI 就全红,最后变成"绿灯靠运气"**。

## 六、覆盖率是结果,不是目标

覆盖率数字好看,和测试有效,是两回事。更该盯的是这几个问题:

- 核心逻辑的分支,是不是都被测到了
- 测试能不能**单独跑**(不依赖执行顺序、不共享状态)
- 反馈快不快(整个单测套件能不能在几秒内跑完)

> 100% 覆盖率配一堆 `assertNotNull`,不如 60% 覆盖率把所有关键分支都覆盖到位。

衡量单测质量,一个更实际的指标是**变异测试**的思路:故意在代码里注入一个 bug,看测试能不能抓住它。抓不住,说明这段测试是"花架子"。

## 写在最后

单元测试的本质,一句话就能说透:**给重构勇气,给上线兜底**。它不产生业务价值,但它保证产生业务价值的代码不会在某个深夜悄悄崩掉。

回头看那一起尾差事故,如果当时肯为那几行分摊逻辑写下三条断言,省下的不只是一下午的排查,更是一批要手工补差的财务数据。**逻辑越危险,越值得在它变成 bug 之前,先用测试把它按住。**
