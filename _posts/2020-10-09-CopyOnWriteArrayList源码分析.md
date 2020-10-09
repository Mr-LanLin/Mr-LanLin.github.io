---
title: CopyOnWriteArrayList源码分析
year: 2020
month: 10
day: 09
pic: 44
type: Java
desc: CopyOnWriteArrayList是ArrayList 的一个线程安全的变体，其中所有可变操作（add、set等等）都是通过对底层数组进行一次新的复制来实现的。...
---

# CopyOnWriteArrayList

CopyOnWriteArrayList是ArrayList 的一个线程安全的变体，其中所有可变操作（add、set等等）都是通过对底层数组进行一次新的复制来实现的。

```java
/** The lock protecting all mutators */
//非公平可重入锁
final transient ReentrantLock lock = new ReentrantLock();

/** The array, accessed only via getArray/setArray. */
//底层数组
private transient volatile Object[] array;
```

![CopyOnWriteArrayList](https:///Mr-LanLin.github.io/images/1/CopyOnWriteArrayList.png)

## 构造函数

### 一、public CopyOnWriteArrayList()

创建一个空的集合

```java
/**
 * Creates an empty list.
 */
public CopyOnWriteArrayList() {
    setArray(new Object[0]);
}
```

### 二、public CopyOnWriteArrayList(Collection<? extends E> c)

按集合的迭代器返回的顺序，创建包含指定集合的元素的集合。

1. 如果传入的集合是CopyOnWriteArrayList，则直接将array赋给新的CopyOnWriteArrayList。
2. 否则，将传入的集合转为Object[]赋给array。

```java
/**
 * Creates a list containing the elements of the specified
 * collection, in the order they are returned by the collection's
 * iterator.
 *
 * @param c the collection of initially held elements
 * @throws NullPointerException if the specified collection is null
 */
public CopyOnWriteArrayList(Collection<? extends E> c) {
    Object[] elements;
    if (c.getClass() == CopyOnWriteArrayList.class)
        elements = ((CopyOnWriteArrayList<?>)c).getArray();
    else {
        elements = c.toArray();
        // c.toArray might (incorrectly) not return Object[] (see 6260652)
        if (elements.getClass() != Object[].class)
            elements = Arrays.copyOf(elements, elements.length, Object[].class);
    }
    setArray(elements);
}
```

### 三、public CopyOnWriteArrayList(E[] toCopyIn)

创建一个包含指定数组的集合。将给定数组转换为Object[]，赋值给array。

```java
/**
 * Creates a list holding a copy of the given array.
 *
 * @param toCopyIn the array (a copy of this array is used as the
 *        internal array)
 * @throws NullPointerException if the specified array is null
 */
public CopyOnWriteArrayList(E[] toCopyIn) {
    setArray(Arrays.copyOf(toCopyIn, toCopyIn.length, Object[].class));
}
```

## 主要方法

### 一、public ~ add(···)

1. public boolean add(E e) 在集合最后添加一个元素
2. public void add(int index, E element) 在集合指定位置，添加一个元素
3. public boolean addIfAbsent(E e) 不存在则添加
4. public boolean addAll(Collection<? extends E> c) 添加指定集合得所有元素
5. public boolean addAll(int index, Collection<? extends E> c) 在指定位置开始，添加指定集合得所有元素
6. public int addAllAbsent(Collection<? extends E> c)  将指定集合中在目标集合中不存在的元素添加到目标集合中

```java
/**
 * Appends the specified element to the end of this list.
 * 在集合最后添加一个元素
 * @param e element to be appended to this list
 * @return {@code true} (as specified by {@link Collection#add})
 */
public boolean add(E e) {
    final ReentrantLock lock = this.lock;
    // 加锁
    lock.lock();
    try {
        Object[] elements = getArray();
        int len = elements.length;
        // 复制一个新的数组，长度+1
        Object[] newElements = Arrays.copyOf(elements, len + 1);
        // 在新的位置赋值元素
        newElements[len] = e;
        // 新数组覆盖原数组
        setArray(newElements);
        return true;
    } finally {
        //释放锁
        lock.unlock();
    }
}


/**
 * Inserts the specified element at the specified position in this
 * list. Shifts the element currently at that position (if any) and
 * any subsequent elements to the right (adds one to their indices).
  在集合指定位置，添加一个元素
 *
 * @throws IndexOutOfBoundsException {@inheritDoc}
 */
public void add(int index, E element) {
    final ReentrantLock lock = this.lock;
    //加锁
    lock.lock();
    try {
        Object[] elements = getArray();
        int len = elements.length;
        // 检查index
        if (index > len || index < 0)
            throw new IndexOutOfBoundsException("Index: "+index+
                                                ", Size: "+len);
        Object[] newElements;
        int numMoved = len - index;
        //复制数组，index是最后一位，直接复制
        if (numMoved == 0)
            newElements = Arrays.copyOf(elements, len + 1);
        //否则，以index为分界，分别复制前面和后面的元素
        else {
            newElements = new Object[len + 1];
            System.arraycopy(elements, 0, newElements, 0, index);
            System.arraycopy(elements, index, newElements, index + 1,
                             numMoved);
        }
        //在指定位置存放值
        newElements[index] = element;
        //覆盖原数组
        setArray(newElements);
    } finally {
        //释放锁
        lock.unlock();
    }
}


/**
 * Appends the element, if not present.
 * 不存在则添加
 * @param e element to be added to this list, if absent
 * @return {@code true} if the element was added
 */
public boolean addIfAbsent(E e) {
    Object[] snapshot = getArray();
    //调用index检索元素，没有则不添加
    return indexOf(e, snapshot, 0, snapshot.length) >= 0 ? false :
        addIfAbsent(e, snapshot);
}


/**
 * A version of addIfAbsent using the strong hint that given
 * recent snapshot does not contain e.
 */
private boolean addIfAbsent(E e, Object[] snapshot) {
    final ReentrantLock lock = this.lock;
    //锁
    lock.lock();
    try {
        Object[] current = getArray();
        int len = current.length;
        // 快照和当前array不相等，说明集合已经发生变化
        if (snapshot != current) {
            // Optimize for lost race to another addXXX operation
            // 检索元素，如存在，则返回false
            int common = Math.min(snapshot.length, len);
            for (int i = 0; i < common; i++)
                if (current[i] != snapshot[i] && eq(e, current[i]))
                    return false;
            if (indexOf(e, current, common, len) >= 0)
                    return false;
        }
        Object[] newElements = Arrays.copyOf(current, len + 1);
        newElements[len] = e;
        setArray(newElements);
        return true;
    } finally {
        //释放锁
        lock.unlock();
    }
}


/**
 * Appends all of the elements in the specified collection to the end
 * of this list, in the order that they are returned by the specified
 * collection's iterator.
 * 添加指定集合得所有元素
 *
 * @param c collection containing elements to be added to this list
 * @return {@code true} if this list changed as a result of the call
 * @throws NullPointerException if the specified collection is null
 * @see #add(Object)
 */
public boolean addAll(Collection<? extends E> c) {
    Object[] cs = (c.getClass() == CopyOnWriteArrayList.class) ?
        ((CopyOnWriteArrayList<?>)c).getArray() : c.toArray();
    if (cs.length == 0)
        return false;
    final ReentrantLock lock = this.lock;
    //锁
    lock.lock();
    try {
        Object[] elements = getArray();
        int len = elements.length;
        //原来为空，直接设置array
        if (len == 0 && cs.getClass() == Object[].class)
            setArray(cs);
        //否则，转换指定集合为数组，复制到新数组，覆盖原数组
        else {
            Object[] newElements = Arrays.copyOf(elements, len + cs.length);
            System.arraycopy(cs, 0, newElements, len, cs.length);
            setArray(newElements);
        }
        return true;
    } finally {
        //释放
        lock.unlock();
    }
}


/**
 * Inserts all of the elements in the specified collection into this
 * list, starting at the specified position.  Shifts the element
 * currently at that position (if any) and any subsequent elements to
 * the right (increases their indices).  The new elements will appear
 * in this list in the order that they are returned by the
 * specified collection's iterator.
 * 在指定位置开始，添加所有元素
 *
 * @param index index at which to insert the first element
 *        from the specified collection
 * @param c collection containing elements to be added to this list
 * @return {@code true} if this list changed as a result of the call
 * @throws IndexOutOfBoundsException {@inheritDoc}
 * @throws NullPointerException if the specified collection is null
 * @see #add(int,Object)
 */
public boolean addAll(int index, Collection<? extends E> c) {
    Object[] cs = c.toArray();
    final ReentrantLock lock = this.lock;
    lock.lock();
    try {
        Object[] elements = getArray();
        int len = elements.length;
        if (index > len || index < 0)
            throw new IndexOutOfBoundsException("Index: "+index+
                                                ", Size: "+len);
        if (cs.length == 0)
            return false;
        int numMoved = len - index;
        Object[] newElements;
        if (numMoved == 0)
            newElements = Arrays.copyOf(elements, len + cs.length);
        else {
            newElements = new Object[len + cs.length];
            System.arraycopy(elements, 0, newElements, 0, index);
            System.arraycopy(elements, index,
                             newElements, index + cs.length,
                             numMoved);
        }
        System.arraycopy(cs, 0, newElements, index, cs.length);
        setArray(newElements);
        return true;
    } finally {
        lock.unlock();
    }
}


/**
 * Appends all of the elements in the specified collection that
 * are not already contained in this list, to the end of
 * this list, in the order that they are returned by the
 * specified collection's iterator.
 * 将指定集合中在目标集合中不存在的元素添加到目标集合中
 *
 * @param c collection containing elements to be added to this list
 * @return the number of elements added
 * @throws NullPointerException if the specified collection is null
 * @see #addIfAbsent(Object)
 */
public int addAllAbsent(Collection<? extends E> c) {
    Object[] cs = c.toArray();
    if (cs.length == 0)
        return 0;
    final ReentrantLock lock = this.lock;
    lock.lock();
    try {
        Object[] elements = getArray();
        int len = elements.length;
        int added = 0;
        // uniquify and compact elements in cs
        // cs中存放要添加的元素，added记录要添加的个数
        for (int i = 0; i < cs.length; ++i) {
            Object e = cs[i];
            if (indexOf(e, elements, 0, len) < 0 &&
                indexOf(e, cs, 0, added) < 0)
                cs[added++] = e;
        }
        // 根据added，从cs中复制要添加的元素
        if (added > 0) {
            Object[] newElements = Arrays.copyOf(elements, len + added);
            System.arraycopy(cs, 0, newElements, len, added);
            setArray(newElements);
        }
        return added;
    } finally {
        lock.unlock();
    }
}
```

### 二、public E get(int index)

从数组指定位置取值

```java
/**
 * {@inheritDoc}
 *
 * @throws IndexOutOfBoundsException {@inheritDoc}
 */
public E get(int index) {
    return get(getArray(), index);
}

@SuppressWarnings("unchecked")
private E get(Object[] a, int index) {
    return (E) a[index];
}
```

### 三、public ~ remove(···)

1. public E remove(int index)移除指定位置的元素
2. public boolean remove(Object o)移除指定的元素
3. public boolean removeAll(Collection<?> c) 移除指定集合中的元素
4. public boolean removeIf(Predicate<? super E> filter) 按条件移除

```java
/**
 * Removes the element at the specified position in this list.
 * Shifts any subsequent elements to the left (subtracts one from their
 * indices).  Returns the element that was removed from the list.
 *
 * @throws IndexOutOfBoundsException {@inheritDoc}
 */
public E remove(int index) {
    final ReentrantLock lock = this.lock;
    lock.lock();
    try {
        Object[] elements = getArray();
        int len = elements.length;
        E oldValue = get(elements, index);
        int numMoved = len - index - 1;
        if (numMoved == 0)
            setArray(Arrays.copyOf(elements, len - 1));
        else {
            Object[] newElements = new Object[len - 1];
            System.arraycopy(elements, 0, newElements, 0, index);
            System.arraycopy(elements, index + 1, newElements, index,
                             numMoved);
            setArray(newElements);
        }
        return oldValue;
    } finally {
        lock.unlock();
    }
}


/**
 * Removes the first occurrence of the specified element from this list,
 * if it is present.  If this list does not contain the element, it is
 * unchanged.  More formally, removes the element with the lowest index
 * {@code i} such that
 * <tt>(o==null&nbsp;?&nbsp;get(i)==null&nbsp;:&nbsp;o.equals(get(i)))</tt>
 * (if such an element exists).  Returns {@code true} if this list
 * contained the specified element (or equivalently, if this list
 * changed as a result of the call).
 *
 * @param o element to be removed from this list, if present
 * @return {@code true} if this list contained the specified element
 */
public boolean remove(Object o) {
    Object[] snapshot = getArray();
    int index = indexOf(o, snapshot, 0, snapshot.length);
    return (index < 0) ? false : remove(o, snapshot, index);
}


/**
 * Removes from this list all of its elements that are contained in
 * the specified collection. This is a particularly expensive operation
 * in this class because of the need for an internal temporary array.
 *
 * @param c collection containing elements to be removed from this list
 * @return {@code true} if this list changed as a result of the call
 * @throws ClassCastException if the class of an element of this list
 *         is incompatible with the specified collection
 *         (<a href="../Collection.html#optional-restrictions">optional</a>)
 * @throws NullPointerException if this list contains a null element and the
 *         specified collection does not permit null elements
 *         (<a href="../Collection.html#optional-restrictions">optional</a>),
 *         or if the specified collection is null
 * @see #remove(Object)
 */
public boolean removeAll(Collection<?> c) {
    if (c == null) throw new NullPointerException();
    final ReentrantLock lock = this.lock;
    lock.lock();
    try {
        Object[] elements = getArray();
        int len = elements.length;
        if (len != 0) {
            // temp array holds those elements we know we want to keep
            int newlen = 0;
            Object[] temp = new Object[len];
            for (int i = 0; i < len; ++i) {
                Object element = elements[i];
                if (!c.contains(element))
                    temp[newlen++] = element;
            }
            if (newlen != len) {
                setArray(Arrays.copyOf(temp, newlen));
                return true;
            }
        }
        return false;
    } finally {
        lock.unlock();
    }
}


public boolean removeIf(Predicate<? super E> filter) {
    if (filter == null) throw new NullPointerException();
    final ReentrantLock lock = this.lock;
    lock.lock();
    try {
        Object[] elements = getArray();
        int len = elements.length;
        if (len != 0) {
            int newlen = 0;
            Object[] temp = new Object[len];
            for (int i = 0; i < len; ++i) {
                @SuppressWarnings("unchecked") E e = (E) elements[i];
                if (!filter.test(e))
                    temp[newlen++] = e;
            }
            if (newlen != len) {
                setArray(Arrays.copyOf(temp, newlen));
                return true;
            }
        }
        return false;
    } finally {
        lock.unlock();
    }
}
```

### 四、public ~ indexOf(···)

1. public int indexOf(Object o) 检索某元素
2. public int indexOf(E e, int index) 从指定位置开始检索某元素
3. public int lastIndexOf(Object o) 反向检索某元素
4. public int lastIndexOf(E e, int index) 从指定位置开始反向检索某元素

正向、反向遍历数组比较元素返回下标。

```java
/**
 * {@inheritDoc}
 */
public int indexOf(Object o) {
    Object[] elements = getArray();
    return indexOf(o, elements, 0, elements.length);
}

/**
 * Returns the index of the first occurrence of the specified element in
 * this list, searching forwards from {@code index}, or returns -1 if
 * the element is not found.
 * More formally, returns the lowest index {@code i} such that
 * <tt>(i&nbsp;&gt;=&nbsp;index&nbsp;&amp;&amp;&nbsp;(e==null&nbsp;?&nbsp;get(i)==null&nbsp;:&nbsp;e.equals(get(i))))</tt>,
 * or -1 if there is no such index.
 *
 * @param e element to search for
 * @param index index to start searching from
 * @return the index of the first occurrence of the element in
 *         this list at position {@code index} or later in the list;
 *         {@code -1} if the element is not found.
 * @throws IndexOutOfBoundsException if the specified index is negative
 */
public int indexOf(E e, int index) {
    Object[] elements = getArray();
    return indexOf(e, elements, index, elements.length);
}

/**
 * static version of indexOf, to allow repeated calls without
 * needing to re-acquire array each time.
 * @param o element to search for
 * @param elements the array
 * @param index first index to search
 * @param fence one past last index to search
 * @return index of element, or -1 if absent
 */
private static int indexOf(Object o, Object[] elements,
                           int index, int fence) {
    if (o == null) {
        for (int i = index; i < fence; i++)
            if (elements[i] == null)
                return i;
    } else {
        for (int i = index; i < fence; i++)
            if (o.equals(elements[i]))
                return i;
    }
    return -1;
}

/**
 * {@inheritDoc}
 */
public int lastIndexOf(Object o) {
    Object[] elements = getArray();
    return lastIndexOf(o, elements, elements.length - 1);
}

/**
 * Returns the index of the last occurrence of the specified element in
 * this list, searching backwards from {@code index}, or returns -1 if
 * the element is not found.
 * More formally, returns the highest index {@code i} such that
 * <tt>(i&nbsp;&lt;=&nbsp;index&nbsp;&amp;&amp;&nbsp;(e==null&nbsp;?&nbsp;get(i)==null&nbsp;:&nbsp;e.equals(get(i))))</tt>,
 * or -1 if there is no such index.
 *
 * @param e element to search for
 * @param index index to start searching backwards from
 * @return the index of the last occurrence of the element at position
 *         less than or equal to {@code index} in this list;
 *         -1 if the element is not found.
 * @throws IndexOutOfBoundsException if the specified index is greater
 *         than or equal to the current size of this list
 */
public int lastIndexOf(E e, int index) {
    Object[] elements = getArray();
    return lastIndexOf(e, elements, index);
}

/**
 * static version of lastIndexOf.
 * @param o element to search for
 * @param elements the array
 * @param index first index to search
 * @return index of element, or -1 if absent
 */
private static int lastIndexOf(Object o, Object[] elements, int index) {
    if (o == null) {
        for (int i = index; i >= 0; i--)
            if (elements[i] == null)
                return i;
    } else {
        for (int i = index; i >= 0; i--)
            if (o.equals(elements[i]))
                return i;
    }
    return -1;
}
```

### 五、public void replaceAll(UnaryOperator<E> operator)

```java
public void replaceAll(UnaryOperator<E> operator) {
    if (operator == null) throw new NullPointerException();
    final ReentrantLock lock = this.lock;
    lock.lock();
    try {
        Object[] elements = getArray();
        int len = elements.length;
        Object[] newElements = Arrays.copyOf(elements, len);
        for (int i = 0; i < len; ++i) {
            @SuppressWarnings("unchecked") E e = (E) elements[i];
            newElements[i] = operator.apply(e);
        }
        setArray(newElements);
    } finally {
        lock.unlock();
    }
}
```

使用示例

```java
CopyOnWriteArrayList<Integer> b = new CopyOnWriteArrayList<>();
b.add(1);
b.add(2);
b.add(3);
b.replaceAll(t -> t -> t % 2 == 0 ? t + 1 : t);
System.out.println(b);//[1, 3, 3]
```

### 六、public boolean contains(Object o)

1. public boolean contains(Object o) 是否包含某元素
2. public boolean containsAll(Collection<?> c) 是否包含指定集合的所有元素

通过（循环）调用indexOf(···)来判断是否包含某元素

```java
/**
 * Returns {@code true} if this list contains the specified element.
 * More formally, returns {@code true} if and only if this list contains
 * at least one element {@code e} such that
 * <tt>(o==null&nbsp;?&nbsp;e==null&nbsp;:&nbsp;o.equals(e))</tt>.
 *
 * @param o element whose presence in this list is to be tested
 * @return {@code true} if this list contains the specified element
 */
public boolean contains(Object o) {
    Object[] elements = getArray();
    return indexOf(o, elements, 0, elements.length) >= 0;
}


/**
 * Returns {@code true} if this list contains all of the elements of the
 * specified collection.
 *
 * @param c collection to be checked for containment in this list
 * @return {@code true} if this list contains all of the elements of the
 *         specified collection
 * @throws NullPointerException if the specified collection is null
 * @see #contains(Object)
 */
public boolean containsAll(Collection<?> c) {
    Object[] elements = getArray();
    int len = elements.length;
    for (Object e : c) {
        if (indexOf(e, elements, 0, len) < 0)
            return false;
    }
    return true;
}
```

### 七、public List<E> subList(int fromIndex, int toIndex)

0. public List<E> subList(int fromIndex, int toIndex)
    - subList使用了静态内部类COWSubList
1. public Iterator<E> iterator()
    - iterator使用了常量类COWIterator
2. public ListIterator<E> listIterator()
3. public ListIterator<E> listIterator(int index)
    - listIterator使用了静态内部类COWSubListIterator

**`COWSubList<E> extends AbstractList<E> implements RandomAccess`**

COWSubList继承自AbstractList，拥有List的基本操作。它的set()、get()、size()、add()、clear()、remove()、iterator()、listIterator()等都有加锁。

- **内部持有的集合和原集合是同一个，COWSubList增加元素时，原集合也会增加**
- **但是修改原集合，则COWSubList不能再使用，因为其内部有一个fail-fast**

```java
// only call this holding l's lock
COWSubList(CopyOnWriteArrayList<E> list,
           int fromIndex, int toIndex) {
    //原集合
    l = list;
    //原数组。原集合结构变化时，l.getArray()会变化
    expectedArray = l.getArray();
    offset = fromIndex;
    size = toIndex - fromIndex;
}

// only call this holding l's lock
private void checkForComodification() {
    //原数组和COWSubList中的数组不相同时，抛出异常
    if (l.getArray() != expectedArray)
        throw new ConcurrentModificationException();
}
```

## 小结

1. **底层数组使用transient volatile修饰，强制线程从主内存读取该变量**
2. **涉及结构变动的操作都加了ReentrantLock可重入锁**
3. **底层都是通过System.arraycopy操作数组**
4. **更适合不常增删的场景**
    - COWList内部没有扩容机制，都是复制一个数组副本copy，给指定位置赋值on，然后覆盖原数组write，消耗很大。使用时，应当指定容量，避免频繁扩容导致fullGC或OOM
    - 虽然COWList没有fail-fast机制，但它的子数组COWSubList有fail-fas机制，原数组变化后，子数组需要重新生成。

{{ page.date|date_to_string }}

<p>上一篇：<a href="https://mr-lanlin.github.io/2020/10/01/ConcurrentHashMap源码分析.html">ConcurrentHashMap源码分析</a></p>

<p>下一篇：<a href="https://mr-lanlin.github.io/2020/10/09/CopyOnWriteArrayList源码分析.html">CopyOnWriteArrayList源码分析</a></p>