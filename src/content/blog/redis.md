---
title: 'Redis知识'
description: 'Redis是一种开放源代码（BSD许可）的内存中数据结构存储，用作数据库，缓存和消息代理。...'
pubDate: 2020-11-20
category: 'DataBase'
tags: []
---


# Redis知识

## 1. NoSql入门和概述

### 1.1 入门概述

#### 为什么用nosql

1. 单机MySQL的年代
	单个数据库实例。瓶颈（数据量大小，索引大小，访问量）
2. Memcached(缓存)+MySQL+垂直拆分
	优化数据库结构和索引，通过文件缓存来缓解数据库压力
3. MySQL主从读写分离
	Memcached只能缓解数据库读取压力，读写集中在一个数据库上让数据库压力过大，开始通过主从复制来达到读写分离
4. 分表分库+水平拆分+MySQL集群
	在Memcached的高速缓存，MySQL的主从复制、读写分离的基础上，开始流行使用分库分表来缓解写压力和数据增长的扩展问题。MySQL退出了MySQL Cluster集群提供了高可靠性
5. MySQL的扩展性瓶颈
	存储大文本字段，导致库表非常大，恢复慢。扩展需要复杂点的技术来实现。大数据下IO压力大，表结构更改困难
6. 今天是什么样子
	nginx + 服务器集群 + Mysql/Oracle集群 + 移动信息服务器/实时通信服务器/流媒体服务器/电子邮件服务器/文件服务器等
7. 为什么用NoSQL
	SQL数据库不适合处理复杂关系

#### 是什么

**NoSQL（Not Only SQL）泛指非关系型的数据库**。随着互联网web2.0网站的兴起，传统的关系数据库在应付web2.0网站，特别是超大规模和高并发的SNS类型的web2.0纯动态网站已经显得力不从心，暴漏了很多难以克服的问题，而非关系型的数据库则由于其本身的特点得到了非常迅速的发展。NoSQL数据库的产生就是为了解决大规模数据集合多重数据种类带来的挑战，尤其是大数据应用难题，包括超大规模数据的存储。

例如：谷歌或Facebook每天为他们的用户收集万亿比特的数据。**这些类型的数据存储不需要固定的模式，无需多余的操作就可以横向扩展。**

#### 能干嘛

1. 易扩展
	NoSQL数据库种类繁多，但是一个共同的特点都是去掉关系型数据库的关系型特性。数据之间无关系，这样就非常容易扩展，也无形之间，在架构的层面上带来了可扩展的能力。
2. 大数据量高性能
	NoSQL数据库都具有非常高的的读写性能，尤其在大数据量下，同样表现优秀。这得益于它的无关系性，数据库的结构简单。一般MySQL使用Query Cache，每次表的更新Cache就失效，是一种大粒度的Cache，在针对web2.0的交互频繁的应用，Cache性能不高。而NoSQL是记录级的，是一种细粒度的Cache，所以NoSQL在这个层面上来说要性能高很多了。
3. 多样灵活的数据模型
	NoSQL无需事先为要存储的数据建立字段，随时可以存储自定义的数据格式。而在关系数据库里，增删字段是一件非常麻烦的事情。如果是非常大数据量的表，增加字段简直就是一个噩梦。

#### 去哪下

- Redis 
- Memcached
- MongDb

#### 怎么玩

- KV 键值对
- Cache 缓存
- Persistence 持久化

### 1.2 3V+3高

- 大数据时代的3V
	1. 海量Volume
	2. 多样Variety
	3. 实时Velocity
- 互联网需求的3高
	1. 高并发
	2. 高扩展
	3. 高性能

### 1.3 当下的NoSQL经典应用

#### 1.3.1 当下应用是sql和nosql一起使用

#### 1.3.2 阿里巴巴中文网站商品信息如何存放

0. 阿里巴巴中文网站首页
	- 架构发展历史
		1. 演变过程 CGI/Oracle->Java/Servlet->EJB->spring/ibatis->Memcache/Mysql->....
		2. 第5代
		3. 第5代架构使命  敏捷/开放/体验
	- 多数据源多数据类型的存储问题
1. 商品基本信息
	- 名称、价格、出厂日期、生产厂商等
	- 关系型数据库MySQL（自己改造过的），去IOE（IBM小型机、Oracle数据库、EMC存储设备）
2. 商品描述、详情、评价信息（多文字类）
	- 多文字描述类，IO读写性能变差
	- 文档数据库MongDB
3. 商品的图片
	- 商品图片展现类
	- 分布式的文件系统中
		1. 淘宝自己的TFS
		2. Google的GFS
		3. Hadoop的HDFS
4. 商品的关键字
	- 搜索引擎，淘宝内用
	- ISearch
5. 商品的波段性的热点高频信息
	- 内存数据库
	- Tair、Redis、Memcache
6. 商品的交易、价格计算、积分累计
7. 总结大型互联网应用（大数据、高并发、多样数据类型）的难点和解决方案
	- 难点
		- 数据类型多样性
		- 数据源多样性和变化重构
		- 数据源改造而数据服务平台不需要大面积重构
	- 解决办法
		- UDSL统一数据平台服务层
			- 映射
			- API
			- 热点缓存

### 1.4 NoSQL数据模型简介

- 以一个电商客户、订单、订购、地址模型来对比下关系型数据库和非关系型数据库
	- 传统关系型数据库，ER图（1:1, 1:n, n:n,主外键等）
	- NoSql如何设计，BSON数据模型（一种类json的一种二进制形式的存储格式，简称Binary JSON，持支内嵌的文档对象和数组对象）
	- 两者对比，问题和难点
		- 为什么可以用聚合模型来处理
			- 高并发的操作是不太建议有关联查询的，互联网公司用冗余数据来避免关联查询
			- 分布式事务是支持不了太多的并发的
- 聚合模型
	- KV键值
	- BSON
	- 列族
	- 图形

### 1.5 NoSQL数据库的四大分类

#### 1.5.1 KV键值

- 新浪：BerkeleyDB+redis
- 美团：redis+tair
- 阿里、百度：memchache+redis

#### 1.5.2 文档型数据库（bson格式比较多）

- CouchDB
- MongoDB，是一个基于分布式文件存储的数据库，由C++编写，旨在为web应用提供可扩展的高性能数据存储解决方案。是一个介于关系数据库和非关系数据库之间的产品，是关系数据库中功能最丰富，最像关系数据库的。

#### 1.5.3 列存储数据库

- Cassandra，HBase
- 分布式文件系统

#### 1.5.4 图关系数据库

- 放的不是图形的，放的是关系，比如：朋友圈社交网络、广告推荐系统
- 社交网络，推荐系统等。专注于构建关系图谱
- Neo4J，InfoGrid

#### 1.5.5 四者对比

|分类|例|应用场景|数据模型|优点|缺点|
|---|---|---|---|---|---|
|键值（key-value）|Tokyo Cabinet/Tyrant,Redis,Voldemort,Oracle BDB|内容缓存，主要用于处理大量数据的高访问负载，也用于一些日志系统等等|Key指向Value的键值对，通常用hash table来实现|查找速度快|数据无结构化，通常只能被当作字符串或者二进制数据|
|列存储数据库|Cassandra，Hbase，Riak|分布式的文件系统|以列簇式存储，将同一列数据存在一起|查找速度快，可扩展性强，更容易进行分布式扩展|功能相对局限|
|文档型数据库|CouchDB，MongoDB|web应用（与key-value类似，value是结构化的，不同的是数据库能够了解Value的内容）|Key-value对应的键值对，value为结构化数据|数据结构要求不严格，表结构可变，不需要像关系型数据库一样预先定义表结构|查询性能不高，而且缺乏统一的查询语法|
|图（Graph）数据库|Neo4J，InfoGrid，Infinite Graph|社交网络，推荐系统等，专注于构建关系图谱|图结构|利用图结构相关算法。比如最短路径寻址，N度关系查找等|很多时候需要对整个图做计算才能得出需要的信息，而且这种结构不太好作分布式的集群方案|

### 1.6 在分布式数据库中CAP原理CAP+BASE

#### 1.6.1 传统的ACID

- A(Atomicity)原子性
- C(Consistency)一致性
- I(Isolation)独立性
- D(Durability)持久性	

#### 1.6.2 CAP

- C(Consistency)强一致性
- A(Availability)可用性
- P(Partition tolerance)分区容错性

#### 1.6.3 CAP的3进2

