# TCP & UDP — Transport Layer

The Transport layer (L4) is where data gets reliably (or fast) delivered between two endpoints. The two protocols here are TCP and UDP — knowing both deeply is essential for any systems interview.

---

## TCP — Transmission Control Protocol

TCP guarantees delivery, order, and error detection. It does this by adding overhead: connection setup, acknowledgements, retransmissions, flow control.

### The Three-Way Handshake

```
Client                          Server
  |                               |
  |── SYN (seq=100) ─────────────>|  "I want to connect, my seq starts at 100"
  |                               |
  |<─ SYN-ACK (seq=300, ack=101)─|  "OK, my seq starts at 300, I got your 100"
  |                               |
  |── ACK (ack=301) ─────────────>|  "Got it. Connection open."
  |                               |
  |     [DATA TRANSFER]           |
```

- **SYN** — synchronize sequence numbers
- **SYN-ACK** — server acknowledges + sends its own SYN
- **ACK** — client acknowledges server's SYN
- After this, both sides have agreed on initial sequence numbers → connection is ESTABLISHED

### Four-Way Teardown

```
Client                          Server
  |── FIN ─────────────────────>|  "I'm done sending"
  |<─ ACK ──────────────────────|  "Got it"
  |<─ FIN ──────────────────────|  "I'm done too"
  |── ACK ─────────────────────>|  "Got it — closing"
```

Why four steps? Because FIN only closes one direction. Each side closes independently (half-close).

**TIME_WAIT state**: after sending the final ACK, client waits `2 × MSL` (typically 60–120s) before fully closing. Ensures delayed packets don't confuse a new connection on the same port.

---

## TCP Sequence Numbers & Reliability

Every byte of data has a sequence number. This enables:

- **Ordering** — receiver reorders out-of-order segments
- **Retransmission** — if ACK not received within timeout, sender retransmits
- **Deduplication** — receiver discards duplicates

```
Sender sends:   [seq=1, data="Hello"] [seq=6, data="World"]
Receiver sends: ACK=6                  ACK=11
                     "got 1-5"              "got 6-10"
```

If `seq=6` is lost:
```
Sender:   [seq=1 ✓] [seq=6 ✗] [seq=11 ✓]
Receiver: → sends ACK=6 (still waiting)
Sender:   retransmits seq=6 after RTO (Retransmission Timeout)
```

---

## TCP Flow Control — Sliding Window

**Problem**: fast sender, slow receiver → receiver's buffer overflows.

**Solution**: receiver advertises a **window size** (rwnd) — how many bytes it can accept.

```
Receiver: "I can accept 8192 bytes" → window=8192
Sender: sends up to 8192 unacknowledged bytes
Receiver processes, ACKs, and updates window
```

Window size is dynamic:
- Receiver processes data → window grows
- Receiver buffer fills → window shrinks
- `window=0` → sender pauses (zero-window probe sent periodically)

---

## TCP Congestion Control

**Problem**: network between sender and receiver has limited capacity. If sender ignores this, routers drop packets → retransmissions → more congestion → collapse.

### Four Phases

```
1. Slow Start
   cwnd = 1 MSS (Maximum Segment Size, ~1460 bytes)
   Every ACK → cwnd doubles (exponential growth)
   Until cwnd ≥ ssthresh (slow start threshold)

2. Congestion Avoidance
   cwnd grows by 1 MSS per RTT (linear growth)
   Until packet loss detected

3. Fast Retransmit
   3 duplicate ACKs → retransmit without waiting for timeout

4. Fast Recovery (TCP Reno/CUBIC)
   ssthresh = cwnd / 2
   cwnd = ssthresh + 3 (TCP Reno)
   Resume congestion avoidance
```

```
cwnd
 |                    *
 |                 *
 |              *
 |           *
 |        * ← ssthresh
 |      *
 |   * * * * (slow start, exponential)
 |──────────────────────────────→ time
```

**TCP CUBIC** (default in Linux): uses cubic function for cwnd growth, more aggressive in high-bandwidth/high-latency networks.

---

