# Networking Interview Questions

Comprehensive Q&A across all networking topics — OSI model, TCP/UDP, IP/subnetting, DNS, HTTP, routing, NAT, firewalls, and cloud networking.

---

## OSI & Network Models

**Q: Explain the OSI model and why it matters.**

The OSI model describes network communication as 7 layers, each with a specific responsibility: Physical (bits on wire), Data Link (MAC/frames, one hop), Network (IP/routing, end-to-end across routers), Transport (TCP/UDP, port-to-port), Session (connection management), Presentation (encoding/encryption), Application (HTTP, DNS). It matters because it gives a mental model for isolating problems ("is this a Layer 2 or Layer 3 issue?") and for understanding where protocols live and interact.

**Q: What's the difference between OSI and TCP/IP models?**

TCP/IP collapses OSI's 7 layers into 4: Network Access (OSI 1+2), Internet (OSI 3), Transport (OSI 4), Application (OSI 5+6+7). TCP/IP is the actual implementation model used by the internet; OSI is a conceptual reference model developed independently. When engineers talk about Layer 3 or Layer 7 load balancers, they're using OSI terminology even though their protocol stack is TCP/IP.

**Q: What is encapsulation?**

Each layer wraps the data from the layer above with its own header (and sometimes trailer). HTTP data gets a TCP header (ports), then an IP header (addresses), then an Ethernet frame header (MACs). At the receiver, each layer strips its header and passes the payload up. This layering means each layer only needs to understand its own protocol, not what's inside.

---

## IP Addressing & Subnetting

**Q: What is a subnet mask and what does /24 mean?**

A subnet mask defines which part of an IP address is the network portion and which is the host portion. `/24` means 24 bits are the network (255.255.255.0), leaving 8 bits for hosts — 256 addresses, but 254 usable (subtract network address and broadcast). The mask is ANDed with the IP to get the network address.

**Q: Walk me through subnetting 192.168.10.0/24 into 4 equal subnets.**

We need 4 subnets, so we borrow 2 bits from the host portion: /26 (255.255.255.192). Each subnet has 64 addresses (62 usable).
- 192.168.10.0/26 → hosts .1–.62, broadcast .63
- 192.168.10.64/26 → hosts .65–.126, broadcast .127
- 192.168.10.128/26 → hosts .129–.190, broadcast .191
- 192.168.10.192/26 → hosts .193–.254, broadcast .255

**Q: What is the difference between a public IP and a private IP?**

Private IP ranges (RFC 1918): 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16. These are non-routable on the public internet — routers drop packets with private source/dest IPs. Used within private networks (home, office, VPC). Public IPs are globally unique, assigned by IANA/RIRs, and routable across the internet. NAT translates between them at network boundaries.

**Q: What is CIDR and why was it introduced?**

CIDR (Classless Inter-Domain Routing) allows flexible subnet sizes not constrained by the old Class A/B/C boundaries. Before CIDR, address space was wasted — a company needing 300 hosts got a Class B (65534 hosts). CIDR also enables route aggregation (supernetting): multiple contiguous subnets can be advertised as one route, reducing BGP routing table size (which was growing explosively in the early 1990s).

**Q: How many hosts fit in a /28 subnet?**

/28 = 28-bit network, 4-bit host = 2⁴ = 16 addresses. Subtract network and broadcast = **14 usable hosts**.

**Q: What is the difference between IPv4 and IPv6?**

IPv4 is 32-bit (4 billion addresses), exhausted. IPv6 is 128-bit (3.4×10³⁸ addresses). IPv6 eliminates NAT need, has built-in IPsec, simplified header format (fixed 40 bytes), no broadcast (uses multicast/anycast), and stateless address autoconfiguration (SLAAC). Adoption is ~40% of global traffic as of 2024. Written in hex with colons: `2001:db8::1`.

---

## TCP & UDP

**Q: Describe the TCP three-way handshake and why each step is necessary.**