- CAP的理论核心是：一个分布式系统不可能同时很好的满足一致性，可用性和分区容错性这三个需求，**最多只能同时较好的满足两个。**

- 因此，根据CAP原理将Nosql数据库分为CA、CP和AP原则三大类:
	- CA-单点集群，满足一致性，可用性的系统，通常可扩展性上不太强
	- CP-满足一致性，分区容错性的系统，通常性能不是特别高
	- AP-满足可用性，分区容错性的系统，通常可能对一致性要求低一些

CAP理论就是说在分布式存储系统中，最多只能实现上面的两点。而由于从前的网络硬件肯定会出现延迟丢包等问题，所以**分区容错性是我们必须实现的**。
所以我们只能在一致性和可用性之间权衡，没有nosql系统能同时保证这三点。分布式架构的时候必须做出取舍。

C：强一致性    A：高可用性   P：分布式容错性
CA传统Oracle数据库
AP大多数网站架构的选择
CP：Redis、MongoDB

一致性和可用性之间取一个平衡。大多数web应用，其实并不需要强一致性。因此牺牲C换取P，这是目前分布式数据库产品的方向。

**一致性和可用性的抉择**
对于web2.0网站来说，关系数据库的很多主要特性却往往无用武之地。

数据库事务一致性需求：很多web实时系统并不要求严格的数据库事务，对读一致性的要求很低，有些场合对写一致性要求并不高/允许实现最终一致性。

数据库的写实时性和读实时性需求：对于关系数据库来说，插入一条数据之后立刻查询，是肯定可以读出来这条数据的，但是对于很多web应用来说，并不要求这么高的实时性，比方说发一条信息之后，过几秒乃至几十秒后，我们的订阅者才能看到这条动态是完全可以接受的。

对于复杂的sql查询，特别是多表关联查询的需求：任何大数据量的web系统，都非常忌讳多个大表的关联查询，以及复杂的数据分析类型的报表查询，特别是SNS类型的网站，从需求以及产品的设计角度，就避免了这种情况的产生。往往更多的知识单表的主键查询，以及单表的简单条件分页查询，SQL的功能被极大的弱化了。

#### 1.6.4 经典的CAP图

#### 1.6.5 BASE

BASE就是为了解决关系数据库强一致性引起的问题而引起的可用性降低而提出的解决方案。

BASE可以是下面三个术语的缩写：
基本可用（Basically Available）
软状态（Soft state）
最终一致（Eventually consistent）

他的思想是通过让系统放松对某一时刻数据一致性的要求来换取系统整体伸缩性和性能上改观。因为大型系统往往由于地域分布和极高性能的要求，不可能采用分布式事务来完成这些指标，而想获得这些指标，我们必须采用另外一种方式来完成，BASE就是解决这个问题的办法。

#### 1.6.6 分布式+集群简介

分布式系统（distributed system），由多台计算机和通信的软件组通过计算机网络连接（本地网络或广域网）组成。分布式系统是建立在网络之上的软件系统。正是因为软件的特性，所以分布式系统具有高度的内聚性和透明性。因此，网络和分布式系统之间的区别更多的在于高层软件（特别是操作系统），而不是硬件。分布式系统可以应用在不同的平台上如：PC、工作站、局域网和广域网上等。

1. 分布式：不同的多台服务器上面部署不同的服务模块（工程），它们之间通过RPC/RMI之间通信和调用，对外提供服务和组内协作。
2. 集群：不同的多台服务器上面部署相同的服务模块，通过分布式调度软件进行统一的调度，对外提供和访问。

## 2. Redis入门介绍

#### 2.1 入门概述

##### 2.1.1 是什么

- dis：REmote DIctionary Server（远程字典服务器）
- 全开源免费的，用C语言编写的，遵守BSD协议，是一个高性能的（key/value）分布式内存数据库，基于内存运行并支持持久化的NoSql数据库，是当前最热门的NoSql数据库之一，也被人们称为数据结构服务器
- dis与其他key-value缓存产品有以下三个特点
	1. 支持数据的持久化，可以将内存中的数据保存在磁盘中，重启的时候可以再次加载进行使用
	2. 不仅仅支持简单的key-value类型的数据，同时还提供list，set，zset，hash等数据结构的存储
	3. 支持数据的备份，即master-slave模式的数据备份

##### 2.1.2 能干嘛

- 内存存储和持久化：redis支持异步将内存中的数据写到硬盘上，同时不影响继续服务
- 取最新N个数据的操作，如：可以将最新的10条评论的ID放在Redis的List集合里面
- 模拟类似于HttpSession这种需要设定过期时间的功能
- 发布、订阅消息系统
- 定时器、计数器

##### 去哪下

- http://redis.io
- http://www.redis.cn

##### 怎么玩

- 数据类型、基本操作和配置
- 持久化和复制，RDB/AOF
- 事务的控制
- 复制

#### 2.3 Redis的安装

- windows
	- 下载地址https://github.com/dmajkic/redis/downloads
	- 服务端命令行运行 redis-server.exe redis.conf
	- 客户端命令行运行redis-cli.exe -h 127.0.0.1 -p 6379
- linux
	- 下载获得redis-3.0.4.tar.gz后将它放入我们的Linux目录/opt
	
	- /opt目录下，解压tar -zxvf redis-3.0.4.tar.gz
	
	- 解压完成后出现文件夹：redis-3.0.4
	
	- 进入目录cd redis-3.0.4
	
	- 在redis-3.0.4目录下执行make命令
		- 安装gcc（linux下的一个编译程序，是C程序的编译工具）
			- 能上网：yum install gcc-c++
			- 不能上网：RPM安装
		- 二次make
		- Jemalloc/jemalloc.h：没有那个文件或目录，运行make distclean之后再make
		- redis test可以不用执行
		
	- 如果make完成后继续执行make install
	
	- 查看默认安装路径usr/local/bin
		- redis-check-aof：修复有问题的AOF文件
		- redis-check-dump：修复有问题的dump.rdb文件
		- redis-cli：客户端，操作入口
		- redis-sentinel：redis集群使用
		- redis-server：Redis服务器启动命令
	- 启动
		- redis-server /redis/redis.conf
		- redis-cli -p 6379
	- 永远的helloword 
		- set k hello
		- get k
	- 关闭 shutdown

#### 2.4 Redis启动后杂项基础知识讲解

- 单进程
- 默认16个数据库，类似数组下标从零开始，初始默认使用零号库
- Select命令切换数据库
- Dbsize查看当前数据库的key的数量
- Flushdb：清空当前库
- Flushall：通杀全部库
- 统一密码管理，16个库都是同样密码，要么都ok要么一个也连接不上
- Redis索引都是从零开始
- 为什么默认端口是6379  merz

## 3. Redis数据类型

### 3.1 五大数据类型

**String（字符串）**
String是redis最基本的类型，可以理解成与Memcached一样的类型，一个key对应一个value。
String类型是二进制安全的。意思是redis的String可以包含任何数据。比如jpg图片或者序列化的对象。
String类型是Redis最基本的数据类型，一个redis中字符串value最多可以是512M

**Hash（哈希，类似Java里的map）**
Hash是一个键值对集合。
Hash是一个String类型的field和value的映射表，hash特别适合用于存储对象。
类似于java里面的Map<String,Object>

**List（列表）**
List是简单的字符串列表，按照插入顺序排序。你可以添加一个元素到列表的头部（左边）或者尾部（右边）。
它的底层实际是个链表。

**Set（集合）**
Set是String类型的无序集合。他是通过HashTable实现的。

**Zset（sorted set：有序集合）**
Zset和set一样也是String类型元素的集合，且不允许重复的成员。
不同的是每个元素都会关联一个double类型的分数。
redis正是通过分数来为集合中的成员从小到大的排序。zset的成员是唯一的，但分数（Score）却可以重复。

**Redis常见数据类型操作命令**
http://redisdoc.com

### 3.2 键（Key）

