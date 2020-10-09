---
title: ConcurrentHashMap源码分析
year: 2020
month: 10
day: 01
pic: 43
type: Java
desc: ConcurrentHashMap是HashMap的线程安全版本，底层数据结构为数组+链表/红黑树，默认容量16，线程同步，不允许[key,value]为null。...
---

# ConcurrentHashMap源码分析

ConcurrentHashMap是HashMap的线程安全版本，底层数据结构为数组+链表/红黑树，默认容量16，线程同步，不允许[key,value]为null。

```java
// 通过一个 Node<K, V> 数组 table 来持有全部数据，每一个 Node 表示一个元素。而每个 Node 的 next 
// 属性则指向链表中的下一个元素，当链表长度大于等于 8 时链表可能会被转化为红黑树以降低搜索复杂度。
transient volatile Node<K,V>[] table;

// nextTable 是一个临时的 Node<K, V> 数组，当数据需要迁移的时候，
// 会把数据都迁移到 nextTable 上，待数据迁移完成再 table = nextTable。
private transient volatile Node<K,V>[] nextTable;
```

![ConcurrentHashMap结构](https:///Mr-LanLin.github.io/images/1/ConcurrentHashMap.png)

## 构造函数

> **一、创建一个新的、空的Map，默认初始大小（16）。**

在第一次put值的时候，使用默认容量`DEFAULT_CAPACITY = 16`初始化。

```java
/**
 * Creates a new, empty map with the default initial table size (16).
 */
public ConcurrentHashMap() {
}
```

> **二、创建一个新的、空的Map，其初始表大小可容纳指定数量的元素，而无需动态调整大小。**

- 1. 入参`int initialCapacity`：指定可以容纳的元素数量。
    - 小于0时，抛异常`IllegalArgumentException`。
    - 大于最大值`MAXIMUM_CAPACITY = 1 << 30`的1/2时，即最大值`MAXIMUM_CAPACITY`。
    - 否则调用`tableSizeFor(int c)`计算容量，使得容量大小总是2的N次方，且大于等于`initialCapacity`
- 2. `private transient volatile int sizeCtl`设置为计算后的容量值。

变量sizeCtl控制初始化和调整大小：
- -1，表示线程正在进行初始化操作。
- -(1+nThreads)，表示正在扩容，有n个线程正在进行协助迁移数据。
- 0，默认值，后续在真正初始化的时候使用默认容量。
- &gt;0，初始化或扩容完成后下一次的扩容门槛。

```java
/**
 * Creates a new, empty map with an initial table size
 * accommodating the specified number of elements without the need
 * to dynamically resize.
 *
 * @param initialCapacity The implementation performs internal
 * sizing to accommodate this many elements.
 * @throws IllegalArgumentException if the initial capacity of
 * elements is negative
 */
public ConcurrentHashMap(int initialCapacity) {
    if (initialCapacity < 0)
        throw new IllegalArgumentException();
    int cap = ((initialCapacity >= (MAXIMUM_CAPACITY >>> 1)) ?
               MAXIMUM_CAPACITY :
               tableSizeFor(initialCapacity + (initialCapacity >>> 1) + 1));
    this.sizeCtl = cap;
}

/**
 * Table initialization and resizing control.  When negative, the
 * table is being initialized or resized: -1 for initialization,
 * else -(1 + the number of active resizing threads).  Otherwise,
 * when table is null, holds the initial table size to use upon
 * creation, or 0 for default. After initialization, holds the
 * next element count value upon which to resize the table.
 */
private transient volatile int sizeCtl;

/**
 * Returns a power of two table size for the given desired capacity.
 * See Hackers Delight, sec 3.2
 */
private static final int tableSizeFor(int c) {
    int n = c - 1;
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    return (n < 0) ? 1 : (n >= MAXIMUM_CAPACITY) ? MAXIMUM_CAPACITY : n + 1;
}
```

> **三、使用默认容量创建一个Map，将指定Map的值putAll到新的Map**

```java
/**
 * Creates a new map with the same mappings as the given map.
 *
 * @param m the map
 */
public ConcurrentHashMap(Map<? extends K, ? extends V> m) {
    this.sizeCtl = DEFAULT_CAPACITY;
    putAll(m);
}
```

> **四、指定容量和加载因子**

```java
/**
 * Creates a new, empty map with an initial table size based on
 * the given number of elements ({@code initialCapacity}) and
 * initial table density ({@code loadFactor}).
 *
 * @param initialCapacity the initial capacity. The implementation
 * performs internal sizing to accommodate this many elements,
 * given the specified load factor.
 * @param loadFactor the load factor (table density) for
 * establishing the initial table size
 * @throws IllegalArgumentException if the initial capacity of
 * elements is negative or the load factor is nonpositive
 *
 * @since 1.6
 */
public ConcurrentHashMap(int initialCapacity, float loadFactor) {
    this(initialCapacity, loadFactor, 1);
}
```

> **五、指定容量、加载因子以及预估的并发更新线程数**

1. 加载因子`loadFactor`必须大于0
2. 容量`initialCapacity`必须大于等于0
3. 并发更新线程数`concurrencyLevel`必须大于0
4. 否则抛异常`IllegalArgumentException`

```java
/**
 * Creates a new, empty map with an initial table size based on
 * the given number of elements ({@code initialCapacity}), table
 * density ({@code loadFactor}), and number of concurrently
 * updating threads ({@code concurrencyLevel}).
 *
 * @param initialCapacity the initial capacity. The implementation
 * performs internal sizing to accommodate this many elements,
 * given the specified load factor.
 * @param loadFactor the load factor (table density) for
 * establishing the initial table size
 * @param concurrencyLevel the estimated number of concurrently
 * updating threads. The implementation may use this value as
 * a sizing hint.
 * @throws IllegalArgumentException if the initial capacity is
 * negative or the load factor or concurrencyLevel are
 * nonpositive
 */
public ConcurrentHashMap(int initialCapacity,
                         float loadFactor, int concurrencyLevel) {
    if (!(loadFactor > 0.0f) || initialCapacity < 0 || concurrencyLevel <= 0)
        throw new IllegalArgumentException();
    if (initialCapacity < concurrencyLevel)   // Use at least as many bins
        initialCapacity = concurrencyLevel;   // as estimated threads
    long size = (long)(1.0 + (long)initialCapacity / loadFactor);
    int cap = (size >= (long)MAXIMUM_CAPACITY) ?
        MAXIMUM_CAPACITY : tableSizeFor((int)size);
    this.sizeCtl = cap;
}
```

## 主要方法

### 一、public V put(K key, V value)

**调用`putVal(key, value, false)`**

```java
/**
 * Maps the specified key to the specified value in this table.
 * Neither the key nor the value can be null.
 *
 * <p>The value can be retrieved by calling the {@code get} method
 * with a key that is equal to the original key.
 *
 * @param key key with which the specified value is to be associated
 * @param value value to be associated with the specified key
 * @return the previous value associated with {@code key}, or
 *         {@code null} if there was no mapping for {@code key}
 * @throws NullPointerException if the specified key or value is null
 */
public V put(K key, V value) {
    return putVal(key, value, false);
}
```

**`putVal()`实现了`put()`和`putIfAbsent()`，处理逻辑见注释**

- `transient volatile Node<K,V>[] table;`在第一次插入时延迟初始化。大小总是二的幂次方。由迭代器直接访问。
- `putVal` 使用 DoubleCheck synchronized
- `static final int TREEIFY_THRESHOLD = 8;`转换成树的阈值

```
/** Implementation for put and putIfAbsent */
final V putVal(K key, V value, boolean onlyIfAbsent) {
    // 判断key、value不能为空
    if (key == null || value == null) throw new NullPointerException();
    // 调用spread方法计算hashCode，详见spread()方法介绍
    int hash = spread(key.hashCode());
    // 桶的节点数，控制转换成树
    int binCount = 0;
    // table在第一次插入时延迟初始化。大小总是二的幂次方。由迭代器直接访问。
    for (Node<K,V>[] tab = table;;) {
        Node<K,V> f; int n, i, fh;
        // table未初始化
        if (tab == null || (n = tab.length) == 0)
            // 初始化table，详见initTable()方法介绍
            tab = initTable();
        // 对应hash位置，第一次插入值
        // tabAt(tab, i = (n - 1) & hash))获取内存中数组tab下标为i的头节点
        else if ((f = tabAt(tab, i = (n - 1) & hash)) == null) {
            // casTabAt基于CAS尝试更新数组tab下标为i的结点的值为 v
            if (casTabAt(tab, i, null,
                         new Node<K,V>(hash, key, value, null)))
                break;                   // no lock when adding to empty bin
        }
        // 如果检测到当前某个节点的hash值为MOVED，则表示正在进行数组扩张的数据复制阶段
        // 则当前线程会参与复制，通过允许多线程复制的功能，减少数组的复制来带来的性能损失
        else if ((fh = f.hash) == MOVED)
            // 协助迁移数据
            tab = helpTransfer(tab, f);
        else {
            V oldVal = null;
            // doublechek
            /**
             * 到该分支表明该位置上有元素，采用synchronized方式加锁
             * 如果是链表的话，则对链表进行遍历，找到key和key的hash值都一样的节点，进行替换
             * 如果没有找到，则添加在链表最后面
             * 如果是树的话，则添加到树中去
             */
            synchronized (f) {
                // 再次检查tab位置i的元素是不是f
                if (tabAt(tab, i) == f) {
                    // 链表
                    if (fh >= 0) {
                        binCount = 1;
                        // 遍历链表
                        for (Node<K,V> e = f;; ++binCount) {
                            K ek;
                            // 元素的hash、key都相同，则进行替换和hashMap相同
                            if (e.hash == hash &&
                                ((ek = e.key) == key ||
                                 (ek != null && key.equals(ek)))) {
                                oldVal = e.val;
                                //onlyIfAbsent=true，当这个key没有插入时，才插入
                                if (!onlyIfAbsent)
                                    e.val = value;
                                break;
                            }
                            Node<K,V> pred = e;
                            // 不同key，hash值相同时，直接添加到链表尾即可
                            if ((e = e.next) == null) {
                                pred.next = new Node<K,V>(hash, key,
                                                          value, null);
                                break;
                            }
                        }
                    }
                    // 当前结点为红黑树
                    else if (f instanceof TreeBin) {
                        Node<K,V> p;
                        binCount = 2;
                        // 添加元素到树中去，表明树的当前结点存在值，则进行替换
                        if ((p = ((TreeBin<K,V>)f).putTreeVal(hash, key,
                                                       value)) != null) {
                            oldVal = p.val;
                            // onlyIfAbsent=true，当这个key没有插入时，才插入
                            if (!onlyIfAbsent)
                                p.val = value;
                        }
                    }
                }
            }
            if (binCount != 0) {
                // 当在同一个节点的数目大于等于8时，则进行扩容或者将数据转换成红黑树
                // 注意，这里并不一定是直接转换成红黑树，有可能先进行扩容
                if (binCount >= TREEIFY_THRESHOLD)
                    // 扩容或树化，详见treeifyBin方法介绍
                    treeifyBin(tab, i);
                if (oldVal != null)
                    return oldVal;
                break;
            }
        }
    }
    //标记新元素的加入，详见addCount方法介绍
    addCount(1L, binCount);
    return null;
}
```

**`addCount()`方法，在put操作后会判断是否需要扩容，如果达到扩容门槛，则进行扩容或协助扩容。**

```java
/**
 * Adds to count, and if table is too small and not already
 * resizing, initiates transfer. If already resizing, helps
 * perform transfer if work is available.  Rechecks occupancy
 * after a transfer to see if another resize is already needed
 * because resizings are lagging additions.
 *
 * @param x the count to add
 * @param check if <0, don't check resize, if <= 1 only check if uncontended
 */
private final void addCount(long x, int check) {
    CounterCell[] as; long b, s;
    // 如果计数盒子不为空，或者修改baseCount失败
    if ((as = counterCells) != null ||
        !U.compareAndSwapLong(this, BASECOUNT, b = baseCount, s = b + x)) {
        CounterCell a; long v; int m;
        boolean uncontended = true;
        // 如果as为空，或者长度为0，或者当前线程所在的段为null，或者在当前线程的段上加数量失败
        if (as == null || (m = as.length - 1) < 0 ||
            (a = as[ThreadLocalRandom.getProbe() & m]) == null ||
            !(uncontended =
              U.compareAndSwapLong(a, CELLVALUE, v = a.value, v + x))) {
            // 这里对counterCells扩容，减少多线程hash到同一个段的频率
            fullAddCount(x, uncontended);
            return;
        }
        if (check <= 1)
            return;
        // 计算元素个数
        s = sumCount();
    }
    if (check >= 0) {
        Node<K,V>[] tab, nt; int n, sc;
        // 如果元素个数达到了扩容门槛，则进行扩容
        // sizeCtl即为扩容门槛，它为容量的0.75倍
        while (s >= (long)(sc = sizeCtl) && (tab = table) != null &&
               (n = tab.length) < MAXIMUM_CAPACITY) {
            // 生成一个唯一的扩容戳，高位表示唯一的扩容标记，低位表示参与扩容的线程数
            // 将数组容量n和sizeCtl能够用一个32位的数字表示
            // 这个二进制从左往右数第一位为 1，表示这个二进制是一个负数，
            // 紧接着的 15 位表示数组容量，剩下来 16 位表示sizeCtl的值。
            int rs = resizeStamp(n);
            // sc小于0，表明正在扩容
            if (sc < 0) {
                if ((sc >>> RESIZE_STAMP_SHIFT) != rs || sc == rs + 1 ||
                    sc == rs + MAX_RESIZERS || (nt = nextTable) == null ||
                    transferIndex <= 0)
                    break;
                // cas,将当前线程加入迁移元素中，并把扩容线程数加1
                if (U.compareAndSwapInt(this, SIZECTL, sc, sc + 1))
                    // 协助迁移数据
                    transfer(tab, nt);
            }
            else if (U.compareAndSwapInt(this, SIZECTL, sc,
                                         (rs << RESIZE_STAMP_SHIFT) + 2))
                // 创建新数组，并进行元素迁移
                transfer(tab, null);
            // 重新计算元素个数
            s = sumCount();
        }
    }
}
```

**`treeifyBin()`方法，扩容或树化**

- `static final int MIN_TREEIFY_CAPACITY = 64;`扩容阈值

```java
/**
 * Replaces all linked nodes in bin at given index unless table is
 * too small, in which case resizes instead.
 */
private final void treeifyBin(Node<K,V>[] tab, int index) {
    Node<K,V> b; int n, sc;
    if (tab != null) {
        // 数组长度小于64时进行的是数组的扩容
        if ((n = tab.length) < MIN_TREEIFY_CAPACITY)
            // 2倍扩容，详见tryPresize方法介绍
            tryPresize(n << 1);
        // hash > 0 表示该节点是一个处在正常状态下的节点，没有在迁移，也不是红黑树节点
        else if ((b = tabAt(tab, index)) != null && b.hash >= 0) {
            synchronized (b) {
                //doublecheck
                if (tabAt(tab, index) == b) {
                    TreeNode<K,V> hd = null, tl = null;
                    //创建红黑树
                    for (Node<K,V> e = b; e != null; e = e.next) {
                        TreeNode<K,V> p =
                            new TreeNode<K,V>(e.hash, e.key, e.val,
                                              null, null);
                        if ((p.prev = tl) == null)
                            hd = p;
                        else
                            tl.next = p;
                        tl = p;
                    }
                    // 设置到index位置
                    setTabAt(tab, index, new TreeBin<K,V>(hd));
                }
            }
        }
    }
}
```

**`tryPresize()`方法，扩容**

```java
/**
 * Tries to presize table to accommodate the given number of elements.
 *
 * @param size number of elements (doesn't need to be perfectly accurate)
 */
private final void tryPresize(int size) {
    // // 通过tableSizeFor计算扩容退出控制量标志，容量大小总是2的N次方
    int c = (size >= (MAXIMUM_CAPACITY >>> 1)) ? MAXIMUM_CAPACITY :
        tableSizeFor(size + (size >>> 1) + 1);
    int sc;
    while ((sc = sizeCtl) >= 0) {
        Node<K,V>[] tab = table; int n;
        // 初始化
        if (tab == null || (n = tab.length) == 0) {
            // 取sizeCtl和计算的Size中较大的
            n = (sc > c) ? sc : c;
            // 初始化时将sizeCtl设置为-1
            if (U.compareAndSwapInt(this, SIZECTL, sc, -1)) {
                try {
                    if (table == tab) {
                        @SuppressWarnings("unchecked")
                        Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n];
                        table = nt;
                        // 完成之后将其设置为数组长度的3/4
                        sc = n - (n >>> 2);
                    }
                } finally {
                    sizeCtl = sc;
                }
            }
        }
        // 一直扩容到c小于等于sizeCtl或者数组长度大于最大长度的时候，退出扩容
        else if (c <= sc || n >= MAXIMUM_CAPACITY)
            break;
        else if (tab == table) {
            int rs = resizeStamp(n);
            // 扩容
            if (sc < 0) {
                Node<K,V>[] nt;
                //1. sc >>> RESIZE_STAMP_SHIFT!=rs，判断高位的扩容标记不相同，则不能参与扩容
	            //2. sc == rs + 1，表示扩容已经结束
	            //3. sc == rs + MAX_RESIZERS ，表示当前帮助扩容的线程数已经达到最大值
	            //4. (nt = nextTable) == null，表示扩容已经结束
	            //5. transferIndex <= 0，表示所有的 transfer 任务都被领取完了
                if ((sc >>> RESIZE_STAMP_SHIFT) != rs || sc == rs + 1 ||
                    sc == rs + MAX_RESIZERS || (nt = nextTable) == null ||
                    transferIndex <= 0)
                    break;
                //cas操作将SIZECTL+1
                if (U.compareAndSwapInt(this, SIZECTL, sc, sc + 1))
                    //迁移数据
                    transfer(tab, nt);
            }
            // 创建新数组,将当前线程作为迁移的第一个线程
            else if (U.compareAndSwapInt(this, SIZECTL, sc,
                                         (rs << RESIZE_STAMP_SHIFT) + 2))
                // 创建新数组，迁移数据
                transfer(tab, null);
        }
    }
}
```

**`helpTransfer()`方法，如果正在扩容，则协助迁移数据**

```java
/**
 * Helps transfer if a resize is in progress.
 */
final Node<K,V>[] helpTransfer(Node<K,V>[] tab, Node<K,V> f) {
    Node<K,V>[] nextTab; int sc;
    // 如果桶数组不为空，并且当前桶第一个元素为fwd类型，且nexttable不为空
    // 说明当前桶已经迁移完毕，可以去帮助迁移其他的桶的元素了
    if (tab != null && (f instanceof ForwardingNode) &&
        (nextTab = ((ForwardingNode<K,V>)f).nextTable) != null) {
        // 生成一个唯一的扩容戳，高位表示唯一的扩容标记，低位表示参与扩容的线程数
        // 将数组容量n和sizeCtl能够用一个32位的数字表示
        // 这个二进制从左往右数第一位为 1，表示这个二进制是一个负数，
        // 紧接着的 15 位表示数组容量，剩下来 16 位表示sizeCtl的值。
        int rs = resizeStamp(tab.length);
        // sizeCtl < 0，正在扩容
        while (nextTab == nextTable && table == tab &&
               (sc = sizeCtl) < 0) {
            // 判断扩容是否结束或者并发扩容线程数是否已达最大值
            //1. sc >>> RESIZE_STAMP_SHIFT!=rs，判断高位的扩容标记不相同，则不能参与扩容
            //2. sc == rs + 1，表示扩容已经结束
            //3. sc == rs + MAX_RESIZERS ，表示当前帮助扩容的线程数已经达到最大值
            //4. (nt = nextTable) == null，表示扩容已经结束
            //5. transferIndex <= 0，表示所有的 transfer 任务都被领取完了
            if ((sc >>> RESIZE_STAMP_SHIFT) != rs || sc == rs + 1 ||
                sc == rs + MAX_RESIZERS || transferIndex <= 0)
                break;
            // 扩容线程+1
            if (U.compareAndSwapInt(this, SIZECTL, sc, sc + 1)) {
                // 当前线程帮忙迁移元素
                transfer(tab, nextTab);
                break;
            }
        }
        return nextTab;
    }
    return table;
}
```

**`transfer()`方法，主要是迁移数据，包装了两倍扩容建立新数组的过程**

- `private static final int MIN_TRANSFER_STRIDE = 16;`扩容线程每次最少要迁移16个hash桶
- `private transient volatile Node<K,V>[] nextTable;`待迁移的数据
- `private transient volatile int transferIndex;`迁移数组nextTable任务指针
- `ForwardIngNode`转发节点，读操作或者迭代读时碰到ForwardingNode时，将操作转发到扩容后的新的table数组上去执行，写操作碰见它时，则尝试帮助扩容。
- `transfer`迁移元素 DoubleCheck `synchronized`
- `static final int UNTREEIFY_THRESHOLD = 6;`转换成链表的阈值

```java
/**
 * Moves and/or copies the nodes in each bin to new table. See
 * above for explanation.
 */
private final void transfer(Node<K,V>[] tab, Node<K,V>[] nextTab) {
    int n = tab.length, stride;
    // 如果是多核处理器那么步长为 n / (8*NCPU)，
    // 如果得到的步长小于16，则将步长设置为16。如果为单核那步长就直接被设置为n了。
    if ((stride = (NCPU > 1) ? (n >>> 3) / NCPU : n) < MIN_TRANSFER_STRIDE)
        // 确保每次迁移的node个数不少于16个
        stride = MIN_TRANSFER_STRIDE; // subdivide range
    // 创建一个两倍长度的新数组并赋值给nextTable，将n赋值给transferIndex。
    if (nextTab == null) {            // initiating
        try {
            @SuppressWarnings("unchecked")
            Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n << 1];
            nextTab = nt;
        } catch (Throwable ex) {      // try to cope with OOME
            // 可能发生OOM，sizeCtl的值为Integer.MAX_VALUE是OOM发生的标志。
            sizeCtl = Integer.MAX_VALUE;
            return;
        }
        nextTable = nextTab;
        transferIndex = n;
    }
    int nextn = nextTab.length;
    /**
     * 这个构造方法做了两件事：
     * 1. new ForwardIngNode<K,V>(hash = MOVED, key = null, value = null, next = null);
     * 2. nextTable = nextTab;。
     */
    ForwardingNode<K,V> fwd = new ForwardingNode<K,V>(nextTab);
    // 单个桶的迁移任务
    boolean advance = true;
    // 整个数组的迁移任务
    boolean finishing = false; // to ensure sweep before committing nextTab
    // i 指向这个任务包最左边的一个节点，bound 指向任务包最后一个节点。
    // 迁移任务是由右往左的，i逐渐减少。当 i == bound 代表没有需要迁移的元素了
    // 循环迁移，迁移一次，advance置为false一次，两者交替进行。
    for (int i = 0, bound = 0;;) {
        Node<K,V> f; int fh;
        // 设置任务包范围
        while (advance) {
            int nextIndex, nextBound;
            // 仍然存在迁移的元素 || 整个数组的迁移已完成
            if (--i >= bound || finishing)
                advance = false;
            // 旧数组的迁移已全部完成
            else if ((nextIndex = transferIndex) <= 0) {
                i = -1;
                advance = false;
            }
            // 设置任务包大小，设置 i、bound 的值
            else if (U.compareAndSwapInt
                     (this, TRANSFERINDEX, nextIndex,
                      nextBound = (nextIndex > stride ?
                                   nextIndex - stride : 0))) {
                bound = nextBound;
                i = nextIndex - 1;
                advance = false;
            }
        }
        // 任务包或者全部迁移是否完成的判断
        if (i < 0 || i >= n || i + n >= nextn) {
            int sc;
            // 数据迁移完成，替换旧桶数据
            if (finishing) {
                nextTable = null;
                table = nextTab;
                sizeCtl = (n << 1) - (n >>> 1);
                return;
            }
            // 扩容完成，将扩容线程数-1
            if (U.compareAndSwapInt(this, SIZECTL, sc = sizeCtl, sc - 1)) {
                if ((sc - 2) != resizeStamp(n) << RESIZE_STAMP_SHIFT)
                    return;
                // finishing和advance设置为true，重新走到上面if条件，再次检查是否迁移完
                // 通过fh=f.hash==MOVED进行判断
                finishing = advance = true;
                i = n; // recheck before commit
            }
        }
        // 老元素为 null，就直接进行 cas 把 fwd 赋到那个位置
        else if ((f = tabAt(tab, i)) == null)
            advance = casTabAt(tab, i, null, fwd);
        // 如果桶中第一个元素的hash值为MOVED，说明该节点为fwd节点，详情看fwd节点的构造函数             // 说明该位置已经被迁移
        else if ((fh = f.hash) == MOVED)
            advance = true; // already processed
        // 这里是真正对一个元素执行迁移任务
        else {
            // 加锁迁移元素
            synchronized (f) {
                // 再次判断桶中第一个元素是否有过修改
                if (tabAt(tab, i) == f) {
                    /**
                     * 把一个链表划分成两个链表
                     * 规则是桶中各元素的hash值与桶大小n进行与操作
                     * 等于0的放到低位链表（low）中，大于1的放到高位链表（high）中
                     * 其中低位链表迁移到新桶的位置是相对旧桶不变的
                     * 高位链表迁移到新桶的位置正好是其在旧桶位置上加n
                     * 这就是为什么扩容时，容量变成原来两倍的原因
                     */
                    Node<K,V> ln, hn;
                    // 桶f 还没有被迁移
                    if (fh >= 0) {
                        // 首先计算出当前结点的位置
                        // 区分桶 f 应该被放置在新数组中原来的位置还是多出来位置
                        int runBit = fh & n;
                        Node<K,V> lastRun = f;
                        for (Node<K,V> p = f.next; p != null; p = p.next) {
                            int b = p.hash & n;
                            // 同一节点下hashCode可能是不同的，这样才会有hash分布
                            // 更新runBit的值，找出与f不同的节点
                            // 这里一直要找到链表尾，但是lastRun不一定是尾节点，也就是找到最后一段相同的
                            // 因为是链表，当位置相同，直接就带过去了，避免没必要的循环
                            if (b != runBit) {
                                runBit = b;
                                lastRun = p;
                            }
                        }
                        // 设置低位节点
                        if (runBit == 0) {
                            ln = lastRun;
                            hn = null;
                        }
                        // 设置高位节点
                        else {
                            hn = lastRun;
                            ln = null;
                        }
                        // 生成两条链表，直接拼接
                        // 找到不等于lastRun的节点，进行拼接，不是倒序，这里就是进行一个拼接，因为把hash值相同的链从lastRun带过来了
                        for (Node<K,V> p = f; p != lastRun; p = p.next) {
                            int ph = p.hash; K pk = p.key; V pv = p.val;
                            if ((ph & n) == 0)
                                ln = new Node<K,V>(ph, pk, pv, ln);
                            else
                                hn = new Node<K,V>(ph, pk, pv, hn);
                        }
                        // 这里设置和hashMap类似，在相应点上设置节点即可
                        setTabAt(nextTab, i, ln);
                        setTabAt(nextTab, i + n, hn);
                        // 在旧的链表位置上设置forwadNode，标记已迁移完成
                        setTabAt(tab, i, fwd);
                        advance = true;
                    }
                    /**
                     * 结点是树的情况
                     * 和链表相同，分成两颗树，根据hash&n为0的放在低位树，为1的放在高位树
                     */
                    else if (f instanceof TreeBin) {
                        TreeBin<K,V> t = (TreeBin<K,V>)f;
                        TreeNode<K,V> lo = null, loTail = null;
                        TreeNode<K,V> hi = null, hiTail = null;
                        int lc = 0, hc = 0;
                        // 遍历整棵树，根据hash&n是否为0进行划分
                        for (Node<K,V> e = t.first; e != null; e = e.next) {
                            int h = e.hash;
                            TreeNode<K,V> p = new TreeNode<K,V>
                                (h, e.key, e.val, null, null);
                            if ((h & n) == 0) {
                                // 1.设置p.prev = loTail
                                // 2.loTail==null，没有前一个节点，即当前是第一个节点
                                if ((p.prev = loTail) == null)
                                    lo = p;
                                // 3.loTail!=null，不是第一个节点，则和前一个节点关联
                                else
                                    loTail.next = p;
                                // 4.将当前节点赋给loTail，作为下轮循环的前一个节点
                                loTail = p;
                                ++lc;
                            }
                            else {
                                // 同上
                                if ((p.prev = hiTail) == null)
                                    hi = p;
                                else
                                    hiTail.next = p;
                                hiTail = p;
                                ++hc;
                            }
                        }
                        // 复制完树结点之后，如果树的节点小于等于6时，就转回链表
                        ln = (lc <= UNTREEIFY_THRESHOLD) ? untreeify(lo) :
                            (hc != 0) ? new TreeBin<K,V>(lo) : t;
                        hn = (hc <= UNTREEIFY_THRESHOLD) ? untreeify(hi) :
                            (lc != 0) ? new TreeBin<K,V>(hi) : t;
                        // 低位树的位置不变
                        setTabAt(nextTab, i, ln);
                        // 高位树的位置在原来位置上加n
                        setTabAt(nextTab, i + n, hn);
                        // 标记该位置已经进迁移
                        setTabAt(tab, i, fwd);
                        // 继续循环，执行--i操作
                        advance = true;
                    }
                }
            }
        }
    }
}
```

**`resizeStamp()`方法，将数组容量n和sizeCtl能够用一个32位的数字表示**

这个二进制从左往右数第一位为 1，表示这个二进制是一个负数，紧接着的 15 位表示数组容量，剩下来 16 位表示sizeCtl的值

`private static int RESIZE_STAMP_BITS = 16;`

```java
/**
 * Returns the stamp bits for resizing a table of size n.
 * Must be negative when shifted left by RESIZE_STAMP_SHIFT.
 */
static final int resizeStamp(int n) {
    // 从高位起遇到第一个 1 之前的 0 的个数 | 得到一个只有第 16 位为1，其余位全为 0 的数字。
    // (1 << (RESIZE_STAMP_BITS - 1) = 0000 0000 0000 0000 1000 0000 0000 0000
    // 第16位这个1右边表示的就是Map的容量
    return Integer.numberOfLeadingZeros(n) | (1 << (RESIZE_STAMP_BITS - 1));
}
```

**`spread()`方法，计算hashCode**

1. 在32位int中，常用的大都是低16位，h ^ (h >>>  16)，将int高16位右移到低16，再和原数异或^，让hashCode高位和低位异或，使hashCode更加散列。
2. 异或后的结果与HASH_BITS进行与运算，因首位始终是0，使得到的值始终为正数。

`static final int HASH_BITS = 0x7fffffff;`即INT_MAX，首位是0，其余为是1。保证到的Hash值为正数

```java
/**
 * Spreads (XORs) higher bits of hash to lower and also forces top
 * bit to 0. Because the table uses power-of-two masking, sets of
 * hashes that vary only in bits above the current mask will
 * always collide. (Among known examples are sets of Float keys
 * holding consecutive whole numbers in small tables.)  So we
 * apply a transform that spreads the impact of higher bits
 * downward. There is a tradeoff between speed, utility, and
 * quality of bit-spreading. Because many common sets of hashes
 * are already reasonably distributed (so don't benefit from
 * spreading), and because we use trees to handle large sets of
 * collisions in bins, we just XOR some shifted bits in the
 * cheapest possible way to reduce systematic lossage, as well as
 * to incorporate impact of the highest bits that would otherwise
 * never be used in index calculations because of table bounds.
 */
static final int spread(int h) {
    return (h ^ (h >>> 16)) & HASH_BITS;
}
```

**initTable()方法，初始化table，容量为sizeCtl，若sizeCtl=0，则使用默认容量DEFAULT_CAPACITY=16**

其他线程正在初始化的时候，使用自旋锁等待。`while(...) { if(...) { Thread.yield();}}`

```java
/**
 * Initializes table, using the size recorded in sizeCtl.
 */
private final Node<K,V>[] initTable() {
    Node<K,V>[] tab; int sc;
    while ((tab = table) == null || tab.length == 0) {
        // 当sizeCtl<0,即其他线程在进行初始化
        if ((sc = sizeCtl) < 0)
            // 自旋锁等待
            Thread.yield(); // lost initialization race; just spin
        // CAS，如果对象偏移量上的值=期待值，更新为x,返回true.否则false。
        else if (U.compareAndSwapInt(this, SIZECTL, sc, -1)) {
            try {
                // table为空，进行初始化
                // 容量为sizeCtl，若sizeCtl=0，则使用默认容量DEFAULT_CAPACITY=16
                if ((tab = table) == null || tab.length == 0) {
                    int n = (sc > 0) ? sc : DEFAULT_CAPACITY;
                    @SuppressWarnings("unchecked")
                    Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n];
                    table = tab = nt;
                    sc = n - (n >>> 2);
                }
            } finally {
                sizeCtl = sc;
            }
            break;
        }
    }
    return tab;
}
```

**`sun.misc.Unsafe.compareAndSwapInt()`方法，以一种乐观锁的方式实现并发控制，**

CAS，如果对象偏移量上的值=期待值，更新为x,返回true.否则false.
类似的有compareAndSwapInt,compareAndSwapLong,compareAndSwapBoolean,compareAndSwapChar等等。

```java
/***
 * Compares the value of the integer field at the specified offset
 * in the supplied object with the given expected value, and updates
 * it if they match.  The operation of this method should be atomic,
 * thus providing an uninterruptible way of updating an integer field.
 * 在obj的offset位置比较integer field和期望的值，如果相同则更新。这个方法
 * 的操作应该是原子的，因此提供了一种不可中断的方式更新integer field。
 * 
 * @param obj the object containing the field to modify.
 *            包含要修改field的对象
 * @param offset the offset of the integer field within <code>obj</code>.
 *               <code>obj</code>中整型field的偏移量
 * @param expect the expected value of the field.
 *               希望field中存在的值
 * @param update the new value of the field if it equals <code>expect</code>.
 *           如果期望值expect与field的当前值相同，设置filed的值为这个新值
 * @return true if the field was changed.
 *                             如果field的值被更改
 */
public native boolean compareAndSwapInt(Object obj, long offset, int expect, int update);
```

### 二、public void putAll(Map<? extends K, ? extends V> m)

遍历传入的map，调用`putVal()`，将[K, V]插入目标Map

```java
/**
 * Copies all of the mappings from the specified map to this one.
 * These mappings replace any mappings that this map had for any of the
 * keys currently in the specified map.
 *
 * @param m mappings to be stored in this map
 */
public void putAll(Map<? extends K, ? extends V> m) {
    // 扩容
    tryPresize(m.size());
    // 循环put
    for (Map.Entry<? extends K, ? extends V> e : m.entrySet())
        putVal(e.getKey(), e.getValue(), false);
}
```

### 三、public V putIfAbsent(K key, V value)

当这个key没有插入时，插入[key, valule]

```java
/**
 * {@inheritDoc}
 *
 * @return the previous value associated with the specified key,
 *         or {@code null} if there was no mapping for the key
 * @throws NullPointerException if the specified key or value is null
 */
public V putIfAbsent(K key, V value) {
    // onlyIfAbsent=true，当这个key没有插入时，才插入
    return putVal(key, value, true);
}
```

### 四、public V get(Object key)

```java
/**
 * Returns the value to which the specified key is mapped,
 * or {@code null} if this map contains no mapping for the key.
 *
 * <p>More formally, if this map contains a mapping from a key
 * {@code k} to a value {@code v} such that {@code key.equals(k)},
 * then this method returns {@code v}; otherwise it returns
 * {@code null}.  (There can be at most one such mapping.)
 *
 * @throws NullPointerException if the specified key is null
 */
public V get(Object key) {
    Node<K,V>[] tab; Node<K,V> e, p; int n, eh; K ek;
    // 调用spread方法计算hashCode，详见spread()方法介绍
    int h = spread(key.hashCode());
    // 对应位置上有元素
    if ((tab = table) != null && (n = tab.length) > 0 &&
        (e = tabAt(tab, (n - 1) & h)) != null) {
        //第一个元素是要寻找的元素，直接反馈
        if ((eh = e.hash) == h) {
            if ((ek = e.key) == key || (ek != null && key.equals(ek)))
                return e.val;
        }
        // eh < 0，桶结构是树（-2）或正在扩容（-1），使用find寻找元素
        else if (eh < 0)
            return (p = e.find(h, key)) != null ? p.val : null;
        // 遍历整个链表寻找元素
        while ((e = e.next) != null) {
            if (e.hash == h &&
                ((ek = e.key) == key || (ek != null && key.equals(ek))))
                return e.val;
        }
    }
    return null;
}
```

### 五、public V getOrDefault(Object key, V defaultValue)

调用`get(key)`得到得结果为null，则返回defaultValue，否则返回得到的结果

```java
/**
 * Returns the value to which the specified key is mapped, or the
 * given default value if this map contains no mapping for the
 * key.
 *
 * @param key the key whose associated value is to be returned
 * @param defaultValue the value to return if this map contains
 * no mapping for the given key
 * @return the mapping for the key, if present; else the default value
 * @throws NullPointerException if the specified key is null
 */
public V getOrDefault(Object key, V defaultValue) {
    V v;
    // get(key)得到得结果为null，则返回defaultValue
    return (v = get(key)) == null ? defaultValue : v;
}
```

### 六、public ~ remove(···)

1. `public V remove(Object key)`移除key对应的[key,value]
2. `public boolean remove(Object key, Object value)`移除[key,value]对应的[key,value]

调用`replaceNode()`方法实现remove。

```java
/**
 * Removes the key (and its corresponding value) from this map.
 * This method does nothing if the key is not in the map.
 *
 * @param  key the key that needs to be removed
 * @return the previous value associated with {@code key}, or
 *         {@code null} if there was no mapping for {@code key}
 * @throws NullPointerException if the specified key is null
 */
public V remove(Object key) {
    return replaceNode(key, null, null);
}

/**
 * {@inheritDoc}
 *
 * @throws NullPointerException if the specified key is null
 */
public boolean remove(Object key, Object value) {
    //key不能为null
    if (key == null)
        throw new NullPointerException();
    return value != null && replaceNode(key, null, value) != null;
}
```

### 七、public ~ replace(···)

1. `public V replace(K key, V value)`将key对应得值替换为value
2. `public boolean replace(K key, V oldValue, V newValue)`将[key,oldValue]对应的oldValue替换为newValue
3. `public void replaceAll(BiFunction<? super K, ? super V, ? extends V> function)`按BiFunction给定的规则替换
```java
//replaceAll例子
map.replaceAll((t, u) -> {
    if (t % 2 == 0) {
        return u + "aaa";
    }
    return u + "bbb";
});
```

调用`replaceNode()`方法实现replace。

```java
/**
 * {@inheritDoc}
 *
 * @return the previous value associated with the specified key,
 *         or {@code null} if there was no mapping for the key
 * @throws NullPointerException if the specified key or value is null
 */
public V replace(K key, V value) {
    //key、value都不能为null
    if (key == null || value == null)
        throw new NullPointerException();
    return replaceNode(key, value, null);
}

/**
 * {@inheritDoc}
 *
 * @throws NullPointerException if any of the arguments are null
 */
public boolean replace(K key, V oldValue, V newValue) {
    if (key == null || oldValue == null || newValue == null)
        throw new NullPointerException();
    return replaceNode(key, newValue, oldValue) != null;
}

public void replaceAll(BiFunction<? super K, ? super V, ? extends V> function) {
    if (function == null) throw new NullPointerException();
    Node<K,V>[] t;
    if ((t = table) != null) {
        Traverser<K,V> it = new Traverser<K,V>(t, t.length, 0, t.length);
        for (Node<K,V> p; (p = it.advance()) != null; ) {
            V oldValue = p.val;
            for (K key = p.key;;) {
                V newValue = function.apply(key, oldValue);
                if (newValue == null)
                    throw new NullPointerException();
                if (replaceNode(key, newValue, oldValue) != null ||
                    (oldValue = get(key)) == null)
                    break;
            }
        }
    }
}
```

### 八、final V replaceNode(Object key, V value, Object cv)

此方法用来实现`remove(···)`、`replace(···)`相关的方法。

```java
/**
 * Implementation for the four public remove/replace methods:
 * Replaces node value with v, conditional upon match of cv if
 * non-null.  If resulting value is null, delete.
 */
final V replaceNode(Object key, V value, Object cv) {
    // 计算hashCode，详见spread方法
    int hash = spread(key.hashCode());
    for (Node<K,V>[] tab = table;;) {
        Node<K,V> f; int n, i, fh;
        // 未初始化
        if (tab == null || (n = tab.length) == 0 ||
            (f = tabAt(tab, i = (n - 1) & hash)) == null)
            break;
        // 正在扩容，协助迁移数据
        else if ((fh = f.hash) == MOVED)
            tab = helpTransfer(tab, f);
        else {
            V oldVal = null;
            boolean validated = false;
            synchronized (f) {
                //doublecheck
                if (tabAt(tab, i) == f) {
                    if (fh >= 0) {
                        validated = true;
                        // 遍历替换对应key的value
                        for (Node<K,V> e = f, pred = null;;) {
                            K ek;
                            if (e.hash == hash &&
                                ((ek = e.key) == key ||
                                 (ek != null && key.equals(ek)))) {
                                V ev = e.val;
                                if (cv == null || cv == ev ||
                                    (ev != null && cv.equals(ev))) {
                                    oldVal = ev;
                                    if (value != null)
                                        e.val = value;
                                    else if (pred != null)
                                        pred.next = e.next;
                                    else
                                        setTabAt(tab, i, e.next);
                                }
                                break;
                            }
                            pred = e;
                            if ((e = e.next) == null)
                                break;
                        }
                    }
                    else if (f instanceof TreeBin) {
                        validated = true;
                        TreeBin<K,V> t = (TreeBin<K,V>)f;
                        TreeNode<K,V> r, p;
                        if ((r = t.root) != null &&
                            (p = r.findTreeNode(hash, key, null)) != null) {
                            V pv = p.val;
                            if (cv == null || cv == pv ||
                                (pv != null && cv.equals(pv))) {
                                oldVal = pv;
                                if (value != null)
                                    p.val = value;
                                else if (t.removeTreeNode(p))
                                    setTabAt(tab, i, untreeify(t.first));
                            }
                        }
                    }
                }
            }
            // 成功替换
            if (validated) {
                if (oldVal != null) {
                    // 新值为null，则为remove，count-1
                    if (value == null)
                        addCount(-1L, -1);
                    return oldVal;
                }
                break;
            }
        }
    }
    return null;
}
```

## 小结

本文基于jdk1.8.0_V112分析

- ConcurrentHashMap内部结构为底层数据结构为数组+链表/红黑树
- 默认容量16，不允许[key,value]为null，扩容是容量*2。
- 当链表长度大于等于 8 ，且数组长度大于等于64时，链表会被转化为红黑树
- 当树节点小于等于6时，红黑树会转换为链表
- 其他线程正在初始化的时候，使用自旋锁等待
- treeifyBin、putVal、replace等方法使用了doublechek synchronized来锁住Node对象
- 操作数组中元素、常量SIZECTL/TRANSFERINDEX等，采用乐观锁CAS来控制并发

{{ page.date|date_to_string }}

<p>上一篇：<a href="https://mr-lanlin.github.io/2020/09/30/经典排序算法之外部排序.html">经典排序算法之外部排序</a></p>

<p>下一篇：<a href="https://mr-lanlin.github.io/2020/10/09/CopyOnWriteArrayList源码分析.html">CopyOnWriteArrayList源码分析</a></p>