# Java注解

## 概念

注解（Annotation）是JDK5.0及以后版本引入的。它的作用是修饰包、类、构造方法、方法、成员变量等。**注解本身不具备任何含义，仅仅是对程序做了某种标记，真正做事情的是注解处理器，也就是根据某种标记做某种事情**

![image](https://raw.githubusercontent.com/Mr-LanLin/MyFile/master/Java%E6%B3%A8%E8%A7%A3/25200814-475cf2f3a8d24e0bb3b4c442a4b44734.jpg)

## 内建注解

### 元注解

元注解就是负责注解其他注解的注解

- @Retention 表示注解保留策略
    - RetentionPolicy.SOURCE 注解仅存在于源码中，在class字节码文件中不包含
    - RetentionPolicy.CLASS  默认的保留策略，注解会在class字节码文件中存在，但运行时无法获得
    - RetentionPolicy.RUNTIME 注解会在class字节码文件中存在，在运行时可以通过反射获取到
- @Target 表示注解所修饰的对象类型
    - ElementType.TYPE 接口、类、枚举、注解
    - ElementType.FIELD 字段、枚举的常量
    - ElementType.METHOD 方法
    - ElementType.PARAMETER 方法参数
    - ElementType.CONSTRUCTOR 构造函数
    - ElementType.LOCAL_VARIABLE 局部变量
    - ElementType.ANNOTATION_TYPE 注解
    - ElementType.PACKAGE 包
- @Document 表示该注解将被包含在javadoc中
- @Inherited 表示子类可以继承父类中的该注解
 
### 预定义注解

- @Override 检查是否满足重写父类方法
- @Deprecated 提示目标过时了
- @SuppressWarnings 关闭警告提示
- @SafeVarargs 在编译期间防止潜在的不安全操作（JDK7）

## 自定义

定义注解格式：public @interface 注解名 {定义体}

@interface用来声明一个注解，自动继承了java.lang.annotation.Annotation接口

- 定义体的每一个方法实际上是声明了一个配置参数
    - 方法的名称就是参数的名称
    - 返回值类型就是参数的类型
    - 通过default来声明参数的默认值
- 注解参数的可支持数据类型：
    - 基本数据类型
    - String
    - Class
    - enum
    - Annotation
    - 前面几种类型的数组类型

## 注解处理器

注解只是一个标记，如果没有用来读取注解的方法和工作，那么注解也就不会比注释更有用处了。使用注解的过程中，很重要的一部分就是创建于使用注解处理器。Java SE5扩展了反射机制的API，以帮助程序员快速的构造自定义注解处理器

Java使用Annotation接口来代表程序元素前面的注解，该接口是所有Annotation类型的父接口。除此之外，Java在java.lang.reflect 包下新增了AnnotatedElement接口，该接口代表程序中可以接受注解的程序元素，该接口主要有如下几个实现类：

- Class：类定义
- Constructor：构造器定义
- Field：累的成员变量定义
- Method：类的方法定义
- Package：类的包定义

获取Annotation信息（RetentionPolicy需要设置为RUNTIME，才能使用反射在运行时获取到）：

- <T extends Annotation> T getAnnotation(Class<T> annotationClass)  返回改程序元素上存在的、指定类型的注解，如果该类型注解不存在，则返回null
- Annotation[] getAnnotations() 返回该程序元素上存在的所有注解
- boolean isAnnotationPresent(Class<?extends Annotation> annotationClass) 判断该程序元素上是否包含指定类型的注解，存在则返回true，否则返回false.
- Annotation[] getDeclaredAnnotations() 返回直接存在于此元素上的所有注解。与此接口中的其他方法不同，该方法将忽略继承的注解

## 注解应用一：自定义MVC

**注解：Controller**

```java
package com.thunisoft.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Controller
 * @author lanlin
 * @version 1.0
 *
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface Controller {

}
```

**注解：RequestMapping**

```java
package com.thunisoft.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * RequestMapping
 * @author lanlin
 * @version 1.0
 *
 */
@Target({ ElementType.TYPE, ElementType.METHOD })
@Retention(RetentionPolicy.RUNTIME)
public @interface RequestMapping {
    String value();
}
```

**前段控制器：DispachterServlet**

```java
package com.thunisoft.servlet;

import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import com.thunisoft.annotation.RequestMapping;

/**
 * DispachterServlet
 * @author lanlin
 * @version 1.0
 *
 */
public class DispachterServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    private Map<String, Object> controllers = new HashMap<String, Object>();

    private Map<String, Method> methods = new HashMap<String, Method>();

    /**
     * Destruction of the servlet. <br>
     */
    @Override
    public void destroy() {
        super.destroy();
    }

    /**
     * The doGet method of the servlet. <br>
     *
     * This method is called when a form has its tag value method equals to get.
     * 
     * @param request the request send by the client to the server
     * @param response the response send by the server to the client
     * @throws ServletException if an error occurred
     * @throws IOException if an error occurred
     */
    @Override
    public void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        doPost(request, response);
    }

    /**
     * The doPost method of the servlet. <br>
     *
     * This method is called when a form has its tag value method equals to post.
     * 
     * @param request the request send by the client to the server
     * @param response the response send by the server to the client
     * @throws ServletException if an error occurred
     * @throws IOException if an error occurred
     */
    @Override
    public void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        //拿到URI
        String uri = request.getRequestURI();
        String contextPath = request.getContextPath();
        String mappingPath = uri.substring(uri.indexOf(contextPath) + contextPath.length(), uri.indexOf(".do"));
        Method method = methods.get(mappingPath);
        String className = method.getDeclaringClass().getName();
        Object controller = controllers.get(className);
        try {
            String result = (String) method.invoke(controller);
            //转到对应视图
            request.getRequestDispatcher("/" + result).forward(request, response);
        } catch (IllegalArgumentException e) {
            e.printStackTrace();
        } catch (IllegalAccessException e) {
            e.printStackTrace();
        } catch (InvocationTargetException e) {
            e.printStackTrace();
        }

    }

    /**
     * Initialization of the servlet. <br>
     *
     * @throws ServletException if an error occurs
     */
    @Override
    @SuppressWarnings({ "rawtypes", "unchecked" })
    public void init() throws ServletException {
        //扫描基础包（basePackage）加载类，通过file对象，读取文件目录，拼接完整类名
        try {
            Class clazz = Class.forName("com.thunisoft.controller.IndexController");
            //注册类
            controllers.put(clazz.getName(), clazz.newInstance());
            Method[] methodArr = clazz.getMethods();
            //注册方法
            for (Method method : methodArr) {
                if (method.getAnnotation(RequestMapping.class) == null) {
                    continue;
                }
                RequestMapping mapping = (RequestMapping) clazz.getAnnotation(RequestMapping.class);
                methods.put(mapping.value() + method.getAnnotation(RequestMapping.class).value(), method);
            }
        } catch (ClassNotFoundException e) {
            e.printStackTrace();
        } catch (InstantiationException e) {
            e.printStackTrace();
        } catch (IllegalAccessException e) {
            e.printStackTrace();
        }
    }

}
```

**控制器：Controller**

```java
package com.thunisoft.controller;

import com.thunisoft.annotation.Controller;
import com.thunisoft.annotation.RequestMapping;

/**
 * IndexController
 * @author lanlin
 * @version 1.0
 *
 */
@Controller
@RequestMapping("/index")
public class IndexController {
    @RequestMapping("/index")
    public String index() {
        System.out.println("业务处理");
        return "index.jsp";
    }

    @RequestMapping("/test")
    public String test() {
        System.out.println("业务处理");
        return "test.jsp";
    }
}
```

## 注解应用二：动态代理

### 概念

**代理**：代替其他对象做某事【你有事去不了，我替你去一下】

**静态代理**：在编译的时候就已经确定了代理与被代理的关系【你妈拿着你的信息，去替你找媳妇儿】

**动态代理**：在运行时才创建代理类【婚姻介绍所接收你的信息，替你去物色对象，至于是哪个客户去，就要等去的时候才知道了】

![image](https://raw.githubusercontent.com/Mr-LanLin/MyFile/master/Java%E6%B3%A8%E8%A7%A3/1085268-20170409105440082-1652546649.jpg)

**动态代理例子：**

```java
package com.thunisoft.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * After
 * @author lanlin
 * @version 1.0
 *
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface After {

}

************************************************************************************

package com.thunisoft.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Aspect
 * @author lanlin
 * @version 1.0
 *
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface Aspect {

}

************************************************************************************

package com.thunisoft.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Before
 * @author lanlin
 * @version 1.0
 *
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Before {

}

************************************************************************************

package com.thunisoft.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Before
 * @author lanlin
 * @version 1.0
 *
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Before {

}

************************************************************************************

package com.thunisoft.test;

import com.thunisoft.annotation.After;
import com.thunisoft.annotation.Aspect;
import com.thunisoft.annotation.Before;
import com.thunisoft.annotation.Pointcut;

/**
 * Interceptor
 * @author lanlin
 * @version 1.0
 *
 */
@Aspect
public class Interceptor {
    @Pointcut(pkg = "com.thunisoft.test", methodName = "sayHello")
    @After
    public void sayWorld() {
        System.out.print(" world");
    }

    @Pointcut(pkg = "com.thunisoft.test", methodName = "sayWorld")
    @Before
    public void sayHello() {
        System.out.print("hello ");
    }
}

************************************************************************************

package com.thunisoft.test;

/**
 * ISubject
 * @author lanlin
 * @version 1.0
 *
 */
public interface ISubject {
    public void sayHello();

    public void sayWorld();
}

************************************************************************************

package com.thunisoft.test;

/**
 * TestObj
 * @author lanlin
 * @version 1.0
 *
 */
public class RealSubject implements ISubject {

    @Override
    public void sayHello() {
        System.out.print("hello");
    }

    @Override
    public void sayWorld() {
        System.out.print("world");
    }
}

************************************************************************************

package com.thunisoft.proxy;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;

import com.thunisoft.annotation.After;
import com.thunisoft.annotation.Aspect;
import com.thunisoft.annotation.Before;
import com.thunisoft.annotation.Pointcut;
import com.thunisoft.test.ISubject;
import com.thunisoft.test.Interceptor;

/**
 * AnnotationInvocationHandler
 * @author lanlin
 * @version 1.0
 *
 */
public class AnnotationInvocationHandler implements InvocationHandler {

    private ISubject subject;

    /**
     * 
     */
    public AnnotationInvocationHandler(ISubject subject) {
        this.subject = subject;
    }

    /** (non-Javadoc)
     * @see java.lang.reflect.InvocationHandler#invoke(java.lang.Object, java.lang.reflect.Method, java.lang.Object[])
     */
    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        Class<?> clazz = Interceptor.class;
        if (clazz.getAnnotation(Aspect.class) == null) {
            return method.invoke(subject, args);
        }
        for (Method m : clazz.getDeclaredMethods()) {
            if ((method.getName().equals(m.getAnnotation(Pointcut.class).methodName())) && (m.getAnnotation(Before.class) != null)) {
                m.invoke(new Interceptor());
                break;
            }
        }
        Object obj = method.invoke(subject, args);
        for (Method m : clazz.getDeclaredMethods()) {
            if ((method.getName().equals(m.getAnnotation(Pointcut.class).methodName())) && (m.getAnnotation(After.class) != null)) {
                m.invoke(new Interceptor());
                break;
            }
        }
        return obj;
    }
}

************************************************************************************

package com.thunisoft.test;

import java.lang.reflect.Proxy;

import com.thunisoft.proxy.AnnotationInvocationHandler;

/**
 * AnnotationTest
 * @author lanlin
 * @version 1.0
 *
 */
public class Test {
    public static void main(String[] args) {
        AnnotationInvocationHandler handler = new AnnotationInvocationHandler(new RealSubject());
        ISubject proxy = (ISubject) Proxy.newProxyInstance(RealSubject.class.getClassLoader(), new Class[] { ISubject.class }, handler);
        proxy.sayHello();
        System.out.println("\n******************");
        proxy.sayWorld();
    }
}


// 输出：
// hello world
// ******************
// hello world
```