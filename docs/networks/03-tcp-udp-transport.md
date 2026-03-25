# TCP & UDP — Transport Layer

The Transport layer (L4) is where data gets reliably (or fast) delivered between two endpoints. The two protocols here are TCP and UDP — knowing both deeply is essential for any systems interview.

---

## TCP — Transmission Control Protocol

TCP guarantees delivery, order, and error detection. It does this by adding overhead: connection setup, acknowledgements, retransmissions, flow control.

### The Three-Way Handshake

Before any data can flow, TCP requires both sides to agree on starting sequence numbers — random numbers that identify the position of each byte in the data stream and enable the receiver to detect gaps, duplicates, and reordering. The three-way handshake accomplishes this synchronization in one round trip and also confirms that both sides are reachable and willing to communicate. The choice of random initial sequence numbers (rather than starting at 0) prevents stale packets from a previous connection on the same port from being accepted as valid data in a new connection.

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

TCP connections are full-duplex — each direction is independent, and either side can stop sending while still receiving. This is why the teardown requires four steps rather than two: each side must independently close its sending direction with a FIN and receive acknowledgement. A three-way teardown is possible when the server piggybacks its FIN onto its ACK, but the four-way form is more common because the server may still have data to send after acknowledging the client's FIN.

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

Sequence numbers are TCP's fundamental mechanism for reliability: by numbering every byte, both sides can detect what arrived, what is missing, and what arrived out of order. The sender increments the sequence number by the number of bytes sent; the receiver acknowledges by sending back the next sequence number it expects, implicitly acknowledging everything before it. This cumulative acknowledgement scheme means a single ACK can confirm receipt of many segments, and a retransmission only needs to retransmit the missing segment rather than everything that followed it.

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

Flow control solves the mismatch between a sender that can transmit data faster than the receiver can process it. Without flow control, a fast sender would flood a slow receiver's buffer, causing the receiver to drop packets — triggering retransmissions that ironically make the problem worse. TCP solves this by having the receiver continuously advertise how much free space it has in its buffer as a 16-bit window size field in every ACK. The sender is only allowed to have that many bytes in flight (sent but not yet acknowledged) at any moment. This creates a feedback loop: as the receiver's application reads data and frees buffer space, it advertises a larger window, allowing the sender to speed up.

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

Congestion control is TCP's mechanism for being a responsible citizen on a shared network. Unlike flow control (which prevents overwhelming the receiver), congestion control prevents overwhelming the network itself — the routers and links between sender and receiver. Without it, all TCP senders would transmit at full speed, filling router queues until packets are dropped, triggering retransmissions from all senders simultaneously, which fills the queues again — a death spiral known as congestion collapse. TCP infers congestion from packet loss (routers drop packets when queues are full) and reduces its sending rate accordingly. The congestion window (`cwnd`) is maintained by the sender and limits how much data can be in flight, independent of the receiver's window.

**Problem**: network between sender and receiver has limited capacity. If sender ignores this, routers drop packets → retransmissions → more congestion → collapse.

### Four Phases

TCP congestion control progresses through four distinct phases based on the current estimate of the network's capacity. The naming of "Slow Start" is counterintuitive — it refers to starting with a small congestion window (one segment) rather than using a small growth rate; in fact it grows exponentially. The transition from exponential to linear growth (Congestion Avoidance) happens when the window reaches the slow-start threshold, a value learned from past packet loss events. Fast Retransmit and Fast Recovery are optimizations that recover from isolated packet loss without fully restarting the slow-start process, preserving throughput by keeping the window relatively large.

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

The TCP header contains all the fields needed to implement reliable, ordered, connection-oriented delivery. Unlike the IP header (which concerns itself with routing), the TCP header concerns itself with delivery guarantees between two processes on two hosts. Each field serves a specific purpose in TCP's reliability or flow-control mechanisms. Understanding the header fields is important for reading packet captures, diagnosing connection issues, and reasoning about what information is available for features like load balancing and firewalling.

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

UDP strips TCP down to the bare minimum: it provides port-based multiplexing (so multiple applications on the same host can receive packets) and an optional checksum, and nothing else. There is no connection setup, no delivery acknowledgement, no ordering, and no congestion control. This makes UDP unsuitable for applications that need guaranteed delivery, but ideal for applications where the overhead of reliability would be counterproductive — a retransmitted video frame arrives too late to be useful, a duplicate DNS response is harmless, and game state that is even 100ms old is meaningless. Many modern protocols (QUIC, WebRTC data channels, online games) implement custom reliability on top of UDP to get precisely the semantics they need without paying for TCP's general-purpose overhead.

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

