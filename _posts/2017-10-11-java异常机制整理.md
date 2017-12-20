# Java异常机制

### 异常概念

**顾名思义，“异常”就是意料之外的情况。发生了异常则不能正常继续下去了，如果不处理或者不能处理，只能交给上级来处理或者系统崩溃。**

### Java异常介绍

#### 异常框架模型

![image](https://raw.githubusercontent.com/Mr-LanLin/MyFile/master/Java%E5%BC%82%E5%B8%B8/%E5%BC%82%E5%B8%B8.png)

#### 标准异常

&nbsp;&nbsp;&nbsp;&nbsp;Throwable这个Java类被用来表示任何可以作为异常抛出的类。Throwable对象可分为两种类型：Error用来表示编译时问题和系统错误；Exception是可以被抛出的基本类型，在Java类库、用户方法以及运行时故障中都可能抛出Exception型异常。（异常的名称代表发生的问题）  <br/>
&nbsp;&nbsp;&nbsp;&nbsp;RuntimeException运行时异常（非检查型异常）是Exception的一种特例。继承自RuntimeException的异常会自动被Java虚拟机抛出，所以不必手动捕获。如果RuntimeException发生了且没有捕获，在程序退出前将会调用异常的printStackTrace()方法。  <br/>
&nbsp;&nbsp;&nbsp;&nbsp;除了RuntimeException，其他异常编译器都会强制要求处理的。因为RuntimeException属于编程错误，无法预料。

#### 处理异常

**try** 监控区域，此块内尝试各种方法的调用，并且可以捕获异常

**catch** 异常处理程序，针对每个要捕获的异常，做出相应的处理。必须跟在try后面，每个异常自已能提供一个异常处理程序，范围大的在后面。

**finally** 始终会执行的语句块，可用于关闭资源、恢复资源初始状态等。

#### 包装异常

可通过RuntimeException包装检查异常，并且可以创建自定义异常，如下：

```java
public class WrapCheckException{
    public void throwRuntimeException() {
        try {
            throw new IOException();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
```

#### 异常相关方法


方法 | 介绍
---|---
String getMessage() | 获取详细信息
String getLocalizedMessage | 获取本地语言表示的详细信息
String toString() | 返回对Throwable的简单描述，要是有详细信息也会打印
void printStackTrace | 打印Throwable和Throwable的调用栈轨迹
Throwable fillInStackTrace() | 用于在Throwable对象的内部记录栈帧的当前状态
