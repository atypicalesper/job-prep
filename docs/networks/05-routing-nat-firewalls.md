# Routing, NAT & Firewalls

How packets find their way across networks, how private IPs reach the internet, and how firewalls control what's allowed.

---

## Routing

**Routing** is the process of forwarding packets from source to destination across one or more networks, making hop-by-hop decisions based on IP destination addresses.

### Routing Table

Every router and host has a routing table — a list of network prefixes and where to send packets for each.

```bash
# Linux
ip route show
# or
route -n

# macOS
netstat -rn
```

Example routing table:
```
Destination     Gateway         Genmask         Iface
0.0.0.0         192.168.1.1     0.0.0.0         eth0   ← default route
192.168.1.0     0.0.0.0         255.255.255.0   eth0   ← local network
10.0.0.0        10.8.0.1        255.0.0.0       tun0   ← VPN
172.16.0.0      192.168.1.254   255.240.0.0     eth0   ← static route
```

**Longest prefix match**: router picks the most specific matching route.

```
Packet to: 192.168.1.55
  Match: 192.168.1.0/24 → local (more specific)
  Match: 0.0.0.0/0 → default route (less specific)
  → Takes 192.168.1.0/24 (longer prefix wins)
```

### Default Route (Default Gateway)

`0.0.0.0/0` — matches everything. Used when no more specific route exists. Packets for unknown destinations are forwarded to the default gateway (usually your router/ISP edge).

```
Your machine (192.168.1.10)
    → default gateway: 192.168.1.1 (your router)
        → ISP router
            → internet
```

### Static Routing

Manually configured routes. Simple but doesn't adapt to failures.

```bash
# Add static route (Linux)
ip route add 10.10.0.0/16 via 192.168.1.254
ip route add default via 192.168.1.1

# Delete
ip route del 10.10.0.0/16
```

### Dynamic Routing Protocols

Routers exchange reachability information automatically.

| Protocol | Type | Use Case |
|---|---|---|
| **RIP** | Distance-vector, hop count | Legacy, small networks |
| **OSPF** | Link-state, cost metric | Enterprise intranets |
| **EIGRP** | Cisco hybrid | Cisco enterprise |
| **BGP** | Path-vector, AS paths | Internet backbone (ISPs) |

**BGP (Border Gateway Protocol)** is the protocol of the internet. Every ISP, cloud provider, and large company has an AS (Autonomous System) number and exchanges BGP routes with peers.

```
AS1 (Comcast)  ←BGP→  AS2 (AWS)  ←BGP→  AS3 (Cloudflare)
```

When you traceroute across the internet, each hop is typically a different AS.

---

## ARP — Address Resolution Protocol

Before sending a frame on a LAN, your machine needs the destination's **MAC address**. If it only knows the IP, it uses ARP.

```
Host A (192.168.1.10)  wants to send to  192.168.1.20

1. ARP Broadcast:
   "Who has 192.168.1.20? Tell 192.168.1.10"
   (dst MAC: FF:FF:FF:FF:FF:FF — all devices on LAN see this)

2. ARP Reply (unicast):
   "192.168.1.20 is at aa:bb:cc:dd:ee:ff"

3. Host A caches: 192.168.1.20 → aa:bb:cc:dd:ee:ff (ARP cache)
4. Host A sends frame directly to that MAC
```

```bash
arp -a              # view ARP cache
arp -d 192.168.1.20 # delete entry
```

**ARP spoofing/poisoning**: attacker sends fake ARP replies, associating their MAC with a legitimate IP → all traffic to that IP goes to attacker. Basis of many LAN MITM attacks. Mitigated by Dynamic ARP Inspection on managed switches.

---

## NAT — Network Address Translation

NAT allows multiple devices with private IPs to share one public IP. It's why your home network can have 50 devices but only one public IP from your ISP.

### Why NAT Exists

IPv4 has ~4.3 billion addresses. The internet has billions of devices. Solution: RFC 1918 private addresses (10.x.x.x, 172.16–31.x.x, 192.168.x.x) are routable only within a private network, not on the public internet. NAT translates between them at the border.

### SNAT — Source NAT (Masquerading)

Outbound traffic from private → public internet. Your router modifies the source IP of outgoing packets.

```
Your machine:         192.168.1.10:54231 → 93.184.216.34:443
Your router rewrites: 203.0.113.5:41000  → 93.184.216.34:443 (SNAT)
                       ↑ your public IP

Response comes back:  93.184.216.34:443  → 203.0.113.5:41000
Router translates:    93.184.216.34:443  → 192.168.1.10:54231 (un-NAT)
```