## TCP Headers

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
├─────────────────────────┬─────────────────────────────────────┤
│      Source Port        │        Destination Port             │
├─────────────────────────┴─────────────────────────────────────┤
│                    Sequence Number                             │
├───────────────────────────────────────────────────────────────┤
│                 Acknowledgment Number                          │
├─────────┬───────┬─────────────────────────────────────────────┤
│Data Off │Rsrvd  │ Flags (URG ACK PSH RST SYN FIN)             │
├─────────┴───────┴─────────────────────────────────────────────┤
│          Window Size    │           Checksum                  │
├─────────────────────────┴─────────────────────────────────────┤
│        Urgent Pointer   │           Options...                │
└─────────────────────────────────────────────────────────────────┘
```

Key fields:
- **Source/Dest Port** — 16 bits each (0–65535)
- **Seq Number** — 32-bit; position of first byte in this segment
- **ACK Number** — 32-bit; next byte expected from sender
- **Flags** — SYN, FIN, ACK, RST, PSH, URG
- **Window Size** — receive buffer available (flow control)
- **Checksum** — integrity check (covers header + data)

---

## UDP — User Datagram Protocol

UDP is connectionless, unreliable, and has minimal overhead. 8-byte header vs TCP's 20+.

```
 0                   1                   2                   3
