---
title: 'Docker 部署 Spring Boot 应用实战'
description: '从一次容器里 JVM 被 OOM Kill 说起,讲透镜像分层、多阶段构建、Dockerfile 最佳实践,以及 JVM 与容器内存那些容易踩的坑。'
pubDate: 2026-01-04
category: '工程实践'
tags: ['Docker', 'DevOps']
---

见过不少服务一上容器就"水土不服":同一个 jar 在宿主机跑得好好的,扔进 Docker 里没两天就被 `OOMKilled` 干掉,`docker inspect` 一看 `State.OOMKilled=true`。排查半天才发现,问题不在代码,而在**容器里的 JVM 不知道自己的内存上限**。

这篇就把 Spring Boot 容器化这条路上踩过的坑、搞懂的姿势,一次讲清楚。

## 一、先把 JVM 和容器的内存对齐

这是最容易被忽略、也最致命的一环。JVM 默认的堆大小是根据**宿主机的物理内存**算出来的,而不是容器分配的限额:

> 假如宿主机 64G、容器只给了 1G,`java -jar app.jar` 不加任何参数时,JVM 会按 64G 的 1/4(约 16G)去规划堆。一旦真实占用超过容器的 1G,cgroup 直接触发 OOM Kill,连 `OutOfMemoryError` 都不给你抛。

所以**部署到容器里的第一个动作,就是显式指定堆大小**:

```bash
java -Xms512m -Xmx512m -jar app.jar
```

更推荐的做法,是让 JVM 自己"读"容器的限额。JDK 10 之后,`-XX:+UseContainerSupport`(默认已开启)会让 JVM 感知 cgroup 限制,配合下面这个参数,堆会自动按容器内存的一定比例分配:

```bash
# 堆自动设为容器可用内存的 75%,不用自己算具体数字
java -XX:MaxRAMPercentage=75.0 -XX:InitialRAMPercentage=50.0 -jar app.jar
```

`MaxRAMPercentage` 和 `-Xmx` 二选一即可,别两个同时上(以 `-Xmx` 为准)。一条基本原则是:**给容器留 25% 左右给堆外内存**——元空间、线程栈、NIO 的 DirectByteBuffer 都不在堆里,堆设成 100% 等于给自己留了个 OOM 的雷。

## 二、镜像分层,搞清楚 COPY 为什么慢

Docker 镜像是一层一层叠起来的,每一层都是只读的,改动只会新增一层。这个机制直接决定了 **Dockerfile 的写法会影响构建速度和缓存命中率**。

下面这段是最常见的"反面教材":

```dockerfile
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY . .          # 把整个项目目录塞进去,包括 target/.git 等垃圾
RUN mvn package   # 每次构建都重新下依赖
```

问题有两个:

- `COPY . .` 把 `target/`、`.git/`、本地 IDE 配置全打包进镜像,体积虚胖还泄露信息
- 只要 `src` 里任何一个文件变了,`COPY` 这层缓存就失效,后面的 `RUN mvn package` 每次都得重跑,依赖重新下载

所以一个基本原则:**把变化频率低的步骤放前面,变化频率高的放后面**,最大化利用层缓存。

## 三、一个能直接抄的多阶段 Dockerfile

多阶段构建解决两件事:构建阶段该有的(JDK、Maven、源码)只留在中间层,最终镜像里只放 JRE 和 jar:

```dockerfile
# 阶段一:构建,带完整 JDK 和 Maven
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
# 先只拷 pom.xml,让依赖下载这一步能被缓存住
COPY pom.xml .
RUN mvn dependency:go-offline
# 源码最后再拷,源码变动不影响上面的依赖缓存
COPY src ./src
RUN mvn package -DskipTests

# 阶段二:运行,只要 JRE 和产物
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
# 用 exec 形式 + 容器感知内存,堆自动按容器限额分配
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
```

几个关键点:

