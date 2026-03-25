# gRPC — Protocol Buffers, Streaming, and When to Use It

---

## gRPC vs REST vs GraphQL

These three API styles represent fundamentally different tradeoffs between flexibility, performance, and tooling. REST is the most widely understood — it uses standard HTTP methods and JSON and works with any HTTP client, making it the right default for public-facing APIs. GraphQL gives clients control over the response shape, which eliminates over-fetching and under-fetching at the cost of a more complex server implementation. gRPC is designed for high-performance internal service-to-service communication: its binary Protocol Buffers encoding is 3–10x more compact than JSON, HTTP/2 multiplexing eliminates connection overhead, and the `.proto` schema generates type-safe client stubs in every major language from a single file. The choice is mostly about who the consumer is: public → REST; client-controlled queries → GraphQL; internal microservices → gRPC.

```
REST:
  Transport:   HTTP/1.1 (text)
  Format:      JSON (human-readable, verbose)
  Contract:    OpenAPI/Swagger (optional, not enforced)
  Streaming:   Polling or WebSocket (separate concern)
  Clients:     Any HTTP client
  Best for:    Public APIs, browser clients, simple CRUD

gRPC:
  Transport:   HTTP/2 (binary, multiplexed)
  Format:      Protocol Buffers (binary, compact, fast)
  Contract:    .proto file (enforced — code generated from it)
  Streaming:   Native (client/server/bidirectional)
  Clients:     Generated stubs (all major languages)
  Best for:    Internal microservices, high-throughput, polyglot systems

GraphQL:
  Transport:   HTTP/1.1 or HTTP/2
  Format:      JSON
  Contract:    SDL schema (enforced)
  Best for:    Client-driven queries, multiple clients with different needs
```

---

## Protocol Buffers

Protocol Buffers (protobuf) is a language-neutral binary serialisation format developed by Google. You define your data schema in a `.proto` file, then generate type-safe client and server code for any supported language from it. Fields are identified by integer numbers rather than string names — this makes the binary encoding more compact and allows fields to be renamed without breaking existing serialised data (as long as numbers are not reused). Field numbers 1–15 encode in one byte; 16–2047 require two bytes, which is why high-traffic fields should use low numbers. The `.proto` file is the single source of truth for the API contract and should be version-controlled alongside your code.

```protobuf
// user.proto
syntax = "proto3";

package user;

// Message definitions (schema):
message User {
  string id = 1;          // field number (1-15 use 1 byte, 16-2047 use 2 bytes)
  string name = 2;
  string email = 3;
  int32 age = 4;
  repeated string roles = 5;  // array
  UserStatus status = 6;
}

enum UserStatus {
  ACTIVE = 0;   // proto3: first value must be 0
  INACTIVE = 1;
  BANNED = 2;
}

message CreateUserRequest {
  string name = 1;
  string email = 2;
  int32 age = 3;
}

message GetUserRequest {
  string id = 1;
}

message ListUsersRequest {
  int32 limit = 1;
  string cursor = 2;
}

message ListUsersResponse {
  repeated User users = 1;
  string next_cursor = 2;
}

// Service definition:
service UserService {
  // Unary RPC (like REST):
  rpc GetUser (GetUserRequest) returns (User);
  rpc CreateUser (CreateUserRequest) returns (User);

  // Server streaming (server sends a stream of responses):
  rpc ListUsers (ListUsersRequest) returns (stream User);

  // Client streaming (client sends a stream):
  rpc BatchCreateUsers (stream CreateUserRequest) returns (ListUsersResponse);

  // Bidirectional streaming:
  rpc Chat (stream ChatMessage) returns (stream ChatMessage);
}
```

```bash
# Generate TypeScript code from .proto:
npx grpc_tools_node_protoc \
  --js_out=import_style=commonjs,binary:./src/generated \
  --grpc_out=grpc_js:./src/generated \
  --ts_out=./src/generated \
  --proto_path=./protos \
  ./protos/user.proto
```

---

## Node.js gRPC Server

A gRPC server registers service implementations against the service definition compiled from the `.proto` file. Each RPC type (unary, server-streaming, client-streaming, bidirectional) has a different call object signature. For unary calls, you receive the full request and call `callback(null, response)` when done — or `callback({ code, message })` to return a gRPC error. For server-streaming calls, you call `call.write(item)` for each item and `call.end()` when finished. The `call.cancelled` flag lets you abort early if the client has cancelled. Wrap all async handler code in `try/catch` and map Node.js errors to the appropriate `grpc.status` code — unhandled throws cause the stream to hang.