1. **SYN**: Client picks a random initial sequence number (ISN) and sends SYN. Establishes the client's starting sequence number.
2. **SYN-ACK**: Server acknowledges client's ISN (ACK = client ISN + 1) and sends its own ISN (SYN). Establishes server's starting sequence number.
3. **ACK**: Client acknowledges server's ISN. Both sides now have synchronized sequence numbers.

Why three steps and not two? Because you need bidirectional agreement: each side must both send its ISN and confirm it was received. Two-way would leave the server unsure its SYN was acknowledged.

**Q: Why does TCP use sequence numbers?**

Sequence numbers enable ordered delivery, retransmission, and deduplication. Since TCP is a byte stream over an unreliable IP layer, packets can arrive out of order, be lost, or be duplicated. Sequence numbers allow the receiver to reorder segments, detect gaps (trigger retransmit requests), and discard duplicates.

**Q: Explain TCP flow control.**

The receiver advertises a window size (rwnd) — how many bytes it can buffer. The sender may not have more than rwnd unacknowledged bytes in flight. As the receiver processes data, its buffer frees up and it advertises a larger window. If the receiver is slow, the window shrinks, throttling the sender. Window = 0 means "stop sending." This prevents a fast sender from overwhelming a slow receiver.

**Q: Explain TCP congestion control.**

Separate from flow control — this deals with the network capacity, not the receiver's capacity. TCP starts with a small congestion window (cwnd) and grows it exponentially (slow start) until it hits the threshold (ssthresh). Then it grows linearly (congestion avoidance). On packet loss, it cuts cwnd drastically and resumes. Three duplicate ACKs trigger fast retransmit + fast recovery (less aggressive than timeout). Modern TCP uses CUBIC instead of Reno.

**Q: What is the difference between TCP and UDP? When would you choose each?**

TCP: reliable, ordered, connection-based, with flow/congestion control, higher overhead. UDP: unreliable, connectionless, no ordering, minimal overhead.

Choose UDP when: latency matters more than reliability (games, VoIP, video), the app handles retransmission itself (DNS), or you need broadcast/multicast. Choose TCP when: data integrity is required (file transfer, HTTP, databases, SSH) or you need all data in order.

**Q: What is head-of-line blocking?**

In a sequential stream, a lost/delayed unit stalls everything behind it. In TCP, if segment N is lost, segments N+1, N+2... queue at the receiver until N arrives. HTTP/2 multiplexes logical streams over TCP but still suffers TCP-level HOL blocking. HTTP/3/QUIC puts streams over UDP with independent reliability per stream, so a lost packet only blocks its stream.

**Q: What is a TIME_WAIT state and why is it a problem under high load?**

After the active close (FIN sent), the socket stays in TIME_WAIT for 2×MSL (~120s) to handle delayed packets. Under high connection rates (e.g., HTTP/1.0 servers), this creates thousands of sockets in TIME_WAIT, exhausting the port range and memory. Mitigation: `SO_REUSEADDR`, persistent connections (HTTP keep-alive / HTTP/2), or tuning `net.ipv4.tcp_tw_reuse` on Linux.

---

## DNS

**Q: Walk me through DNS resolution for `www.example.com` from scratch.**

1. Browser checks local cache → miss
2. OS checks `/etc/hosts` → miss; queries local DNS resolver (from `/etc/resolv.conf`)
3. Recursive resolver checks its cache → miss; queries root nameserver
4. Root NS: "I don't know .com, but here are the .com TLD servers"
5. TLD server (.com): "I don't know example.com, but here's its authoritative nameserver (ns1.example.com)"
6. Authoritative NS for example.com: "www.example.com → 93.184.216.34, TTL 3600"
7. Resolver caches the result for TTL seconds, returns IP to client
8. OS caches, browser caches, request proceeds

**Q: What is the difference between A, CNAME, and ALIAS records?**

**A record**: maps hostname directly to IPv4 address. **CNAME**: maps hostname to another hostname (alias). Cannot be at zone apex (e.g., `example.com` itself) — only for subdomains. **ALIAS/ANAME** (Route 53 Alias, Cloudflare CNAME Flattening): like a CNAME but resolved at DNS level, returns A records, can be at zone apex. Use for pointing root domain to a load balancer or CDN.