The router maintains a **NAT translation table**:

```
Internal IP:Port        External IP:Port       Remote IP:Port
192.168.1.10:54231  ↔  203.0.113.5:41000  ↔  93.184.216.34:443
192.168.1.11:62001  ↔  203.0.113.5:41001  ↔  8.8.8.8:53
```

This is **PAT (Port Address Translation)** or "NAT overload" — multiple internal IPs mapped to one external IP using different ports.

### DNAT — Destination NAT (Port Forwarding)

Inbound traffic from internet → specific internal host. Used for hosting services behind NAT.

```
External request: 203.0.113.5:80
Router DNAT rule: :80 → 192.168.1.100:80
Router forwards:  192.168.1.100:80

# iptables equivalent
iptables -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to-destination 192.168.1.100:80
```

### NAT Problems

- **Breaks end-to-end connectivity** — two NAT'd devices can't connect directly without a relay (STUN/TURN for WebRTC)
- **Stateful** — NAT table must be maintained; connection tracking uses memory
- **Protocol issues** — protocols that embed IP addresses in payload (FTP, SIP) need special ALG (Application Layer Gateway) support
- **IPv6** — designed to eliminate NAT need (enough addresses for every device)

---

## Firewalls

Firewalls control which network traffic is allowed or denied.

### Packet Filtering (Stateless)

Inspects each packet independently: source/dest IP, port, protocol. No memory of connections.

```
iptables -A INPUT -p tcp --dport 22 -s 10.0.0.0/8 -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j DROP
# Allow SSH from 10.x.x.x, drop from everywhere else
```

**Problem**: can't distinguish a new connection from an established one. Hard to allow replies to outbound connections without allowing all inbound.

### Stateful Inspection

Tracks connection state. Allows inbound packets that belong to established outbound connections.

```
State machine per connection:
  NEW        — first packet of a connection
  ESTABLISHED — part of known connection
  RELATED    — related to a known connection (e.g., FTP data channel)
  INVALID    — doesn't match any known connection
```

```bash
# iptables stateful rules
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -m state --state NEW -p tcp --dport 443 -j ACCEPT
iptables -A INPUT -j DROP
```

### Application Layer Firewall (L7)

Understands application protocols (HTTP, DNS, TLS). Can:
- Block specific URLs or domains
- Inspect TLS (with certificate interception)
- Detect application-layer attacks (SQL injection, XSS in HTTP)
- Apply different rules to different apps

Used in next-generation firewalls (NGFW), WAFs (Web Application Firewalls).

### iptables / nftables (Linux)

```
Tables → Chains → Rules

Tables:
  filter  — default, packet filtering
  nat     — NAT (PREROUTING, POSTROUTING)
  mangle  — packet modification
  raw     — connection tracking bypass

Chains:
  INPUT    — packets for this host
  OUTPUT   — packets from this host
  FORWARD  — packets routed through this host
  PREROUTING  — before routing decision
  POSTROUTING — after routing decision
```

```bash
# View rules
iptables -L -n -v
iptables -t nat -L -n -v

# Default policies
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT

# Allow established
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow SSH
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# Allow HTTP/HTTPS
iptables -A INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT

# Rate limit (brute force protection)
iptables -A INPUT -p tcp --dport 22 -m recent --set --name SSH
iptables -A INPUT -p tcp --dport 22 -m recent --update --seconds 60 --hitcount 4 --name SSH -j DROP
```

### Security Groups (Cloud)

Cloud firewalls (AWS Security Groups, GCP Firewall Rules) work like stateful packet filters at the VM level:

```
Inbound rules:
  Port 80    TCP  0.0.0.0/0    ← HTTP from anywhere
  Port 443   TCP  0.0.0.0/0    ← HTTPS from anywhere
  Port 22    TCP  10.0.0.0/8   ← SSH from internal only
  Port 5432  TCP  sg-app-tier  ← Postgres from app servers only

Outbound rules:
  All traffic  0.0.0.0/0       ← allow all outbound (default)
```

**Stateful**: return traffic for allowed inbound is automatically allowed.

---

## ICMP — Internet Control Message Protocol

ICMP carries control messages at Layer 3. Not a user data protocol — used by network infrastructure.

