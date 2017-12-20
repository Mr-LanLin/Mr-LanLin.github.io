# ArrayList 剖析

### 一、总体介绍

ArrayList | 数组列表
---|---
static final int DEFAULT_CAPACITY = 10|初始化容量
static final Object[] EMPTY_ELEMENTDATA = {}|无参构造使用的空数组
int size | 集合元素个数
transient Object[] elementData | 装元素的数组
transient int modCount (extends) | 记录修改次数

`Object[] elementData`

1 | 2 | 3 | 4 | 5 |  |  |  |
---|---|---|---|---|---|---|---

&nbsp;<———— size ————>

&nbsp;<—————— capacity ——————>

`ArrayList`继承自`AbstractList`，实现了`List`、`RandomAccess`、`Cloneable`、`Serializable`接口，内部使用`Object[]`容纳元素。这表明`ArrayList`**可以有序存放任何元素，拥有增删改查功能，并且可以快速随机访问，可以复制，可以被序列化**

### 二、方法解析

#### 1、构造函数

`public ArrayList(int initialCapacity)`指定初始化容量大小为initialCapacity

`public ArrayList()`不指定初始化容量，默认为0或10(不同版本的JDK或不同)

`public ArrayList(Collection<? extends E> c)`用一个现有集合c，初始化新的ArrayList，c的元素作为elementData的元素

#### 2、普通方法

##### `public int size()`获取元素个数

> 思路:返回size

##### `public boolean isEmpty()`是否没有元素

> 思路：size == 0

##### `public boolean contains(Object o)`是否包含某元素

> 思路：indexOf(o)

##### `public int indexOf(Object o)`某元素在集合中的索引，没有该元素返回-1

> 思路：遍历比较，null特殊处理

##### `public int lastIndexOf(Object o)`最后一次出现的索引，没有该元素返回-1

> 思路：同indexOf，从后往回比较

##### `public Object clone()`复制集合

> 思路：调用Object的`clone()`，`Arrays.copyOf(elementData, size)`复制元素

##### `public Object[] toArray()`转换为数组

> 思路：`Arrays.copyOf(elementData, size);`

##### `public <T> T[] toArray(T[] a)`转为制定类型的数组

> 思路：检查数组长度`System.arraycopy(elementData, 0, a, 0, size);`

##### `public E get(int index)`获取index位置的元素

> 思路：检查下标，`(E) elementData[index];`

##### `public E set(int index, E element)`设置index位置的元素

> 思路：检查下标，替换index位置的元素

##### `public boolean add(E e)`添加元素

> 思路：`ensureCapacity(size + 1);`，`elementData[size++] = e;`

##### `public void add(int index, E element)`在index位置添加元素

> 思路：检查容量，移动位置`System.arraycopy(elementData, index, elementData, index + 1, size - index);` ，设值`elementData[index] = element;`

##### `public E remove(int index)`移除指定位置的元素

> 思路：检查下标，移动元素`ystem.arraycopy`，最后一位设置为null

##### `public boolean remove(Object o)`移除指定元素（第一个）

> 思路：遍历找到index，`System.arraycopy`移动元素，最后一位设置为null

##### `public void clear()`清空

> 思路：遍历`elementData`，元素设值为null，`size = 0;`

##### `public boolean addAll(Collection<? extends E> c)`添加集合中的所有元素

> 思路：检查容量，`System.arraycopy`复制元素

##### `public boolean addAll(int index, Collection<? extends E> c)`在指定位置开始添加集合中的所有元素

> 思路：检查下标，检查容量，移动index及后面的元素，插入集合c中的元素

##### `public void trimToSize()`去除size以外的容量capacity，即去除elementData未被使用的length

> 思路：`if (size < oldCapacity) { Arrays.copyOf(elementData, size);}`

##### `public void ensureCapacity(int minCapacity)`确保容量

> 思路：`if (minCapacity > oldCapacity)` `newCapacity = (oldCapacity * 3)/2 + 1;`  <br/>`if (newCapacity < minCapacity)``newCapacity = minCapacity;`  <br/>`elementData = Arrays.copyOf(elementData, newCapacity);`

#### 3、继承方法

##### `public Iterator<E> iterator()`获取迭代器（继承自AbstractList）

> 思路：创建一个内部`Iterator`，定义一个游标`cursor`指向下一个即将遍历的索引，`cursor != size()` 则`hasNext()`为true，`cursor != 0`则`hasPrevious()`为true；定义一个`lastRet`指向上一个遍历的索引，`next()`的值为`get(cursor)`，`previous()`的值为`get(lastRet)`

##### `public List<E> subList(int fromIndex, int toIndex)`获取集合的一个子集合（继承自AbstractList）

> 思路：new了一个SubList，SubList内部的AbstractList<E> l = list；offset = fromIndex；size = toIndex - fromIndex；并不是创建了一个新的List，而是通过offset和size，只展示了原集合的一部分

##### `public boolean retainAll(Collection<?> c)`保留在集合c中拥有的元素（继承自AbstractCollection）

> 思路：遍历集合，判断集合c中是否包含当前元素，没有则移除

##### `public boolean containsAll(Collection<?> c)`是否包含集合c中所有的元素（继承自AbstractCollection）

> 思路：遍历集合，判断集合c中是否不包含当前元素，没有则返回false

### 三、总结

- **底层使用数组的形式来实现**
- **排列有序可重复**
- **查询速度快、增删数据慢**
- **线程不安全，效率高**，如果想要线程安全，可使用Collections.synchronizedList(arrayList)、CopyOnWriteArrayList、Vector（效率低不推荐）。或者自行封装ArrayList，对有线程安全的方法加锁
- **ArrayList创建时的大小为0 或 10（JDK版本不同，实现不同）**
    - 创建默认大小为0时，加入第一个元素时，第一次扩容时，默认容量大小为10，每次扩容都以**当前数组大小的1.5倍**去扩容
    - 创建默认大小为10时，扩容都以**当前数组大小的1.5倍 + 1** 去扩容
