# HashMap剖析

### 一、总体介绍

HashMap | 散列表
---|---
static final int MAXIMUM_CAPACITY = 1 << 30 | 最大容量2的30次
static final int DEFAULT_INITIAL_CAPACITY = 16 | 默认初始化容量
static final float DEFAULT_LOAD_FACTOR = 0.75f | 默认加载因子
transient Entry[] table | Entry数组，哈希表
transient int size | 元素的个数
int threshold | 扩容阈值
final float loadFactor | 加载因子
transient volatile int modCount | 修改次数
transient Set<Map.Entry<K,V>> entrySet | Eentry集合
transient volatile Set<K> keySet (AbstractMap) | key集合
transient volatile Collection<V> values (AbstractMap) | value集合
`HashMap`继承自`AbstractMap`，实现了`Map`, `Cloneable`, `Serializable`

Entry[] table | first Entry | next Entry | next Entry | next Entry | ...
---|---|---|---|---|---
#0——> | Entry<Key,Value> | Entry<Key,Value> | NULL
#1——> | NULL
#2——> | Entry<Key,Value> | Entry<Key,Value> | Entry<Key,Value> | Entry<Key,Value> | ...
#3——> | Entry<Key,Value> | NULL
... | ...

在HashMap内部，采用了数组+链表的形式来组织键值对Entry<Key,Value>。
HashMap内部维护了一个Entry[] table 数组，当我们使用 new HashMap()创建一个HashMap时，Entry[] table 的默认长度为16。Entry[] table的长度又被称为这个HashMap的容量（capacity）；

对于Entry[] table的每一个元素而言，或为null，或为由若干个Entry<Key,Value>组成的链表。HashMap中Entry<Key,Value>的数目被称为HashMap的大小(size);
Entry[] table中的某一个元素及其对应的Entry<Key,Value>又被称为桶(bucket); 

JVM都会为其生成一个hashcode值。HashMap在存储键值对Entry<Key,Value>的时候，会根据Key的hashcode值，以某种映射关系，决定应当将这对键值对Entry<Key,Value>存储在HashMap中的什么位置上；

然后根据Key值的hashcode，以及内部映射条件，直接定位到Key对应的Value值存放在什么位置，可以非常高效地将Value值取出

根据Key的hashCode，可以直接定位到存储这个Entry<Key,Value>的桶所在的位置，这个时间的复杂度为O(1)；在桶中查找对应的Entry<Key,Value>对象节点，需要遍历这个桶的Entry<Key,Value>链表，时间复杂度为O(n);
Entry[] table数组的长度，由于数组是内存中连续的存储单元，它的空间代价是很大的，但是它的随机存取的速度是Java集合中最快的。我们增大桶的数量，而减少Entry<Key,Value>链表的长度，来提高从HashMap中读取数据的速度。这是典型的拿空间换时间的策略

阀值（threshold）=容量（capacity）*加载因子（load factor）   <br/>
容量（capacity）：HashMap内部Entry[] table的length   <br/>
加载因子（load factor）：元素在容量中最大占比，经验值，一般为0.75   <br/>
阀值（threshold）：size>=阀值，则HashMap容量*2，并且rehash

容量扩充算法：
- 对容量的要求
    - 容量的大小应当是 2的N次幂；
    - 当容量大小超过阀值时，容量扩充为当前的一倍；
- 扩充步骤
    - 申请一个新的、大小为当前容量两倍的数组；
    - 将旧数组的Entry[] table中的链表重新计算hash值，然后重新均匀地放置到新的扩充数组中；
    - 释放旧的数组；
- 合理使用容量
    - 比较明确它要容纳多少Entry<Key,Value>，应在创建HashMap的时候直接指定它的容量
    - 数量很大，那应该控制好加载因子的大小。避免Entry[] table过大，而利用率觉很低

### 二、方法分析

#### 1、构造函数

##### `public HashMap(int initialCapacity, float loadFactor)`指定初始容量和加载因子（构造方法最终都是调用这个，实际容量为>=指定容量，且为2的N次幂`while (capacity < initialCapacity) capacity <<= 1;`）


##### `public HashMap(int initialCapacity)`指定初始容量和默认加载因子 (0.75) 

##### `public HashMap()`默认初始容量 (16) 和默认加载因子 (0.75)

##### `public HashMap(Map<? extends K, ? extends V> m)` 构造一个映射关系与指定 Map 相同的 HashMap

#### 2、普通方法

##### `static int hash(int h)`重新计算`key.hashCode()`，减少hashcode重复概率

> 思路：`h ^= (h >>> 20) ^ (h >>> 12);`  <br/>`return h ^ (h >>> 7) ^ (h >>> 4);`

##### `static int indexFor(int h, int length)`计算hashcode对应的index

> 思路：`return h & (length-1);`等价于`h % (length - 1)`

