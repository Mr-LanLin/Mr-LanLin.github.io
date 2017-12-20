# java高级特性之enum

> **关键字`enum`可以将一组具名的值的有限集合创建为一种新的类型，而这些具名的值可以作为常规的程序组件使用**

### 一、enum基本特性


属性、方法 | 简介
---|---
String name | 实例名
int ordinal | 定义时的次序
Enum(String name, int ordinal) | 默认构造方法
values() | 返回enum实例数组，有序，可用于遍历
int ordinal() | 返回一个int，声明时次序，从0开始
int compareTo(E o) | 比较两个实例定义的先后
String name() | 返回实例名
Class<E> getDeclaringClass() | 返回实例所属的enum类
static T valueOf(Class<T> enumType, String name) | 获取实例
static T valueOf(String name) | 获取实例
toString() | 返回实例名
boolean equals(Object other) | return this==other
int hashCode() | 获取hashCode
Object clone() | 复制对象

#### 静态导入

使用`import static`能够将enum实例的标识符带入当前的命名空间，所以无需再用enum类型来修饰enum实例。定义在默认包中的enum只能在默认包中使用

### 二、向enum添加新方法

enum默认继承了java.lang.Enum，故除了不能再继承其它类以外，enum可以看作是一个普通的类。当然可以添加方法以及重写方法。例：

```java
public enum Seasons {
    SPRING("春天"), SUMMER("夏天"), AUTUMN("秋天"), WINTER("冬天");
    private String desc;

    private Seasons(String desc) {
        this.desc = desc;
    }

    public String getDesc() {
        return desc;
    }

    @Override
    public String toString() {
        String name = name();
        return name.charAt(0) + name.substring(1).toLowerCase();
    }

    public static void main(String[] args) {
        for (Seasons seasons : values()) {
            System.out.println(seasons.toString() + "：" + seasons.getDesc());
        }
    }
}
//输出结果
//Spring：春天
//Summer：夏天
//Autumn：秋天
//Winter：冬天
```

### 三、switch语句中的enum

enum在定义是就自带次序，因此可以在switch中使用enum。例：

```java
public static void main(String[] args) {
    switch (Seasons.AUTUMN) {
        case SPRING:
            System.out.println(SPRING.getDesc());
            break;
        case SUMMER:
            System.out.println(SUMMER.getDesc());
            break;
        case AUTUMN:
            System.out.println(AUTUMN.getDesc());
            break;
        case WINTER:
            System.out.println(WINTER.getDesc());
            break;
    }
}
//输出结果
//秋天
```

### 四、编译器添加的神秘方法

编译器为我们创建的enum类都继承自Enum类，并且还添加了两方法`values()`和`valueOf(String arg0)`，即如果将创建的enum类向上转型为Enum类，则会丢失这两个方法。但在Class中有一个`getEnumConstants()`方法，同样可以获取所有enum实例（如果不是枚举类调用此方法，则返回null）。例：

```java
for (Seasons seasons : Seasons.class.getEnumConstants()) {
    System.out.println(seasons.toString() + "：" + seasons.getDesc());
}
//输出结果
//Spring：春天
//Summer：夏天
//Autumn：秋天
//Winter：冬天
```

### 五、实现、而非继承

enum继承自`java.lang.Enum`，所以不能再继承其他类。例：

```java
public enum Seasons implements IRandomSeasons {
    SPRING("春天"), SUMMER("夏天"), AUTUMN("秋天"), WINTER("冬天");

    private Random random = new Random();//new Random(47);

    private Seasons(String desc) {
        this.desc = desc;
    }

    @Override
    public Seasons getRandomSeasons() {
        return values()[random.nextInt(values().length)];
    }

    public static void main(String[] args) {
        System.out.println(Seasons.SPRING.getRandomSeasons());
        System.out.println(Seasons.SPRING.getRandomSeasons());
    }
}
//输出结果
//SUMMER
//WINTER
```

### 六、随机选取