**常用命令**
- DEL key 该命令用于在key存在时删除key
- DUMP key 序列化给定key，并返回序列化的值
- EXISTS key 检查给定key是否存在
- EXPIRE key seconds 为给定ey设置过期时间
- EXPIREAT key timestamp 为key设置过期时间。不同在于EXPIREAT命令接受的时间参数是UNIX时间戳（UNIX timestamp）。
- PEXPIRE key milliseconds 设置key的过期时间以毫秒计算
- PEXPIREAT key milliseconds-timestamp 设置key过期时间的时间戳（UNIX timestamp）以毫秒计
- KEYS pattern 查找所有符合给定模式（pattern）的key
- MOVE key db 将当前数据库的key移动到给定数据库db当中
- PERSIST key 移除key的过期时间，key将永久保持
- PTTL key 以毫秒为单位妇女会可以的剩余过期时间
- TTL key 以秒为单位返回给定key剩余的生存时间（TTL，time to live），-1表示永不过期，-2表示已过期
- RANDOMKEY 从当前数据库中那个随即返回一个key
- RENAME key newkey 修改key的名称
- RENAMENX key newkey 仅当newkey不存在时，将key改名为newkey
- TYPE key 返回key所储存的值的类型

**重点案例**
- keys \* 查看所有的key
- exists keyname 判断key是否存在
- move key db 将key移动到指定库，当前库被移除了
- expire key 秒钟：为给定的key设置过期时间
- ttl key 查看还有多少秒过期，-1表示永不过期，-2表示已过期
- type key 查看key存储的值是什么类型

### 3.3 字符串（String）

**常用**
- SET key value 设置key的值
- GET key 获取指定key的值
- GETRANGE key start end 返回key中字符串值得子字符串
- GETSET key value将给定key的值设为value，并返回key得旧值
- GETBIT key offset 对于key所存储得字符串，获取指定偏移量上的位（bit）
- MGET key1 [key2...] 获取所有（一个或多个）给定key的值
- SETBIT key offset value 对key所存储得字符串，设置或清楚指定偏移量上的位
- SETEX key seconds value 将value关联到key，并将key得过期时间设置为seconds（秒为单位）
- SETNX key value 只有在key不存在时设置key的值
- SETRANGE key offet value 用value参数覆盖给定key所存储的字符串值，从偏移量offset开始
- STRLEN key 返回key所储存的字符串值的长度
- MSET key value[key value...] 同时设置一个或多个key-value对
- MSETNX key value[key value...] 同时设置一个或多个key-value对，当且仅当所有给定key都不存在
- PSETEX key milliseconds value 这个命令和SETEX命令相似，但它以毫秒为单位设置key的生存时间，恶如是像SETEX命令那样以秒为单位。
- INCR key 将key中存储的数字值增一
- INCRBY key increment 将key所储存的值加上给定的增量值。
- INCRBYFLOAT key increment 将key所储存的值加上给定的浮点增量值
- DECR key 将key中储存的数值减一
- DECRBY key decrement 将key所储存的值减去给定的减量值
- APPEND key value 如果key已经存在并且是第一个字符，APPEND命令将value值追加到key原来值的末尾

**重点案例**
- set/get/del/append/strlen
- incr/decr/incrby/decrby一定要是数字才能进行加减
- getrange/setrange
	- getrange：获取指定区间内范围的值，类似between and的关系，0到-1表示全部
	- setrange设置指定区间范围内的值，格式是setrange key值 位置 具体值。例：setrange k 0 xxx，设置k对应的值，从第一位开始，前三位为xxx
- setex(set with expire)键 秒 值/setnx(set if not exists)
- mset/mget/msetnx批量设置/获取
- getset(先get再set)

### 3.4 列表（List）

**常用**
- BLPOP key1[key2] timeout 移除并获取列表的第一个元素，如果列表没有元素会阻塞列表知道等待超时或发现可弹出元素为止
- BRPOP key1[key2] timeout 移除并获取列表的最后一个元素，如果列表没有元素会阻塞列表知道等待超时或发现可弹出元素为止
- BRPOPLPUSH source destination timeout 从元素中弹出一个值，将弹出的元素插入到另一个列表中，并返回它；如果列表没有元素会阻塞列表知道等待超时或发现可弹出元素为止
- LINDEX key index 通过索引获取列表中而元素
- LINSERT key BEFOREIAFTER pivot value 在列表元素前或后插入元素
- LLEN key 获取列表长度
- LPOP key 移除并获取列表的第一个元素
- LPUSH key value1[value2]将一个或多个值插入到已存在的列表头部
- LRANGE key start stop 获取列表指定范围内的元素
- LERM key count value 移除列表元素
- LSET key index value 通过索引设置列表元素的值
- LTRIM key start stop 对于一个列表进行修剪，让列表只保留指定区间内的元素，不在指定区间内的元素都将被删除
- RPOP key 移除并获取列表最后一个元素
- RPOPLPUSH source destination 移除列表的最后一个元素，并将该元素添加到另一个列表并返回
- RPUSH key value1[value2]在列表中添加一个或多个值
- RPUSHHX key value 为已存在的列表添加值

**重点案例**
- lpush/rpush/lrange
- lpop/rpop
- lindex，按照索引下标获得元素(从上到下)
	- 通过索引获取列表中的元素 lindex key index
- llen
- lrem key 删N个value
	- 从left往right删除2个值等于v1的元素，返回的值为实际删除的数量: LREM list3 0 值，表示删除全部给定的值。零个就是全部值
- rpoplpush 源列表 目的列表
	- 移除列表的最后一个元素，并将该元素添加到另一个列表并返回 
- ltrim key 开始index 结束index，截取指定范围的值后再赋值给key
	- ltrim：截取指定索引区间的元素，格式是ltrim list的key 起始索引 结束索引
- lset key index value
- linsert key  before/after 值1 值2
	- 在list某个已有值的前后再添加具体值
- 性能总结
	- 它是一个字符串链表，left、right都可以插入添加；
	- 如果键不存在，创建新的链表；
	- 如果键已存在，新增内容；
	- 如果值全移除，对应的键也就消失了。
	- 链表的操作无论是头和尾效率都极高，但假如是对中间元素进行操作，效率就很惨淡了。

### 3.5 集合（Set）

**常用**
- SADD key member1[member2] 向集合添加一个或多个成员
- SCARD key 获取集合的成员数
- SDIFF key1[key2] 返回给定所有集合的差集
- SDIFFSTORE destination key1[key2] 返回给定所有集合的差集并存储在destination中
- SINTER key1[key2] 返回给定集合的交集
- SINTERSTORE destination key1[key2] 返回给定所有集合的交集并存储在destination中
- SISMEMBER key member 判断member元素是否是集合key的成员
- SMEMBERS key 返回集合中所有成员
- SMOVE source destination member 将member元素从source集合移动到destination集合
- SPOP key 移除并返回集合中的一个随机元素
- SRANDMEMBER key [count] 返回集合中一个或多个随机数
- SREM key member1[member2] 移除集合中的一个或多个成员
- SUNION key1[key2] 返回给定所有集合的并集
- SUNIONSTORE 所有给定集合的并集存储在的destination集合中
- SSCAN key cursor [MATCH pattern] [COUNT count]迭代集合中的元素

**重点案例**
- sadd/semebers/sismember
- scard，获取集合里的元数个数
- srem key value 删除集合中元素
- srandmember key 某个整数（随机出几个数）
- spop key 随机出栈
- smove key1 key2 在key1里某个值，作用是将jey1里的某个值赋值给key2
- 数学集合类
	- 差集：Sdiff
	- 交集：sinter
	- 并集：sunion 

### 3.6 哈希（Hash）

**常用**
- HDEL key field2[field2] 删除一个或多个哈希表字段
- HEXITSTS key field 查看哈希表key中，指定的字段是否存在
- HGET key field 获取存储在哈希表中指定字段的值
- HGELALL key 获取在哈希表key中的所有字段和值
- HINCRBY key field increament 为哈希表key中的指定字段的整数值加上增量increment
- HINCRBYFLOAT key field increment 为哈希表key中的指定字段的浮点数值加上增量increment
- HKEYS key 获取哈希表key中的所有字段
- HLEN key 获取哈希表中字段的数量
- HMGET key field1[field2] 获取所有给定字段的值
- HMSET key field1 value1[field2 value2]同时将多个field-value设置到哈希表中
- HSET key field value 将哈希表key中的字段field的值设置为value
- HSETNX key field value 只有在字段field不存在时，设置哈希表字段的值
- HVALS key获取哈希表中的所有值
- HSCAN key cursor[MATCH pattern][COUNT cout]迭代哈希表中的键值对

**重点案例**
- hset/hget/hmset/hmget/hgetall/hdel
- hlen字段数量
- hexists key field 判断哈希表key中是否存在field，存在1，不存在0
- hkeys/hvals 键集合/值集合
- hincrby/hincrbyfloat 值增加
- hsetnx 设置，当不存在的时候