```typescript
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

// Load proto definition:
const packageDefinition = protoLoader.loadSync(
  path.join(__dirname, '../protos/user.proto'),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  }
);

const proto = grpc.loadPackageDefinition(packageDefinition) as any;

// Implement service handlers:
const userServiceImpl = {
  // Unary RPC:
  async GetUser(
    call: grpc.ServerUnaryCall<{ id: string }, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const user = await db.users.findById(call.request.id);
      if (!user) {
        callback({
          code: grpc.status.NOT_FOUND,
          message: `User ${call.request.id} not found`,
        });
        return;
      }
      callback(null, user);
    } catch (err) {
      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal server error',
      });
    }
  },

  // Server streaming:
  async ListUsers(call: grpc.ServerWritableStream<{ limit: number; cursor: string }, any>) {
    try {
      const users = await db.users.findMany({
        limit: call.request.limit || 100,
        cursor: call.request.cursor,
      });

      // Stream each user as it's ready:
      for (const user of users) {
        if (call.cancelled) break;  // respect client cancellation
        call.write(user);
      }

      call.end();
    } catch (err) {
      call.destroy(new Error('Failed to list users'));
    }
  },

  // Bidirectional streaming:
  Chat(call: grpc.ServerDuplexStream<any, any>) {
    call.on('data', (message) => {
      // Echo back with timestamp:
      call.write({
        ...message,
        timestamp: Date.now(),
        fromServer: true,
      });
    });

    call.on('end', () => {
      call.end();
    });

    call.on('error', (err) => {
      console.error('Chat stream error:', err);
    });
  },
};

// Create and start server:
const server = new grpc.Server();
server.addService(proto.user.UserService.service, userServiceImpl);

server.bindAsync(
  '0.0.0.0:50051',
  grpc.ServerCredentials.createInsecure(),  // use createSsl() for TLS
  (err, port) => {
    if (err) throw err;
    console.log(`gRPC server running on port ${port}`);
    server.start();
  }
);
```

---

## Node.js gRPC Client

The gRPC client stub is generated from the same `.proto` file and gives you a typed object with one method per RPC definition. Unary calls use a Node.js-style callback `(err, response)`. Every unary call should have a `deadline` set — without one, a call to an unavailable server will hang indefinitely. For server-streaming, the returned object is a readable stream you can iterate with `for await`. `grpc.Metadata` is the gRPC equivalent of HTTP headers — pass authentication tokens and trace context through it. Always handle `grpc.status.DEADLINE_EXCEEDED` and `grpc.status.UNAVAILABLE` explicitly, as these are the most common failure modes in production microservice meshes.

```typescript
import * as grpc from '@grpc/grpc-js';

// Create client:
const client = new proto.user.UserService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

// Unary call:
function getUser(id: string): Promise<any> {
  return new Promise((resolve, reject) => {
    client.GetUser(
      { id },
      (err: grpc.ServiceError | null, response: any) => {
        if (err) reject(err);
        else resolve(response);
      }
    );
  });
}

// With deadline (timeout):
function getUserWithTimeout(id: string, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const deadline = new Date(Date.now() + timeoutMs);
    client.GetUser(
      { id },
      { deadline },
      (err: grpc.ServiceError | null, response: any) => {
        if (err) {
          if (err.code === grpc.status.DEADLINE_EXCEEDED) {
            reject(new Error('Request timed out'));
          } else {
            reject(err);
          }
        } else {
          resolve(response);
        }
      }
    );
  });
}

// Consume server stream:
async function listAllUsers() {
  const stream = client.ListUsers({ limit: 1000 });
  const users: any[] = [];

  for await (const user of stream) {
    users.push(user);
  }

  return users;
}

// Metadata (like HTTP headers):
function getAuthenticatedUser(id: string, token: string): Promise<any> {
  const metadata = new grpc.Metadata();
  metadata.set('authorization', `Bearer ${token}`);

  return new Promise((resolve, reject) => {
    client.GetUser({ id }, metadata, (err: any, response: any) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}
```

---

## gRPC Interceptors (Middleware)

gRPC interceptors are the equivalent of Express middleware — they run on every call before (or after) the service handler and are the correct place for cross-cutting concerns like authentication, request logging, and distributed tracing. A client-side interceptor wraps each outbound call; a server-side interceptor wraps each inbound call. The interceptor receives the call's `metadata` (headers), the `listener` (for receiving responses), and a `next` function to pass control to the next interceptor or handler. Returning a gRPC error from `listener.onReceiveStatus` short-circuits the call before it reaches the handler, which is how auth interceptors reject unauthenticated requests.

