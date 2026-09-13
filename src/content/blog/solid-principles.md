---
title: '面向对象设计的 SOLID 原则'
description: '从一段改不动的上帝类说起,用 Java 反例与正例逐个拆解单一职责、开闭、里氏替换、接口隔离、依赖倒置,理解什么叫"改得动的好设计"。'
pubDate: 2025-11-09
category: '后端'
tags: ['设计', '原则']
---

前阵子接手过一个订单模块,里面有个 `OrderService`,三千多行,下单、算库存、发券、拼短信模板、写日志、连邮件通知都塞在里面。需求方提了个"下单后按会员等级发不同优惠券"的小改动,结果一改牵出五六个方法,回归测了一个礼拜,最后还是漏了一个短信渠道。

这种"改不动、不敢改"的代码,根源往往不是写得烂,而是**设计上违反了 SOLID**。这五条原则,就是衡量"一段代码好不好改"的尺子。

## 一、S - 单一职责原则(SRP)

一句话:**一个类只该有一个引起它变化的原因**。反例,一个"万能"员工类:

```java
// 违反 SRP:一个类干了三件互不相干的事
class Employee {
    void calculateSalary() { /* 算工资,财务关心 */ }
    void saveToDatabase() { /* 存库,DBA 关心 */ }
    void generateReport()  { /* 出报表,领导关心 */ }
}
```

三个职责的变更原因完全不同:财务改薪资公式得动它,换存储方案得动它,改报表口径还得动它。三个团队改同一个文件,冲突、回归、甩锅都来了。拆开:

```java
class Employee {  // 纯数据
    private double baseSalary;
    public double getBaseSalary() { return baseSalary; }
}
class PayrollService {     // 只算钱
    double calculate(Employee e) { return e.getBaseSalary() * 1.5; }
}
class EmployeeRepository { // 只存库
    void save(Employee e) { /* INSERT ... */ }
}
class ReportService {      // 只出报表
    void generate(Employee e) { /* 生成报表 */ }
}
```