### 3.7 有序集合Zset（sorted set）

**常用**
- ZDD key score1 member1[score2 member2] 向有序集合添加一个或多个成员，或者更新已存在成员的分数
- ZCARD key 获取有序集合的成员数
- ZCOUNT key min max 计算在有序集合中指定区间分数的成员数
- ZINCRBY key increment member 有序集合中对指定成员的分数加上增量increment
- ZINTERSTORE destination numkeys key[key...] 计算给定的一个或多个有序集的交集并将结果集存储在新的有序集合key中
- ZLEXCOUNT key min max 在有序集合中计算指定字段区间内成员数量
- ZRANGE key start stop [WITHSCORES] 通过索引区间返回有序集合指定区间内的成员
- ZRANGEBYLEX key min max [LIMIT offset count] 通过字段区间返回有序集合的成员
- ZRANGEBYSCORE key min max [WITHSCORES][LIMIT] 通过分数返回有序集合指定区间内的成员
- ZRANK key member 返回有序集合中指定成员的索引
- ZREM key member [member...] 移除有序集合中的一个或多个成员
- ZREMRANGEBYLEX key min max 移除有序集合中给定的排名区间的所有成员
- ZREVRANGE key start stop [WITHSCORES] 返回有序集合中指定区间内的成员，通过索引，分数从高到低排序
- ZREVRANGEBYSCORE key max min [WITHSCORES]返回有序集合中指定分数区间内的成员，分数从高到低排序
- ZREVRANK key member 返回有序集中，成员的分数值
- ZUNIONSTORE destination numkeys key[key...] 计算给定的一个或多个有序集的并集，并存储在新的key中
- ZSCAN key cursor[MATCH parttern][COUNT count] 迭代有序集合中的元素（包括元素和分数）

