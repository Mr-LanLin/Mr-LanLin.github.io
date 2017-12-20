# Java动态特性之反射

**反射库（reflection library）提供了一个非常丰富且精心设计的工具集，以便能够动态操纵Java代码的程序。这项功能被大量地应用于JavaBeans中。使用反射，Java可以支持Visual Basic用户习惯使用的工具，特别是在设计或运行中添加新类时，能够快速地应用开发工具动态地查询新添加类的能力。能够分析类能力的程序称为反射（reflective）**

## Class

在程序运行期间，Java运行时系统始终为所有的对象维护一个被称为运行时的类型标识。这个信息保存着每个对象所属的类足迹。虚拟机利用运行时信息选择相应的方法执行。保存这些信息的类被称为Class。

**有3种方法可以获取Class类对象：**

1. 实例对象的`getClass()`方法
2. Class的静态方法`forName(className)`
3. `T.Class`T是任意的Java类型

```java
Class cls = (new Date()).getClass();
// 只有在className是类名或接口时才能执行，否则抛出java.lang.ClassNotFoundException
Class cls = Class.forName("java.util.Date");
// int不是类，但int.class是一个Class类型的对象
Class cls = int.class;
```

**虚拟机为每个类型管理一个Class对象。因此，可以利用==运算符实现两个类对象比较的操作：**

```java
System.out.println((new Date()).getClass() == Date.class);
```

**`newInstance()`可以用来快速地创建一个类的实例：**

```java
// forName返回描述类名为“java.util.Date”的Class对象
// newInstance返回这个类的一个新实例
Class.forName("java.util.Date").newInstance();
```

`newInstance()`方法调用默认构造器（无参，无关访问权限）初始化新创建的对象，若不存在无参构造器，则抛出java.lang.InstantiationException

## Constructor

通过构造方法可以在运行时动态地创建Java对象，而不只是通过new操作来进行创建。在得到Class类的对象之后，可以通过其中的方法来获取构造方法：

1. `getConstructor`根据参数来获取公共的构造方法
2. `getConstructors`获取所有公共的构造方法
3. `getDeclaredConstructor`根据参数来获取声明的构造方法
4. `getDeclaredConstructors`获取所有的声明的构造方法

得到了java.lang.reflect.Constructor对象之后，就可以获取关于构造方法的更多信息，以及通过newInstance方法创建出新村的对象

### 参数长度可变的构造方法的获取

如果构造方法声明了长度可变的参数，在获取构造方法的时候，需要使用对应的数组类型的Class对象。因为长度可变的参数实际上是通过数组来实现的。

```java
public class TestConstructor {
    public Constructor(String... names) {}
}

public void useConstructor() throws Exception {
    Constructor<TestConstructor> c = TestConstructor.class.getDeclaredConstructor(String[].class);
    // 构造一个这个构造器所属类的新实例
    c.newInstance((Object) new String[] {"a", "b", "c"});
}
```

### 嵌套类（nested class）的构造方法的获取

对于嵌套类的构造方法的获取，需要区分静态和非静态两种情况，即是否在声明嵌套类的时候使用static修饰。静态的嵌套类没有什么特殊之处，按一般的方式使用即可。非静态嵌套类其特殊之处在于它的对象实例中都有一个隐含的对象引用，指向它的外部类对象。也正是这个隐含的对象引用的存在，使非静态嵌套类中的代码可以直接引用外部类中包含的私有域和方法。因此，在获取非静态嵌套类的构造方法的时候，类型参数列表的第一个值必须是外部类的Class对象

```java
static class StaticNestedClass {
    public StaticNestedClass(String name) {}
}

class NestedClass {
    public NestedClass(int count) {}
}

public void useNestedClass() throws Exception {
    // 嵌套静态类的构造方法获取和使用与正常情况一下
    Constructor<StaticNestedClass> sncc = StaticNestedClass.class.getDeclaredConstructor(String.class);
    sncc.newInstance("Alex");
    // 非静态嵌套类的构造方法获取和使用域外部类有关
    Constructor<NestedClass> ncc = NestedClass.class.getDeclaredConstructor(Test.class, int.class);
    NestedClass ic = ncc.newInstance(new Test(), 3);
}
```

## Field

通过反射API获取类中公开的静态域和对象中的实例域。

**4种获取域的方法：**

1. `getField`获取指定名称公共的域（包括继承的）
2. `getFields`获取所有的公共的域（包括继承的）
3. `getDeclaredField`获取指定名称声明的域（不含继承的）
4. `getDeclaredFields`获取所有声明的域（不含继承的）

得到表示域的java.lang.reflect.Field类的对象之后，就可以获取和设置域的值。Field类中除了操作Object的get/set方法外，还有操作基本类型的对应方法，包括getBoolean/setBoolean、getByte/setByte、getChar/setChar、getDouble/setDouble、getFloat/setFloat、getInt/setInt、getLong/setLong等

