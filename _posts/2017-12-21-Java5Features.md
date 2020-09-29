---
title: Java 5 新特性整理
year: 2017
month: 12
day: 21
pic: 10
type: Java
desc: Java编程语言发展到5.0版本，出现了很多和之前Java版本相比比较新颖的特性，这可以说是Java史上最重大的更新之一...
---

# Java 5 新特性整理

> 致那些年我们一起错过的Java重大更新

### 更新列表

- [泛型Generics](#Generics)
- [枚举Enumeration](#Enumeration)
- [注解annotation](#annotation)
- [拆装箱Autoboxing与Unboxing](#boxing)
- [格式化Formatter](#Formatter)
- [foreach](#for)
- [静态导入import static](#simportant)
- [变长参数varargs](#args)
- [线程相关](#threads)
- [其他](#utils)

<a id="Generics"></a>

### 泛型

**泛型，即“参数化类型”。与C++不同的是，Java的泛型是在编译器中实现的编译器使用泛型类型信息保证类型安全，执行类型检查和类型推断，然后在生成字节码之前将其“擦除”，最后生成普通的非泛型的字节码。**

- 泛型可以用于类、接口、方法/构造函数、变量（不能定义只能使用）
- 泛型不是协变的【`List<Object> list = new ArrayList<String>();`这是不允许的，`List<Object>`不能作为`ArrayList<String>`的父类】
- 类型通配【由于擦出现象的存在，不能用泛型来重载方法或构造函数，`List<String>`与`List<Object>`都是`List`】
- 通配符泛型可以向上/向下限制【`<? extends Collection>`只能接受collection及其子类，`<? super Double>`只能接收Double及其父类】
- 泛型不能是基本类型，Java中没有泛型数组

<a id="Enumeration"></a>

### 枚举

[Java 枚举知识整理](http://blinkfox.com/java-mei-ju-zhi-shi-zheng-li/)

<a id="annotation"></a>

### 注解

[Java注解的理解和应用](http://blinkfox.com/javazhu-jie-de-li-jie-he-ying-yong/)

<a id="boxing"></a>

### 自动拆装箱

由于Java是面向对象，而基本类型不是面向对象，所以提供了对应包装类型，基本类型与包装类型之间的转换称为装箱(autoboxing)、拆箱(unboxing)。在Java 5以后这些转换都是有编译器完成的，所以称为自动拆装箱。


基本类型 | 包装类型
---|---
boolean | Boolean
byte | Byte
short | Short
char | Character
int | Integer
long　| Long
float | Float
double | Double

```
Integer integer = new Integer(10);// Java 5以前
Integer integer = 10;// Java 5及以后
Number number = 10;// 先装箱为Integer，再赋给Number
```

- 将一个为null的包装类型赋值给基本类型是会抛异常的，在获取包装类型的value的时候，会报空指针
- -128到127的值被缓存在内存中，便于重用

<a id="Formatter"></a>

### 格式化

java.util.Formatter是JDK5 新增的printf样式格式字符串的解释器。此类提供对布局对齐和对齐的支持，数字，字符串和日期/时间数据的常用格式以及特定于语言环境的输出。常见的Java类型，如 byte，BigDecimal和Calendar 支持。可通过Formattable接口定制任意用户类型的格式。

Java语言的格式化打印很大程度上受C`printf`的启发。在C不适用的标志会被忽略，Java格式化比C更严格，如果转换与标志不兼容，则会抛出异常。

简单的格式化：

```java
StringBuilder sb = new StringBuilder();
// 将所有输出append到sb对象
Formatter formatter = new Formatter(sb, Locale.US);
// 显式参数索引可以用来重新排序输出
formatter.format("%4$2s %3$2s %2$2s %1$2s", "a", "b", "c", "d");
// -> " d  c  b  a"
```

`String.format`、`System.*.format`和`System.*.printf`快速格式化

```java
Calendar c = new GregorianCalendar(1995, Calendar.MAY, 23);
String s = String.format("Duke's Birthday: %1$tm %1$te,%1$tY", c);
// -> s == "Duke's Birthday: May 23, 1995"

System.out.format("Local time: %tT", Calendar.getInstance());
// -> "Local time: 13:34:18"

System.out.printf("身高体重(%.2f , %d)", 180.2, 65);
// -> 身高体重(180.20 , 65)
```

**通用、字符和数字类型的格式化语法如下：**

`%[argument_index$][flags][width][.precision]conversion`

- argument_index 可选，十进制整数，表示参数列表中参数的位置。第一个参数由“ 1$” 引用
- flags 可选，一组修改输出格式的字符，有效标志的集合取决于conversion
- width 可选，非负十进制整数，指示要写入输出的最小字符数
- precision 可选，非负十进制整数，通常用于限制字符数。具体行为取决于conversion
- conversion 必须，指示如何格式化参数的字符。给定参数的有效转换集取决于参数的数据类型

**用于表示日期和时间的类型的格式化语法如下：**

`%[argument_index$][flags][width]conversion`

- argument_index、flags、width 可选，同上
- conversion 一个两个字符的序列。第一个字符是't'或'T'。第二个字符表示要使用的格式

**不符合参数的格式化语法如下：**

`%[flags][width]conversion`

- flags、width 可选，同上
- conversion 指示要在输出中插入的内容的字符

**Conversions分为以下几类：**

- **General** 可以应用于任何参数类型
- **Character** 可以被应用到基本类型代表Unicode字符：char，Character，byte，Byte，short，和Short
- **Numeric**
    - **Integral** 可应用于Java的整数类型：byte， Byte，short，Short，int和Integer，long，Long，和BigInteger
    - **Floating Point** 可用于Java的浮点类型： float，Float，double，Double，和BigDecimal
- **Date/Time** 可以被施加到Java类型，其能够编码的日期或时间的：long，Long，Calendar，和 Date
- **Percent** 产生一个'%' （'\ u0025'）
- **Line Separator** 生成特定于平台的行分隔符

下表总结了支持的conversion

conversion | 参数类别 | 描述
---|---|---
'b', 'B'| General | 如果参数arg是null，那么结果是“ false”。如果arg是booleanor Boolean，那么结果就是返回的字符串String.valueOf(arg)。否则，结果是“真”。
'h', 'H'| General | 如果参数arg是null，那么结果是“ null”。否则，调用就会得到结果 Integer.toHexString(arg.hashCode())。
's', 'S'| General | 如果参数arg是null，那么结果是“ null”。如果arg执行Formattable，则 arg.formatTo调用。否则，调用就会得到结果arg.toString()。
'c', 'C'| Character | 结果是一个Unicode字符
'd'	| Integral | 结果被格式化为十进制整数
'o'	| Integral | 结果被格式化为八进制整数
'x', 'X'| Integral | 结果被格式化为一个十六进制整数
'e', 'E'| Floating Point | 结果以电脑科学记数法格式化为十进制数字
'f' | Floating Point | 结果被格式化为十进制数字
'g', 'G'| Floating Point | 使用计算机科学记数法或小数格式对结果进行格式化，具体取决于舍入后的精度和值。
'a', 'A'| Floating Point | 结果被格式化为带有有效数和指数的十六进制浮点数
't', 'T'| Date/Time | 日期和时间转换字符的前缀。查看日期/时间转换。
'%' | Percent | 结果是一个文字'%'（'\ u0025'）
'n' | Line Separator | 结果是平台特定的行分隔符

**日期/时间conversion**

以下转换字符用于格式化时间：

- 'H'	24小时制的一天中的小时，格式化为两位数字，必要时带有前导零，即00 - 23。
- 'I'	小时为12小时制，格式化为两位数字，必要时带前导零，即 01 - 12。
- 'k'	24小时的一天的小时，即0 - 23。
- 'l'	12小时制的小时，即1 - 12。
- 'M'	小时内的小时数格式化为两位数字，必要时带前导零，即 00 - 59。
- 'S'	在一分钟之内，格式化为必要的前两个数字，即00 - 60（“ 60”是支持闰秒所需的特殊值）。
- 'L'	第二秒内的毫秒格式化为必要的前三位的三位数字，即000 - 999。
- 'N'	秒内的纳秒，根据需要格式化为带有前导零的九位数字，即000000000 - 999999999。
- 'p'	小写的区域特定的早上或下午标记，例如“ am”或“ pm”。使用转换前缀将'T'强制输出为大写。
- 'z'	来自GMT的RFC 822风格数字时区偏移，例如-0800。这个值将根据夏令时的需要进行调整。对于 long，Long以及Date使用的时区是默认时区 Java虚拟机实例。
- 'Z'	表示时区缩写的字符串。这个值将根据夏令时的需要进行调整。对于long，Long以及Date使用的时区是默认时区 Java虚拟机实例。格式器的语言环境将取代参数的语言环境（如果有的话）。
- 's'	自1970年1月1日00:00:00UTC 开始以来的秒 ，即Long.MIN_VALUE/1000至 Long.MAX_VALUE/1000。
- 'Q'	毫秒，因为时代的起点开始，在1970年1月1日00:00:00UTC，即Long.MIN_VALUE到 Long.MAX_VALUE。

以下转换字符用于格式化日期：

- 'B'	特定于语言环境的月份全称，例如"January"，"February"。
- 'b'	特定于语言环境缩写月份名称，例如"Jan"，"Feb"。
- 'h'	和...一样'b'。
- 'A'	星期几的地区特定的全名，例如"Sunday"，"Monday"
- 'a'	本地特定的星期几的短名称，例如"Sun"，"Mon"
- 'C'	四位数除以，按需要100格式化为两位数字，前导零，即00 - 99
- 'Y'	年，格式化为至少四位数字，必要时带前导零，例如0092等于92公历的CE。
- 'y'	一年中的最后两位数字，根据需要用前导零格式化，即00 - 99。
- 'j'	一年中的一天，格式化为必要的前三位的三位数字，例如001 - 366公历。
- 'm'	月，根据需要格式化为带有前导零的两位数字，即01 - 13。
- 'd'	一个月的日子，根据需要格式化为两位数前导零，即 01 - 31
- 'e'	一个月的日期，格式为两位数字，即1 - 31。

以下转换字符用于格式化常用日期/时间组合

- 'R'	时间格式为24小时制 "%tH:%tM"
- 'T'	时间格式为24小时制"%tH:%tM:%tS"。
- 'r'	时间格式为12小时制"%tI:%tM:%tS%Tp"。早上或下午标记（'%Tp'）的位置可能与语言环境有关。
- 'D'	日期格式为"%tm/%td/%ty"。
- 'F'	ISO 8601 完整日期格式为"%tY-%tm-%td"。
- 'c'	日期和时间格式为"%ta %tb %td %tT %tZ %tY"，例如"Sun Jul 20 16:17:00 EDT 1969"。

任何未明确定义为日期/时间转换后缀的字符都是非法的，并且为将来的扩展而保留。

**下表总结了支持的Flag。 y表示该标志对于指定的参数类型是受支持的**

Flag|General|Character|Integral|Floating Point|Date/Time|Description
---|---|---|---|---|---|---
'-'|	y|	y|	y|	y|	y|	结果将是左对齐的
'#'|	y1|	-|	y3|	y|	-|	结果应该使用一个依赖于转换的替代形式
'+'|	-|	-|	y4|	y|	-|	结果将总是包含一个标志
' '|	-|	-|	y4|	y|	-|	结果将包括积极的价值的领先空间
'0'|	-|	-|	y|	y|	-|  结果将被填零
','|	-|	-|	y2|	y5|	-|	结果将包括特定于语言环境的分组分隔符
'('|	-|	-|	y4|	y5|	-|	结果会将括号中的负数括起来

1 取决于的定义Formattable。

2 'd'仅适用于转换。

3 仅用于'o'，'x'和'X'转换。

4 对于'd'，'o'，'x'，和 'X'转换应用到BigInteger 或'd'应用到byte，Byte，short，Short，int和Integer，long和Long。

5 对'e'，'E'，'f'， 'g'，和'G'唯一的转换。

没有明确定义为标志的任何字符都是非法的，并且为将来的扩展保留

[更多格式化相关内容](https://docs.oracle.com/javase/7/docs/api/java/util/Formatter.html)

<a id="for"></a>

### foreach

foreach又名曰增强for循环，它使用`Iterator`简化数组集合等遍历，只有实现了`Iterable`接口的容器才能用foreach遍历。需要注意的几点：

- 遍历时没有索引值
- 遍历过程中不能操作集合，集合内部有个检查机制，遍历过程中发生了变化就抛出异常`java.util.ConcurrentModificationException`
- 遍历的容器如果实现了RandomAccess，使用`get`遍历会比迭代快很多

```
for (int x : arr) {
    // TODO
}  
```

<a id="simportant"></a>

### 静态导入

静态导入可以简化调用静态方法或者使用静态变量的操作，他必须满足以下亮点

1. 只能导入static修饰的内容
2. 带入的类型必须是字段(Field )或者成员类型(方法，常量值，枚举实例等)

```
// 静态导入
import static java.lang.System.out;
// 调用
out.print("Hello World");
```

<a id="args"></a>

### 变长参数

- 将相同类型的参数合并到一起
- 当有多个参数的时候，变长参数放于最后`public static int max(String str, int... nums)`
- 变长参数其实是数组，所以可以接受一个数组作为参数`public static void main(String... args)`<=>`public static void main(String[] args)`

<a id="threads"></a>

### 线程相关

- StringBuilder 替换线程不安全的StringBuffer
- ConcurrentHashMap 替换原有Hashtable，并且支持所有Hashtable特有的所有“传统”方法
- CopyOnWriteArrayList 由数组支持的 List实现。所有可变操作（例如 add， set和 remove）都是通过创建数组的新副本来实现的
- CopyOnWriteArraySet 由写时复制数组支持的 Set实现。这个实现与 CopyOnWriteArrayList类似
- ConcurrentLinkedQueue 由链接节点支持的无界线程安全FIFO（先进先出）队列
- 线程优先级映射有所改变，允许Java线程和本地线程没有明确设置优先级来平等竞争

<a id="utils"></a>

### 其他

- Override 返回类型 支持协变返回
- Queue 避免集合add/remove的异常操作
    - AbstractQueue 一个骨架队列的实现
    - BlockingQueue 使用在检索元素时等待队列变为非空的操作来扩展 Queue，并且在存储元素时等待队列中的空间变得可用
    - LinkedBlockingQueue 由链接节点支持的可选有界的FIFO阻塞队列。
    - ArrayBlockingQueue 一个由数组支持的有界FIFO阻塞队列。
    - PriorityBlockingQueue 由堆支持的无限制阻塞优先级队列。
    - DelayQueue 一个由堆支持的基于时间的调度队列。
    - SynchronousQueue 一个使用 BlockingQueue接口的简单集合机制。
    - PriorityQueue 一个由堆支持的无限优先级队列
- EnumSet 由位向量支持的高性能 Set实现。每个 EnumSet实例的所有元素必须是单个枚举类型的元素
- EnumMap 由数组支持的高性能 Map实现。每个 EnumMap实例中的所有键必须是单个枚举类型的元素
- ConcurrentMap - 使用原子 putIfAbsent扩展 Map，删除和替换 方法
- 另外还添加了一些集合、数组、以及对应工具类的操作方法

参考资源：[New Features and Enhancements J2SE 5.0](https://docs.oracle.com/javase/1.5.0/docs/relnotes/features.html)

{{ page.date|date_to_string }}

<p>上一篇：<a href="https://mr-lanlin.github.io/2017/12/13/JavaAnnotation.html">Java 注解知识整理</a></p>

<p>下一篇：<a href="https://mr-lanlin.github.io/2018/01/01/Java6新特性.html">Java6新特性</a></p>