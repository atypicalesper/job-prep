# gRPC — Protocol Buffers, Streaming, and When to Use It

---

## gRPC vs REST vs GraphQL

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