**重点案例**
- zadd/zrange  [WITHSCORES]
- zrangebyscore key 开始score 结束score 
	- withscores 显示分数
	- (表示开区间，不包含
	- limit返回限制 从多少开始 多少步
- zrem key score 删除key下对应分数的元素
- zcard统计数量/zcount key score区间，按分数区间统计/zrank key values值，作用是获得下标值/zscore key 对应值，获得分数 
- zrevrank key values值，作用是逆序获得下标值
- zrevrange 逆序输出
- zrevrangebyscore 按分数区间逆序输出

## 4. 解析配置文件redis.conf

### 4.1 它在哪

安装目录下，注意备份

### 4.2 Units单位

- 配置大小写单位，开头定义了一些基本的度量单位，只支持bytes，不支持bit
- 对大小写不敏感

### 4.3 INCLUDES包含

和Struts2配置文件类似，可以包其他redis配置文件
include /path/local.conf

### 4.4 GENERAL通用

- Daemonize 是否在后台执行，yes：后台运行；no：不是后台运行
- Pidfile 当Redis以守护进程方式运行时，Redis默认会把pid写入/var/run/redis.pid文件，可以通过pidfile指定
- Port 指定Redis监听端口，默认端口为6379，如果指定0端口，表示Redis不监听TCP连接
- Tcp-backlog 此参数确定了TCP连接中已完成队列(完成三次握手之后)的长度， 当然此值必须不大于Linux系统定义
的/proc/sys/net/core/somaxconn值，默认是511，而Linux的默认参数值是128。当系统并发量大并且客户端
速度缓慢的时候，可以将这二个参数一起参考设定。该内核参数默认值一般是128，对于负载很大的服务程序来说
大大的不够。一般会将它修改为2048或者更大。在/etc/sysctl.conf中添加:net.core.somaxconn = 2048，
然后在终端中执行sysctl -p
- Timeout 当客户端闲置多长时间后关闭连接，如果指定为0，表示关闭该功能
- Bind 指定 redis 只接收来自于该IP地址的请求，如果不进行设置，那么将处理所有请求
- Tcp-keepalive 如果设置不为0，就使用配置tcp的SO_KEEPALIVE值，使用keepalive有两个好处:检测挂
掉的对端。降低中间设备出问题而导致网络看似连接却已经与对端端口的问题。在Linux内核中，设置了
keepalive，redis会定时给对端发送ack。检测到对端关闭需要两倍的设置值，建议设置为60
- Loglevel 指定了服务端日志的级别。级别包括：debug（很多信息，方便开发、测试），verbose（许多有用的信息，
但是没有debug级别信息多），notice（适当的日志级别，适合生产环境），warn（只有非常重要的信息）
- Logfile 指定了记录日志的文件。空字符串的话，日志会打印到标准输出设备。后台运行的redis标准输出是/dev/null
- Syslog-enabled 是否打开记录syslog功能
- Syslog-ident syslog的标识符
- Syslog-facility 日志的来源、设备，user或local0-local7
- Databases 数据库的数量默认16，默认使用的数据库是0号。可以通过”SELECT 【数据库序号】“命令选择一个数据库，序号从0开始

### 4.5 SNAPSHOTTING快照

- **save \<seconds><changes\>**
RDB是整个内存的压缩过的Snapshot，RDB的数据结构，可以配置符合的快照触发条件：
//关闭快照功能，不配置或配置空字符串
save ""
//900秒（15分钟）内有1次修改，就保存
save 900 1 
//300秒（5分钟）内有10次修改，就保存
save 300 10
//60秒（1分钟）内有10000次修改，就保存
save 60 10000

ps：save命令可以直接触发快照备份

- **Stop-writes-on-bgsave-error**
后台保存数据时出错，停止写入。
如果配置成no，表示你不在乎数据不一致或者有其他的手段发现和控制

- **rdbcompression**
rdbcompression：对于存储到磁盘中的快照，可以设置是否进行压缩存储。如果是的话，redis会采用LZF算法进行压缩。如果你不想消耗CPU来进行压缩的话，可以设置为关闭此功能

- **rdbchecksum**
rdbchecksum：在存储快照后，还可以让redis使用CRC64算法来进行数据校验，但是这样做会增加大约10%的性能消耗，如果希望获取到最大的性能提升，可以关闭此功能

- **dbfilename**
 指定本地数据库文件名，默认值为dump.rdb

- **dir**
指定本地数据库存放目录


### 4.6 REPLICATION复制



### 4.7 SECURITY安全

- config get requirepass --获取密码
- config set requirepass "密码"   --设置密码，如果设置为''空字符串，表示取消密码
- auth 密码 --设置密码后，要校验密码才能继续操作

### 4.8 LIMITS限制

- **Maxclients **
设置redis同时可以与多少个客户端进行连接。默认情况下为10000个客户端。当你无法设置进程文件句柄限制时，redis会设置为当前的文件句柄限制值减去32，因为redis会为自身内部处理逻辑留一些句柄出来。如果达到了此限制，redis则会拒绝新的连接请求，并且向这些连接请求方发出“max number of clients reached”以作回应。

- **Maxmemory**
设置redis可以使用的内存量。一旦到达内存使用上限，redis将会试图移除内部数据，移除规则可以通过maxmemory-policy来指定。如果redis无法根据移除规则来移除内存中的数据，或者设置了“不允许移除”，那么redis则会针对那些需要申请内存的指令返回错误信息，比如SET、LPUSH等。但是对于无内存申请的指令，仍然会正常响应，比如GET等。如果你的redis是主redis（说明你的redis有从redis），那么在设置内存使用上限时，需要在系统中留出一些内存空间给同步队列缓存，只有在你设置的是“不移除”的情况下，才不用考虑这个因素

- **Maxmemory-policy**
	- volatile-lru -> remove the key with an expire set using an LRU algorithm，最近最久未使用法，使用LRU算法移除key，只对设置了过期时间的键
	- allkeys-lru -> remove any key according to the LRU algorithm，使用LRU算法移除key
	- volatile-random -> remove a random key with an expire set，在过期集合中移除随机的key，只对设置了过期时间的键
	- allkeys-random -> remove a random key, any key，移除随机的key
	- volatile-ttl -> remove the key with the nearest expire time (minor TTL)，移除那些TTL值最小的key，即那些最近要过期的key
	- noeviction -> don't expire at all, just return an error on write operations，永不失效，正对写操作，只返回错误信息

- **Maxmemory-samples**
设置样本数量，LRU算法和最小TTL算法都并非是精确的算法，而是估算值，所以你可以设置样本的大小，redis默认会检查这么多个key并选择其中LRU的那个。默认5个


### 4.9 APPEND ONLY MODE追加

- appendonly 默认no
- appendfilename 默认appendonly.aof
- appendfsync
	- always：同步持久化 每次发生数据变更会被立即记录到磁盘  性能较差但数据完整性比较好
	- everysec：出厂默认推荐，异步操作，每秒记录   如果一秒内宕机，有数据丢失
	- no
- no-appendfsync-on-rewrite：重写时是否可以运用Appendfsync，用默认no即可，保证数据安全性。
- auto-aof-rewrite-min-size：重写的基准值，默认64mb，表示最小64mb
- auto-aof-rewrite-percentage：重写的基准值，默认100，表示是上次的一倍

### 4.10 常见配置redis.conf介绍

参数说明
redis.conf 配置项说明如下：
1. Redis默认不是以守护进程的方式运行，可以通过该配置项修改，使用yes启用守护进程
     daemonize no
2. 当Redis以守护进程方式运行时，Redis默认会把pid写入/var/run/redis.pid文件，可以通过pidfile指定
     pidfile /var/run/redis.pid
3. 指定Redis监听端口，默认端口为6379，作者在自己的一篇博文中解释了为什么选用6379作为默认端口，因为6379在手机按键上MERZ对应的号码，而MERZ取自意大利歌女Alessia Merz的名字
     port 6379
4. 绑定的主机地址 
     bind 127.0.0.1
5. 当 客户端闲置多长时间后关闭连接，如果指定为0，表示关闭该功能
     timeout 300
6. 指定日志记录级别，Redis总共支持四个级别：debug、verbose、notice、warning，默认为verbose
     loglevel verbose
7. 日志记录方式，默认为标准输出，如果配置Redis为守护进程方式运行，而这里又配置为日志记录方式为标准输出，则日志将会发送给/dev/null
     logfile stdout
8. 设置数据库的数量，默认数据库为0，可以使用SELECT <dbid>命令在连接上指定数据库id
    databases 16
9. 指定在多长时间内，有多少次更新操作，就将数据同步到数据文件，可以多个条件配合
    save <seconds> <changes>
    Redis默认配置文件中提供了三个条件：
    save 900 1
    save 300 10
    save 60 10000
    分别表示900秒（15分钟）内有1个更改，300秒（5分钟）内有10个更改以及60秒内有10000个更改。
10. 指定存储至本地数据库时是否压缩数据，默认为yes，Redis采用LZF压缩，如果为了节省CPU时间，可以关闭该选项，但会导致数据库文件变的巨大
    rdbcompression yes
11. 指定本地数据库文件名，默认值为dump.rdb
     dbfilename dump.rdb
12. 指定本地数据库存放目录
     dir ./
13. 设置当本机为slav服务时，设置master服务的IP地址及端口，在Redis启动时，它会自动从master进行数据同步
     slaveof <masterip> <masterport>
14. 当master服务设置了密码保护时，slav服务连接master的密码
     masterauth <master-password>
15. 设置Redis连接密码，如果配置了连接密码，客户端在连接Redis时需要通过AUTH <password>命令提供密码，默认关闭
     requirepass foobared
16. 设置同一时间最大客户端连接数，默认无限制，Redis可以同时打开的客户端连接数为Redis进程可以打开的最大文件描述符数，如果设置 maxclients 0，表示不作限制。当客户端连接数到达限制时，Redis会关闭新的连接并向客户端返回max number of clients reached错误信息
     maxclients 128
17. 指定Redis最大内存限制，Redis在启动时会把数据加载到内存中，达到最大内存后，Redis会先尝试清除已到期或即将到期的Key，当此方法处理 后，仍然到达最大内存设置，将无法再进行写入操作，但仍然可以进行读取操作。Redis新的vm机制，会把Key存放内存，Value会存放在swap区
     maxmemory <bytes>
18. 指定是否在每次更新操作后进行日志记录，Redis在默认情况下是异步的把数据写入磁盘，如果不开启，可能会在断电时导致一段时间内的数据丢失。因为 redis本身同步数据文件是按上面save条件来同步的，所以有的数据会在一段时间内只存在于内存中。默认为no
     appendonly no
19. 指定更新日志文件名，默认为appendonly.aof
     appendfilename appendonly.aof
20. 指定更新日志条件，共有3个可选值： 
     no：表示等操作系统进行数据缓存同步到磁盘（快） 
     always：表示每次更新操作后手动调用fsync()将数据写到磁盘（慢，安全） 
     everysec：表示每秒同步一次（折衷，默认值）
     appendfsync everysec
21. 指定是否启用虚拟内存机制，默认值为no，简单的介绍一下，VM机制将数据分页存放，由Redis将访问量较少的页即冷数据swap到磁盘上，访问多的页面由磁盘自动换出到内存中（在后面的文章我会仔细分析Redis的VM机制）
     vm-enabled no
22. 虚拟内存文件路径，默认值为/tmp/redis.swap，不可多个Redis实例共享
     vm-swap-file /tmp/redis.swap
23. 将所有大于vm-max-memory的数据存入虚拟内存,无论vm-max-memory设置多小,所有索引数据都是内存存储的(Redis的索引数据 就是keys),也就是说,当vm-max-memory设置为0的时候,其实是所有value都存在于磁盘。默认值为0
     vm-max-memory 0
24. Redis swap文件分成了很多的page，一个对象可以保存在多个page上面，但一个page上不能被多个对象共享，vm-page-size是要根据存储的 数据大小来设定的，作者建议如果存储很多小对象，page大小最好设置为32或者64bytes；如果存储很大大对象，则可以使用更大的page，如果不 确定，就使用默认值
     vm-page-size 32
25. 设置swap文件中的page数量，由于页表（一种表示页面空闲或使用的bitmap）是在放在内存中的，，在磁盘上每8个pages将消耗1byte的内存。
     vm-pages 134217728
26. 设置访问swap文件的线程数,最好不要超过机器的核数,如果设置为0,那么所有对swap文件的操作都是串行的，可能会造成比较长时间的延迟。默认值为4
     vm-max-threads 4
27. 设置在向客户端应答时，是否把较小的包合并为一个包发送，默认为开启
     glueoutputbuf yes
28. 指定在超过一定的数量或者最大的元素超过某一临界值时，采用一种特殊的哈希算法
     hash-max-zipmap-entries 64
     hash-max-zipmap-value 512
29. 指定是否激活重置哈希，默认为开启（后面在介绍Redis的哈希算法时具体介绍）
     activerehashing yes
30. 指定包含其它的配置文件，可以在同一主机上多个Redis实例之间使用同一份配置文件，而同时各个实例又拥有自己的特定配置文件
     include /path/to/local.conf

## 5. Redis的持久化

### 5.1 rdb(Redis Database)

**是什么**
	在指定时间间隔内将内存中的数据集快照写入磁盘，也就是行话讲的Snapshot快照，他恢复时是将快照文件直接读到内存里
	Redis会单独创建（fork）已给进程来进行持久化，会先将数据写入到一个临时文件中，代持久化过程都结束了，再用这个临时文件替换上次持久化好的文件。整个过程中，主进程是不进行任何IO操作的，这就确保了极高的性能
	如果要进行大规模数据的恢复，且对于数据恢复的完整性不是非常敏感，那RDB方式要比AOF方式更加高效。RDB的缺点是最后一次持久化后的数据可能丢失

**Fork**
	fork的作用是复制一个与当前进程一样的进程。新进程的所有数据（变量、环境变量、程序计数器等）
	数值都和原进程一致，但是是一个全新的进程，并作为原进程的子进程

**Rdb保存的是dump.rdb文件**

**配置位置**
配置文件redis.conf， SNAPSHOTTING下面

**如何触发RBD快照**
- 配置文件中默认的快照配置
	- 冷拷贝后重新使用，可以cp dump.rdb dump_new.rdb
- 命令save或者是bgsave
	- Save：save时只管保存，其它不管，全部阻塞
	- BGSAVE：Redis会在后台异步进行快照操作，快照同时还可以响应客户端请求。可以通过lastsave命令获取最后一次成功执行快照的时间
- 执行flushall命令，也会产生dump.rdb文件，但里面是空的，无意义

**如何恢复**
	将备份文件 (dump.rdb) 移动到 redis 安装目录并启动服务即可
	CONFIG GET dir 获取目录

**优势**
	适合大规模的数据恢复
	对数据完整性和一致性要求不高

**劣势**
	在一定间隔时间做一次备份，所以如果redis意外down掉的话，就会丢失最后一次快照后的所有修改
	fork的时候，内存中的数据被克隆了一份，大致2倍的膨胀性需要考虑

**如何停止**
	动态所有停止RDB保存规则的方法：redis-cli config set save ""

**小总结**
- rdbSave将内存中数据对象写入磁盘中的RDB文件
- rbdLoad将磁盘中的RDB文件的数据读取到内存中
- 优点
	- RDB是一个非常紧凑的文件
	- RDB在保存RDB文件时父进程唯一需要做的就是fork一个子进程，接下来的工作全部由子进程来做，所以RDB持久化方式可以最大化redis性能
	- 与AOF相比，在恢复大的数据集的时候，RDB方式会更快一些
- 缺点
	- 数据丢失风险大
	- RDB需要经常fork子进程来保存数据集到硬盘上，当数据集比较大的时候，fork的过程是非常耗时的，可能会导致redis在一些毫秒级不能响应客户端请求

### 5.2 aof(Append Only File)

**是什么**
	以日志的形式来记录每个写操作，将Redis执行过的所有写指令记录下来(读操作不记录)，只许追加文件但不可以改写文件，redis启动之初会读取该文件重新构建数据，换言之，redis重启的话就根据日志文件的内容将写指令从前到后执行一次以完成数据的恢复工作


**Aof保存的是appendonly.aof文件**


**配置位置**
配置文件redis.conf，APPEND ONLY MODE下面

**AOF启动/修复/恢复**
- 正常恢复
	- 修改默认的appendonly no，改为yes
	- 将有数据的aof文件复制一份保存到对应目录(config get dir)
	- 恢复：重启redis然后重新加载
- 异常恢复
	- 修改默认的appendonly no，改为yes
	- 备份被写坏的AOF文件
	- redis-check-aof --fix 进行修复
	- 恢复：重启redis然后重新加载

**rewrite**
- 是什么
	AOF采用文件追加方式，文件会越来越大为避免出现此种情况，新增了重写机制，当AOF文件的大小超过所设定的阈值时，Redis就会启动AOF文件的内容压缩，只保留可以恢复数据的最小指令集.可以使用命令bgrewriteaof
- 重写原理
	AOF文件持续增长而过大时，会fork出一条新进程来将文件重写(也是先写临时文件最后再rename)，
遍历新进程的内存中数据，每条记录有一条的Set语句。重写aof文件的操作，并没有读取旧的aof文件，
而是将整个内存中的数据库内容用命令的方式重写了一个新的aof文件，这点和快照有点类似
- 触发机制
	Redis会记录上次重写时的AOF大小，默认配置是当AOF文件大小是上次rewrite后大小的一倍且文件大于64M时触发

**优势**
- 每修改同步：appendfsync always   同步持久化 每次发生数据变更会被立即记录到磁盘  性能较差但数据完整性比较好
- 每秒同步：appendfsync everysec    异步操作，每秒记录   如果一秒内宕机，有数据丢失
- 不同步：appendfsync no   从不同步

**劣势**
- 相同数据集的数据而言aof文件要远大于rdb文件，恢复速度慢于rdb
- aof运行效率要慢于rdb,每秒同步策略效率较好，不同步效率和rdb相同

**小总结**
- 客户端请求服务器，服务器将命令以网络协议格式保存为AOF文件
- 优点
	- AOF文件是一个只进行追加的日志文件
	- Redis可以在AOF文件体积变得过大时，自动地在后台对AOF进行重写
	- AOF文件有序地保存了对数据库执行的所有写入操作，这些写入操作以Redis协议的格式保存，因此AOF文件的内容非常容易被人读懂，对文件进行分析也很轻松
- 缺点
	- 对于相同的数据集来说，AOF文件的体积通常要大于RDB文件的体积
	- 根据所使用的fsync策略，AOF的速度可能会慢于RDB

### 5.3 总结
- RDB持久化方式能够在指定时间间隔内对你的数据进行快照存储
- AOF持久化方式记录每次对服务器写的操作，当服务器重启的时候会重新执行这些命令来恢复原始的数据，AOF命令以redis协议追加保存每次写的操作到文件末尾。redis还能对AOF文件进行后台重写，是的AOF文件的体积不至于过大
- 只做缓存：如果你只希望你的数据在服务器运行的时候存在，你也可以不使用任何持久化方式
- 同时开启两种持久化方式
	- 在这种情况下，当redis重启的时候会优先载入AOF文件来恢复原始的数据，因为在通常情况下AOF文件保存的数据集要比RDB文件保存的数据集要完整
	- RDB的数据不实时，同时使用两者时服务器重启也只会找AOF文件，那要不要只是用AOF呢？作者建议不要，因为RDB更适合用于备份数据库（AOF在不断变化不好备份），快速重启，而且不会有AOF可能潜在的BUG，留着作为一个万一的手段
- 性能建议
	- 因为RDB文件只用作后备用途，建议只在Slave上持久化RDB文件，而且只要15分钟备份一次就够了，只保留save 900 1这条规则
	- 如果Enable AOF，好处是在最恶劣的情况下也只会丢失不超过两秒数据，启动脚本较简单值load自己的AOF文件就可以了。代价一是带来了持续的IO，二是AOF rewrite的最后将rewrite过程中产生的新数据写到新文件造成的阻塞几乎是不可避免的。只要硬盘许可，应该尽量减少AOF rewrite的频率，AOF重写的基础大小默认值64M太小了，可以设到5G以上。默认超过原大小100%大小时重写可以改到适当的数值
	- 如果不Enable AOF，仅靠Master-Slave Replication实现高可用也可以。能省掉一大笔IO也减少了rewrite时带来的系统波动。代价是如果Master/Slave同时垮掉，会丢失十几分钟的数据，启动脚本也要比较两个Master/Slave中的RDB文件，载入较新的那个。新浪微博就选用了这种架构

## 6. Redis的事务

### 6.1 是什么

可以依次执行多个命令，本质是一组命令的集合。一个事务中的所有命令都会序列化，**按顺序串行化地执行而不会被其他命令插入，不许加加塞**

### 6.2 能干嘛

一个队列中，一次性、顺序性、排他性的执行一些列命令

### 6.3 怎么玩

**常用命令**
- DISCARD 取消事务，放弃执行事务块内的所有命令
- EXEC 执行所有事务块内的命令
- MULTI 标记一个事务块的开始
- UNWATCH 取消WATCH名利那个对有所key的监视
- WATCH key[key...] 监视一个或多个key，如果在事务执行之前这个或这些key被其他命令所改动，那么事务将被打断

**正常执行**
```
MULTI     -->ok
set k1 v1 -->QUEUED
set k2 v2 -->QUEUED
get  k2     -->QUEUED
EXEC        -->OK OK "v2" OK
```
**放弃事务**
```
set k1 11 -->ok
MULTI     -->ok
set k1 v1 -->QUEUED
set k2 v2 -->QUEUED
DISCARD -->OK
get k1      -->"11"
```
**全体连坐**
```
MULTI     -->ok
set k1 v1 -->QUEUED
set k2 v2 -->QUEUED
getset k2 -->（error）ERR wrong number of arguments...
EXEC -->（error）EXECABORT Transcation discarded...
get k1      -->（nil）
```
**冤头债主**
```
set k1 v1 -->ok
MULTI     -->ok
incr k1    -->QUEUED
set k2 v2 -->QUEUED
EXEC        -->（error）value is not an integer...
       --> OK
get k2      -->"v2"
```
**watch监控**
- 悲观锁/乐观锁/CAS（check and set）
	- 悲观锁（Pessimistic Lock），就是很悲观，每次去拿数据的时候都认为别人会修改，所以每次都在拿数据的时候会上锁，这样别人想拿到这个数据就会阻塞直到它拿到锁。传统的关系型数据库里面就用到了很多这种锁机制，比如行锁，表锁等，读锁，写锁等，都是在操作之前先上锁。
	- 乐观锁（Optimistic Lock），就是很乐观，每次去拿数据的时候都认为别人不会修改，所以不会上锁，但是在更新的时候会判断一下在此期间别人有没有去更新这个数据，可以使用版本号等机制。乐观锁适用于多读的应用类型，这样可以提高吞吐量。**乐观锁策略：提交版本必须大于记录当前版本才能执行更新**
	- CAS：
- 初始化信用卡可用余额和欠款
- 无加塞篡改，先监控再开启multi，保证两笔金额变动在同一个事务内
- 有加塞篡改，监控了key，如果key被修改了，后面一个事务的执行失效
- unwatch
- 一旦执行了exec之前加的监控锁都会被取消掉
- 小结
	- Watch指令，类似乐观锁，事务提交时，如果Key的值已被别的客户端改变，比如某个list已被别的客户端push/pop过了，整个事务队列都不会被执行
	- 通过WATCH命令在事务执行之前监控了多个Keys，倘若在WATCH之后有任何Key的值发生了变化，EXEC命令执行的事务都将被放弃，同时返回Nullmulti-bulk应答以通知调用者事务执行失败

### 6.4 三阶段

- 开启：以MULTI开始一个事务
- 入队：将多个命令入队到事务中，接到这些命令并不会立即执行，二是放到等待执行的事务队列里面
- 执行：有EXEC命令触发事务

### 6.5 三特性

- 单独的隔离操作：事务中的所有命令都会序列化、按顺序地执行。事务在执行的过程中，不会被其他客户端发送来的命令请求所打断。
- 没有隔离级别的概念：队列中的命令没有提交之前都不会实际的被执行，因为事务提交前任何指令都不会被实际执行，也就不存在”事务内的查询要看到事务里的更新，在事务外查询不能看到”这个让人万分头痛的问题
- 不保证原子性：redis同一个事务中如果有一条命令执行失败，其后的命令仍然会被执行，没有回滚

## 7. Redis的发布订阅

### 7.1 是什么

- 进程间的一种消息通信模式：发送者（pub）发送消息，订阅者（sub）接收消息

### 7.2 命令

- PSUBSCRIBE pattern[pattern...] 订阅一个或多个符合给定模式的频道
- PUBSUB subcommand[argument [argument...]] 查看订阅与发布系统状态
- PUBLISH channel message 将信息发送到指定的频道
- PUNSUBSCRIBE [pattern [pattern...]] 退订所有给定模式的频道
- SUBSCRIBE channel [channel...] 订阅给定的一个或多个频道的信息
- UNSUBSCRIBE [channel [channel...]] 指退订给定的频道

### 7.3 案例

先订阅后，发布才能收到消息
1. 可以一次性订阅多个，SUBSCRIBE c1 c2 c3
2. 发布消息，PUBLISH c2 hello-redis
3. 订阅多个，通配符*，PSUBSCRIBE new*
4. 收取消息，PUBLISH new1 redis-hello

## 8. Redis的复制（Master/Slave）

### 8.1 是什么

也就是所说的主从复制，主机数据更新后根据配置和策略，自动同步到备机的master/slave机制，Master以写为主，Slave以读为主

### 8.2 能干嘛

- 读写分离
- 容灾备份

### 8.3 怎么玩

- 配从（库）不配主（库）
- 从库配置：slaveof 主库IP 主库端口
	- 每次与master断开之后，都需要重新连接，除非你配置进redis.conf文件
	- Info replication
- 修改配置文件细节操作
	- 拷贝多个redis.conf
	- 开启daemonize yes
	- Pid文件名字
	- 指定端口
	- Log文件名字
	- Dump.rdb名字
- 常用3招
	- 一主二仆
		- Init 
		- 一个Master两个Slave
		- 日志查看
			- 主机日志
			- 从机日志
			- info replication
		- 主从问题演示
			1. 切入点问题？slave1、slave2是从头开始复制还是从切入点开始复制?比如从k4进来，那之前的123是否也可以复制（从头复制）
			2. 从机是否可以写？set可否？（从机只能读）
			3. 主机shutdown后情况如何？从机是上位还是原地待命（从机原地待命）
			4. 主机又回来了后，主机新增记录，从机还能否顺利复制？（继续）
			5. 其中一台从机down后情况如何？依照原有它能跟上大部队吗？（不能，需要重新slaveof）
	- 薪火相传
		- 上一个Slave可以是下一个slave的Master，Slave同样可以接收其他slaves的连接和同步请求，那么该slave作为了链条中下一个的master,可以有效减轻master的写压力
		- 中途变更转向:会清除之前的数据，重新建立拷贝最新的
		- slaveof 新主库IP 新主库端口
	- 反客为主 SLAVEOF no one
		- 使当前数据库停止与其他数据库的同步，转成主数据库

### 8.4 复制原理

- slave启动成功连接到master后会发送一个sync命令
- Master接到命令启动后台的存盘进程，同时收集所有接收到的用于修改数据集命令，在后台进程执行完毕之后，master将传送整个数据文件到slave,以完成一次完全同步
- 全量复制：而slave服务在接收到数据库文件数据后，将其存盘并加载到内存中。
- 增量复制：Master继续将新的所有收集到的修改命令依次传给slave,完成同步
- 但是只要是重新连接master,一次完全同步（全量复制)将被自动执行

