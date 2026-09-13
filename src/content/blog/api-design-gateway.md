---
title: 'API 设计与网关：从 RESTful 到 gRPC 的选型与工程实践'
description: 'RESTful 设计原则是什么？gRPC 和 REST 怎么选？API 网关做哪些事？限流/熔断/鉴权怎么实现？API 版本怎么管理？从接口设计到网关架构，API 工程的完整指南。'
pubDate: 2025-07-07
category: '架构'
tags: ['API设计', 'RESTful', 'gRPC', 'API网关', '限流', '鉴权']
---

> API 是系统之间对话的语言。设计得好，系统集成成本低、演进灵活；设计得差，每次改接口都是一场灾难。RESTful 解决资源建模问题，gRPC 解决高性能通信问题，API 网关解决统一治理问题。理解每种方案的适用场景，才能做出正确的选择。

## 一、RESTful API 设计原则

### 1.1 核心原则

```
1. 资源导向：URL 是名词，不是动词
   ✅ GET /users/123/orders      （获取用户 123 的订单）
   ❌ GET /getOrders?userId=123  （动词 + 参数）

2. HTTP 方法表达操作
   GET    → 查询（幂等、安全）
   POST   → 创建
   PUT    → 全量更新（幂等）
   PATCH  → 部分更新
   DELETE → 删除（幂等）

3. 状态码表达结果
   200 OK / 201 Created / 204 No Content
   400 Bad Request / 401 Unauthorized / 403 Forbidden / 404 Not Found
   409 Conflict / 429 Too Many Requests
   500 Internal Server Error / 502 Bad Gateway / 503 Service Unavailable

4. 分页、过滤、排序统一规范
   GET /orders?page=1&size=20&status=PAID&sort=created_at,desc
```

### 1.2 版本管理

```
三种版本策略：

1. URL 版本（最直观）
   GET /api/v1/users/123
   GET /api/v2/users/123
   优点：清晰；缺点：URL 变长

2. Header 版本（RESTful 纯度更高）
   GET /api/users/123
   Header: Accept: application/vnd.myapp.v2+json
   优点：URL 干净；缺点：调试不直观

3. 参数版本（简单粗暴）
   GET /api/users/123?version=2
   优点：简单；缺点：不标准

推荐：内部 API 用 Header，外部 API 用 URL（开发者友好）
```

### 1.3 幂等性设计

```
幂等 = 同一个请求执行多次和执行一次效果相同

天然幂等：GET / PUT / DELETE
非幂等：POST（创建资源，多次执行会创建多个）

POST 怎么保证幂等？
  方案 1：客户端生成唯一请求 ID（Idempotency-Key）
    POST /orders
    Header: Idempotency-Key: req_abc123
    服务端：检查这个 Key 是否已处理 → 已处理返回上次结果

  方案 2：业务唯一约束
    订单表：UNIQUE(user_id, sku_id, created_date)
    重复提交 → 唯一约束冲突 → 返回 409
```

## 二、gRPC vs REST

### 2.1 对比

| 维度 | REST (JSON/HTTP) | gRPC (Protobuf/HTTP2) |
|------|-----------------|----------------------|
| **协议** | HTTP/1.1 | HTTP/2 |
| **序列化** | JSON（文本，可读） | Protobuf（二进制，高效） |
| **性能** | 中 | 高（二进制 + 多路复用 + 头部压缩） |
| **可读性** | 高（curl 就能调试） | 低（需要 protoc 工具） |
| **流式支持** | 有限（SSE/WebSocket） | 原生（Unary/Server/Client/BiDi Stream） |
| **代码生成** | 无（手动写） | 自动（.proto → 多语言代码） |
| **浏览器支持** | 原生 | 需要 grpc-web 代理 |
| **生态** | 通用 | Google 主导 |

### 2.2 选型决策

```
选 REST：
  - 对外 API（开发者友好、浏览器原生支持）
  - 简单 CRUD 服务
  - 需要人类可读的请求/响应

选 gRPC：
  - 内部微服务通信（性能敏感）
  - 流式数据（实时推送、大文件传输）
  - 多语言服务（Protobuf 自动生成各语言代码）
  - 强类型约束（Protobuf Schema 保证接口一致性）

混合方案：
  - 对外 REST + 对内 gRPC
  - API 网关做协议转换（外部 REST → 内部 gRPC）
```

### 2.3 gRPC 四种调用模式

```protobuf
service OrderService {
  // 1. 一元调用（普通 RPC）
  rpc GetOrder(OrderRequest) returns (OrderResponse);

  // 2. 服务端流式（服务器持续推送）
  rpc WatchOrderStatus(OrderRequest) returns (stream OrderStatus);

  // 3. 客户端流式（客户端持续发送）
  rpc UploadOrderImages(stream ImageData) returns (UploadResponse);

  // 4. 双向流式（双方持续通信）
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);
}
```

## 三、API 网关

### 3.1 网关做什么