**Q: What is TTL and what are the trade-offs of setting it high vs low?**

TTL controls how long resolvers cache a record. High TTL (hours/days): fewer DNS queries, lower latency, less load on nameservers, but slow propagation when you change records. Low TTL (60–300s): fast propagation (critical during incidents or migrations), but more DNS queries and load. Best practice: lower TTL before planned changes, then raise after confirming.

**Q: What does `dig +trace` show you?**

Shows the full iterative resolution path: queries root servers first, then TLD servers, then authoritative servers — exactly how a recursive resolver does it. Useful for debugging delegation issues, expired NS records, and propagation problems.

---

## HTTP & TLS

**Q: What happens during a TLS 1.3 handshake?**

1. Client sends ClientHello: TLS version, supported cipher suites, client random, key_share (DH public key)
2. Server sends ServerHello (selects cipher), then in encrypted form: Certificate, CertificateVerify, Finished
3. Client verifies certificate chain, sends Finished
4. Both sides derive session keys from the DH exchange

TLS 1.3 is 1-RTT (vs 2-RTT in TLS 1.2), uses only forward-secret key exchange (no static RSA), and supports 0-RTT session resumption for known servers.

**Q: How does HTTPS prevent a man-in-the-middle attack?**

The server presents a certificate signed by a trusted Certificate Authority (CA) whose root certificate is pre-installed in the OS/browser trust store. The certificate binds the server's public key to its domain name. An attacker can't forge this certificate without compromising a CA's private key. The client verifies the chain and the domain name match. Even if the attacker intercepts traffic, they can't decrypt it without the server's private key, and can't present a fake cert that browsers will trust.

**Q: What is HSTS and why does it matter?**

HTTP Strict Transport Security tells browsers: for this domain, always use HTTPS, never HTTP, for the next N seconds (typically 1 year). Prevents SSL stripping attacks where an attacker downgrades HTTPS to HTTP on the first request. The `preload` flag adds the domain to browser preload lists — even the very first visit uses HTTPS without a redirect. Browsers store this policy locally.

**Q: Difference between 401 and 403?**

**401 Unauthorized**: not authenticated. The request can be retried with valid credentials. The response should include a `WWW-Authenticate` header indicating how to authenticate. **403 Forbidden**: authenticated but not authorized. The server knows who you are, but you don't have permission for this resource. Retrying with the same credentials won't help.

**Q: What is the Cache-Control header and what do its directives mean?**

Controls caching behavior for responses: `max-age=N` — cache for N seconds; `no-cache` — cache but revalidate before using (conditional GET); `no-store` — never cache; `private` — browser cache only (not CDN/proxy); `public` — any cache may store; `s-maxage` — override max-age for shared caches (CDN); `must-revalidate` — don't serve stale; `immutable` — won't change, skip revalidation.

---

## Routing & NAT

**Q: What is the difference between a router and a switch?**

A switch connects devices on the **same network** using MAC addresses (Layer 2). It learns which MAC is on which port and forwards frames only to the correct port. A router connects **different networks** using IP addresses (Layer 3). It reads the IP destination, looks up its routing table, and forwards the packet to the next hop. Your home device has both: a switch for LAN, a router for WAN connection.

**Q: Explain how NAT works for outbound connections.**

When a private host sends a packet, the NAT device rewrites the source IP from the private address to its own public IP, and maps the original source port to a unique external port. It stores this mapping (private IP:port ↔ public IP:port ↔ remote IP:port) in a NAT table. When the response arrives at the public IP:external port, NAT looks up the mapping and rewrites the destination back to the original private IP:port, then forwards it.

**Q: What is BGP?**

Border Gateway Protocol is the routing protocol of the internet. It's used between Autonomous Systems (AS) — large networks like ISPs, cloud providers, enterprises. Each AS has a unique AS number. BGP routers advertise IP prefixes they can reach. When a packet enters an AS, BGP routing determines which AS to forward to next. It uses path-vector routing (chooses based on AS path, prefix length, policies) rather than shortest-path metrics.