使用枚举类型作为参数，调用`getEnumConstants()`获取所有枚举实例数组，再从数组中随机返回一个枚举实例。例：

```java
public class Enums {
    private static Random random = new Random();

    public static <T extends Enum<T>> T random(Class<T> cls) {
        return random(cls.getEnumConstants());
    }

    public static <T> T random(T[] values) {
        return values[random.nextInt(values.length)];
    }
    
    public static void main(String[] args) {
        System.out.println(random(Seasons.class));
        System.out.println(random(Seasons.class));
    }
}
//输出结果
//WINTER
//SUMMER
```

### 七、使用接口组织枚举

在接口内部，创建实现该接口的枚举，达到将枚举元素分组的目的。创建一个新的枚举，用其实例包装接口中的每一个枚举类，就可以实现“枚举的枚举”。例：

```java
public enum Meal {
    APPETIZER(IFood.Appetizer.class), 
    MAINCOURSE(IFood.MainCourse.class), 
    DRINKS(IFood.Drinks.class);
    private IFood[] values;

    private Meal(Class<? extends IFood> kind) {
        values = kind.getEnumConstants();
    }

    public IFood randomSelection() {
        return Enums.random(values);
    }

    public interface IFood {
        enum Appetizer implements IFood {
            SALAD, SOUP
        }

        enum MainCourse implements IFood {
            NOODLE, CAKE, RICE
        }

        enum Drinks implements IFood {
            COLA, SPRITE, TEA
        }
    }
    
    public static void main(String[] args) {
        System.out.println(Meal.APPETIZER.randomSelection());
        System.out.println(Meal.APPETIZER.randomSelection());
    }
}
//输出结果
//SALAD
//SOUP
```

### 八、EnumSet

EnumSet是一个抽象类，内部维护一个`Enum[] universe`数组，所以每个元素必须是enum。enum实例定义的次序决定了它在集合中的位置。它有两个子类，当`universe.length <= 64`，则使用RegularEnumSet，否则使用JumboEnumSet。RegularEnumSet内部是一个long变量，JumboEnumSet内部是一个long[]变量，将枚举的ordinal通过位运算存储在long值里。将long值作为“位向量”，所以非常快速高效

### 九、EnumMap

EnumMap是一种特殊的Map，它要求其中的键必须来自一个Enum，由于enum本身是实例数是固定的，所以EnumMap内部使用数组实现。EnumMap在命令模式中的应用:

```java
interface ICommand {
    void action();
}

public class EnumMaps {
    public static void main(String[] args) {
        EnumMap<Seasons, ICommand> enumMap = new EnumMap<Seasons, ICommand>(Seasons.class);
        enumMap.put(Seasons.SPRING, new ICommand() {
            @Override
            public void action() {
                System.out.println("春眠不觉晓，处处闻啼鸟");
            }
        });
        enumMap.put(Seasons.WINTER, new ICommand() {
            @Override
            public void action() {
                System.out.println("冬去冰须泮，春来草自生");
            }
        });
        enumMap.put(Seasons.SUMMER, new ICommand() {
            @Override
            public void action() {
                System.out.println("秋风吹不尽，总是玉关情");
            }
        });
        for (Entry<Seasons, ICommand> entry : enumMap.entrySet()) {
            System.out.print(entry.getKey() + ":");
            entry.getValue().action();
        }
    }
}
//输出结果
//SPRING:春眠不觉晓，处处闻啼鸟
//SUMMER:秋风吹不尽，总是玉关情
//WINTER:冬去冰须泮，春来草自生
```

### 十、常量相关的方法

#### 1、表驱动的代码

Java允许为enum实例编写方法，从而为每个实例赋予不同的行为。但是enum不能当作class，因为每个enum实例都是一个`static final`元素

