# Real-time & Messaging Protocols

WebRTC, gRPC-web, MQTT, AMQP — protocols for real-time communication, IoT, and messaging.

---

## WebRTC — Web Real-Time Communication

WebRTC is a browser-native protocol stack for peer-to-peer real-time communication — audio, video, and arbitrary data — without requiring a server to relay the media. The key insight is that traditional server-relayed architectures for video calls are expensive (the server must receive, decode, and re-encode every participant's media stream), while WebRTC enables direct peer connections that scale in cost with participants rather than with a central server. The challenge is that most peers are behind NAT routers that don't have publicly reachable IP addresses; WebRTC uses STUN and TURN servers to discover and traverse NAT, and a developer-controlled signaling server to exchange the connection negotiation metadata (SDP offers and ICE candidates) before the P2P channel is established.

### Architecture

```
Browser A                    STUN/TURN Server                Browser B
   |                               |                             |
   |── What's my public IP? ──────>|                             |
   |<─ 203.0.113.5:51234 ──────────|                             |
   |                               |                             |
   |── Signaling (SDP offer) ───────────────────────────────────>|  (via your server)
   |<─ Signaling (SDP answer) ──────────────────────────────────|
   |                               |                             |
   |────────── Direct P2P media stream ─────────────────────────>|
```

### Signaling

Signaling is the out-of-band exchange of connection metadata that happens before the peer-to-peer channel can be established. WebRTC deliberately does not define a signaling protocol, leaving the choice to the developer — any bidirectional channel works (WebSocket is most common, HTTP polling works, even copy-paste works for demos). The signaling server's job is purely to relay SDP (Session Description Protocol) offers/answers and ICE candidates between peers; it is not in the media path. Once the P2P channel is established, the signaling server is no longer involved.

WebRTC doesn't define signaling — you implement it (WebSocket, HTTP). Signaling exchanges SDP (Session Description Protocol) — codec preferences, resolution, IP candidates.

```javascript
// Peer A — create offer
const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
socket.emit('offer', offer);  // send via your signaling server

// Peer B — receive offer, create answer
socket.on('offer', async (offer) => {
  const pc = new RTCPeerConnection({ iceServers: [...] });
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('answer', answer);
});

// Peer A — receive answer
socket.on('answer', async (answer) => {
  await pc.setRemoteDescription(answer);
});

// Both — exchange ICE candidates
pc.onicecandidate = (e) => {
  if (e.candidate) socket.emit('ice-candidate', e.candidate);
};
socket.on('ice-candidate', (candidate) => {
  pc.addIceCandidate(candidate);
});
```

### ICE — Interactive Connectivity Establishment

ICE is the process WebRTC uses to discover and negotiate the best available network path between two peers. Because most devices are behind NAT routers and firewalls, the local IP address a peer sees for itself is not the address that a remote peer would use to reach it. ICE systematically gathers multiple candidate addresses — local LAN addresses, the public address revealed by a STUN server, and relayed addresses through a TURN server — and then performs connectivity checks to find the pair of candidates (one from each peer) that can actually communicate. The candidate priority ordering ensures that the lowest-cost path (direct LAN) is always preferred, falling back to higher-cost paths only when cheaper ones fail.

Finds the best path between peers: local → STUN (reflexive, NAT-translated) → TURN (relayed).

```
Candidate types (preference order):
  1. host      — direct LAN (192.168.1.x) — fastest
  2. srflx     — STUN server-reflexive (public IP:port)
  3. prflx     — peer-reflexive (discovered during connectivity checks)
  4. relay     — TURN relay — always works, highest latency/cost
```

### STUN vs TURN

STUN and TURN are both NAT traversal helpers used by the ICE process, but they differ fundamentally in what they do and what they cost. STUN is a lightweight discovery service: it tells a client its own public-facing IP address and port as seen from the internet, enabling two peers to potentially connect directly if at least one is not behind symmetric NAT. TURN is a fallback relay: when direct connectivity is impossible (both peers behind strict NAT), all media is relayed through the TURN server — which solves connectivity at the cost of bandwidth and latency. Every real-world WebRTC deployment requires both: STUN for the common case (no relay cost), TURN for the remaining ~15% of connections.

**STUN** (Session Traversal Utilities for NAT): tells you your public IP/port. Free/cheap. Works unless both peers are behind symmetric NAT.

**TURN** (Traversal Using Relays around NAT): relays all media traffic through the TURN server. Required ~15% of the time when P2P fails. Bandwidth costs money. Google provides free STUN; you pay for TURN (coturn is open-source self-hosted).

### Media Tracks & Data Channels

WebRTC supports two types of content over a peer connection: media tracks (audio and video streams captured from the device's camera and microphone) and data channels (arbitrary binary or text data with configurable reliability and ordering). Media tracks are managed by the browser's media engine — the browser handles encoding, packetization, and jitter buffering automatically. Data channels are more flexible: they run over SCTP (Stream Control Transmission Protocol) layered on DTLS on UDP, and can be configured as reliable (like TCP), unreliable (like UDP), or ordered/unordered depending on the application's needs. A real-time game might use unreliable data channels for position updates and reliable channels for game-state events, all over the same peer connection.

```javascript
// Video call
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
stream.getTracks().forEach(track => pc.addTrack(track, stream));

// Data channel (arbitrary data — P2P)
const dc = pc.createDataChannel('chat');
dc.onopen = () => dc.send('Hello P2P!');
dc.onmessage = (e) => console.log(e.data);
```

---

## gRPC-Web

gRPC is a high-performance RPC framework that uses Protocol Buffers (binary serialization) and HTTP/2 for transport, making it significantly more efficient than JSON/REST for inter-service communication. However, browsers cannot initiate raw HTTP/2 frames — the Fetch and XHR APIs only expose the HTTP request/response abstraction, not the underlying HTTP/2 binary framing layer. gRPC-Web solves this by defining a slightly modified protocol that works over standard browser fetch, and a proxy (Envoy is the reference implementation) that translates between gRPC-Web (browser side) and native gRPC (backend side). The trade-off compared to REST is that gRPC-Web requires the Envoy proxy in the stack and generated client code from `.proto` definitions, which increases setup complexity but eliminates handwritten API clients and provides end-to-end type safety from backend to browser.

gRPC uses HTTP/2 but browsers can't speak HTTP/2 natively for gRPC (binary framing not exposed). gRPC-Web is a subset that works in browsers via a proxy.

```
Browser → gRPC-Web (HTTP/1.1 or HTTP/2 fetch) → Envoy proxy → gRPC backend (HTTP/2)
```

### Why gRPC over REST for browser apps?

The primary advantage over REST+JSON is the combination of binary efficiency and code generation. Protobuf payloads are 3–10x smaller than equivalent JSON and faster to serialize/deserialize, which matters for bandwidth-constrained mobile clients or high-frequency data APIs. More importantly, `.proto` files serve as a single schema definition from which both server stubs and typed browser clients are automatically generated — eliminating an entire class of API client bugs and removing the need to manually maintain TypeScript types that match your backend's response shape. The major limitation is that browsers cannot do bidirectional streaming over gRPC-Web; for use cases requiring that (live collaborative editing, chat), WebSocket remains the right choice.

- Protobuf binary encoding (smaller payloads vs JSON)
- Generated TypeScript client from `.proto` schema
- Strong typing end-to-end
- Server streaming (but no bidirectional streaming in browsers — use WebSocket for that)

```protobuf
// user.proto
service UserService {
  rpc GetUser (GetUserRequest) returns (User);
  rpc ListUsers (ListRequest) returns (stream User);  // server streaming
}

message GetUserRequest { string id = 1; }
message User {
  string id = 1;
  string email = 2;
  int32 created_at = 3;
}
```

```typescript
// Generated TypeScript client
import { UserServiceClient } from './generated/user_grpc_web_pb';
import { GetUserRequest } from './generated/user_pb';

const client = new UserServiceClient('https://api.example.com');
const req = new GetUserRequest();
req.setId('42');

client.getUser(req, {}, (err, response) => {
  console.log(response.getEmail());
});

// Server streaming
const stream = client.listUsers(new ListRequest(), {});
stream.on('data', (user) => console.log(user.getEmail()));
stream.on('end', () => console.log('done'));
```

---

## MQTT — Message Queuing Telemetry Transport

MQTT is a publish/subscribe messaging protocol designed from the ground up for environments where bandwidth is scarce, power is limited, and network connections are unreliable — the defining constraints of IoT sensors, industrial telemetry devices, and mobile applications on cellular networks. Its binary protocol overhead is minimal (a minimum 2-byte fixed header versus HTTP's hundreds of bytes of header overhead), and its broker-mediated pub/sub model means devices only need to maintain a single persistent connection to the broker regardless of how many other devices they communicate with. The built-in QoS levels allow each message to independently trade delivery guarantees for overhead, enabling a single application to send fire-and-forget telemetry (QoS 0) and reliable commands (QoS 2) over the same connection.

Lightweight pub/sub protocol designed for constrained devices and unreliable networks. Port 1883 (TCP) / 8883 (TLS) / 8083 (WebSocket).

### Core Concepts

MQTT's model has three components: a broker, topics, and clients (publishers and subscribers). The broker is the central hub — all messages pass through it, and it is responsible for routing, delivery guarantees, session persistence, and retained messages. Topics are hierarchical string addresses that act as the routing key; clients subscribe to topic patterns using wildcards (`+` for a single level, `#` for multiple levels) rather than specific addresses. A single client can simultaneously publish to some topics and subscribe to others, and there is no concept of a direct peer connection — all communication is mediated by the broker.

**Broker** — central server (Mosquitto, HiveMQ, AWS IoT Core, EMQX).

**Topics** — hierarchical strings: `home/livingroom/temperature`

**Subscribe/Publish**:
```
Subscriber: home/+/temperature    ← + = single level wildcard
Subscriber: home/#                ← # = multi-level wildcard
Publisher:  home/livingroom/temperature → "23.5"
Publisher:  home/kitchen/temperature   → "21.0"
```

### QoS Levels

QoS (Quality of Service) is one of MQTT's most important features: it lets each published message independently specify how strongly the broker and subscriber guarantee delivery. This per-message control is essential for IoT because different message types have different requirements — a sensor reading published every 500ms can afford to lose occasional values (QoS 0), while a command to unlock a door must be delivered exactly once (QoS 2). Higher QoS levels achieve stronger guarantees through additional acknowledgement round trips, which increases latency and bandwidth usage. The choice of QoS level is one of the primary design decisions when modeling MQTT topics.

| QoS | Delivery | Mechanism |
|---|---|---|
| 0 | At most once | Fire and forget — no ACK |
| 1 | At least once | PUBACK — possible duplicates |
| 2 | Exactly once | 4-way handshake (PUBREC/PUBREL/PUBCOMP) |

### Node.js with MQTT

The `mqtt` npm package is the standard Node.js client for MQTT, supporting all QoS levels, persistent sessions, and TLS. Setting `clean: false` enables persistent sessions — the broker remembers the client's subscriptions and queues QoS 1/2 messages that arrive while the client is offline, delivering them on reconnect. This is what makes MQTT suitable for intermittently connected devices that go offline between readings.

```javascript
import mqtt from 'mqtt';

const client = mqtt.connect('mqtts://broker.example.com', {
  username: 'device-1',
  password: process.env.MQTT_PASSWORD,
  clientId: 'sensor-living-room',
  clean: false,       // resume session on reconnect
  reconnectPeriod: 5000,
});

client.on('connect', () => {
  client.subscribe('home/+/command', { qos: 1 });
  client.publish('home/livingroom/temperature', '23.5', { qos: 1, retain: true });
});

client.on('message', (topic, message) => {
  console.log(`${topic}: ${message.toString()}`);
});
```

**Retained messages** — broker stores last message on a topic; new subscribers immediately receive the last value.

**Last Will & Testament (LWT)** — message broker sends automatically if client disconnects unexpectedly:
```javascript
{ will: { topic: 'home/livingroom/status', payload: 'offline', qos: 1, retain: true } }
```

### MQTT vs WebSocket

MQTT and WebSocket are often confused because both involve persistent, bidirectional connections between a client and a server, but they operate at different levels of abstraction and solve different problems. WebSocket is a transport protocol: it provides a raw, low-level bidirectional channel over which any application protocol can run. MQTT is an application protocol with specific semantics: broker-mediated pub/sub, QoS guarantees, retained messages, persistent sessions, and last-will messages. The two are actually complementary rather than competing — MQTT can run over WebSocket (port 8083), which is the standard way to connect browser-based clients to an MQTT broker.

| | MQTT | WebSocket |
|---|---|---|
| Pattern | Pub/Sub via broker | Direct bidirectional |
| Overhead | Very low (2-byte header) | Higher |
| QoS | Built-in (0/1/2) | Must implement |
| Offline messages | Via retained/persistent session | No |
| Use case | IoT devices, telemetry | Web apps, games, chat |

MQTT over WebSocket (`ws://`) allows browsers to use MQTT.

---

## AMQP — Advanced Message Queuing Protocol

AMQP (Advanced Message Queuing Protocol) is a binary, wire-level messaging protocol standardized for enterprise messaging that decouples message producers from message consumers through a broker. Unlike simple pub/sub, AMQP introduces a rich routing model: messages are sent to exchanges rather than directly to queues, and bindings with routing keys determine which queues receive which messages. This lets a single producer send to one exchange and have messages automatically routed to different queues based on topic, type, or custom headers — enabling sophisticated patterns like work queues, topic-based fanout, and RPC-style request/reply. RabbitMQ is the dominant open-source implementation and is the right choice when you need flexible routing, message acknowledgement, dead-letter handling, and delivery guarantees, but do not need the long-term event log replay capability that Kafka provides.

Enterprise messaging protocol. RabbitMQ is the most popular implementation.

### Concepts

The core AMQP topology has four entities: producers, exchanges, queues, and consumers. Producers never publish directly to queues — they publish to exchanges, which are routing entities that apply rules (bindings) to decide which queue(s) receive a copy of the message. This indirection is what makes AMQP's routing so flexible: you can change routing rules (move traffic to a new queue, add a second consumer group) without touching the producer code. Queues are the durable buffers that hold messages until a consumer acknowledges them; an unacknowledged message stays in the queue and will be redelivered if the consumer disconnects. Manual acknowledgement is the key to "at-least-once" delivery — the broker only removes a message from the queue when the consumer explicitly calls `ack()`.

```
Producer → Exchange → Queue → Consumer
              ↓
          Binding (routing rule)
```

**Exchange types**:
- **Direct** — exact routing key match
- **Topic** — wildcard routing (`order.*`, `order.created`)
- **Fanout** — broadcast to all bound queues
- **Headers** — route by message headers

```javascript
import amqplib from 'amqplib';

const conn = await amqplib.connect('amqp://localhost');
const ch = await conn.createChannel();

// Declare exchange + queue
await ch.assertExchange('orders', 'topic', { durable: true });
await ch.assertQueue('order-emails', { durable: true });
await ch.bindQueue('order-emails', 'orders', 'order.created');

// Publish
ch.publish('orders', 'order.created', Buffer.from(JSON.stringify({ orderId: 1 })), {
  persistent: true,   // survive broker restart
  contentType: 'application/json',
});

// Consume
await ch.prefetch(10);  // max 10 unacknowledged messages
ch.consume('order-emails', async (msg) => {
  if (!msg) return;
  const order = JSON.parse(msg.content.toString());
  await sendConfirmationEmail(order);
  ch.ack(msg);          // manual ack — message removed from queue
  // ch.nack(msg, false, true);  // nack → requeue
});
```

**Dead Letter Exchange (DLX)** — messages go to DLX when: nacked without requeue, TTL expires, queue is full. Use for retry logic or error inspection.

### AMQP vs MQTT vs Kafka

These three protocols are often compared because they all involve a broker mediating messages between producers and consumers, but they are designed for fundamentally different problems. The most important distinguishing factor is message replay: Kafka stores messages in an immutable log that consumers can re-read from any point (enabling event sourcing, audit, and rebuilding projections), while AMQP and MQTT messages are consumed and gone. The second key difference is push vs pull: AMQP and MQTT brokers push messages to consumers as they arrive, which minimizes latency but couples consumer throughput to producer rate; Kafka consumers pull at their own pace, which enables independent scaling and catching up after downtime.

| | AMQP (RabbitMQ) | MQTT | Kafka |
|---|---|---|---|
| Pattern | Push (broker pushes to consumers) | Pub/Sub | Pull (consumers pull) |
| Message size | KB | Bytes–KB | MB (configurable) |
| Throughput | High | Very high | Extreme |
| Replay | No (consumed = gone) | Retained (1 msg) | Yes (log retention) |
| Use case | Task queues, RPC, routing | IoT, telemetry | Event streaming, audit |
| Ordering | Per-queue FIFO | Per-topic (QoS 2) | Per-partition |

---

## Choosing a Real-time Protocol

No single real-time protocol is best for all scenarios — the choice depends on the communication pattern (peer-to-peer vs broker-mediated), the network environment (browsers vs constrained devices), the delivery guarantee required, and whether messages need to be replayed after they are consumed. WebRTC is the only option when media (audio/video) must flow directly between browser peers at low latency. MQTT is the natural choice for IoT devices where byte-level overhead matters and devices may reconnect frequently. AMQP/RabbitMQ excels when flexible routing, acknowledgement, and work-queue semantics are needed. Kafka is the appropriate choice when you need a durable, replayable event log rather than transient message delivery. WebSocket and SSE cover the browser-to-server real-time use cases where you control both sides.

```
Need audio/video?          → WebRTC
IoT / constrained devices? → MQTT
Enterprise task queues?    → AMQP (RabbitMQ)
High-throughput streaming? → Kafka
Browser <-> server chat?   → WebSocket
Simple server push?        → SSE (Server-Sent Events)
Browser gRPC?              → gRPC-Web + Envoy
```