- **`COPY pom.xml` 单独一行**:pom 不变时 `go-offline` 这层永远命中缓存,构建时间从几分钟降到几秒
- **`--from=build`**:只从构建阶段挑走想要的产物,其余全丢弃
- **ENTRYPOINT 用 exec 形式**(数组写法),不要 shell 形式,否则容器里的 PID 1 是 shell,信号(如 `SIGTERM`)传不到 JVM,优雅停机就失效了

`.dockerignore` 也是标配,别让构建上下文里混进垃圾:

```
target/
.git/
.idea/
*.iml
Dockerfile
docker-compose.yml
```

## 四、基础镜像怎么选,体积差一个数量级

多阶段构建已经把 JDK 砍掉了,但基础镜像还能继续压。常见三档,对比如下:

| 基础镜像 | 特点 | 适用场景 |
|---------|------|---------|
| `eclipse-temurin:17-jre` | 标准版,自带 glibc、工具链齐全 | 最省心,排障方便 |
| `eclipse-temurin:17-jre-alpine` | 基于 musl libc,体积小 | 追求小体积,但要小心兼容性 |
| `gcr.io/distroless/java17` | 无 shell、无包管理器 | 最安全,但进去排障难 |

见过不少团队图省事直接上 alpine,结果踩了坑:alpine 用 **musl libc**,某些依赖 glibc 的 native 库(比如某些加解密、字体渲染)在 alpine 上跑不起来。**没有特殊需求,标准版 jre 更稳**;真要极致瘦身,再上 distroless,但记住 distroless 连 `sh` 都没有,出问题只能靠日志。

## 五、配置外置,别把环境信息烤进镜像

同一个镜像要在 dev / test / prod 到处跑,环境相关的配置必须从外面注入,而不是写死在 `application.yml` 里再重新打镜像。Spring Boot 的配置优先级天然支持这个:环境变量 `SPRING_DATASOURCE_URL` 会覆盖 `spring.datasource.url`。

用 `docker-compose.yml` 组织一整套依赖最省事:

```yaml
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: shop
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      retries: 5

  app:
    build: .
    ports:
      - "8080:8080"
    depends_on:
      mysql:
        condition: service_healthy
    environment:
      SPRING_DATASOURCE_URL: jdbc:mysql://mysql:3306/shop
      SPRING_DATASOURCE_USERNAME: root
      SPRING_DATASOURCE_PASSWORD: root
      JAVA_TOOL_OPTIONS: "-XX:MaxRAMPercentage=75.0"

volumes:
  mysql-data:
```

`depends_on` 的 `condition: service_healthy` 配合 mysql 的 healthcheck,能保证应用启动时数据库已经就绪,而不是一上来就连接失败。

## 六、资源限制与健康检查,两个常被漏掉的点

**资源限制**要显式写,别指望默认值。`docker run` 或 compose 里把内存和 CPU 限制住,配合第一节的 JVM 参数一起用:

```yaml
services:
  app:
    # ...
    deploy:
      resources:
        limits:
          memory: 1g
        reservations:
          memory: 512m
```

如果容器限制 1G,堆就用 `MaxRAMPercentage=75.0`(约 768M),剩下 25% 给堆外,内存这块就闭环了。

**健康检查**是给编排系统(K8s、Swarm)看的,没有它,应用"活着但不可用"时容器不会被重启:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:8080/actuator/health || exit 1
```

前提是引入了 Actuator 并开放 `/actuator/health`。注意:如果用 distroless 镜像,里面没有 `wget`,得换成 curl 或用 Java 自带的健康探针方式。

## 写在最后

Spring Boot 容器化,难点从来不在"跑起来",而在"跑得稳"。回头看真正值得记住的就三件事:

1. **先把 JVM 内存和容器限额对齐**,用 `MaxRAMPercentage`,别让 JVM 按宿主机算堆
2. **多阶段构建 + 缓存友好排序 + `.dockerignore`**,镜像瘦身和构建提速是一体的
3. **配置外置、资源限制、健康检查**一个都别省,这是生产部署的底线

把这三点做到,一个 Spring Boot 应用才能真正在容器里踏实地跑下去,而不是隔三差五被 OOM Kill 打回原形。
