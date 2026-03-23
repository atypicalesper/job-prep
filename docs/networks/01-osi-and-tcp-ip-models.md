# OSI & TCP/IP Models

Every network conversation — from typing a URL to receiving a webpage — travels through a stack of layers. These models define how.

---

## The OSI Model (7 Layers)

```
┌──────────────────────────────────────────┐
│  7 — Application   HTTP, DNS, FTP, SMTP  │  ← Your app lives here
│  6 — Presentation  TLS/SSL, encoding     │  ← Encryption, compression
│  5 — Session       NetBIOS, RPC          │  ← Connection management
│  4 — Transport     TCP, UDP              │  ← Ports, reliability
│  3 — Network       IP, ICMP, routing     │  ← IP addresses, routing
│  2 — Data Link     Ethernet, MAC, ARP    │  ← MAC addresses, frames
│  1 — Physical      Cables, Wi-Fi, bits   │  ← Raw bits on wire/air
└──────────────────────────────────────────┘
```

Mnemonic: **A**ll **P**eople **S**eem **T**o **N**eed **D**ata **P**rocessing
(Application → Physical, top to bottom)

---

## What Each Layer Does

### Layer 7 — Application
The protocol your application uses directly.
- **HTTP/HTTPS** — web
- **DNS** — domain name resolution
- **SMTP/IMAP/POP3** — email
- **SSH** — secure shell
- **FTP/SFTP** — file transfer
- **WebSocket** — bidirectional web comms

### Layer 6 — Presentation
Data translation — encryption, encoding, compression.
- **TLS/SSL** — encrypts data before it leaves your machine
- **Character encoding** — ASCII, UTF-8
- **Image/video codecs** — JPEG, MPEG

### Layer 5 — Session
Manages connections — opening, maintaining, closing.
- Rarely visible directly; handled by OS/runtime
- **NetBIOS**, **RPC**, **SQL sessions**

### Layer 4 — Transport
End-to-end delivery between **ports** on two hosts.
- **TCP** — reliable, ordered, connection-based
- **UDP** — unreliable, connectionless, fast
- Port numbers (0–65535) live here
- Segments (TCP) / Datagrams (UDP)

### Layer 3 — Network
Logical addressing (**IP**) and **routing** between networks.
- **IPv4 / IPv6** — source and destination IP addresses
- **ICMP** — ping, traceroute
- **Routing** — how packets hop from router to router
- Unit: **Packet**

### Layer 2 — Data Link
Node-to-node delivery on the **same network** (one hop).
- **MAC addresses** — hardware addresses
- **Ethernet frames** — wrap packets for LAN transmission
- **ARP** — resolves IP → MAC on local network
- **Switches** operate at this layer
- Unit: **Frame**

### Layer 1 — Physical
Raw bits over a physical medium.
- Cables (Cat5e, Cat6, fiber optic)
- Radio waves (Wi-Fi, 4G/5G)
- Signal voltage levels, encoding
- **Hubs**, **repeaters** live here
- Unit: **Bits**

---

## The TCP/IP Model (4 Layers)

The real-world model used by the internet. Collapses OSI 5+6+7 into one and 1+2 into one.

```
┌────────────────────────────────────────────────────────┐
│  Application     HTTP, DNS, TLS, FTP, SSH, SMTP        │  ← OSI 5+6+7
│  Transport       TCP, UDP                               │  ← OSI 4
│  Internet        IP, ICMP, ARP                          │  ← OSI 3
│  Network Access  Ethernet, Wi-Fi, MAC frames            │  ← OSI 1+2
└────────────────────────────────────────────────────────┘
```

---

## Data Encapsulation (What Happens When You Send a Request)

```
You type: https://example.com

Application layer:    HTTP request → data
                      [HTTP header + body]

Transport layer:      Wrapped in TCP segment
                      [TCP header | HTTP data]
                      Adds: source port (e.g. 54231), dest port (443)

Network layer:        Wrapped in IP packet
                      [IP header | TCP segment]
                      Adds: source IP (192.168.1.5), dest IP (93.184.216.34)

Data Link layer:      Wrapped in Ethernet frame
                      [Eth header | IP packet | Eth trailer]
                      Adds: source MAC, dest MAC (your gateway's MAC)

Physical layer:       Converted to electrical/optical/radio signals
                      01001000 01001001 ...
```

**De-encapsulation** happens in reverse at the receiving end — each layer strips its header and passes the payload up.

---

## Protocol Data Units (PDUs) by Layer

| Layer | PDU name | Contains |
|---|---|---|
| Application | Message / Data | HTTP body, DNS query |
| Transport | Segment (TCP) / Datagram (UDP) | Port numbers + data |
| Network | Packet | IP addresses + segment |
| Data Link | Frame | MAC addresses + packet |
| Physical | Bits | Binary signal |

---

## OSI Layer Devices

| Device | OSI Layer | What it does |
|---|---|---|
| Hub | L1 (Physical) | Broadcasts to all ports — dumb, no addressing |
| Switch | L2 (Data Link) | Forwards frames by MAC address — smart |
| Router | L3 (Network) | Routes packets by IP — connects networks |
| Firewall | L3/L4 | Filters packets by IP/port |
| Load balancer | L4/L7 | Distributes traffic by port or HTTP content |
| Proxy/CDN | L7 (Application) | Inspects and routes by HTTP headers, URLs |

---

## Common Interview Questions

**Q: At what layer does a switch operate, and why?**

Layer 2 (Data Link). A switch reads the destination **MAC address** on each incoming frame and forwards it only to the correct port, learning which MACs are on which port over time. Because MAC addresses are Layer 2 constructs (not IP addresses), the switch works at L2. A router is needed to move traffic **between** networks.

**Q: What is the difference between a router and a switch?**

A switch connects devices on the **same network** using MAC addresses (L2). A router connects **different networks** and routes packets based on IP addresses (L3). Your home has both: a switch connecting your devices to the local LAN, and a router connecting the LAN to the ISP's network.

**Q: Why is TLS at Layer 6 (Presentation) but implemented above TCP?**

In the OSI model it's conceptually at L6 since it handles encryption/encoding. In practice (TCP/IP model), TLS runs on top of TCP and below HTTP — it's an application-layer protocol in the TCP/IP sense. This is one of many places where the OSI model is a conceptual guide, not a strict implementation blueprint.

**Q: What does ARP do, and at what layer?**

ARP (Address Resolution Protocol) resolves a known IP address to the MAC address needed to deliver a frame on the local network. It's a Layer 2/3 boundary protocol. When your machine knows the IP of the destination but needs to build an Ethernet frame, it broadcasts: "Who has 192.168.1.1? Tell 192.168.1.5." The device with that IP replies with its MAC.

---

## Links to Refer

- [Cloudflare — OSI Model](https://www.cloudflare.com/learning/ddos/glossary/open-systems-interconnection-model-osi/)
- [RFC 1122 — TCP/IP Requirements](https://datatracker.ietf.org/doc/html/rfc1122)
- [Julia Evans — Networking Zines](https://jvns.ca/networking-zine.pdf)