判断类是否职责过多,有个简单标准:**描述它的时候,如果不得不用"和"字**(它负责算工资"和"存库"和"出报表"),基本就该拆了。

## 二、O - 开闭原则(OCP)

**对扩展开放,对修改关闭**:加新功能靠"新增代码",而不是改老代码。反例,`if-else` 分叉的折扣:

```java
// 违反 OCP:每加一种会员,就要改这个方法
class DiscountService {
    double discount(String type, double price) {
        if ("NORMAL".equals(type))      return price * 0.9;
        else if ("SILVER".equals(type)) return price * 0.8;
        else if ("GOLD".equals(type))   return price * 0.7;
        else return price;
    }
}
```

每来一种新会员就得改 `discount()`,老逻辑被反复触碰。改成策略模式,扩展就变成"加一个类":

```java
interface DiscountStrategy { double apply(double price); }
class NormalDiscount implements DiscountStrategy {
    public double apply(double price) { return price * 0.9; }
}
class SilverDiscount implements DiscountStrategy {
    public double apply(double price) { return price * 0.8; }
}
class DiscountService {
    private final DiscountStrategy strategy;
    DiscountService(DiscountStrategy s) { this.strategy = s; }
    double discount(double price) { return strategy.apply(price); }
}
// 新增"铂金会员",只加类,不动 DiscountService
```

> 开闭原则不是要求永远不改老代码,而是把"变化点"隔离到固定的扩展点上,让未来的变化不再惊动已稳定的部分。

## 三、L - 里氏替换原则(LSP)

**子类必须能替换父类,且不破坏正确性**。最经典的翻车现场,是"正方形继承长方形":

```java
class Rectangle {
    protected int width, height;
    public void setWidth(int w)  { this.width = w; }
    public void setHeight(int h) { this.height = h; }
    public int area() { return width * height; }
}
class Square extends Rectangle {
    @Override public void setWidth(int w)  { this.width = this.height = w; }
    @Override public void setHeight(int h) { this.width = this.height = h; }
}
```

问题出在下面这段:传 `Rectangle` 正常,换成 `Square` 就错:

```java
void enlarge(Rectangle r) {
    r.setWidth(5);
    r.setHeight(4);
    // 期望面积 20,Square 却得到 16
}
```

父类承诺了"宽高可独立设置",子类偷偷破坏了这个承诺,**依赖父类语义的代码全部失效**。编译期发现不了,只能运行时踩坑。别硬拗继承,该组合就组合:

```java
class Square {
    private int side;
    public Square(int side) { this.side = side; }
    public int area() { return side * side; }
}
```

一句话:**子类不能百分百兑现父类契约,就不要继承**。继承不是省代码的工具,是"is-a"的承诺。

## 四、I - 接口隔离原则(ISP)

**接口要小而专,别让实现类被迫实现它用不到的方法**。反例,臃肿接口逼实现类"凑数":

```java
// 违反 ISP:机器人被迫实现"吃饭睡觉"
interface Worker { void work(); void eat(); void sleep(); }

class RobotWorker implements Worker {
    public void work()  { /* 干活 */ }
    public void eat()   { throw new UnsupportedOperationException(); }
    public void sleep() { throw new UnsupportedOperationException(); }
}
```

那两行抛异常,就是接口设计失败的证据——调用方看到 `worker.eat()` 以为能安心调用,一跑就炸。拆成聚焦的小接口:

```java
interface Workable  { void work(); }
interface Feedable  { void eat(); }
interface Sleepable { void sleep(); }

class RobotWorker implements Workable { /* 只干活 */ }
class HumanWorker implements Workable, Feedable, Sleepable { /* 都实现 */ }
```

## 五、D - 依赖倒置原则(DIP)

**高层模块不依赖低层模块,两者都依赖抽象**。这是五条里最立竿见影的一条,Spring 依赖注入背后就是这个思想。反例,直接 `new` 具体实现:

```java
// 违反 DIP:OrderService 焊死在 MySQL 实现上
class OrderService {
    private MySQLOrderRepository repo = new MySQLOrderRepository();
    void save(Order o) { repo.insert(o); }
}
```

单测一下就知道多难受:想测 `OrderService`,得真的连 MySQL。将来换存储,还得改业务代码。倒过来,都依赖抽象:

```java
interface OrderRepository { void save(Order o); }

class MySQLOrderRepository implements OrderRepository {
    public void save(Order o) { /* MySQL 实现 */ }
}

class OrderService {
    private final OrderRepository repo;  // 依赖抽象
    OrderService(OrderRepository repo) { this.repo = repo; }
    void save(Order o) { repo.save(o); }
}
// 测试传内存实现,或换 Mongo 实现,OrderService 一行不用改
```

所谓"倒置",指依赖方向反过来了:以前是"上层 → 下层具体实现",现在是"上层和下层 → 共同的抽象"。

## 六、一张表记住它们

| 原则 | 要解决的问题 | 一句话记忆 |
|------|------------|-----------|
| SRP 单一职责 | 一个类管太多,牵一发动全身 | 一个类只做一件事 |
| OCP 开闭 | 加功能就得改老代码 | 新增优于修改 |
| LSP 里氏替换 | 子类破坏父类契约 | 别让继承背叛承诺 |
| ISP 接口隔离 | 实现类被迫凑数 | 接口宁小勿大 |
| DIP 依赖倒置 | 高层焊死在具体实现上 | 都依赖抽象 |

这五条不是孤立的,指向同一个目标:**降低耦合,让改动影响面变小**。SRP 和 ISP 是"分",OCP 和 DIP 是"合"——分得清职责,才能合得稳依赖。

## 写在最后

SOLID 不是教条,别为了套原则把代码拆得稀碎、接口建得满天飞。它更像一套**体检指标**:看到"上帝类""if-else 堆成山""实现类抛 UnsupportedOperationException""业务代码里 new 具体存储",就知道这里迟早出问题。

原则是手段,不是目的。真正想要的,是那份"敢改、改得动、改完睡得着"的底气。