### 8.5 哨兵模式(sentinel)

#### 8.5.1 是什么

反客为主的自动版，能够后台监控主机是否故障，如果故障了根据投票数自动将从库转换为主库

#### 8.5.2 怎么玩

1. 调整结构，6379带着80、81
2. 自定义的/myredis目录下新建sentinel.conf文件，名字绝不能错
3. 配置哨兵,填写内容
	- sentinel monitor 被监控数据库名字(自己起名字) 127.0.0.1 6379 1
	- 上面最后一个数字1，表示主机挂掉后salve投票看让谁接替成为主机，得票数多少后成为主机
4. 启动哨兵
	- redis-sentinel /myredis/sentinel.conf 
	- 上述目录依照各自的实际情况配置，可能目录不同
5. 正常主从演示
6. 原有的master挂了
7. 投票新选
8. 重新主从继续开工,info replication查查看
9. 问题：如果之前的master重启回来，会不会双master冲突？

#### 8.5.3 一组sentinel能同时监控多个Master

### 8.6 复制的缺点

由于所有的写操作都是先在Master上操作，然后同步更新到Slave上，所以从Master同步到Slave机器有一定的延迟，当系统很繁忙的时候，延迟问题会更加严重，Slave机器数量的增加也会使这个问题更加严重。

## 9. Redis的Java客户端Jedis

