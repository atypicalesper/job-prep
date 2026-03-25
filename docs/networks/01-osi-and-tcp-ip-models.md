# OSI & TCP/IP Models

Every network conversation — from typing a URL to receiving a webpage — travels through a stack of layers. These models define how.

---

## The OSI Model (7 Layers)

The OSI model is a conceptual framework that standardizes how different network functions are divided into layers. Each layer has a specific role and communicates only with the layers directly above and below it, making the model a clean abstraction: you can change how layer 2 (Ethernet) works without affecting layer 7 (HTTP). In practice, the OSI model is a diagnostic and educational tool rather than a strict implementation spec — real-world protocols like TLS don't map cleanly to one layer. Its primary value is giving engineers a shared vocabulary for reasoning about where a problem lives ("is this a layer 3 routing issue or a layer 4 port firewall rule?") and for understanding how data is transformed as it moves through the network stack.

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

Each layer in the OSI model solves a distinct problem in the task of moving data from one machine to another. Layers 1 and 2 handle the physical and local network; layers 3 and 4 handle addressing and reliability across networks; layers 5, 6, and 7 (collapsed into the Application layer in the TCP/IP model) handle the application-facing concerns. The key insight is encapsulation: as data travels down the stack, each layer wraps the layer above's data with its own header, and the receiving machine unwraps in reverse. Each layer only reads its own header and passes the rest opaquely to the next layer.

### Layer 7 — Application
The Application layer is the topmost layer and is the only layer that directly interacts with application software. It provides the communication services that applications need — request/response semantics for the web, name resolution for DNS, and reliable file transfer — without exposing the lower-level details of how those services are delivered. Every protocol at this layer assumes a reliable transport is already established beneath it; HTTP, for example, relies entirely on TCP to handle retransmission and ordering.

The protocol your application uses directly.
- **HTTP/HTTPS** — web
- **DNS** — domain name resolution
- **SMTP/IMAP/POP3** — email
- **SSH** — secure shell
- **FTP/SFTP** — file transfer
- **WebSocket** — bidirectional web comms

### Layer 6 — Presentation
The Presentation layer is responsible for translating data between the format used by the application and the format used on the network. It handles three distinct transformations: encryption/decryption (so that data is unreadable to intermediaries), encoding/decoding (converting character sets, e.g., UTF-8 to ASCII), and compression/decompression. In practice, TLS (which encrypts data in transit) is the most significant Presentation-layer concern for web developers, though TLS is implemented as an application-layer protocol in TCP/IP stack terms.

Data translation — encryption, encoding, compression.
- **TLS/SSL** — encrypts data before it leaves your machine
- **Character encoding** — ASCII, UTF-8
- **Image/video codecs** — JPEG, MPEG

### Layer 5 — Session
The Session layer manages the lifecycle of a communication session between two applications: establishing it, maintaining it while data is exchanged, and tearing it down cleanly when both sides are done. In the OSI model this includes checkpointing (allowing a long transfer to resume from a save point if interrupted) and dialog control (half-duplex or full-duplex negotiation). In practice the Session layer is largely invisible to application developers because its functions are absorbed by the TCP connection or by application-level protocols. It is most relevant when working with older enterprise protocols like RPC or NetBIOS.

Manages connections — opening, maintaining, closing.
- Rarely visible directly; handled by OS/runtime
- **NetBIOS**, **RPC**, **SQL sessions**

### Layer 4 — Transport
The Transport layer provides end-to-end communication services between specific application processes on two hosts, identified by port numbers. It is where reliability (or the deliberate absence of it) is defined: TCP adds connection setup, sequencing, acknowledgements, retransmission, and flow control; UDP provides only port multiplexing and an optional checksum. The Transport layer is the boundary between the application-facing layers above and the infrastructure-facing layers below — applications interact with the network primarily through the abstractions TCP and UDP expose (sockets).

End-to-end delivery between **ports** on two hosts.
- **TCP** — reliable, ordered, connection-based
- **UDP** — unreliable, connectionless, fast
- Port numbers (0–65535) live here
- Segments (TCP) / Datagrams (UDP)