```java
public enum Seasons implements IRandomSeasons {
    SPRING {
        @Override
        void getPoetry() {
            System.out.println("春眠不觉晓，处处闻啼鸟");
        }
    },
    SUMMER {
        @Override
        void getPoetry() {
            System.out.println("夏日长抱饥，寒夜无被眠");
        }
    },
    AUTUMN {
        @Override
        void getPoetry() {
            System.out.println("秋浦长似秋，萧条使人愁");
        }
    },
    WINTER {
        @Override
        void getPoetry() {
            System.out.println("冬行虽幽墨，冰雪工琢镂");
        }
    };

    abstract void getPoetry();

    public static void main(String[] args) {
        Seasons.SPRING.getPoetry();
        Seasons.AUTUMN.getPoetry();
    }
}
//输出结果
//春眠不觉晓，处处闻啼鸟
//秋浦长似秋，萧条使人愁
```

#### 2、使用enum的责任链

在责任链设计模式中，程序员以不同方式来解决一个问题，然后将它们链接在一起。当请求到来时，它遍历这个链，直到链中的某个解决方案能够处理，而enum定义的次序，决定了各个解决策略在应用时的顺序。下面是检查邮件是否为无效邮件。

```java
class Mail {
    //待收
    enum GeneralDelivery {YES, NO1, NO2, NO3, NO4, NO5}
    //扫描
    enum Scannability {UNSCANNABLE, YES1, YES2, YES3,YES4}
    //可读性
    enum Readbility {ILLEGIBLE, YES1, YES2, YES3, YES4}
    //地址
    enum Address {INCORRECT, OK1, OK2, OK3, OK4, OK5, OK6}
    GeneralDelivery generalDelivery;
    Scannability scannability;
    Readbility readbility;
    Address address;
    static long counter;
    long id = counter++;
    @Override
    public String toString() { return "Mail" + id;}
    public String details() {
        return toString() + ",generalDelivery：" + generalDelivery + ",scannability：" + scannability + ",readbility："
                + readbility + ",address：" + address;
    }
    public static Mail randomMail() {
        Mail mail = new Mail();
        mail.generalDelivery = Enums.random(Mail.GeneralDelivery.class);
        mail.scannability = Enums.random(Mail.Scannability.class);
        mail.readbility = Enums.random(Mail.Readbility.class);
        mail.address = Enums.random(Mail.Address.class);
        return mail;
    }
    public static Iterable<Mail> generator(final int count) {
        return new Iterable<Mail>() {
            @Override
            public Iterator<Mail> iterator() {
                return new Iterator<Mail>() {
                    int index = count;
                    @Override
                    public boolean hasNext() { return index > 0;}
                    @Override
                    public Mail next() {
                        index--;
                        return randomMail();
                    }
                    @Override
                    public void remove() { System.out.println("不能移除");}
                };
            }
        };
    }
}
public class PostOffice {
    enum MailHandler {
        GENERAL_DELIVERY {
            boolean handle(Mail m) {
                switch (m.generalDelivery) {
                    case YES:
                        System.out.println("邮件在邮局待领取-->" + m);
                        return true;
                    default: return false;
                }
            }
        },
        MACHINE_SCAN {
            @Override
            boolean handle(Mail m) {
                switch (m.scannability) {
                    case UNSCANNABLE: return false;
                    default:
                        System.out.println("机器扫描正常-->" + m);
                        return true;
                }
            }
        },
        VISUAL_INSPECTION {
            @Override
            boolean handle(Mail m) {
                switch (m.readbility) {
                    case ILLEGIBLE: return false;
                    default:
                        System.out.println("字迹清晰，可以看懂-->" + m);
                        return true;
                }
            }
        },
        SEND_TO_ADDRESS {
            @Override
            boolean handle(Mail m) {
                switch (m.address) {
                    case INCORRECT: return false;
                    default:
                        System.out.println("地址填写正确-->" + m);
                        return true;
                }
            }
        };
        abstract boolean handle(Mail m);
    }
    static void handle(Mail m) {
        for (MailHandler handler : MailHandler.values()) {
            if (handler.handle(m)) { return;}
        }
        System.out.println("此邮件为无效邮件，通不过扫描、字迹模糊、地址填写错误等...");
    }
    public static void main(String[] args) {
        for (Mail mail : Mail.generator(5)) {
            System.out.println(mail.details());
            handle(mail);
            System.out.println("************************************************");
        }
    }
}
```