| Type | Code | Meaning |
|---|---|---|
| 0 | 0 | Echo Reply (ping response) |
| 3 | 0–15 | Destination Unreachable |
| 3 | 3 | Port Unreachable |
| 8 | 0 | Echo Request (ping) |
| 11 | 0 | TTL Exceeded (traceroute) |

### ping

```bash
ping google.com           # send ICMP echo requests
ping -c 4 8.8.8.8         # 4 packets only
ping -s 1400 192.168.1.1  # specify packet size
```

### traceroute

Exploits TTL field. Each router decrements TTL by 1. When TTL hits 0, router sends back ICMP "Time Exceeded". Traceroute sends packets with TTL=1, 2, 3, ... to reveal each hop.

```bash
traceroute google.com       # Linux/macOS (uses UDP by default)
traceroute -T google.com    # use TCP (bypasses some firewalls)
tracert google.com          # Windows

Example output:
 1  192.168.1.1      1.2 ms    ← your router
 2  10.0.0.1         5.4 ms    ← ISP
 3  72.14.209.1      8.1 ms    ← Google peering point
 4  142.251.52.69   10.3 ms    ← Google backbone
 5  google.com      11.2 ms
```

`* * *` means that hop doesn't respond to ICMP (firewalled), not necessarily that the packet isn't forwarded.

---

## VPN — Virtual Private Network

Creates an encrypted tunnel between client and VPN server. Traffic appears to originate from VPN server's IP.

### Site-to-Site VPN

Connects two networks (e.g., office ↔ AWS VPC):

```
Office LAN (10.0.0.0/24) ←── encrypted tunnel ──→ AWS VPC (172.16.0.0/16)
```

### Remote Access VPN

Client connects to corporate network:

```
Laptop (public IP) → VPN tunnel → Corporate network (10.x.x.x)
```

### WireGuard

Modern VPN protocol, simple and fast:

```ini
# /etc/wireguard/wg0.conf (server)
[Interface]
Address = 10.8.0.1/24
ListenPort = 51820
PrivateKey = <server-private-key>

[Peer]
PublicKey = <client-public-key>
AllowedIPs = 10.8.0.2/32

# Client config
[Interface]
Address = 10.8.0.2/24
PrivateKey = <client-private-key>
DNS = 1.1.1.1

[Peer]
PublicKey = <server-public-key>
Endpoint = server.example.com:51820
AllowedIPs = 0.0.0.0/0  # route all traffic through VPN
```

---

## Common Interview Questions

**Q: What is a default gateway and what happens if it's misconfigured?**

The default gateway is the router IP that your machine sends packets to when the destination is not on the local subnet. It's the "exit door" to other networks. If misconfigured (wrong IP, unreachable), your machine can communicate with local devices (same subnet) but can't reach anything external — internet and remote services fail. Symptoms: ping LAN devices works, ping 8.8.8.8 fails.

**Q: How does NAT work for outbound connections?**

When a host sends a packet out, the NAT device (router) modifies the source IP from the private IP to its public IP, and records the mapping (private IP:port ↔ public IP:port ↔ remote IP:port) in a NAT table. When the response arrives, it looks up the destination port in the NAT table, rewrites the destination IP:port back to the private address, and forwards inbound. The external server only ever sees the public IP.

**Q: What is the difference between a stateful and stateless firewall?**

A stateless firewall evaluates each packet independently based on source/dest IP, port, and protocol. It can't distinguish between a new connection and an established one. A stateful firewall tracks connection state — it knows which TCP connections are established, so it can allow reply packets without needing an explicit inbound rule. Stateful firewalls are safer (less rule complexity, harder to bypass with spoofed packets) but use more memory.

**Q: Why can't two devices behind different NATs connect directly?**

Both devices only have private IPs. Neither can be a server that the other connects to, because packets sent to a private IP are dropped at the internet — they're not routable. Solutions: STUN (discovers public IP/port from an external server), then direct connection if one NAT allows it; TURN (relay server if both NATs block direct); or a relay/rendezvous server. WebRTC uses both for P2P video/audio.

---

## Links to Refer

- [iptables Tutorial](https://www.frozentux.net/iptables-tutorial/iptables-tutorial.html)
- [Cloudflare — What is NAT?](https://www.cloudflare.com/learning/network-layer/what-is-nat/)
- [WireGuard Whitepaper](https://www.wireguard.com/papers/wireguard.pdf)
- [RFC 1918 — Private IP Ranges](https://datatracker.ietf.org/doc/html/rfc1918)