```typescript
// Server interceptor for logging and auth:
function authInterceptor(
  options: grpc.InterceptorOptions,
  nextCall: Function
) {
  return new grpc.InterceptingCall(nextCall(options), {
    start: function(metadata, listener, next) {
      const token = metadata.get('authorization')[0] as string;
      if (!token) {
        const err = {
          code: grpc.status.UNAUTHENTICATED,
          message: 'Missing authorization token',
        };
        listener.onReceiveMessage(null);
        listener.onReceiveStatus(err);
        return;
      }
      // Verify token and add user to metadata:
      try {
        const user = verifyJwt(token.replace('Bearer ', ''));
        metadata.set('user-id', user.id);
        next(metadata, listener);
      } catch {
        listener.onReceiveStatus({
          code: grpc.status.UNAUTHENTICATED,
          message: 'Invalid token',
        });
      }
    }
  });
}
```

---

## HTTP/2 Advantages gRPC Leverages

```
Multiplexing:
  HTTP/1.1: one request per connection (or connection pool)
  HTTP/2: multiple streams over ONE connection
  → gRPC can pipeline requests without head-of-line blocking

Header compression (HPACK):
  HTTP/1.1: headers sent as text on every request
  HTTP/2: headers compressed and cached
  → Saves bandwidth especially for many small messages

Binary framing:
  HTTP/1.1: text protocol (parse overhead)
  HTTP/2: binary frames
  → Faster to encode/decode

Server push:
  HTTP/2: server can push data without a request
  → Used by gRPC streaming for server→client
```

---

## gRPC Error Codes

gRPC defines its own set of 17 canonical status codes that are protocol-level, independent of HTTP. They are more semantically precise than HTTP status codes and are portable across all gRPC language bindings. The mapping to HTTP concepts is approximate — `NOT_FOUND` maps to 404, `UNAUTHENTICATED` to 401, `PERMISSION_DENIED` to 403 — but gRPC adds distinctions that HTTP does not have, such as `DEADLINE_EXCEEDED` (timed out) vs `CANCELLED` (client explicitly cancelled), and `RESOURCE_EXHAUSTED` (rate limited or quota exceeded). Always return the most specific status code: returning `UNKNOWN` (2) when `INVALID_ARGUMENT` (3) is correct makes debugging much harder.

```typescript
// gRPC has standard error codes (vs HTTP status codes):
grpc.status.OK                  // 0 — success
grpc.status.CANCELLED           // 1 — client cancelled the request
grpc.status.UNKNOWN             // 2 — unexpected error
grpc.status.INVALID_ARGUMENT    // 3 — bad input (like 400)
grpc.status.DEADLINE_EXCEEDED   // 4 — timeout (like 408)
grpc.status.NOT_FOUND           // 5 — resource not found (like 404)
grpc.status.ALREADY_EXISTS      // 6 — resource exists (like 409)
grpc.status.PERMISSION_DENIED   // 7 — not authorized (like 403)
grpc.status.RESOURCE_EXHAUSTED  // 8 — rate limited (like 429)
grpc.status.FAILED_PRECONDITION // 9 — state mismatch (like 412)
grpc.status.UNAVAILABLE         // 14 — service unavailable (like 503)
grpc.status.UNAUTHENTICATED     // 16 — missing auth (like 401)
```

---

## Interview Questions

**Q: When would you use gRPC over REST?**
A: gRPC for: (1) Internal microservice communication — both sides are controlled, generated clients eliminate manual HTTP/JSON wiring, type safety across services. (2) High-throughput, low-latency — binary protobuf + HTTP/2 multiplexing is 5-10x smaller payload and faster parse than JSON. (3) Streaming — native support for server/client/bidirectional streaming. (4) Polyglot systems — generate clients in Go, Python, Java from one .proto. REST for: public APIs (browsers can't call gRPC without a proxy), teams unfamiliar with protobuf, or when human-readable responses are needed.

**Q: What is Protocol Buffers and why is it faster than JSON?**
A: Protocol Buffers is a binary serialization format. Fields are identified by number (not string names) — smaller payload. Binary encoding of integers/floats is more compact than decimal text. No quotes, brackets, or whitespace. Encoding/decoding is faster because it's just reading fixed-position bytes, not parsing text. Trade-off: not human-readable, requires .proto schema to decode (unlike JSON which is self-describing). For a typical API message, protobuf is 3-10x smaller than JSON.

**Q: What are the four types of gRPC communication?**
A: (1) Unary — one request, one response (like REST). (2) Server streaming — one request, server sends a stream of responses (live data, large dataset chunks). (3) Client streaming — client sends a stream, server responds once (file upload, batch ingestion). (4) Bidirectional streaming — both sides stream simultaneously (real-time collaboration, chat). All four use HTTP/2 streams under the hood — the difference is just which side writes and when it calls `end()`.

**Q: How do you handle authentication in gRPC?**
A: gRPC metadata is equivalent to HTTP headers — pass a JWT in the `authorization` metadata field. Server-side interceptors (like Express middleware) read metadata from `call.metadata`, verify the token, and either propagate the call or return `UNAUTHENTICATED`. For service-to-service auth, use mutual TLS (mTLS) — both sides present certificates, eliminates need for tokens.