The choice between TCP and UDP comes down to one question: does your application need the network to guarantee delivery, or does it need the network to deliver as fast as possible and handle failures itself? TCP pays for its reliability guarantees with setup overhead (one RTT for the handshake), per-packet acknowledgement overhead, and head-of-line blocking within a connection. UDP pays nothing but provides nothing — the application must implement any reliability it needs. The table below maps each protocol's properties to the use cases they favor.

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

A port number is a 16-bit integer (0–65535) that identifies a specific application process on a host. IP addresses route packets to the right machine; port numbers route packets to the right application on that machine. This separation allows a single server to run dozens of services simultaneously — web server on 80, SSH on 22, PostgreSQL on 5432 — each distinguished by its port. The OS multiplexes all incoming packets to the correct process based on the (source IP, source port, destination IP, destination port) 4-tuple, which uniquely identifies every TCP connection.

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

TCP connections progress through a well-defined state machine throughout their lifecycle — from the initial `LISTEN` to the final `CLOSED`. These states are visible via `netstat` or `ss` on any Linux/macOS machine, making them a practical debugging tool. The most operationally significant state is `TIME_WAIT`, which keeps a connection's slot occupied for up to 120 seconds after close to prevent port reuse confusion. Under heavy load, a server that closes many short-lived connections can accumulate thousands of `TIME_WAIT` entries; `SO_REUSEADDR` and proper keep-alive tuning are the remedies.

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

The kernel provides several socket options that tune TCP behavior for specific workload profiles. The defaults are chosen for general-purpose use and are sensible for most applications, but specialized workloads — real-time game servers, long-polling APIs, services that restart frequently — benefit from explicitly tuning these options. Knowing when and why to deviate from the defaults is the mark of understanding rather than cargo-culting.

### Nagle's Algorithm
Nagle's algorithm addresses the "small packet problem": without it, an application that writes one byte at a time (a terminal emulator, a chat app typing character by character) would generate a separate TCP segment for each byte, each carrying 40 bytes of TCP/IP headers for one byte of data. Nagle's algorithm buffers small writes and sends them as a single segment once the previous segment is acknowledged or the buffer is large enough. This is a significant efficiency improvement for throughput-sensitive applications but adds measurable latency for interactive applications where you want each keystroke or game input sent immediately. Batches small writes into one segment to reduce small-packet overhead. Can add latency for interactive apps.

```javascript
// Node.js — disable Nagle for low-latency (e.g., game servers, telnet)
socket.setNoDelay(true);  // TCP_NODELAY
```

### TCP Keep-Alive
Long-lived TCP connections that carry no application traffic for extended periods can become "zombie" connections: one side believes the connection is open, but the other side has crashed, rebooted, or had its network path torn down. Without a detection mechanism, the surviving side will hold the connection open indefinitely, leaking memory and file descriptors. TCP keep-alive sends periodic probe packets on idle connections; if no response is received after a configured number of probes, the OS closes the connection and notifies the application. This is especially important for database connection pools and WebSocket servers that maintain thousands of long-lived connections.

Sends probe packets on idle connections to detect dead peers.

```javascript
socket.setKeepAlive(true, 60000);  // probe after 60s idle
```

### SO_REUSEADDR
When a server process exits, any TCP connections it owned enter `TIME_WAIT` for up to 120 seconds. During this window, the OS refuses to let a new process bind to the same port, because a late-arriving packet from the old connection might be mistaken for data in the new one. For development servers or services that restart frequently (e.g., after a crash), this means a 1–2 minute wait before the service can restart cleanly. `SO_REUSEADDR` instructs the OS to allow binding to a port that has connections in `TIME_WAIT`, effectively bypassing this restriction — safe in practice because TCP's sequence number randomization makes accidental packet acceptance extremely unlikely.

Allows binding to a port in TIME_WAIT. Needed for servers that restart quickly.

```python
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
```

---

## QUIC / HTTP/3

QUIC is a transport protocol designed by Google and standardized by the IETF (RFC 9000) that reimplements the reliability and security features of TCP + TLS in user space on top of UDP. The motivation is that TCP is implemented in operating system kernels, which update slowly, while QUIC running in user space can be updated with every application release. QUIC also directly addresses TCP's most significant modern limitations: the three-way handshake adds one round trip of latency before any data flows (QUIC achieves 0-RTT for known servers), and TCP's single bytestream causes head-of-line blocking for HTTP/2's multiplexed streams (QUIC provides independent stream delivery so a lost packet only blocks the stream it belongs to, not all streams). HTTP/3 is simply HTTP semantics running over QUIC instead of TCP.

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
