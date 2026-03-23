# Real-time & Messaging Protocols

WebRTC, gRPC-web, MQTT, AMQP — protocols for real-time communication, IoT, and messaging.

---

## WebRTC — Web Real-Time Communication

Browser-native P2P protocol for audio, video, and data — no plugins, no server relay for media.

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

Finds the best path between peers: local → STUN (reflexive, NAT-translated) → TURN (relayed).

```
Candidate types (preference order):
  1. host      — direct LAN (192.168.1.x) — fastest
  2. srflx     — STUN server-reflexive (public IP:port)
  3. prflx     — peer-reflexive (discovered during connectivity checks)
  4. relay     — TURN relay — always works, highest latency/cost
```

### STUN vs TURN

**STUN** (Session Traversal Utilities for NAT): tells you your public IP/port. Free/cheap. Works unless both peers are behind symmetric NAT.

**TURN** (Traversal Using Relays around NAT): relays all media traffic through the TURN server. Required ~15% of the time when P2P fails. Bandwidth costs money. Google provides free STUN; you pay for TURN (coturn is open-source self-hosted).

### Media Tracks & Data Channels

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

gRPC uses HTTP/2 but browsers can't speak HTTP/2 natively for gRPC (binary framing not exposed). gRPC-Web is a subset that works in browsers via a proxy.

```
Browser → gRPC-Web (HTTP/1.1 or HTTP/2 fetch) → Envoy proxy → gRPC backend (HTTP/2)
```

### Why gRPC over REST for browser apps?

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

Lightweight pub/sub protocol designed for constrained devices and unreliable networks. Port 1883 (TCP) / 8883 (TLS) / 8083 (WebSocket).

### Core Concepts

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

| QoS | Delivery | Mechanism |
|---|---|---|
| 0 | At most once | Fire and forget — no ACK |
| 1 | At least once | PUBACK — possible duplicates |
| 2 | Exactly once | 4-way handshake (PUBREC/PUBREL/PUBCOMP) |

### Node.js with MQTT

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

Enterprise messaging protocol. RabbitMQ is the most popular implementation.

### Concepts

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

```
Need audio/video?          → WebRTC
IoT / constrained devices? → MQTT
Enterprise task queues?    → AMQP (RabbitMQ)
High-throughput streaming? → Kafka
Browser <-> server chat?   → WebSocket
Simple server push?        → SSE (Server-Sent Events)
Browser gRPC?              → gRPC-Web + Envoy
```
