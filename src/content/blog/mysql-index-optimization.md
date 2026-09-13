---
title: 'MySQL 底层原理：从 B+ 树到 MVCC，架构师必须知道的十个坑'
description: 'B+ 树为什么适合数据库？MVCC 怎么解决幻读？什么情况下索引会失效？线上 DDL 怎么不停机？分库分表后跨库 JOIN 怎么办？不讲教科书定义，只讲生产环境真正会踩的坑。'
pubDate: 2025-02-09
category: '数据库与中间件'
tags: ['MySQL', 'InnoDB', '索引', 'MVCC', '底层原理']
---

> 面试问 MySQL 原理，背一遍 B+ 树和 MVCC 就够了。但生产环境的 MySQL 问题，从来不是「背了原理就能解决」的。索引建了但查询还是慢、MVCC 没挡住幻读、DDL 锁了半小时表、分库后跨库查询没法做——这些才是架构师每天面对的真实问题。

## 一、B+ 树：为什么是它

### 1.1 磁盘 IO 是瓶颈

数据库和缓存最大的区别：缓存数据在内存（纳秒级访问），数据库数据在磁盘（毫秒级访问）。一次磁盘随机 IO 大约 10ms——如果每查一条记录都要一次磁盘 IO，100 万条记录的表查一次要 100 万 × 10ms = 277 小时。

**B+ 树解决的是「用最少的磁盘 IO 找到目标记录」**。

### 1.2 B+ 树 vs B 树 vs 哈希

| 特性 | B+ 树 | B 树 | 哈希索引 |
|------|------|------|---------|
| 范围查询 | ✅ 叶子节点链表 | ❌ 需要中序遍历 |  |
| 等值查询 | O(log N) 次 IO | O(log N) 次 IO | O(1)，但哈希冲突退化 |
| 磁盘 IO 次数 | 3-4 次（百万级表） | 3-4 次 | 1 次 |
| 数据存在位置 | 只在叶子节点 | 所有节点都有 | 只在叶子 |
| 顺序扫描 | ✅ 链表顺序遍历 |  | ❌ |

**关键洞察**：B+ 树非叶子节点只存 Key 不存数据——同样大小的磁盘页能放更多 Key，树更矮。一个 3 层 B+ 树（根节点 + 中间层 + 叶子层），假设每页 16KB、每个 Key 12 字节、每个指针 6 字节：

```
根节点：16KB / 18B ≈ 910 个 Key
中间层：910 个节点 × 910 个 Key = 828,100 个 Key
叶子层：828,100 × 910 = 7.5 亿条记录

3 层 B+ 树能索引 7.5 亿条记录，查询只需 3 次磁盘 IO。
```

### 1.3 聚簇索引 vs 二级索引

```
聚簇索引（主键索引）：
  叶子节点 = 完整行数据
  按主键顺序存储
  查询主键 → 1 次 B+ 树查找 → 拿到整行

二级索引（非主键索引）：
  叶子节点 = 主键值
  按索引列顺序存储
  查询二级索引 → 1 次 B+ 树查找 → 拿到主键 → 回表查聚簇索引 → 拿到整行
  「回表」就是一次额外的 B+ 树查找
```

**工程教训**：二级索引查询 = 两次 B+ 树查找。如果查询的列都能从二级索引拿到（覆盖索引），就不需要回表。这就是 `EXTRA: Using index` 的含义——查询效率翻倍。

## 二、MVCC：多版本并发控制的真相

### 2.1 问题：读写互相阻塞

没有 MVCC 的数据库：写操作加排他锁，读操作加共享锁。写的时候不能读，读的时候不能写。高并发场景下，一个慢查询就能阻塞所有写入。

MVCC 的思路：**读不加锁，写不加锁（行锁只锁需要修改的行），通过版本链实现读写不冲突**。

### 2.2 版本链与 Read View

```
同一行数据的版本链（undo log 串联）：

版本 3: {name: "张三", age: 30}, trx_id: 103, roll_pointer → 版本 2
版本 2: {name: "张三", age: 28}, trx_id: 102, roll_pointer → 版本 1
版本 1: {name: "张三", age: 25}, trx_id: 101, roll_pointer → NULL
```

每个事务开始时生成一个 **Read View**（快照），包含：
- `m_ids`：创建 Read View 时所有活跃事务的 ID 列表
- `min_trx_id`：m_ids 中最小的事务 ID
- `max_trx_id`：创建 Read View 时系统分配给下一个事务的 ID
- `creator_trx_id`：当前事务的 ID

**可见性判断规则**（按版本链从新到旧遍历）：
1. 如果 `trx_id < min_trx_id` → 版本在 Read View 之前创建 → **可见**
2. 如果 `trx_id >= max_trx_id` → 版本在 Read View 之后创建 → **不可见**
3. 如果 `trx_id` 在 `m_ids` 中 → 事务还活跃 → **不可见**
4. 否则 → 事务已提交 → **可见**

