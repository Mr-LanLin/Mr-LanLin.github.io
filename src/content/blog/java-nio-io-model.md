---
title: 'Java NIO 与 I/O 模型：从 BIO 到 Netty 的演进之路'
description: 'BIO 为什么一个连接一个线程？NIO 的多路复用怎么工作？Channel、Buffer、Selector 三件套怎么用？Netty 的 Reactor 模型和零拷贝是怎么回事？从同步阻塞到异步非阻塞，I/O 模型的完整演进。'
pubDate: 2025-09-07
category: '后端'
tags: ['Java', 'NIO', 'Netty', 'I/O模型', '零拷贝', 'Reactor']
---

> I/O 是大多数后端服务的瓶颈。BIO 一个连接一个线程，10000 并发就要 10000 线程——直接 OOM。NIO 的多路复用让一个线程管理上万个连接，Netty 在此基础上加了 Reactor 模型和零拷贝。理解 I/O 模型的演进，才能写出高性能的网络服务。

## 一、三种 I/O 模型

### 1.1 BIO（同步阻塞）

```java
// 一个连接一个线程
ServerSocket server = new ServerSocket(8080);
while (true) {
    Socket client = server.accept();  // 阻塞等待连接
    new Thread(() -> {
        InputStream in = client.getInputStream();  // 阻塞读数据
        // 处理请求...
    }).start();
}
// 问题：10000 并发 = 10000 线程 = 10GB 内存 + 大量上下文切换
```

**适用**：连接数少、连接时长长（如数据库连接）。**不适用**：高并发短连接（如 HTTP 服务）。

### 1.2 NIO（同步非阻塞 + 多路复用）

```java
// 一个线程管理所有连接
Selector selector = Selector.open();
ServerSocketChannel server = ServerSocketChannel.open();
server.configureBlocking(false);  // 非阻塞模式
server.bind(new InetSocketAddress(8080));
server.register(selector, SelectionKey.OP_ACCEPT);

while (true) {
    selector.select();  // 阻塞直到有事件（连接/读/写）
    Set<SelectionKey> keys = selector.selectedKeys();
    for (SelectionKey key : keys) {
        if (key.isAcceptable()) {
            SocketChannel client = server.accept();
            client.configureBlocking(false);
            client.register(selector, SelectionKey.OP_READ);
        } else if (key.isReadable()) {
            SocketChannel client = (SocketChannel) key.channel();
            ByteBuffer buffer = ByteBuffer.allocate(1024);
            client.read(buffer);  // 非阻塞读（有数据才读）
        }
    }
    keys.clear();
}
// 一个线程管理上万个连接——没有线程开销
```

### 1.3 AIO（异步非阻塞，Java 7+）

```java
// 操作系统级别的异步 I/O（Linux epoll 的异步模式）
AsynchronousServerSocketChannel server = AsynchronousServerSocketChannel.open();
server.bind(new InetSocketAddress(8080));

server.accept(null, new CompletionHandler<AsynchronousSocketChannel, Void>() {
    @Override
    public void completed(AsynchronousSocketChannel client, Void att) {
        // 连接建立后的回调——不阻塞任何线程
        ByteBuffer buffer = ByteBuffer.allocate(1024);
        client.read(buffer, buffer, new CompletionHandler<Integer, ByteBuffer>() {
            @Override
            public void completed(Integer bytes, ByteBuffer buf) {
                // 数据读好的回调
            }
        });
    }
});
// AIO 在生产环境用得少——Netty 的 NIO + Reactor 已经足够好
```

### 1.4 四种模型对比

| 模型 | 阻塞点 | 并发能力 | 编程复杂度 | 代表 |
|------|--------|---------|-----------|------|
| **BIO** | 连接+读写都阻塞 | 低（线程数限制） | 低 | `java.net.Socket` |
| **NIO** | select/epoll 阻塞，读写非阻塞 | 高（单线程万连接） | 高 | `java.nio` |
| **NIO 多路复用** | epoll 等待事件 | 高 | 高 | Netty |
| **AIO** | 完全不阻塞（回调） | 高 | 中 | `java.nio.channels.Asynchronous*` |

## 二、NIO 三件套

### 2.1 Channel（通道）

```
Channel 是双向的（InputStream/OutputStream 是单向的）

FileChannel：文件读写
SocketChannel：TCP 连接
ServerSocketChannel：TCP 服务端
DatagramChannel：UDP
```

### 2.2 Buffer（缓冲区）

```
Buffer 的四个属性：
  position：当前读写位置
  limit：可读/写的上限
  capacity：总容量
  mark：标记位置（reset 时回到这里）

flip()：写模式 → 读模式（limit = position, position = 0）
clear()：重置为写模式（position = 0, limit = capacity）
compact()：把未读数据移到开头，继续写

直接内存（DirectBuffer）：
  ByteBuffer buffer = ByteBuffer.allocateDirect(1024);
  → 数据在堆外内存，不经过 GC
  → 适合大 buffer、长生命周期的场景
  → 分配/释放比堆内慢（适合复用）
```

### 2.3 Selector（选择器）