---

## Cloud Networking

**Q: What is a VPC and how is it structured?**

A Virtual Private Cloud is an isolated virtual network in a cloud region. You define a CIDR range (e.g., 10.0.0.0/16). You create subnets within AZs, each with its own sub-CIDR. Public subnets have routes to an Internet Gateway. Private subnets route internet traffic through a NAT Gateway. Security Groups control per-resource traffic. NACLs control per-subnet traffic. VPC Peering or Transit Gateway connects multiple VPCs.

**Q: Security Groups vs NACLs — which would you use for what?**

Use Security Groups as your primary control — they're stateful (return traffic automatic), attached per-resource, support SG-referencing (dynamic, no IP maintenance needed). Use NACLs for subnet-level controls that should apply regardless of individual resource security groups — e.g., explicitly denying specific IPs (possible with NACLs, not SGs which are allow-only), or a second layer of defense. NACLs are stateless so ephemeral ports must be explicitly allowed.

**Q: What is a VPC Endpoint and when would you use it?**

A VPC Endpoint allows private subnet resources to access AWS services (S3, DynamoDB, SQS, etc.) without going through the internet or NAT Gateway. Gateway Endpoints (free, only S3/DynamoDB) add a route table entry. Interface Endpoints create a private ENI in your subnet. Benefits: reduced NAT Gateway costs for high-volume S3/DynamoDB traffic, traffic never leaves AWS network (security), can add resource policies restricting access to specific buckets.

**Q: What is the difference between ALB and NLB?**

ALB (Layer 7): HTTP/HTTPS aware, routes by URL path, host header, query params. Terminates TLS. For web applications. NLB (Layer 4): TCP/UDP, passes raw packets, preserves client IP, static IP per AZ, millions of RPS, microsecond latency. For non-HTTP workloads or when you need static IPs. Use ALB for microservices routing; NLB for game servers, custom protocols, or in front of firewalls.

---

## Troubleshooting Scenarios

**Q: You deploy an app to a private subnet in AWS. It can reach the RDS database but can't pull Docker images from ECR. What's wrong?**

Private subnet has no internet route. Options:
1. Add a NAT Gateway in a public subnet; update private subnet route table `0.0.0.0/0 → nat-xxxx`
2. Add a VPC Interface Endpoint for ECR (`com.amazonaws.region.ecr.api` and `com.amazonaws.region.ecr.dkr`) + S3 Gateway Endpoint (ECR stores layers in S3) — no internet needed, no NAT cost

**Q: A microservice is getting 504 Gateway Timeout from the load balancer. How do you debug?**

1. Check LB health check — is the target healthy?
2. Check target group: is the instance/container responding on the health check path?
3. `curl -v http://internal-ip:port/health` from within the VPC — does the app respond directly?
4. Check app logs for errors/slow queries
5. Check `time_connect` vs `time_ttfb` in curl timing — is it the TCP connect (network/SG) or the response (app)?
6. Check security group: does LB SG have access to app port? Does app SG allow traffic from LB SG?
7. Check if app is timing out internally (DB query, external API call)

**Q: A developer says "DNS is not working" for a new internal service. How do you diagnose?**

```bash
dig internal.company.com          # does it resolve?
dig @your-dns-server internal.company.com  # test specific server
dig +trace internal.company.com   # full resolution chain
cat /etc/resolv.conf               # which resolver? search domains?
```
Check: record created in correct zone? Correct DNS server authoritative for this zone? Split-horizon DNS — internal DNS returns private IP, public DNS returns public? TTL on old record cached? Correct `/etc/resolv.conf` search domain?

---

## Links to Refer

- [Julia Evans — Networking Zines](https://jvns.ca/)
- [Cloudflare Learning Center](https://www.cloudflare.com/learning/)
- [AWS Networking Fundamentals](https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html)
- [Stanford CS 144 — Introduction to Computer Networking](https://cs144.github.io/)