```java
public void useField() throws Exception {
    Field count = FieldTest.class.getDeclaredField("count");
    // 设置静态域
    fieldCount.set(null, 3);
    Field name = FieldTest.class.getDeclaredField("name");
    FieldTest fieldTest = new FieldTest();
    // 设置实例域
    name.set(fieldTest, "Jack");
}
```

**注：只能获取/操作公开域，没办法获取/操作私有域**

## Method

通过反射API还可以获取方法，这也是最常使用的反射API的场景，即获取到一个对象中的方法，并在运行时调用该方法。

**4种获取方法的方式：**

1. `getMethod`获取指定名称的公共方法（包含继承的）
2. `getMethods`获取所有的公共方法（包含继承的）
3. `getDeclaredMethod`获取指定名称声明的方法（不含继承的）
4. `getDeclaredMethods`获取所有声明的方法（不含继承的）

在得到java.lang.reflect.Method类的对象之后，可以查询方法的详细信息（参数、返回值等等）。最重要的是可以通过invoke方法来传入实际参数并调用该方法。

```java
public void useMethod() throws Exception {
    MethodTest mt = new MethodTest();
    // 获取公共方法pubMethod
    Method pubMethod = MethodTest.class.getMethod("pubMethod");
    pubMethod.invoke(mt);
    // 获取声明的（私有）方法priMethod
    Method priMethod = MethodTest.class.getDeclaredMethod("priMethod", String.class);
    // 设置私有放法访问权限
    priMethod.setAccessible(true)
    priMethod.invoke(mt, "hello world");
}
```

**注：可以获取私有方法，调用私有方法前需要先调用setAccessible方法来设置访问权限；调用静态方法，invoke第一个参数可以为null**

## Array

使用反射对数组进行操作的方式不同于一般的java对象，是通过专门的java.lang.reflect.Array这个工具类来实现的。Array类中提供的方法包括创建数组和操作数组中的元素。newInstance方法用来创建新的数组，第一个参数是数组中元素的类型，后面的参数是数组的纬度信息

```java
String[] names = (String[]) Array.newInstance(String.class, 10);
names[0] = "Hello, ";
Array.set(names, 1, "World!");
int[][][] matrix1 = (int[][][]) Array.newInstance(int.class, 3, 3, 3);
matrix1[0][0][0] = 1;
int[][][] matrix2 = (int[][][]) Array.newInstance(int[].class, 3, 4);
matrix2[0][0] = new int[10];
matrix2[0][1] = new int[3];
matrix2[0][0][1] = 1;
```

**使用反射编写泛型数组**

一个Object数组不能转为其他对象数组，如果强转，则会在运行时抛出java.lang.ClassCastException。Java数组会记住每个元素的类型，即创建数组时new表达式中使用的元素类型。将一个对象数组临时转为Object[]，然后再转回去是可以的，但一个Object[]的数组却永远不能转换为对象数组。

```java
//获取一个指定类型的数组
Object newArray = Array.newInstance(componentType, newLength);
```

要获得新数组元素类型，需要进行以下工作：

1. 首先获得数组的类对象
2. 确认它是一个数组
3. 使用Class类的getComponentType方法确定数组对应的类型

```java
static Object arrayGrow(Object a) {
    Class cls = a.getClass();
    if (!cls.isArray()) {
        return null;
    }
    // 获取数组对应的类型
    Class componentType = cls.getComponentType();
    int length = Array.getLength(a);
    // 扩容
    int newLength = length * 11 / 10 + 10;
    // 创建一个扩容后的指定类型的数组
    Object newArray = Array.newInstance(componentType, newLength);
    System.arraycopy(a, 0, newArray, 0, length);
    return newArray;
}
```

上面是一个可以用来扩展任意类型的数组的例子。之所以使用Object作为参数，是因为基本类型数组可以转为Object，但是不能转为Object[]

## 访问权限和异常处理

使用反射API可以绕过Java语言中默认的访问控制权限。java.lang.reflect.AccessibleObject中的setAccessible可以用来设置是否绕开默认的权限检查。

在你用invoke方法来调用方法时，如果方法本身抛出了异常，invoke方法会抛出InvocationTargetException异常来表示这种情况。在捕获到InvocationTargetException异常的时候，通过InvocationTargetException异常的getCause方法可以获取到真正的异常信息。Java 7为所有与反射操作相关的异常添加了一个新的父类java.lang.ReflectiveOperationException

---

参考文献：

[1] Java核心技术：卷Ⅰ 基础知识（原书第8版）

[2] 深入理解Java 7 核心技术与最佳实践