```
Selector 是 NIO 多路复用的核心：
  一个 Selector 注册多个 Channel
  selector.select() → 阻塞直到某个 Channel 有事件
  → OP_ACCEPT（新连接）、OP_READ（可读）、OP_WRITE（可写）

Linux 底层实现：
  select() → 最多 1024 个 fd，每次全量遍历 → O(N)
  poll() → 无 fd 上限，但仍然全量遍历 → O(N)
  epoll() → 事件驱动，只返回有事件的 fd → O(1)

Java NIO 在 Linux 上默认用 epoll（最优）。
```

## 三、Netty 的 Reactor 模型

### 3.1 为什么不用原生 NIO

```
原生 NIO 的问题：
  1. API 复杂（Buffer flip/clear 容易搞错）
  2. epoll bug（JDK 老版本的空轮询导致 CPU 100%）
  3. 断线重连、半包读写、心跳检测都要自己实现
  4. 编解码框架要自己写

Netty 解决了所有这些问题，外加：
  - 链式 Handler 处理（类似责任链）
  - 零拷贝（CompositeByteBuf、FileRegion）
  - 内存池（减少 Buffer 分配/回收开销）
  - 连接池
```

### 3.2 Reactor 模型

```
单 Reactor 单线程：
  Selector + Handler 都在一个线程
  → 简单，但 Handler 慢会阻塞所有连接

单 Reactor 多线程：
  Selector 在一个线程，Handler 分发到线程池
  → Handler 不阻塞 Selector，但单 Selector 是瓶颈

主从 Reactor 多线程（Netty 默认）：
  Main Reactor（1 个线程）：处理连接（accept）
  Sub Reactor（N 个线程）：处理读写（read/write）
  Worker 线程池：处理业务逻辑
  → 连接和 IO 分离，IO 和业务分离
  → 高并发场景的最优模型
```

```java
// Netty 服务端（主从 Reactor）
EventLoopGroup bossGroup = new NioEventLoopGroup(1);      // Main Reactor
EventLoopGroup workerGroup = new NioEventLoopGroup(8);    // Sub Reactor

ServerBootstrap bootstrap = new ServerBootstrap();
bootstrap.group(bossGroup, workerGroup)
    .channel(NioServerSocketChannel.class)
    .childHandler(new ChannelInitializer<SocketChannel>() {
        @Override
        protected void initChannel(SocketChannel ch) {
            ch.pipeline()
                .addLast(new LengthFieldBasedFrameDecoder(1024, 0, 4))
                .addLast(new StringDecoder())
                .addLast(new BusinessHandler());  // 业务处理
        }
    })
    .option(ChannelOption.SO_BACKLOG, 128)
    .childOption(ChannelOption.SO_KEEPALIVE, true);

ChannelFuture future = bootstrap.bind(8080).sync();
```

## 四、零拷贝：从内核到用户的三次拷贝

### 4.1 传统 I/O 的四次拷贝

```
读文件 → 发送网络：
  1. 磁盘 → 内核 Buffer（DMA）
  2. 内核 Buffer → 用户 Buffer（CPU 拷贝）
  3. 用户 Buffer → Socket Buffer（CPU 拷贝）
  4. Socket Buffer → 网卡（DMA）

两次 CPU 拷贝 + 两次 DMA = 四次拷贝
```

### 4.2 mmap 零拷贝（两次拷贝）

```
mmap 把文件映射到用户空间（共享内核 Buffer）：
  1. 磁盘 → 内核 Buffer（DMA）
  2. 内核 Buffer → Socket Buffer（CPU 拷贝，但从 mmap 区域直接拷贝）
  3. Socket Buffer → 网卡（DMA）

减少一次 CPU 拷贝。Java 的 FileChannel.map() 就是 mmap。
```

### 4.3 sendfile 零拷贝（一次拷贝）

```
sendfile 系统调用：数据不经过用户空间
  1. 磁盘 → 内核 Buffer（DMA）
  2. 内核 Buffer → Socket Buffer（DMA，不用 CPU！）
  3. Socket Buffer → 网卡（DMA）

零次 CPU 拷贝！Java 的 FileChannel.transferTo() 就是 sendfile。

Netty 的 DefaultFileRegion 封装了 sendfile，大文件传输性能提升 5-10x。
```

## 五、NIO 实战：粘包/拆包

```java
/**
 * TCP 是流协议，没有消息边界。
 * 两个消息可能被粘在一起（粘包），一个消息可能被拆成两半（拆包）。
 * 解法：定长、分隔符、长度字段。
 */

// Netty 的长度字段解码器（最常用）
// 消息格式：[4 字节长度][N 字节内容]
new LengthFieldBasedFrameDecoder(
    1024,    // 最大帧长度
    0,       // 长度字段的偏移量
    4,       // 长度字段的字节数
    0,       // 长度调整值
    0        // 初始跳过字节数
)
```

## 结语

I/O 模型的演进是一条从「简单但低效」到「复杂但高效」的路。

> BIO 的简单是以线程资源为代价，NIO 的多路复用消除了线程开销但增加了编程复杂度，Netty 的 Reactor 模型把复杂度封装在了框架里。零拷贝技术让数据在内核和用户空间之间的搬运次数从 4 次降到 0 次。

理解 I/O 模型，不是为了手写 NIO 代码——是为了在选框架（Netty/gRPC/WebSocket）时知道底层发生了什么。
