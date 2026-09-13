---
title: 'Java 反射与动态代理：框架背后的魔法'
description: 'Spring 的 AOP 怎么实现？MyBatis 的 Mapper 接口为什么不需要实现类？JDK 动态代理和 CGLIB 的区别是什么？反射的性能损耗到底有多大？从 Class 对象到字节码生成，深入 Java 反射与动态代理的底层机制。'
pubDate: 2025-08-31
category: '后端'
tags: ['Java', '反射', '动态代理', 'Spring AOP', 'CGLIB', '字节码']
---

> 每个 Java 开发者都在用 Spring 和 MyBatis，但很少有人想过：Spring 的 `@Transactional` 是怎么在方法前后加事务的？MyBatis 的 Mapper 接口没有实现类，调用时是谁在执行 SQL？答案都是反射和动态代理。理解这些底层机制，才能看懂框架的源码，才能写出自己的框架。

## 一、反射：运行时的类信息

### 1.1 Class 对象

```java
// Java 中一切皆对象——类本身也是对象（Class 对象）
Class<?> clazz = User.class;           // 方式 1：类名.class
Class<?> clazz2 = Class.forName("com.example.User");  // 方式 2：全限定名
Class<?> clazz3 = user.getClass();     // 方式 3：实例.getClass()

// 三个 clazz 是同一个对象（JVM 中每个类只有一个 Class 对象）
System.out.println(clazz == clazz2);  // true
```

### 1.2 反射的常用操作

```java
Class<?> clazz = User.class;

// 获取构造方法
Constructor<?> constructor = clazz.getConstructor(String.class, int.class);
User user = (User) constructor.newInstance("张三", 25);

// 获取字段（包括 private）
Field nameField = clazz.getDeclaredField("name");
nameField.setAccessible(true);  // 突破访问控制
nameField.set(user, "李四");
System.out.println(nameField.get(user));  // "李四"

// 获取方法
Method getName = clazz.getDeclaredMethod("getName");
Object result = getName.invoke(user);  // 调用方法
```

### 1.3 反射的性能损耗

```java
// 直接调用 vs 反射调用
// 直接调用：~1ns
// 反射调用（setAccessible(true)）：~10ns（10x 慢）
// 反射调用（setAccessible(false)）：~100ns（100x 慢，因为要做访问控制检查）

// 为什么慢？
// 1. 方法查找：每次反射都要从 Class 对象中查找 Method
// 2. 访问控制检查：setAccessible(false) 时要检查权限
// 3. 参数包装：基本类型要装箱为 Object

// 优化：MethodHandle（Java 7+）
MethodHandle handle = MethodHandles.lookup()
    .findVirtual(User.class, "getName", MethodType.methodType(String.class));
String name = (String) handle.invoke(user);
// MethodHandle 比反射快 3-5x（JVM 可以内联优化）
```

### 1.4 反射在框架中的应用

| 框架 | 反射用途 |
|------|---------|
| **Spring** | Bean 实例化、依赖注入、AOP 代理、注解解析 |
| **MyBatis** | Mapper 接口动态代理、结果集映射 |
| **Jackson** | 序列化/反序列化（读写私有字段） |
| **JDBC** | ResultSet → 对象映射 |
| **JPA/Hibernate** | 懒加载代理、字段注入 |

## 二、JDK 动态代理

### 2.1 原理

```java
// JDK 动态代理只能代理接口（不能代理类）
public interface UserService {
    User getUser(Long id);
}

// 代理处理器
public class UserServiceProxy implements InvocationHandler {
    private final UserService target;

    public UserServiceProxy(UserService target) {
        this.target = target;
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        // 前置增强
        System.out.println("Before: " + method.getName());
        long start = System.currentTimeMillis();

        // 调用目标方法
        Object result = method.invoke(target, args);

        // 后置增强
        System.out.println("After: " + method.getName() + " took " + (System.currentTimeMillis() - start) + "ms");
        return result;
    }
}

// 创建代理对象
UserService target = new UserServiceImpl();
UserService proxy = (UserService) Proxy.newProxyInstance(
    UserService.class.getClassLoader(),
    new Class<?>[]{UserService.class},
    new UserServiceProxy(target)
);

proxy.getUser(1L);  // 实际调用 InvocationHandler.invoke()
```

### 2.2 底层：字节码生成