### 9.1 安装JDK

- tar -zxvf jdk-7u67-linux-i586.tar.gz
- vi /etc/profile
- 重启一次Centos
- 编码验证

### 9.2 安装eclipse

- commons-pool-1.6.jar
- jedis-2.1.0.jar

### 9.3 Jedis所需要的jar包

### 9.4 Jedis常用操作

- **测试连通性**
```java
public class Demo01 {
  public static void main(String[] args) {
    //连接本地的 Redis 服务
    Jedis jedis = new Jedis("127.0.0.1",6379);
    //查看服务是否运行，打出pong表示OK
    System.out.println("connection is OK==========>: "+jedis.ping());
  }
}
```
- **5大数据类型和key**
```java
package com.atguigu.redis.test;

import java.util.*;
import redis.clients.jedis.Jedis;

public class Test02 
{
  public static void main(String[] args) 
  {
     Jedis jedis = new Jedis("127.0.0.1",6379);
     //key
     Set<String> keys = jedis.keys("*");
     for (Iterator iterator = keys.iterator(); iterator.hasNext();) {
       String key = (String) iterator.next();
       System.out.println(key);
     }
     System.out.println("jedis.exists====>"+jedis.exists("k2"));
     System.out.println(jedis.ttl("k1"));
     //String
     //jedis.append("k1","myreids");
     System.out.println(jedis.get("k1"));
     jedis.set("k4","k4_redis");
     System.out.println("----------------------------------------");
     jedis.mset("str1","v1","str2","v2","str3","v3");
     System.out.println(jedis.mget("str1","str2","str3"));
     //list
     System.out.println("----------------------------------------");
     //jedis.lpush("mylist","v1","v2","v3","v4","v5");
     List<String> list = jedis.lrange("mylist",0,-1);
     for (String element : list) {
       System.out.println(element);
     }
     //set
     jedis.sadd("orders","jd001");
     jedis.sadd("orders","jd002");
     jedis.sadd("orders","jd003");
     Set<String> set1 = jedis.smembers("orders");
     for (Iterator iterator = set1.iterator(); iterator.hasNext();) {
       String string = (String) iterator.next();
       System.out.println(string);
     }
     jedis.srem("orders","jd002");
     System.out.println(jedis.smembers("orders").size());
     //hash
     jedis.hset("hash1","userName","lisi");
     System.out.println(jedis.hget("hash1","userName"));
     Map<String,String> map = new HashMap<String,String>();
     map.put("telphone","13811814763");
     map.put("address","atguigu");
     map.put("email","abc@163.com");
     jedis.hmset("hash2",map);
     List<String> result = jedis.hmget("hash2", "telphone","email");
     for (String element : result) {
       System.out.println(element);
     }
     //zset
     jedis.zadd("zset01",60d,"v1");
     jedis.zadd("zset01",70d,"v2");
     jedis.zadd("zset01",80d,"v3");
     jedis.zadd("zset01",90d,"v4");
     
     Set<String> s1 = jedis.zrange("zset01",0,-1);
     for (Iterator iterator = s1.iterator(); iterator.hasNext();) {
       String string = (String) iterator.next();
       System.out.println(string);
     }    
  }
}
```
- **事务提交日常**
```java
package com.atguigu.redis.test;

import redis.clients.jedis.Jedis;
import redis.clients.jedis.Response;
import redis.clients.jedis.Transaction;

public class Test03 
{
  public static void main(String[] args) 
  {
     Jedis jedis = new Jedis("127.0.0.1",6379);
     
     //监控key，如果该动了事务就被放弃
     /*3
     jedis.watch("serialNum");
     jedis.set("serialNum","s#####################");
     jedis.unwatch();*/
     
     Transaction transaction = jedis.multi();//被当作一个命令进行执行
     Response<String> response = transaction.get("serialNum");
     transaction.set("serialNum","s002");
     response = transaction.get("serialNum");
     transaction.lpush("list3","a");
     transaction.lpush("list3","b");
     transaction.lpush("list3","c");
     
     transaction.exec();
     //2 transaction.discard();
     System.out.println("serialNum***********"+response.get());
          
  }
}
```
- **事务提交加锁**
```java
public class TestTransaction {

  public boolean transMethod() {
     Jedis jedis = new Jedis("127.0.0.1", 6379);
     int balance;// 可用余额
     int debt;// 欠额
     int amtToSubtract = 10;// 实刷额度

     jedis.watch("balance");
     //jedis.set("balance","5");//此句不该出现，讲课方便。模拟其他程序已经修改了该条目
     balance = Integer.parseInt(jedis.get("balance"));
     if (balance < amtToSubtract) {
       jedis.unwatch();
       System.out.println("modify");
       return false;
     } else {
       System.out.println("***********transaction");
       Transaction transaction = jedis.multi();
       transaction.decrBy("balance", amtToSubtract);
       transaction.incrBy("debt", amtToSubtract);
       transaction.exec();
       balance = Integer.parseInt(jedis.get("balance"));
       debt = Integer.parseInt(jedis.get("debt"));


       System.out.println("*******" + balance);
       System.out.println("*******" + debt);
       return true;
     }
  }

  /**
   * 通俗点讲，watch命令就是标记一个键，如果标记了一个键， 在提交事务前如果该键被别人修改过，那事务就会失败，这种情况通常可以在程序中
   * 重新再尝试一次。
   * 首先标记了键balance，然后检查余额是否足够，不足就取消标记，并不做扣减； 足够的话，就启动事务进行更新操作，
   * 如果在此期间键balance被其它人修改， 那在提交事务（执行exec）时就会报错， 程序中通常可以捕获这类错误再重新执行一次，直到成功。
   */
  public static void main(String[] args) {
     TestTransaction test = new TestTransaction();
     boolean retValue = test.transMethod();
     System.out.println("main retValue-------: " + retValue);
  }
}

```
- **主从复制**
	- 6379,6380启动，先各自先独立
	- 主写
	- 从读
