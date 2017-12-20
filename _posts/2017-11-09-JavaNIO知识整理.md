# java之NIO

## 一、概述

**java NIO 核心组成部分：**

- Channel
- Buffer
- Selector

Java NIO(New IO)是一个可以替代标准Java IO API的IO API（从Java 1.4开始)，Java NIO提供了与标准IO不同的IO工作方式。

**Java NIO: Channels and Buffers（通道和缓冲区）**

标准的IO基于字节流和字符流进行操作的，而NIO是基于通道（Channel）和缓冲区（Buffer）进行操作，数据总是从通道读取到缓冲区中，或者从缓冲区写入到通道中。

**Java NIO: Non-blocking IO（非阻塞IO）**

Java NIO可以让你非阻塞的使用IO，例如：当线程从通道读取数据到缓冲区时，线程还是可以进行其他事情。当数据被写入到缓冲区时，线程可以继续处理它。从缓冲区写入通道也类似。

**Java NIO: Selectors（选择器）**

Java NIO引入了选择器的概念，选择器用于监听多个通道的事件（比如：连接打开，数据到达）。因此，单个的线程可以监听多个数据通道。

## 二、Channel

Java NIO的通道类似流，但又有些不同：

![image](http://ifeve.com/wp-content/uploads/2013/06/overview-channels-buffers.png)

- 既可以从通道中读取数据，又可以写数据到通道。但流的读写通常是单向的
- 通道可以异步地读写
- 通道中的数据总是要先读到一个Buffer，或者总是要从一个Buffer中写入

Channel主要的实现：

- FileChannel 从文件中读写数据
- DatagramChannel 能通过UDP读写网络中的数据
- SocketChannel 能通过TCP读写网络中的数据
- ServerSocketChannel 可以监听新进来的TCP连接，像Web服务器那样。对每一个新进来的连接都会创建一个SocketChannel

基本的Channel示例：

```java
public class TestChannel {
    /**
     * @param args
     * @throws IOException 
     */
    public static void main(String[] args) throws IOException {
        RandomAccessFile aFile = new RandomAccessFile("C:/Users/Administrator/Desktop/随手记.txt", "rw");
        
        //获取一个通道
        FileChannel inChannel = aFile.getChannel();
        
        //创建一个容量为48字节的字节缓冲区
        ByteBuffer buf = ByteBuffer.allocate(48);
        
        //创建一个容量为48字符的字符缓冲区
        CharBuffer cb = CharBuffer.allocate(48);
        
        //创建一个字符解码器
        CharsetDecoder decoder = Charset.forName("UTF-8").newDecoder();
        
        // 从通道读取数据到缓冲区
        int bytesRead = inChannel.read(buf);
        
        while (bytesRead != -1) {
            buf.flip();
            
            // 按照指定编码UTF-8将字节缓冲区转为字符缓冲区
            decoder.decode(buf, cb, false);
            
            cb.flip();
            while (cb.hasRemaining()) {
                System.out.print(cb.get());
            }
            buf.clear();
            cb.clear();
            bytesRead = inChannel.read(buf);
        }
        aFile.close();
    }
}
```

## 三、Buffer

Java NIO中的Buffer用于和NIO通道进行交互。数据是从通道读入缓冲区，从缓冲区写入到通道中的。缓冲区本质上是一块可以写入数据，然后可以从中读取数据的内存。这块内存被包装成NIO Buffer对象，并提供了一组方法，用来方便的访问该块内存

### Buffer的三个属性

![image](http://ifeve.com/wp-content/uploads/2013/06/buffers-modes.png)

- **capacity**

作为一个内存块，Buffer有一个固定的大小值，也叫“capacity”.你只能往里写capacity个byte、long，char等类型。一旦Buffer满了，需要将其清空（通过读数据或者清除数据）才能继续写数据往里写数据
 
- **position**

当你写数据到Buffer中时，position表示当前的位置。初始的position值为0.当一个byte、long等数据写到Buffer后， position会向前移动到下一个可插入数据的Buffer单元。position最大可为capacity – 1。当读取数据时，也是从某个特定位置读。当将Buffer从写模式切换到读模式，position会被重置为0。当从Buffer的position处读取数据时，position向前移动到下一个可读的位置

- **limit**

在写模式下，Buffer的limit表示你最多能往Buffer里写多少数据。 写模式下，limit等于Buffer的capacity。当切换Buffer到读模式时， limit表示你最多能读到多少数据。因此，当切换Buffer到读模式时，limit会被设置成写模式下的position值。换句话说，你能读到之前写入的所有数据（limit被设置成已写数据的数量，这个值在写模式下就是position）

### Buffer的类型

Java NIO 有以下Buffer类型

- ByteBuffer
- MappedByteBuffer
- CharBuffer
- DoubleBuffer
- FloatBuffer
- IntBuffer
- LongBuffer
- ShortBuffer

可以通过char，short，int，long，float 或 double类型来操作缓冲区中的字节

### 基本方法介绍

#### 分配

```java
//创建一个容量为48字节的字节缓冲区
ByteBuffer buf = ByteBuffer.allocate(48);

//创建一个容量为48字符的字符缓冲区
CharBuffer cb = CharBuffer.allocate(48);
```

#### 向Buffer写数据

```java
//从Channel写到Buffer
int bytesRead = inChannel.read(buf);

//通过put方法写Buffer
buf.put(127);
```

#### 从Buffer中读取数据

```java
//从Buffer读取数据到Channel
int bytesWritten = inChannel.write(buf);

//使用get()方法从Buffer中读取数据
byte aByte = buf.get();
```

#### 其他方法汇总

`flip()`方法将Buffer从写模式切换到读模式。调用flip()方法会将position设回0，并将limit设置成之前position的值。position现在用于标记读的位置，limit表示之前写进了多少个byte、char等 —— 现在能读取多少个byte、char等

`rewind()`将position设回0，所以可以重读Buffer中的所有数据。limit保持不变，仍然表示能从Buffer中读取多少个元素（byte、char等）

`clear()``方法将position设回0，limit设置成 capacity的值。Buffer被清空了。Buffer中的数据并未清除，只是这些标记告诉我们可以从哪里开始往Buffer里写数据。如果Buffer中有一些未读的数据，调用clear()方法，数据将“被遗忘”

`compact()`方法将所有未读的数据拷贝到Buffer起始处。然后将position设到最后一个未读元素正后面。limit属性依然像clear()方法一样，设置成capacity。现在Buffer准备好写数据了，但是不会覆盖未读的数据

`mark()`方法，可以标记Buffer中的一个特定position。之后可以通过调用`reset()`方法恢复到这个positio

`equals()`方法比较Buffer，当满足下列条件时，表示两个Buffer相等

1. 有相同的类型（byte、char、int等）
2. Buffer中剩余的byte、char等的个数相等
3. Buffer中所有剩余的byte、char等都相同

`compareTo()`方法比较两个Buffer的剩余元素(byte、char等)，如果满足下列条件，则认为一个Buffer“小于”另一个Buffer

1. 第一个不相等的元素小于另一个Buffer中对应的元素 。
2. 所有元素都相等，但第一个Buffer比另一个先耗尽(第一个Buffer的元素个数比另一个少)

```java
//标记一个位置
buffer.mark();
······
//回到这个标记的位置
buffer.reset(); 
```

### Buffer的基本用法

1. 写入数据到Buffer
2. 调用`flip()`方法
3. 从Buffer中读取数据
4. 调用`clear()`方法或者`compact()`方法

当向buffer写入数据时，buffer会记录下写了多少数据。一旦要读取数据，需要通过`flip()`方法将Buffer从写模式切换到读模式。在读模式下，可以读取之前写入到buffer的所有数据。一旦读完了所有的数据，就需要清空缓冲区，让它可以再次被写入。有两种方式能清空缓冲区：调用`clear()`或`compact()`方法。`clear()`方法会清空整个缓冲区。`compact()`方法只会清除已经读过的数据。任何未读的数据都被移到缓冲区的起始处，新写入的数据将放到缓冲区未读数据的后面

```java
RandomAccessFile aFile = new RandomAccessFile("data/nio-data.txt", "rw");
FileChannel inChannel = aFile.getChannel();

// 创建一个容量为48字节的缓冲区
ByteBuffer buf = ByteBuffer.allocate(48);

// 从通道读取数据到这个缓冲区，也可以通过put向缓冲区写数据
int bytesRead = inChannel.read(buf); 
while (bytesRead != -1) {

  buf.flip();  // 切换Buffer模式，准备读取

  while(buf.hasRemaining()){
      System.out.print((char) buf.get()); // 一次读取一个字节
  }

  buf.clear(); // 清空缓冲区，准备下次读取
  bytesRead = inChannel.read(buf);
}
aFile.close();
```

## 四、Selector

Selector（选择器）是Java NIO中能够检测一到多个NIO通道，并能够知晓通道是否为诸如读写事件做好准备的组件。这样，一个单独的线程可以管理多个channel，从而管理多个网络连接

### 创建

通过`open()`方法创建一个Selector

```java
Selector selector = Selector.open();
```

### 注册通道

```java
ServerSocketChannel channel = ServerSocketChannel.open();
channel.configureBlocking(false);
SelectionKey key = channel.register(selector, Selectionkey.OP_READ);
```

与Selector一起使用时，Channel必须处于非阻塞模式下。这意味着不能将FileChannel与Selector一起使用，因为FileChannel不能切换到非阻塞模式。而SocketChannel都可以。

`register()`方法的第二个参数是一个“**interest集合**”，表示监听事件的类型：

1. SelectionKey.OP_CONNECT 某个channel成功连接到另一个服务器称为“连接就绪”
2. SelectionKey.OP_ACCEPT 一个server socket channel准备好接收新进入的连接称为“接收就绪”
3. SelectionKey.OP_READ 一个有数据可读的通道可以说是“读就绪”
4. SelectionKey.OP_WRITE 等待写数据的通道可以说是“写就绪”

注：监听多种事件可以使用“|”操作符连接常量`SelectionKey.OP_READ | SelectionKey.OP_WRITE`

### SelectionKey

当向Selector注册Channel时，`register()`方法会返回一个SelectionKey对象，这个对象包含的属性：

- interest集合
- ready集合
- Channel
- Selector
- 附加的对象（可选）

**interest集合**是监听事件的集合，可以通过SelectionKey读写interest集合，如下：

```java
int interestSet = selectionKey.interestOps();
boolean isInterestedInAccept  = (interestSet & SelectionKey.OP_ACCEPT) == SelectionKey.OP_ACCEPT;
boolean isInterestedInConnect = (interestSet & SelectionKey.OP_CONNECT) == SelectionKey.OP_CONNECT;
boolean isInterestedInRead = (interestSet & SelectionKey.OP_READ) == SelectionKey.OP_READ;
boolean isInterestedInWrite = (interestSet & SelectionKey.OP_WRITE) == SelectionKey.OP_WRITE;
```

用“&”操作interest 集合和给定的SelectionKey常量，可以确定某个确定的事件是否在interest 集合中

**ready 集合**是通道已经准备就绪的操作的集合。在一次选择(Selection)之后，你会首先访问这个集合：

```java
int readySet = selectionKey.readyOps();
//监测时间是否已经就绪
selectionKey.isAcceptable();
selectionKey.isConnectable();
selectionKey.isReadable();
selectionKey.isWritable();
```

从SelectionKey访问**Channel和Selector**：

```java
Channel  channel  = selectionKey.channel();
Selector selector = selectionKey.selector();
```

可以**将一个对象或者更多信息附着到SelectionKey上**，这样就能方便的识别某个给定的通道。例如，可以附加 与通道一起使用的Buffer，或是包含聚集数据的某个对象：

```java
selectionKey.attach(theObject);
Object attachedObj = selectionKey.attachment();
```

还可以在用`register()`方法向Selector注册Channel的时候**附加对象**:

```java
SelectionKey key = channel.register(selector, SelectionKey.OP_READ, theObject);
```

### 通过Selector选择通道

一旦向Selector注册了一或多个通道，就可以调用几个重载的`select()`方法。这些方法返回你所感兴趣的事件（如连接、接受、读或写）已经准备就绪的那些通道。换句话说，如果你对“读就绪”的通道感兴趣，`select()`方法会返回读事件已经就绪的那些通道

- `int select()` 阻塞到至少有一个通道在你注册的事件上就绪了
- `int select(long timeout)` 和`select()`一样，多了最长会阻塞timeout毫秒(参数)
- `int selectNow()` 不会阻塞，不管什么通道就绪都立刻返回

`select()`方法返回的int值表示有多少通道已经就绪。亦即，自上次调用`select()`方法后有多少通道变成就绪状态。如果调用`select()`方法，因为有一个通道变成就绪状态，返回了1，若再次调用`select()`方法，如果另一个通道就绪了，它会再次返回1。如果对第一个就绪的channel没有做任何操作，现在就有两个就绪的通道，但在每次`select()`方法调用之间，只有一个通道就绪了

一旦调用了`select()`方法，并且返回值表明有一个或更多个通道就绪了，然后可以通过调用selector的`selectedKeys()`方法，访问“已选择键集（selected key set）”中的就绪通道

```java
Set selectedKeys = selector.selectedKeys();
```

`wakeUp()`可以唤醒select()方法后阻塞的线程

`close()`方法会关闭该Selector，且使注册到该Selector上的所有SelectionKey实例无效。通道本身并不会关闭

## 五、Scatter/Gather

scatter/gather用于描述从Channel中读取或者写入到Channel的操作。

分散（scatter）从Channel中读取是指在读操作时将读取的数据写入多个buffer中。因此，Channel将从Channel中读取的数据“分散（scatter）”到多个Buffer中。

聚集（gather）写入Channel是指在写操作时将多个buffer的数据写入同一个Channel，因此，Channel 将多个Buffer中的数据“聚集（gather）”后发送到Channel。

scatter / gather经常用于需要将传输的数据分开处理的场合，例如传输一个由消息头和消息体组成的消息，可能会将消息体和消息头分散到不同的buffer中，这样可以方便的处理消息头和消息体

**Scattering Reads**是指数据从一个channel读取到多个buffer中

```java
ByteBuffer header = ByteBuffer.allocate(128);
ByteBuffer body   = ByteBuffer.allocate(1024);
ByteBuffer[] bufferArray = { header, body };
channel.read(bufferArray);
```

buffer首先被插入到数组，然后再将数组作为channel.read() 的输入参数。read()方法按照buffer在数组中的顺序将从channel中读取的数据写入到buffer，当一个buffer被写满后，channel紧接着向另一个buffer中写。

Scattering Reads在移动下一个buffer前，必须填满当前的buffer，这也意味着它不适用于动态消息(消息大小不固定)。换句话说，如果存在消息头和消息体，消息头必须完成填充（例如 128byte），Scattering Reads才能正常工作

**Gathering Writes**是指数据从多个buffer写入到同一个channel

```java
ByteBuffer header = ByteBuffer.allocate(128);
ByteBuffer body   = ByteBuffer.allocate(1024);
ByteBuffer[] bufferArray = { header, body };
channel.write(bufferArray);
```

buffers数组是write()方法的入参，write()方法会按照buffer在数组中的顺序，将数据写入到channel，注意只有position和limit之间的数据才会被写入。因此，如果一个buffer的容量为128byte，但是仅仅包含58byte的数据，那么这58byte的数据将被写入到channel中。因此与Scattering Reads相反，Gathering Writes能较好的处理动态消息。

## 六、FileChannel

FileChannel是一个连接到文件的通道。可以通过文件通道读写文件。FileChannel无法设置为非阻塞模式，它总是运行在阻塞模式下

使用步骤（示例见第一节）：

1. 打开FileChannel 通过使用一个InputStream、OutputStream或RandomAccessFile来获取`aFile.getChannel()`
2. 从FileChannel读取数据 `inChannel.read(buf)`
3. 向FileChannel写数据 `channel.write(buf)`
4. 关闭FileChannel `channel.close()`

### 方法介绍


方法名 | 作用
---|---
long position() | 获取FileChannel的当前位置
long size() | 返回该实例所关联文件的大小
FileChannel truncate(long size) | 截取一个文件。截取文件时，文件将中指定长度后面的部分将被删除
void force(boolean metaData) | 方法将通道里尚未写入磁盘的数据强制写到磁盘上，metaData指明是否将元数据写到磁盘上
long transferFrom(ReadableByteChannel src, long position, long count)|将数据从源通道传输到FileChannel中
long transferTo(long position, long count, WritableByteChannel target)|将数据从FileChannel传输到其他的channel中

### 通道之间的数据传输

如果两个通道中有一个是FileChannel，那你可以直接将数据从一个channel（译者注：channel中文常译作通道）传输到另外一个channel

```java
RandomAccessFile fromFile = new RandomAccessFile("fromFile.txt", "rw");
FileChannel fromChannel = fromFile.getChannel();
 
RandomAccessFile toFile = new RandomAccessFile("toFile.txt", "rw");
FileChannel toChannel = toFile.getChannel();
 
long position = 0;
long count = fromChannel.size();
 
toChannel.transferFrom(position, count, fromChannel);
```

方法的输入参数position表示从position处开始向目标文件写入数据，count表示最多传输的字节数。如果源通道的剩余空间小于 count 个字节，则所传输的字节数要小于请求的字节数。

此外要注意，在SoketChannel的实现中，SocketChannel只会传输此刻准备好的数据（可能不足count字节）。因此，SocketChannel可能不会将请求的所有数据(count个字节)全部传输到FileChannel中

```java
RandomAccessFile fromFile = new RandomAccessFile("fromFile.txt", "rw");
FileChannel fromChannel = fromFile.getChannel();

RandomAccessFile toFile = new RandomAccessFile("toFile.txt", "rw");
FileChannel toChannel = toFile.getChannel();

long position = 0;
long count = fromChannel.size();

fromChannel.transferTo(position, count, toChannel);
```

关于SocketChannel的问题在transferTo()方法中同样存在。SocketChannel会一直传输数据直到目标buffer被填满

## 七、SocketChannel

SocketChannel是一个连接到TCP网络套接字的通道。可以通过以下2种方式创建SocketChannel：

1. 打开一个SocketChannel并连接到互联网上的某台服务器。
2. 一个新连接到达ServerSocketChannel时，会创建一个SocketChannel。

### 使用步骤

- **打开 SocketChannel**

```java
SocketChannel socketChannel = SocketChannel.open();
socketChannel.connect(new InetSocketAddress("http://jenkov.com", 80));
```

- **从 SocketChannel 读取数据**

```java
ByteBuffer buf = ByteBuffer.allocate(48);
int bytesRead = socketChannel.read(buf);
```

`read()`方法返回的int值表示读了多少字节进Buffer里。如果返回的是-1，表示已经读到了流的末尾（连接关闭了）

- **写入 SocketChannel**

```java
String newData = "New String to write to file..." + System.currentTimeMillis();

ByteBuffer buf = ByteBuffer.allocate(48);
buf.clear();
buf.put(newData.getBytes());

buf.flip();

while(buf.hasRemaining()) {
    channel.write(buf);
}
```

`write()`方法的调用是在一个while循环中的。`write()`方法无法保证能写多少字节到SocketChannel。所以，我们重复调用`write()`直到Buffer没有要写的字节为止

- **关闭 SocketChannel**

```java
socketChannel.close();
```

### 非阻塞模式

可以设置 SocketChannel 为非阻塞模式（non-blocking mode）.设置之后，就可以在异步模式下调用connect(), read() 和write()了

```java
socketChannel.configureBlocking(false);
socketChannel.connect(new InetSocketAddress("http://jenkov.com", 80));

while(! socketChannel.finishConnect() ){
    //wait, or do something else...
}
```

非阻塞模式与选择器搭配会工作的更好，通过将一或多个SocketChannel注册到Selector，可以询问选择器哪个通道已经准备好了读取，写入等

## 八、ServerSocketChannel

java.nio.channels.ServerSocketChannel 是一个可以监听新进来的TCP连接的通道, 就像标准IO中的ServerSocket一样

### 使用步骤

1. 打开 ServerSocketChannel `ServerSocketChannel.open()`
2. 监听新进来的连接 `serverSocketChannel.accept()`
3. 关闭 ServerSocketChannel `serverSocketChannel.close()`

如下：

```java
ServerSocketChannel serverSocketChannel = ServerSocketChannel.open();

serverSocketChannel.socket().bind(new InetSocketAddress(9999));

while(true){
    SocketChannel socketChannel = serverSocketChannel.accept();

    //do something with socketChannel...
}
```

### 非阻塞模式

ServerSocketChannel可以设置成非阻塞模式。在非阻塞模式下，accept() 方法会立刻返回，如果还没有新进来的连接,返回的将是null。 因此，需要检查返回的SocketChannel是否是null

```java
ServerSocketChannel serverSocketChannel = ServerSocketChannel.open();

serverSocketChannel.socket().bind(new InetSocketAddress(9999));
serverSocketChannel.configureBlocking(false);

while(true){
    SocketChannel socketChannel =
            serverSocketChannel.accept();

    if(socketChannel != null){
        //do something with socketChannel...
    }
}
```

## 九、DatagramChannel

DatagramChannel是一个能收发UDP包的通道。因为UDP是无连接的网络协议，所以不能像其它通道那样读取和写入。它发送和接收的是数据包

- 打开 DatagramChannel

```java
DatagramChannel channel = DatagramChannel.open();
channel.socket().bind(new InetSocketAddress(9999));
```

- 接收数据

```java
ByteBuffer buf = ByteBuffer.allocate(48);
buf.clear();
channel.receive(buf);
```

`receive()`方法会将接收到的数据包内容复制到指定的Buffer。`receive()`可能无限期地休眠直到有包到达。如果是非阻塞模式，当没有可接收的包时则会返回null。如果Buffer容不下收到的数据，多出的数据将被丢弃

- 发送数据

```java
String newData = "New String to write to file..." + System.currentTimeMillis();

ByteBuffer buf = ByteBuffer.allocate(48);
buf.clear();
buf.put(newData.getBytes());
buf.flip();

int bytesSent = channel.send(buf, new InetSocketAddress("jenkov.com", 80));
```

`send()`会发送给定ByteBuffer对象的内容到给定SocketAddress对象所描述的目的地址和端口，内容范围为从当前position开始到末尾处结束。如果DatagramChannel对象处于阻塞模式，调用线程可能会休眠直到数据报被加入传输队列。如果通道是非阻塞的，返回值要么是字节缓冲区的字节数，要么是0。发送数据报是一个全有或全无(all-or-nothing)的行为。如果传输队列没有足够空间来承载整个数据报，那么什么内容都不会被发

- 连接到特定的地址

```java
channel.connect(new InetSocketAddress("jenkov.com", 80));

int bytesRead = channel.read(buf);
int bytesWritten = channel.write(but);
```

将DatagramChannel置于已连接的状态可以使除了它所「连接」到的地址之外的任何其他源地址的数据报被忽略

## 十、Pipe

Pipe是2个线程之间的单向数据连接。Pipe有一个source通道和一个sink通道。数据会被写到sink通道，从source通道读取
 
![image](http://ifeve.com/wp-content/uploads/2013/06/pipe.bmp)
 
### 创建管道
 
```java
Pipe pipe = Pipe.open();
```

### 向管道写数据

访问sink通道

```java
Pipe.SinkChannel sinkChannel = pipe.sink();
```

SinkChannel的`write()`方法，将数据写入SinkChannel

```java
String newData = "New String to write to file..." + System.currentTimeMillis();
ByteBuffer buf = ByteBuffer.allocate(48);
buf.clear();
buf.put(newData.getBytes());

buf.flip();

while(buf.hasRemaining()) {
    sinkChannel.write(buf);
}
```

### 从管道读取数据

访问source通道

```java
Pipe.SourceChannel sourceChannel = pipe.source();
```

调用source通道的`read()`方法来读取数据

```java
ByteBuffer buf = ByteBuffer.allocate(48);
//返回读取了多少字节到缓冲区
int bytesRead = sourceChannel.read(buf);
```

注：参考文档来自【并发编程网 - ifeve.com】

[Java NIO系列教程（一） Java NIO 概述](http://ifeve.com/overview/)

[Java NIO系列教程（二） Channel](http://ifeve.com/channels/)

[Java NIO系列教程（三） Buffer](http://ifeve.com/buffers/)

[Java NIO系列教程（四） Scatter/Gather](http://ifeve.com/java-nio-scattergather/)

[Java NIO系列教程（五） 通道之间的数据传输](http://ifeve.com/java-nio-channel-to-channel/)

[Java NIO系列教程（六） Selector](http://ifeve.com/selectors/)

[Java NIO系列教程（七） FileChannel](http://ifeve.com/file-channel/)

[Java NIO系列教程（八） SocketChannel](http://ifeve.com/socket-channel/)

[Java NIO系列教程（九） ServerSocketChannel](http://ifeve.com/server-socket-channel/)

[Java NIO系列教程（十） Java NIO DatagramChannel](http://ifeve.com/datagram-channel/)

[Java NIO系列教程（十一） Pipe](http://ifeve.com/pipe/)