### Layer 3 — Network
The Network layer is responsible for logical addressing and routing — moving packets from their source to their destination across potentially many intermediate networks. Unlike the Data Link layer which only delivers a frame to the next hop on the same physical network, the Network layer is concerned with the full end-to-end path. IP addresses at this layer are assigned logically (not burned into hardware) and are hierarchical, enabling routers to make forwarding decisions using prefix-based routing tables rather than per-host tables. The Internet's scalability depends entirely on this hierarchical addressing scheme.

Logical addressing (**IP**) and **routing** between networks.
- **IPv4 / IPv6** — source and destination IP addresses
- **ICMP** — ping, traceroute
- **Routing** — how packets hop from router to router
- Unit: **Packet**

### Layer 2 — Data Link
The Data Link layer handles the reliable transfer of frames between two directly connected nodes on the same physical network segment. While the Network layer gives every device a logical (IP) address, the Data Link layer deals with hardware (MAC) addresses — the physical identity burned into each network interface card. ARP (Address Resolution Protocol) bridges layers 2 and 3 by resolving a known IP address to the MAC address needed to build a frame for the next hop. Switches operate at this layer and maintain MAC address tables to forward frames only to the correct port rather than broadcasting to everyone.

Node-to-node delivery on the **same network** (one hop).
- **MAC addresses** — hardware addresses
- **Ethernet frames** — wrap packets for LAN transmission
- **ARP** — resolves IP → MAC on local network
- **Switches** operate at this layer
- Unit: **Frame**

### Layer 1 — Physical
The Physical layer defines the electrical, optical, or radio specifications for transmitting raw bits over a physical medium. It concerns itself with signal voltage levels, cable specifications, frequencies, connector types, and modulation schemes. There is no addressing or framing at this layer — just the encoding of 0s and 1s onto a signal. A hub, unlike a switch, operates entirely at this layer: it repeats every incoming signal to every other port with no awareness of addresses or frames, which is why hubs create collision domains and have been replaced by switches in virtually all modern networks.

Raw bits over a physical medium.
- Cables (Cat5e, Cat6, fiber optic)
- Radio waves (Wi-Fi, 4G/5G)
- Signal voltage levels, encoding
- **Hubs**, **repeaters** live here
- Unit: **Bits**

---

## The TCP/IP Model (4 Layers)

The TCP/IP model is the practical model that the internet actually implements, developed from the ARPANET research that became the internet. It predates OSI and is less granular: it collapses OSI's Session, Presentation, and Application layers into a single Application layer, and collapses OSI's Physical and Data Link layers into a Network Access (or Link) layer. When you work with real network code and tools, you are always working within the TCP/IP model — OSI is the conceptual map, TCP/IP is the territory.

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

Encapsulation is the mechanism by which each network layer adds its own header (and sometimes trailer) to the data it receives from the layer above, creating a nested structure of headers-within-headers. The payload of each layer is opaque to the layers below it — IP does not know or care that the data inside its packet is a TCP segment carrying an HTTP request. This layering is what makes the internet composable: you can swap Ethernet for Wi-Fi at layer 2 without changing anything at layers 3 through 7. De-encapsulation at the receiving end strips each header in reverse order, delivering the original application data to the process that needs it.

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

Each layer of the network stack gives its unit of data a different name because each unit has a different structure and purpose. This terminology is used consistently in network analysis tools (Wireshark shows "frames" at layer 2, "packets" at layer 3, "segments" at layer 4) and in technical documentation. Knowing the correct term for each layer is often tested in networking interviews and is essential for reading packet captures accurately.

| Layer | PDU name | Contains |
|---|---|---|
| Application | Message / Data | HTTP body, DNS query |
| Transport | Segment (TCP) / Datagram (UDP) | Port numbers + data |
| Network | Packet | IP addresses + segment |
| Data Link | Frame | MAC addresses + packet |
| Physical | Bits | Binary signal |

---

## OSI Layer Devices

Network devices are classified by the highest OSI layer they inspect when making forwarding decisions. A hub at layer 1 is completely passive — it broadcasts every bit it receives to every port because it has no awareness of addressing. A switch at layer 2 reads MAC addresses and makes intelligent per-port forwarding decisions. A router at layer 3 reads IP addresses and makes routing decisions based on routing tables. Load balancers and proxies at layers 4 and 7 can inspect ports and HTTP content respectively, enabling sophisticated routing and policy enforcement. The higher the layer a device operates at, the more context it has and the more sophisticated (and expensive) its decisions can be.

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