### 2.3 MVCC 挡不住的幻读

MVCC 解决了「快照读」的幻读——`SELECT` 看到的是事务开始时的快照。但**当前读**（`SELECT ... FOR UPDATE`、`UPDATE`、`DELETE`）不看快照，看最新数据。

```sql
-- 事务 A
BEGIN;
SELECT * FROM orders WHERE status = 'pending';  -- 快照读，看到 10 条
-- 此时事务 B 插入一条 status='pending' 的记录并提交
SELECT * FROM orders WHERE status = 'pending';  -- 快照读，还是 10 条 ✅
SELECT * FROM orders WHERE status = 'pending' FOR UPDATE; -- 当前读！看到 11 条 ❌ 幻读！
```

**解法**：RC 隔离级别下避免在同一个事务里混用快照读和当前读。RR 隔离级别下 InnoDB 用 **Next-Key Lock**（记录锁 + 间隙锁）锁住范围，防止其他事务在范围内插入。

## 三、索引失效的七种场景

建了索引但查询不走索引——这是生产环境最常见的性能问题。

### 3.1 隐式类型转换

```sql
-- phone 字段是 VARCHAR(11)，有索引
SELECT * FROM users WHERE phone = 13800138000;  -- ❌ 数字字面量 → 隐式转换 → 索引失效
SELECT * FROM users WHERE phone = '13800138000'; -- ✅ 字符串匹配 → 走索引
```

**原因**：MySQL 对 WHERE 条件的左边做函数运算时，索引失效。隐式类型转换等价于 `WHERE CAST(phone AS SIGNED) = 13800138000`。

### 3.2 左模糊匹配

```sql
SELECT * FROM orders WHERE order_no LIKE '%ABC';     -- ❌ 左模糊 → 索引失效
SELECT * FROM orders WHERE order_no LIKE 'ABC%';     -- ✅ 右模糊 → 走索引
SELECT * FROM orders WHERE order_no LIKE '%ABC%';    --  全模糊 → 索引失效
```

**原因**：B+ 树按左前缀排序。`'ABC%'` 可以定位到 `ABC` 开头的子树，`'%ABC'` 无法利用有序性。

### 3.3 联合索引不满足最左前缀

```sql
-- 联合索引 (a, b, c)
SELECT * FROM t WHERE a = 1 AND b = 2 AND c = 3;   -- ✅ 用满索引
SELECT * FROM t WHERE a = 1 AND c = 3;              -- ⚠️ 只用 (a)，(c) 不走索引
SELECT * FROM t WHERE b = 2 AND c = 3;              -- ❌ 没有 a，索引完全失效
SELECT * FROM t WHERE a = 1 AND b > 2 AND c = 3;   -- ⚠️ 只用 (a, b)，范围查询右边的 c 不走
```

### 3.4 其他常见失效场景

| 场景 | 示例 | 原因 |
|------|------|------|
| 对索引列做运算 | `WHERE year(create_time) = 2025` | 函数运算破坏有序性 |
| OR 条件有一列没索引 | `WHERE indexed_col = 1 OR non_indexed_col = 2` | 优化器选择全表扫描 |
| 负向查询 | `WHERE status != 1` | 无法利用 B+ 树有序性 |
| IS NULL / IS NOT NULL | 数据分布倾斜时 | 优化器判断回表代价高于全表扫描 |
| 数据量太小 | 表只有 100 行 | 优化器认为全表扫描更快 |

**验证工具**：永远用 `EXPLAIN` 看执行计划。关注 `type`（ALL=全表扫描，ref=索引查找）、`key`（实际使用的索引）、`Extra`（Using filesort=需要排序，Using temporary=需要临时表——这两个都是性能杀手）。

## 四、线上 DDL：怎么不停机改表结构

### 4.1 InnoDB 的三种 DDL 算法

| 算法 | 行为 | 锁表时间 | MySQL 版本 |
|------|------|---------|-----------|
| **COPY** | 创建新表 → 拷贝数据 → 改名 | 全程锁表 | 5.5- |
| **INPLACE** | 原地修改，不拷贝全表 | 元数据锁（短时间） | 5.6+ |
| **INSTANT** | 只改元数据，不碰数据 | 毫秒级 | 8.0+ |

```sql
-- MySQL 8.0 INSTANT：只改元数据，10 亿行的表也秒级完成
ALTER TABLE orders ADD COLUMN remark VARCHAR(255), ALGORITHM=INSTANT;

-- INPLACE：需要重建索引但不拷贝数据
ALTER TABLE orders MODIFY COLUMN status INT NOT NULL, ALGORITHM=INPLACE;

-- 5.6 以前只能 COPY：10 亿行的表可能要几个小时
ALTER TABLE orders ADD INDEX idx_create_time(create_time);  -- 锁表！
```

