---
title: 'Spring Boot 自动装配原理剖析'
description: '从一次"自定义 Starter 死活不生效"的排查说起,顺着 @EnableAutoConfiguration 一路看到 spring.factories/imports 和 @Conditional,再到手写一个能被别人直接引用的 starter。'
pubDate: 2025-12-28
category: '后端'
tags: ['Spring', '源码']
---

线上有一个很经典的怪问题:明明引了某个 starter,依赖也都在,配置项也填了,可一启动要么报 `NoSuchBeanDefinitionException`,要么那个 Bean 静默地就是没被创建,日志里一点提示都没有。更让人头疼的是,同样一份配置在同事机器上能跑,换个环境就"灵异消失"。

这种问题排查到最后,十有八九落在**自动装配**上。这篇文章就顺着 `@EnableAutoConfiguration` 一路往下挖,把 `spring.factories` / `imports` 的加载、`@Conditional` 系列的判断、以及自己写 starter 的门道,一次讲清楚。

## 一、自动装配解决的是什么事

传统 Spring 里,要把一个第三方组件用起来,得自己写一大段 XML 或 `@Configuration` 手动声明一堆 Bean,配错一个就崩。Spring Boot 把这件事做成了"约定优于配置":

> 引入依赖,自动帮你把这些 Bean 装配好;你在配置文件里改改参数,就能覆盖默认行为。

它背后的三件套,一句话概括:**SPI 加载 + 条件判断 + 配置绑定**。下面逐个拆。

## 二、入口:一个不起眼的 @Import

所有自动装配的开关,藏在 `@SpringBootApplication` 里。它是个复合注解,其中最关键的是 `@EnableAutoConfiguration`:

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Import(AutoConfigurationImportSelector.class)
public @interface EnableAutoConfiguration {
}
```

注意那个 `@Import`——它才是真正的"引信"。`@Import` 本来的作用是"导入一个普通类当配置",但在这里导入的是一个 `ImportSelector`,Spring 会调用它的 `selectImports()` 方法,动态返回一批**要注册的类全限定名**。自动装配的候选清单,就是这么被"算"出来的,而不是写死在某个注解里。

## 三、候选清单从哪来:spring.factories → imports

`AutoConfigurationImportSelector` 拿到候选类的过程,精简下来是三步:

1. 用 `SpringFactoriesLoader` 加载 `META-INF/spring.factories`(或新版 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`)
2. 按 key `EnableAutoConfiguration` 取到一批配置类全限定名
3. 再经过 `@Conditional` 过滤、`exclude` 排除、去重排序,得到最终要注册的类

看一段 `spring.factories` 长什么样(老版本写法):

```properties
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
com.example.autoconfigure.DataSourceAutoConfiguration,\
com.example.autoconfigure.WebMvcAutoConfiguration
```

Spring Boot 2.7 之后推荐换成 `AutoConfiguration.imports` 文件,一行一个全限定名:

```text
com.example.autoconfigure.DataSourceAutoConfiguration
com.example.autoconfigure.WebMvcAutoConfiguration
```

这里有一个新手最容易踩的点:**自动配置类的加载顺序不是随意排的**,Spring Boot 用 `@AutoConfigureBefore` / `@AutoConfigureAfter` 加 `@AutoConfigureOrder` 来精确控制先后。见过有人自定义的配置被框架默认配置"顶掉"的情况,根因就是顺序没排对——你的 Bean 先注册了,后面框架的 `@ConditionalOnMissingBean` 判断"容器里已经有了",于是它就不创建,结果用的还是默认实现。

## 四、@Conditional:按需生效的关键

光把候选类加载进来还不够,能不能真正生效,靠的是密密麻麻的 `@Conditional` 系列。这才是"为什么在同事机器上能跑、换个环境就没了"的元凶。

拿最经典的 `DataSourceAutoConfiguration` 举例:

```java
@Configuration
@ConditionalOnClass(DataSource.class)        // 类路径里没有 DataSource 就整个跳过
@ConditionalOnMissingBean(DataSource.class)  // 容器里已经有了就不再创建
public class DataSourceAutoConfiguration {
    // ...
}
```

常用的条件注解,值得背下来:

| 注解 | 作用 | 典型场景 |
|------|------|---------|
| `@ConditionalOnClass` | 类路径存在某类才生效 | 引入了对应依赖才装配 |
| `@ConditionalOnMissingClass` | 类不存在才生效 | 兜底逻辑 |
| `@ConditionalOnBean` | 容器有某 Bean 才生效 | 依赖别的 Bean |
| `@ConditionalOnMissingBean` | 容器没有才创建 | 允许用户自己覆盖 |
| `@ConditionalOnProperty` | 配置项满足才生效 | 功能开关 |
| `@ConditionalOnWebApplication` | 是 Web 环境才生效 | 区分 Web/非 Web |

判断顺序有个关键细节:`@ConditionalOnBean` / `@ConditionalOnMissingBean` 依赖容器里**当前已经注册了哪些 Bean**,所以它对自动配置类的注册顺序极其敏感。两个条件注解互相依赖时,顺序错了就会出现"看似满足条件却没生效"的诡异结果——这也解释了为什么顺序注解那么重要。

## 五、自己写一个 starter

原理搞懂了,写 starter 就水到渠成。一个能直接被别人引用的 starter,结构是这样的:

```text
my-sms-spring-boot-starter
├── pom.xml
└── src/main/java/com/example/sms
    ├── SmsProperties.java
    ├── SmsService.java
    ├── SmsAutoConfiguration.java
    └── src/main/resources/META-INF/spring
        └── org.springframework.boot.autoconfigure.AutoConfiguration.imports
```

四步走:

1. 定义**配置属性类**,用 `@ConfigurationProperties` 绑定 `application.yml` 里的前缀
2. 写**核心业务类**(这里是 `SmsService`),别和 Spring 耦合,方便单独测试
3. 写**自动配置类**,挂上 `@Conditional` 把按需生效的规则定清楚
4. 在 `imports` 文件里**登记**这个配置类的全限定名

下面是完整能跑的代码。先看属性类:

```java
@ConfigurationProperties(prefix = "my-sms")
public class SmsProperties {
    /** 短信网关地址,默认空 */
    private String gateway;
    /** 是否启用,默认 true */
    private boolean enabled = true;
    // getter / setter 省略
}
```

核心业务类,纯 POJO,零 Spring 依赖:

```java
public class SmsService {
    private final SmsProperties properties;

    public SmsService(SmsProperties properties) {
        this.properties = properties;
    }

    public void send(String phone, String content) {
        System.out.printf("发送短信到 %s: %s (网关=%s)%n",
            phone, content, properties.getGateway());
    }
}
```

自动配置类,把条件定清楚:

```java
@Configuration
@EnableConfigurationProperties(SmsProperties.class)
@ConditionalOnClass(SmsService.class)               // 有 SmsService 才装配
@ConditionalOnProperty(prefix = "my-sms", name = "enabled", havingValue = "true", matchIfMissing = true)
public class SmsAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean                        // 用户自己定义了就不抢
    public SmsService smsService(SmsProperties properties) {
        return new SmsService(properties);
    }
}
```

最后在 `AutoConfiguration.imports` 里登记一行:

```text
com.example.sms.SmsAutoConfiguration
```

别人的项目里只要引了这个 starter,再在 `application.yml` 写两行,`SmsService` 就能直接 `@Autowired` 注入:

```yaml
my-sms:
  gateway: https://sms.example.com
  enabled: true
```

## 六、一条排查"没生效"的思路

下次再遇到自动装配不生效,别上来就翻博客,按这个顺序走一遍,基本能定位:

1. **类路径有没有**:依赖真的引入了吗?`@ConditionalOnClass` 判断的类在不在?
2. **配置项对不对**:`@ConditionalOnProperty` 的前缀、key、值是不是匹配?
3. **顺序有没有问题**:是不是被后面的默认配置用 `@ConditionalOnMissingBean` 顶掉了?
4. **排除项**:`spring.autoconfigure.exclude` 或者 `@SpringBootApplication(exclude = ...)` 有没有误伤?

一个更硬核的办法,是把日志级别调到 `DEBUG`(或直接看 `ConditionEvaluationReport`),Spring Boot 会详细打印每个自动配置类**为什么生效 / 为什么没生效**,那些"灵异消失"的 Bean,原因几乎都写在里面了。

## 写在最后

自动装配没那么玄,它就是一个**"按约定加载候选 + 按条件筛掉不合身的"**的机制。真正值得记住的两句话:

1. **看懂 `@Import` + `ImportSelector`**,就知道候选清单是动态算出来的,不是魔法
2. **读懂 `@Conditional` 的求值顺序**,就抓住了"为什么有时候没生效"的命门

遇到怪问题别猜,去看一眼 `ConditionEvaluationReport`,它会比任何博客都诚实地告诉你答案。