├─────────────────────────┬───────────────────────────────────┤
│      Source Port        │      Destination Port             │
├─────────────────────────┼───────────────────────────────────┤
│         Length          │          Checksum                 │
└─────────────────────────┴───────────────────────────────────┘
│                         Data...                              │
```

**No**:
- Connection setup/teardown
- Sequence numbers or ordering
- Acknowledgements
- Retransmission
- Flow control or congestion control

**Yes**:
- Checksum (optional in IPv4, mandatory in IPv6)
- Multiple recipients via multicast/broadcast

### When to Use UDP

| Use Case | Why UDP |
|---|---|
| DNS queries | Single request/response, no need for connection |
| DHCP | Broadcast discovery before IP is assigned |
| Video streaming | Better to lose frames than stutter from retransmit |
| VoIP / WebRTC | Latency matters more than reliability |
| Online gaming | Stale game state is useless — prefer fresh |
| QUIC (HTTP/3) | Implements own reliability on top of UDP |
| NTP (time sync) | Single UDP packet, no overhead |
| SNMP (monitoring) | Lightweight polling |

---

## TCP vs UDP Comparison

| Feature | TCP | UDP |
|---|---|---|
| Connection | 3-way handshake | None |
| Reliability | Guaranteed delivery | Best effort |
| Ordering | Yes, reorders | No |
| Retransmission | Yes | No |
| Flow control | Yes (window) | No |
| Congestion control | Yes (CUBIC/Reno) | No |
| Header size | 20–60 bytes | 8 bytes |
| Latency | Higher | Lower |
| Throughput | Lower (ACK overhead) | Higher |
| Broadcast/Multicast | No | Yes |
| Use cases | HTTP, FTP, email, SSH | DNS, VoIP, games, streaming |

---

## Port Numbers

Ports identify specific processes/services on a host. Range: 0–65535.

```
0–1023      Well-known ports (require root to bind)
1024–49151  Registered ports (applications)
49152–65535 Ephemeral (dynamic) ports — assigned to clients by OS
```

| Port | Protocol | Service |
|---|---|---|
| 20, 21 | TCP | FTP (data, control) |
| 22 | TCP | SSH |
| 23 | TCP | Telnet (unencrypted, avoid) |
| 25 | TCP | SMTP |
| 53 | TCP/UDP | DNS |
| 67, 68 | UDP | DHCP (server, client) |
| 80 | TCP | HTTP |
| 110 | TCP | POP3 |
| 143 | TCP | IMAP |
| 443 | TCP | HTTPS |
| 3306 | TCP | MySQL |
| 5432 | TCP | PostgreSQL |
| 6379 | TCP | Redis |
| 27017 | TCP | MongoDB |

---

## TCP States

```
CLOSED → LISTEN (server opens socket)
LISTEN → SYN_RCVD (server receives SYN)
SYN_SENT → ESTABLISHED (client sends SYN, receives SYN-ACK, sends ACK)
ESTABLISHED → FIN_WAIT_1 (active close — sends FIN)
FIN_WAIT_1 → FIN_WAIT_2 (receives ACK)
FIN_WAIT_2 → TIME_WAIT (receives FIN, sends ACK)
TIME_WAIT → CLOSED (2×MSL timer expires)
CLOSE_WAIT (passive close — receives FIN, sends ACK)
LAST_ACK → CLOSED (passive close — sends FIN, receives ACK)
```

Check live TCP states on Linux/macOS:
```bash
netstat -an | grep tcp
ss -tan  # Linux, faster
```

---

## TCP Optimizations in Practice

### Nagle's Algorithm
Batches small writes into one segment to reduce small-packet overhead. Can add latency for interactive apps.

```javascript
// Node.js — disable Nagle for low-latency (e.g., game servers, telnet)
socket.setNoDelay(true);  // TCP_NODELAY
```

### TCP Keep-Alive
Sends probe packets on idle connections to detect dead peers.

```javascript
socket.setKeepAlive(true, 60000);  // probe after 60s idle
```

### SO_REUSEADDR
Allows binding to a port in TIME_WAIT. Needed for servers that restart quickly.

```python
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
```

---

## QUIC / HTTP/3

QUIC is built on UDP but re-implements reliability, multiplexing, and security in user space:

```
HTTP/1.1  →  TCP  →  IP
HTTP/2    →  TCP  →  IP         (still head-of-line blocking at TCP level)
HTTP/3    →  QUIC → UDP →  IP   (stream-level reliability, no HOL blocking)
```

QUIC advantages:
- **0-RTT connection resumption** — known server, skip handshake
- **No head-of-line blocking** — each stream independent
- **Connection migration** — same connection over Wi-Fi → LTE (connection ID, not IP)
- **Integrated TLS 1.3** — no separate TLS handshake round trip

---

## Common Interview Questions

**Q: Explain the TCP three-way handshake.**

Client sends SYN with its initial sequence number (ISN). Server responds with SYN-ACK — acknowledging the client's ISN+1 and sending its own ISN. Client sends ACK acknowledging the server's ISN+1. Now both sides have synchronized sequence numbers and the connection is ESTABLISHED. This takes 1 RTT before data can flow.

**Q: Why does TIME_WAIT exist?**

After sending the final ACK, the closer waits `2 × MSL` (Maximum Segment Lifetime) because: (1) the final ACK may be lost — if it is, the server resends its FIN, and the closer must still be able to ACK it; (2) ensures any delayed packets from this connection expire before the same port is reused for a new connection, preventing cross-contamination.

**Q: How does TCP handle packet loss?**

Two mechanisms: (1) **Timeout-based retransmission** — sender waits for RTO (Retransmission Timeout, estimated from RTT) then retransmits; (2) **Fast retransmit** — 3 duplicate ACKs (receiver keeps ACKing the same number, indicating a gap) trigger immediate retransmit without waiting for timeout. Fast retransmit is faster since it doesn't wait for the full timeout.

**Q: When would you choose UDP over TCP?**

When latency matters more than reliability: real-time games (stale state is worse than missing state), VoIP (better to have a gap than wait for retransmit), live video streaming, DNS lookups (single req/resp, application-level retry is fine). Also when building your own reliability protocol on top — QUIC does this, implementing selective ACKs, encryption, and multiplexing in userspace with less overhead than TCP.

**Q: What is head-of-line blocking?**

In TCP, all data is an ordered byte stream. If packet N is lost, packets N+1, N+2, ... must wait at the receive buffer even if they arrived. HTTP/2 multiplexes many streams over one TCP connection, but if a TCP packet is lost, ALL streams stall until it's retransmitted. HTTP/3/QUIC solves this by implementing per-stream reliability in userspace — a lost UDP packet only blocks the stream it belongs to.

---

## Links to Refer

- [Cloudflare — TCP vs UDP](https://www.cloudflare.com/learning/ddos/glossary/tcp-ip/)
- [RFC 793 — TCP](https://datatracker.ietf.org/doc/html/rfc793)
- [RFC 768 — UDP](https://datatracker.ietf.org/doc/html/rfc768)
- [Julia Evans — TCP Illustrated](https://jvns.ca/blog/2015/11/21/why-you-should-understand-a-little-about-tcp/)