### 4.2 gh-ost：零锁表在线 DDL

大表（>1000 万行）的 DDL，即使 INPLACE 也会阻塞。`gh-ost`（GitHub 出品）的方案：

```
1. 创建幽灵表 _orders_gho（和目标表同结构，但加了新列）
2. 通过解析 binlog 把增量变更同步到幽灵表
3. 全量拷贝历史数据到幽灵表（不影响原表）
4. 增量追平（binlog 实时同步）
5. 原子 rename：orders → _orders_old, _orders_gho → orders
6. 删除旧表
```

**关键**：整个过程原表不加锁，业务无感知。切换瞬间（rename）有毫秒级阻塞。

## 五、分库分表后的噩梦

### 5.1 什么时候该分

| 指标 | 单机阈值 | 超过后考虑分 |
|------|---------|------------|
| 单表行数 | 500 万 | 500 万+ |
| 单表大小 | 2GB | 2GB+ |
| QPS | 3000 | 3000+ |
| 慢查询比例 | > 5% | 索引优化无效后 |

**原则**：先优化（索引、SQL、缓存），再垂直拆（按业务拆库），最后水平拆（分库分表）。分库分表是最后的手段，不是第一步。

### 5.2 跨库 JOIN 怎么解决

```sql
-- 分库前：一条 SQL 搞定
SELECT o.*, u.name FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = 123;

-- 分库后：orders 和 users 在不同库，JOIN 不了
```

**三种解法**：

| 方案 | 做法 | 适用场景 |
|------|------|---------|
| **冗余字段** | 在 orders 表冗余 user_name | 关联字段少、更新不频繁 |
| **应用层组装** | 先查 orders，拿 user_id 批量查 users | 关联复杂度中等 |
| **宽表/ES** | 把关联数据同步到 ES 做查询 | 复杂查询、搜索场景 |

**架构师的判断**：90% 的跨库 JOIN 可以通过「冗余字段 + 应用层组装」解决。只有搜索、报表场景才需要 ES。不要用中间件（如 ShardingSphere 的联邦查询）做跨库 JOIN——性能差且调试困难。

### 5.3 分布式事务

分库后，一个业务操作可能写多个库。本地事务保不了跨库一致性。

| 方案 | 一致性 | 性能 | 复杂度 |
|------|--------|------|--------|
| **最终一致（消息队列）** | 最终一致 | 高 | 中 |
| **TCC** | 强一致 | 中 | 高 |
| **Saga** | 最终一致 | 高 | 中高 |
| **Seata AT** | 强一致 | 低 | 低 |

**生产推荐**：业务允许最终一致的场景（下单扣库存、发积分），用消息队列做最终一致。需要强一致的场景（转账），用 TCC。Seata AT 的全局锁在高并发下是性能瓶颈。

## 六、主从延迟：读写分离的隐形炸弹

### 6.1 延迟从哪来

```
Master 写事务 → binlog → 网络传输 → Slave relay log → Slave 回放
                                                        ↑
                                                  这里是瓶颈
                                         Slave 单线程回放（MySQL 5.6 前）
                                         Slave 并行回放但仍然有延迟（5.7+）
```

大事务（批量 UPDATE 10 万行）在 Master 上执行了 2 秒，Slave 回放也要 2 秒——这 2 秒内读写分离读到的是旧数据。

### 6.2 解法

```java
/**
 * 读写分离的一致性读策略。
 * 核心思路：刚写完的数据，短时间内必须读 Master。
 */
@Component
public class ConsistentReadRouter {

    private static final ThreadLocal<Long> LAST_WRITE_TIME = new ThreadLocal<>();
    private static final long CONSISTENCY_WINDOW_MS = 3000;  // 3 秒一致性窗口

    /** 写操作后记录时间戳 */
    public void afterWrite() {
        LAST_WRITE_TIME.set(System.currentTimeMillis());
    }

    /** 路由决策：3 秒内读 Master，超时读 Slave */
    public DataSource route() {
        Long lastWrite = LAST_WRITE_TIME.get();
        if (lastWrite != null && (System.currentTimeMillis() - lastWrite) < CONSISTENCY_WINDOW_MS) {
            return masterDataSource;  // 读主库
        }
        return slaveDataSource;  // 读从库
    }
}
```

更彻底的方案：**强制路由**——同一个会话内的读请求全部走 Master（ShardingSphere 的 `HintManager`）。

## 结语

MySQL 不是「建个表、写个 SQL 就完事」的数据库。

> B+ 树决定了索引怎么建才有效，MVCC 决定了并发读写会不会互相阻塞，执行计划决定了 SQL 优化往哪个方向用力，分库分表决定了数据增长后的天花板在哪，主从延迟决定了读写分离的一致性代价。

每一个「优化手段」背后都是权衡。知道 MySQL 的边界在哪，比知道它有什么功能更重要。
