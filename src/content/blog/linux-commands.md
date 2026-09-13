---
title: 'Linux 常用命令速查'
description: '从一次线上内存告警排查说起,串起后端最常用的 Linux 命令:top/free 看资源、df/du 找磁盘、ss/netstat 查连接、grep/awk/sed 拆日志、find 定位文件,以及一套性能定位的排查套路。'
pubDate: 2025-10-26
category: '工程实践'
tags: ['Linux', '工具']
---

凌晨两点收到告警,一台跑着订单服务的机器内存使用率飙到 95%,接口响应一路变慢。SSH 上去第一步,不是翻代码,而是先用几条命令把现场摸清楚——这就是这篇文章要讲的:后端日常最常用的那批 Linux 命令,以及一条排查现场的路子。

命令本身不复杂,难的是**在正确的时机想起用哪一条**。下面按"看资源 → 找文件 → 查连接 → 拆日志"的顺序,把踩过的坑一并说清。

## 一、先看资源:top / ps / free

上机器第一件事,永远是先看**整机状态**,再下钻到进程。

```bash
# 实时看 CPU / 内存 / 负载,按 shift+m 可按内存排序
top

# 只盯着某一个进程,更轻量
top -p <pid>

# 内存使用(注意 available 比 free 更有意义)
free -h
```

`top` 里几个关键列,别只盯着 `%CPU`:

| 字段 | 含义 | 关注点 |
|------|------|--------|
| `load average` | 1/5/15 分钟平均负载 | 持续高于 CPU 核数,说明有排队 |
| `%CPU` / `%MEM` | CPU / 内存占用 | 单进程长期打满要警惕 |
| `RES` | 实际占用物理内存 | 比 `VIRT` 实在得多 |
| `S` | 进程状态 | `D`(不可中断)多半是卡 IO |

`free -h` 里有一个经典误读:很多人看 `free` 那一列以为内存快没了,其实 Linux 会把空闲内存拿去做缓存。**真正该看的是 `available` 这一列**,它才是"现在还能给新进程用的内存"。

```bash
# 找进程 / 看启动参数
ps -ef | grep java
# 按内存排序取前十
ps aux --sort=-%mem | head -10
```

一个基本原则:**先看整体,再定位单个进程**,别一上来就 `grep` 某个服务,容易漏掉真正吃资源的元凶。

## 二、磁盘满了是最容易踩的坑:df / du

见过最冤的线上故障:服务突然写不了日志,接口跟着报错,查了半天代码没毛病,最后发现是**磁盘写满了**,日志写不进去,日志框架自己都崩了。

```bash
# 看各分区用量,一眼定位谁满了
df -h

# 看某个目录下谁占得最多,一层层往下钻
du -sh /* 2>/dev/null | sort -rh | head
du -sh /var/log/* | sort -rh | head
```

排查磁盘的几个固定动作:

- `df -h` 先确认是不是真的满了(注意 `inode` 也可能会满,`df -i` 查 inode)
- `du -sh` 逐层定位到具体目录
- 常见元凶:**日志文件没做轮转**、某个 `nohup` 输出文件疯狂膨胀

有个隐蔽的坑:`du` 和 `df` 对不上的时候,多半是**文件被删除但进程还占着句柄**。文件删了,空间却不释放。

```bash
# 找出被删除但仍被进程占用的文件
lsof +L1
```

杀掉或重启那个进程,空间立马回来。这条命令救过不少半夜的场。

## 三、网络连接:netstat / ss

服务连不上数据库、连接数被打满、`TIME_WAIT` 堆积,都得靠这两条。

```bash
# ss 是新版推荐,速度比 netstat 快很多
ss -tlnp        # 监听中的 TCP 端口
ss -s           # 连接数汇总

# 统计各种状态的 TCP 连接数量
ss -ant | awk '{print $1}' | sort | uniq -c | sort -rn
```

**推荐优先用 `ss`**,`netstat` 已经属于"能不用就不用"的老工具,大连接数场景下它太慢。但很多老脚本里还留着 `netstat`,看到也别慌:

```bash
netstat -tlnp | grep 8080
```

`TIME_WAIT` 太多是个常见问题,它本质是**主动关闭方要等 2MSL 才会彻底释放**,高并发短连接下会大量堆积。真到了影响连接建立的地步,常见做法是调整内核参数(`net.ipv4.tcp_tw_reuse`),但更推荐的做法是**先从连接复用、KeepAlive 入手**,而不是无脑改内核。

## 四、拆日志三板斧:grep / awk / sed

日志是排查的大头,这三兄弟配合起来,几乎没有拆不动的日志。

```bash
# grep:过滤 + 统计 + 上下文
grep "ERROR" app.log                    # 含关键词的行
grep -c "ERROR" app.log                 # 出现次数
grep -C 3 "ERROR" app.log               # 前后各 3 行上下文
grep -v "DEBUG" app.log | grep "ERROR"  # 先排除再过滤
```

```bash
# awk:按列取值、统计。access.log 最后一段是耗时,取出来排序看慢接口
awk '{print $NF}' access.log | sort -n | tail -10

# 统计每个接口的平均耗时(假设第 7 列是接口,最后一列是耗时)
awk '{sum[$7]+=$NF; cnt[$7]++} END {for(k in sum) print k, sum[k]/cnt[k]}' access.log
```

```bash
# sed:查找替换、截取某几行
sed -n '100,200p' app.log                 # 看第 100 到 200 行
sed -i 's/旧地址/新地址/g' config.txt     # 原地替换
sed -n '/ERROR/p' app.log                 # 等价 grep,但更可控
```

三者分工一句话:**`grep` 负责找,`awk` 负责算,`sed` 负责改**。日常 80% 的日志诉求,`grep` 一条就能覆盖,别一上来就写一长串 `awk`。

## 五、找文件:find

删不掉、找不到、文件太多,`find` 出场。

```bash
# 按名字找
find / -name "*.log" 2>/dev/null

# 按大小:找大于 100M 的大文件
find / -size +100M 2>/dev/null

# 按时间:找最近 1 天内改过的文件
find /var/log -mtime -1

# 找到后直接操作(注意安全)
find /tmp -name "*.tmp" -mtime +7 -delete
```

> `-delete` 是危险动作,建议先不带它跑一遍,把结果打印出来确认了再删。`find ... -exec rm {} \;` 这种写法,漏个空格就是灾难。

## 六、性能定位的套路

遇到"慢",别一上来就改代码。先把这几条跑一遍,基本能定位到是 CPU、内存、IO 还是网络:

```bash
uptime           # 负载:高负载但 CPU 不忙,多半是等 IO
vmstat 1 5       # r(运行队列)、b(阻塞)、si/so(swap 换入换出)
iostat -x 1      # 磁盘 IO:%util 长期 100 说明 IO 是瓶颈
```

判断路径大致是这样:

- **负载高、CPU 也高** → 计算密集,`top` 找占 CPU 的进程,再 `jstack` 看线程栈
- **负载高、CPU 不高、`b` 列有值** → 在等 IO,`iostat` 看磁盘
- **`si/so` 有持续交换** → 内存不够在吃 swap,回头查 `free` 和具体进程

一套下来,瓶颈藏在哪一层,心里基本有数了。

## 写在最后

Linux 命令浩如烟海,但后端真正天天用的就这几条。真要记住,一句话:**`top`/`free` 看资源,`df`/`du` 找磁盘,`ss` 查连接,`grep`/`awk`/`sed` 拆日志,`find` 定位文件**。与其背一长串冷门参数,不如把这套"看现场的顺序"练成肌肉记忆——凌晨告警响起来的时候,手比脑子先动起来。