```
API 网关 = 系统的统一入口，所有外部请求先过网关

核心职责：
  1. 路由转发：/api/orders → 订单服务，/api/users → 用户服务
  2. 鉴权认证：JWT 验证、OAuth2、API Key
  3. 限流：防止某个接口被刷爆
  4. 熔断：下游服务挂了快速失败
  5. 协议转换：外部 REST → 内部 gRPC
  6. 日志/监控：统一记录所有请求
  7. 缓存：热点接口直接返回缓存
```

### 3.2 限流实现

```java
/**
 * 多级限流：网关层 + 服务层双重保护。
 *
 * 网关层限流（粗粒度）：按 API 路径 + 用户 ID
 * 服务层限流（细粒度）：按具体业务逻辑
 */
@Component
public class RateLimiter {

    // 令牌桶：允许突发流量
    private final Map<String, RateLimitConfig> configs = Map.of(
        "/api/orders/create", new RateLimitConfig(100, 10),    // 100 容量，每秒 10 个
        "/api/orders/query", new RateLimitConfig(1000, 100),    // 查询放宽
        "/api/users/login",  new RateLimitConfig(50, 5)         // 登录严格
    );

    public RateLimitResult check(String apiPath, String userId) {
        RateLimitConfig config = configs.get(apiPath);
        if (config == null) return RateLimitResult.allow();

        // 按用户维度限流
        String key = apiPath + ":" + userId;
        long tokens = tokenBucket.get(key);

        if (tokens <= 0) {
            return RateLimitResult.reject("请求过于频繁，请稍后重试");
        }

        tokenBucket.decrement(key);
        return RateLimitResult.allow();
    }
}
```

### 3.3 鉴权流程

```
请求 → API 网关
  → 1. 检查 API Key（识别调用方）
  → 2. 验证 JWT Token（识别用户）
  → 3. 检查权限（RBAC：用户角色 → API 权限）
  → 4. 限流检查
  → 5. 转发到下游服务

JWT Token 结构：
  Header: { "alg": "HS256", "typ": "JWT" }
  Payload: { "userId": "123", "roles": ["admin"], "exp": 1700000000 }
  Signature: HMAC-SHA256(header + payload, secret)

网关验证：
  - 解码 Header + Payload（Base64）
  - 用 Secret 验证 Signature（防篡改）
  - 检查 exp（防过期）
  - 通过 → 将 userId 注入请求头 → 转发给下游
```

### 3.4 网关选型

| 网关 | 语言 | 特点 | 适用 |
|------|------|------|------|
| **Kong** | Lua/Nginx | 插件丰富、社区活跃 | 通用 API 网关 |
| **APISIX** | Lua/Nginx | 高性能、动态路由 | 高并发场景 |
| **Spring Cloud Gateway** | Java | 和 Spring 生态无缝集成 | Java 微服务体系 |
| **Envoy** | C++ | 功能强大、Service Mesh 数据面 | 需要精细流量控制 |
| **自研** | — | 完全定制 | 有特殊需求 |

## 四、API 设计的常见反模式

| 反模式 | 问题 | 正确做法 |
|--------|------|---------|
| 上帝接口 | `POST /api/execute` 一个接口做所有事 | 按资源拆分，一个接口一件事 |
| 过度嵌套 | `/api/users/123/orders/456/items/789` | 扁平化：`/api/order-items/789` |
| 返回全部字段 | 一个列表接口返回 50 个字段 | 支持 `fields=id,name,status` 按需返回 |
| 无分页 | 返回全量数据 | 强制分页 + 游标分页（深度列表） |
| 错误信息不透明 | `{"error": "failed"}` | `{"code": "ORDER_NOT_FOUND", "message": "订单不存在", "detail": "..."}` |
| 时间格式不统一 | 有的用时间戳、有的用字符串 | 统一用 ISO 8601（`2024-01-15T10:30:00Z`） |

## 五、API 演进策略

```
API 一旦发布就不能随便改——下游可能在用。

向后兼容的变更（安全）：
  ✅ 新增可选字段
  ✅ 新增 API 端点
  ✅ 扩展枚举值

不兼容的变更（危险）：
  ❌ 删除字段
  ❌ 修改字段类型
  ❌ 修改 URL 路径
  ❌ 修改错误码含义

策略：
  1. 新版本并行运行（v1 和 v2 同时服务）
  2. 通知下游迁移（给 3-6 个月过渡期）
  3. 监控 v1 调用量 → 降到 0 → 下线 v1
  4. 关键：不要强制下游立即迁移
```

## 结语

API 设计不是「定义几个接口」——是**定义系统之间的契约**。

> RESTful 解决资源建模的可读性问题，gRPC 解决高性能通信的效率问题，API 网关解决统一治理的安全问题，版本管理解决向后兼容的演进问题。

好的 API 设计让集成方愉悦，差的 API 设计让集成方痛苦。架构师的责任是让前者发生。