```java
public static void main(String[] args) throws InterruptedException 
  {
     Jedis jedis_M = new Jedis("127.0.0.1",6379);
     Jedis jedis_S = new Jedis("127.0.0.1",6380);
     
     jedis_S.slaveof("127.0.0.1",6379);
     
     jedis_M.set("k6","v6");
     Thread.sleep(500);
     System.out.println(jedis_S.get("k6"));
  }
```

### 9.5 JedisPool

- 获取Jedis实例需要从JedisPool中获取
- 用完Jedis实例需要返还给JedisPool
- 如果Jedis在使用过程中出错，则也需要还给JedisPool
- 案例见代码
```java
package com.atguigu.redis.test;

import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;

public class JedisPoolUtil {
  
 private static volatile JedisPool jedisPool = null;//被volatile修饰的变量不会被本地线程缓存，对该变量的读写都是直接操作共享内存。
  
  private JedisPoolUtil() {}
  
  public static JedisPool getJedisPoolInstance()
 {
     if(null == jedisPool)
    {
       synchronized (JedisPoolUtil.class)
      {
          if(null == jedisPool)
         {
           JedisPoolConfig poolConfig = new JedisPoolConfig();
           poolConfig.setMaxActive(1000);
           poolConfig.setMaxIdle(32);
           poolConfig.setMaxWait(100*1000);
           poolConfig.setTestOnBorrow(true);
            
            jedisPool = new JedisPool(poolConfig,"127.0.0.1");
         }
      }
    }
     return jedisPool;
 }
  
  public static void release(JedisPool jedisPool,Jedis jedis)
 {
     if(null != jedis)
    {
      jedisPool.returnResourceObject(jedis);
    }
 }
}
 
 
package com.atguigu.redis.test;

import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;

public class Test01 {
  public static void main(String[] args) {
     JedisPool jedisPool = JedisPoolUtil.getJedisPoolInstance();
     Jedis jedis = null;
     
     try 
     {
       jedis = jedisPool.getResource();
       jedis.set("k18","v183");
       
     } catch (Exception e) {
       e.printStackTrace();
     }finally{
       JedisPoolUtil.release(jedisPool, jedis);
     }
  }
}
  
```
- 配置总结all

JedisPool的配置参数大部分是由JedisPoolConfig的对应项来赋值的。

maxActive：控制一个pool可分配多少个jedis实例，通过pool.getResource()来获取；如果赋值为-1，则表示不限制；如果pool已经分配了maxActive个jedis实例，则此时pool的状态为exhausted。
maxIdle：控制一个pool最多有多少个状态为idle(空闲)的jedis实例；
whenExhaustedAction：表示当pool中的jedis实例都被allocated完时，pool要采取的操作；默认有三种。
 WHEN_EXHAUSTED_FAIL --> 表示无jedis实例时，直接抛出NoSuchElementException；
 WHEN_EXHAUSTED_BLOCK --> 则表示阻塞住，或者达到maxWait时抛出JedisConnectionException；
 WHEN_EXHAUSTED_GROW --> 则表示新建一个jedis实例，也就说设置的maxActive无用；
maxWait：表示当borrow一个jedis实例时，最大的等待时间，如果超过等待时间，则直接抛JedisConnectionException；
testOnBorrow：获得一个jedis实例的时候是否检查连接可用性（ping()）；如果为true，则得到的jedis实例均是可用的；


testOnReturn：return 一个jedis实例给pool时，是否检查连接可用性（ping()）；


testWhileIdle：如果为true，表示有一个idle object evitor线程对idle object进行扫描，如果validate失败，此object会被从pool中drop掉；这一项只有在timeBetweenEvictionRunsMillis大于0时才有意义；


timeBetweenEvictionRunsMillis：表示idle object evitor两次扫描之间要sleep的毫秒数；


numTestsPerEvictionRun：表示idle object evitor每次扫描的最多的对象数；


minEvictableIdleTimeMillis：表示一个对象至少停留在idle状态的最短时间，然后才能被idle object evitor扫描并驱逐；这一项只有在timeBetweenEvictionRunsMillis大于0时才有意义；


softMinEvictableIdleTimeMillis：在minEvictableIdleTimeMillis基础上，加入了至少minIdle个对象已经在pool里面了。如果为-1，evicted不会根据idle time驱逐任何对象。如果minEvictableIdleTimeMillis>0，则此项设置无意义，且只有在timeBetweenEvictionRunsMillis大于0时才有意义；


lifo：borrowObject返回对象时，是采用DEFAULT_LIFO（last in first out，即类似cache的最频繁使用队列），如果为False，则表示FIFO队列；


其中JedisPoolConfig对一些参数的默认设置如下：
testWhileIdle=true
minEvictableIdleTimeMills=60000
timeBetweenEvictionRunsMillis=30000
numTestsPerEvictionRun=-1