#### 3、使用enum的状态机

一个状态机可以具有有限个特定的状态，它可以根据输入，从一个状态转移到下一个状态，每个状态都具有某些可接受的输入，不同的输入会使状态机进入不同的状态。**由于enum对实例有严格限制，非常适合用来表现不同的状态和输入。**

#### 4、使用enum多路分发

```java
public enum Outcome { WIN, LOSE, DRAW}

public class RoShamBo {  
    public static <T extends Enum<T> & Competitor<T>> void play(Class<T> ec,int size){  
        for(int i=0;i<size;i++){  
            match(Enums.next(ec),Enums.next(ec));  
        }  
    }  
    public static <T extends Enum<T> & Competitor<T>> void match(T a ,T b){  
        System.out.println(a + " vs " + b + " == " + a.competitor(b));  
    }  
}  

public interface Competitor<T> {  
    Outcome competitor(T t);  
}  

public enum RoShamBo2 implements Competitor<RoShamBo2> { 
    ROCK(DRAW,WIN,LOSE),  
    SCISSORS(LOSE,DRAW,WIN),  
    PAPER(WIN,LOSE,DRAW);  
    private Outcome vrock;  
    private Outcome vscissors;  
    private Outcome vpaper;  
    private RoShamBo2(Outcome rock,Outcome scissors,Outcome paper){  
        this.vrock= rock;  
        this.vscissors = scissors;  
        this.vpaper = paper;  
    }  
    @Override  
    public Outcome competitor(RoShamBo2 t) {  
        switch(t){  
        default:  
        case ROCK:  
            return vrock;  
        case SCISSORS:  
            return vscissors;  
        case PAPER:  
            return vpaper;  
        }  
    }  
    public static void main(String args[]){  
        RoShamBo.play(RoShamBo2.class, 10);  
    }  
}  
```

#### 5、使用EnumMap多路分发

```java
public enum RoShamBo3 implements Competitor<RoShamBo3> { 
    ROCK, SCISSORS, PAPER;  
    static EnumMap<RoShamBo3, EnumMap<RoShamBo3, Outcome>> table = new EnumMap<RoShamBo3, EnumMap<RoShamBo3, Outcome>>(  
            RoShamBo3.class);  
    static {  
        //初始化表结构 就像一个表格  
        for (RoShamBo3 rs : RoShamBo3.values()) {  
            table.put(rs, new EnumMap<RoShamBo3, Outcome>(RoShamBo3.class));  
        }  
        initRow(ROCK, DRAW, WIN, LOSE);  
        initRow(SCISSORS, LOSE, DRAW, WIN);  
        initRow(PAPER, WIN, LOSE, DRAW);  
    }  
    private static void initRow(RoShamBo3 rs, Outcome vrock, Outcome vscissors,  
            Outcome vpaper) {  
        EnumMap<RoShamBo3, Outcome> rso = table.get(rs);  
        rso.put(ROCK, vrock);  
        rso.put(SCISSORS, vscissors);  
        rso.put(PAPER, vpaper);  
        table.put(rs, rso);  
    }  
    @Override  
    public Outcome competitor(RoShamBo3 t) {  
        return table.get(this).get(t);  
    }  
    public static void main(String args[]) {  
        RoShamBo.play(RoShamBo3.class, 10);  
    }  
}  
```

### 十一、总结：

1. **添加方法前必须先罗列所有枚举实例，并以分号结束**  
2. **构造方法必须为private，enum底层是单例的**
3. **enum自带次序，可以使用swicth语句**
4. **`values()`和`valueOf(String arg0)`是编译器添加的方法**
5. **只能实现接口，不能继承类**
6. **可以与其他语言功能结合，如多态、泛型和反射**