```
Proxy.newProxyInstance() 做了什么：
  1. 动态生成一个类 $Proxy0 implements UserService
  2. $Proxy0 的所有方法都委托给 InvocationHandler
  3. 用 ClassLoader 加载 $Proxy0
  4. 返回 $Proxy0 的实例

生成的 $Proxy0 伪代码：
  public final class $Proxy0 extends Proxy implements UserService {
      private InvocationHandler h;
      public User getUser(Long id) {
          return (User) h.invoke(this, getUserMethod, new Object[]{id});
      }
  }

查看生成的字节码：
  System.setProperty("jdk.proxy.ProxyGenerator.saveGeneratedFiles", "true");
  → 会在当前目录生成 $Proxy0.class 文件
```

**限制**：JDK 动态代理只能代理接口。如果目标类没有实现接口，JDK 代理无法使用。

## 三、CGLIB：代理类的终极方案

### 3.1 原理

```java
// CGLIB 通过字节码技术生成目标类的子类
Enhancer enhancer = new Enhancer();
enhancer.setSuperclass(UserServiceImpl.class);  // 目标类（不需要接口）
enhancer.setCallback(new MethodInterceptor() {
    @Override
    public Object intercept(Object obj, Method method, Object[] args,
                             MethodProxy proxy) throws Throwable {
        System.out.println("Before");
        Object result = proxy.invokeSuper(obj, args);  // 调用父类方法
        System.out.println("After");
        return result;
    }
});

UserServiceImpl proxy = (UserServiceImpl) enhancer.create();
proxy.getUser(1L);
```

### 3.2 JDK 代理 vs CGLIB

| 维度 | JDK 动态代理 | CGLIB |
|------|------------|-------|
| **代理对象** | 接口 | 类（生成子类） |
| **实现方式** | `java.lang.reflect.Proxy` | ASM 字节码生成 |
| **速度** | 创建快，调用稍慢 | 创建慢（生成字节码），调用快 |
| **限制** | 必须有接口 | 不能代理 final 类/方法 |
| **Spring 默认** | 目标有接口时 | 目标无接口时（Spring 6+ 默认 CGLIB） |

### 3.3 Spring 为什么选 CGLIB

```
Spring 5 及之前：
  目标类实现了接口 → JDK 动态代理
  目标类没有接口 → CGLIB

Spring 6（Spring Boot 3）及之后：
  默认全部用 CGLIB（即使有接口）
  原因：CGLIB 调用更快，且避免了接口代理的类型转换问题
  配置：spring.aop.proxy-target-class=true（默认 true）
```

## 四、MyBatis Mapper 的动态代理

```java
// Mapper 接口——没有实现类
public interface UserMapper {
    User selectById(Long id);
}

// MyBatis 用动态代理为每个 Mapper 接口生成代理对象
// 代理对象的 InvocationHandler = MapperProxy

public class MapperProxy<T> implements InvocationHandler {
    @Override
    public Object invoke(Object proxy, Method method, Object[] args) {
        // 1. 根据方法签名找到对应的 MappedStatement（SQL 定义）
        MappedStatement ms = configuration.getMappedStatement(method);

        // 2. 获取 SqlSession，执行 SQL
        SqlSession sqlSession = sqlSessionFactory.openSession();
        return sqlSession.selectOne(ms.getId(), args[0]);
    }
}

// 这就是为什么 Mapper 接口不需要实现类——
// MyBatis 在运行时用动态代理生成了实现
```

## 五、反射的安全边界

### 5.1 setAccessible 的风险

```java
// setAccessible(true) 可以突破 private 访问控制
Field passwordField = User.class.getDeclaredField("password");
passwordField.setAccessible(true);
passwordField.set(user, "hacked");  // 绕过了所有封装

// Java 9+ 模块系统限制了跨模块的反射访问
// 如果 User 在模块 A，反射代码在模块 B → AccessException
// 解法：模块 A 的 module-info.java 中 opens com.example to moduleB
```

### 5.2 序列化漏洞

```java
// Java 反序列化可以绕过构造器，直接创建对象
ObjectInputStream ois = new ObjectInputStream(inputStream);
User user = (User) ois.readObject();  // 不调用任何构造方法！

// 如果 User 的字段被恶意赋值 → 安全漏洞
// 解法：
// 1. 不反序列化不可信数据
// 2. 用 readObject() 方法做校验
// 3. 用 SerializationFilter（Java 9+）限制可反序列化的类
```

## 结语

反射和动态代理是 Java 框架的基石。

> 反射让框架能在运行时操作类的结构，JDK 动态代理让接口方法调用可以被拦截和增强，CGLIB 让没有接口的类也能被代理。Spring 的 AOP、MyBatis 的 Mapper、Hibernate 的懒加载——这些「魔法」的背后，都是反射和字节码生成。

理解这些机制，不是为了自己写框架——是为了看懂框架的源码，在框架出问题时知道去哪找根因。