##### `public int size()`元素个数

> 思路：`return size;`

##### `public boolean isEmpty()`是否为空

> 思路：`return size == 0;`

##### `public V get(Object key)`获取key对应的元素

> 思路：1)`if (key == null) return getForNullKey();`特殊处理key为NULL的情况，NULL key放在table[0]；  <br/>2)计算index，在对应的bucket里寻找hash相等、key相等的元素`if (e.hash == hash && ((k = e.key) == key || key.equals(k))) return e.value;`  <br/>3)否则`return null;`

##### `public boolean containsKey(Object key)`是否包含指定的key

> 思路：`return getEntry(key) != null;`

##### `public V put(K key, V value)`存放key-value键值对

> 思路：1)`if (key == null) return putForNullKey(value);`特殊处理key为NULL的情况，放在table[0]里，如果key存在则替换value，否则放在table[0]的第一位；  <br/>2)计算index，在对应的bucket里寻找hash相等、key相等的元素`if (e.hash == hash && ((k = e.key) == key || key.equals(k))) return e.value;`，存在则替换value；  <br>3)否则 `addEntry(hash, key, value, i);`在索引i位置第一位添加Entry，next指向原`table[bucketIndex]`  <br/>计算大小是否超过阀值，若超过则容量*2，重新组织内部Entry<key,value>

##### `public void putAll(Map<? extends K, ? extends V> m)`将m中的key-value对，存放进HashMap

> 思路：1)检查容量，保证目标HashMap容量大于m；  <br/>2)遍历m，把Entry存进目标HashMap

##### `public V remove(Object key)`移除指定key对应的Entry<Key,Value>

> 思路：1)计算key对应的index  <br/>2)找到对应的桶，遍历寻找key对应的Entry，从桶中移除（修改Entry中next的指向）

##### `public void clear()`清空元素

> 思路：table中元素设为null，size设为0

##### `public boolean containsValue(Object value)`是否包含某value

> 思路：1)`if (value == null) return containsNullValue();`特殊处理NULL；  <br/>2)遍历判value是否相等

##### `public Object clone()`复制HashMap对象

> 思路：1)调用Object的`clone()`复制对象 2)复制元素

##### `public Set<K> keySet()`获取key集合

> 思路：`Set<K> ks = keySet; return (ks != null ? ks : (keySet = new KeySet()));`KeySet是一个内部类，继承自AbstractSet，提供了`iterator()`，`size()`，`contains(Object o)`，`remove(Object o)`，`clear()`等方法，本质都是调用的HashMap的方法

##### `public Collection<V> values()`获取value集合

> 思路：`Collection<V> vs = values; return (vs != null ? vs : (values = new Values()));`Values是一个内部类，继承自AbstractCollection，提供了iterator()，size()，contains(Object o)，clear()等方法，本质也是调用的HashMap的方法

##### `public Set<Map.Entry<K,V>> entrySet`获取Entry集合

> 思路：`Set<Map.Entry<K,V>> es = entrySet; return es != null ? es : (entrySet = new EntrySet());`EntrySet是一个内部类，继承自AbstractSet，提供了iterator()，contains(Object o)，remove(Object o)，size()，clear()等方法，本质也是调用HashMap的方法

#### 3、继承方法

##### `public boolean equals(Object o)`判断与对象o是否相同（继承自AbstractMap）

> 思路：1)`if (o == this) return true;` 2)`if (!(o instanceof Map)) return false;` 3)`if (m.size() != size()) return false;`  <br/> 4)遍历当前HashMap,    <br/>`if (value == null) {`  <br/>
 &nbsp;&nbsp;&nbsp;&nbsp;`if (!(m.get(key)==null && m.containsKey(key))) return false;`  <br/>
                `} else {`  <br/>
 &nbsp;&nbsp;&nbsp;&nbsp;`if (!value.equals(m.get(key))) return false;`  <br/>
                `}`

##### `public int hashCode()`获取对象hashcode（继承自AbstractMap）

> 思路：`int h = 0; Iterator<Entry<K,V>> i = entrySet().iterator();`  <br/>
	`while (i.hasNext())  h += i.next().hashCode(); return h;`

### 三、总结

1. 底层是用链表数组
2. HashMap是线程不安全的，如果想要线程安全,可以使用ConcurrentHashMap、Collections.synchronizedMap、Hashtable（效率低不推荐）。或者在外部包装，实现同步机制；
3. key无序不可重复可为null、value可重复可为null；
4. HashMap的查找效率非常高，因为它使用Hash表对进行查找，可直接定位到Key值所在的桶中；
5. 使用HashMap时，要注意HashMap容量和加载因子的关系，这将直接影响到HashMap的性能问题。加载因子过小，会提高HashMap的查找效率，但同时也消耗了大量的内存空间，加载因子过大，节省了空间，但是会导致HashMap的查找效率降低