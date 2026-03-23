# IP Addressing & Subnetting

The most important networking topic for developers and DevOps engineers. Master binary math here once, and everything from AWS VPC design to firewall rules makes sense.

---

## IPv4 Fundamentals

An IPv4 address is **32 bits** written as four **octets** (8 bits each) in dotted-decimal notation.

```
192 . 168 . 1 . 5
 ↑      ↑    ↑   ↑
 8 bits  8   8   8   = 32 bits total
```

### Binary ↔ Decimal Conversion

Each octet position represents a power of 2:

```
Bit position:  128  64  32  16   8   4   2   1
               2⁷  2⁶  2⁵  2⁴  2³  2²  2¹  2⁰

Example: 192
  128 + 64 = 192
  1    1    0   0   0   0   0   0  = 11000000 = 192

Example: 168
  128 + 32 + 8 = 168
  1    0    1   0   1   0   0   0  = 10101000 = 168

Example: 255
  All 1s:
  1    1    1   1   1   1   1   1  = 11111111 = 255

Example: 0
  All 0s:
  0    0    0   0   0   0   0   0  = 00000000 = 0
```

**Quick reference table:**
```
128  = 10000000
192  = 11000000
224  = 11100000
240  = 11110000
248  = 11111000
252  = 11111100
254  = 11111110
255  = 11111111
```

---

## Subnet Mask

A subnet mask is also 32 bits. It defines which part of an IP address is the **network portion** and which is the **host portion**.

```
IP Address:    192.168.1.5
Subnet Mask:   255.255.255.0

In binary:
IP:    11000000.10101000.00000001.00000101
Mask:  11111111.11111111.11111111.00000000
       ←─────── network bits ────────────→←host→

Network:  192.168.1    (first 24 bits)
Host:     .5           (last 8 bits)
```

**Key rule:** Where the mask bit is **1** → network bit. Where it is **0** → host bit.

---

## CIDR Notation (Classless Inter-Domain Routing)

CIDR notation combines the IP address and the number of network bits into one compact form:

```
192.168.1.0/24

/24 = 24 ones in the mask = 255.255.255.0

10.0.0.0/8    → mask = 255.0.0.0       (8 network bits,  24 host bits)
172.16.0.0/12 → mask = 255.240.0.0     (12 network bits, 20 host bits)
192.168.1.0/24 → mask = 255.255.255.0  (24 network bits,  8 host bits)
192.168.1.0/30 → mask = 255.255.255.252 (30 network bits, 2 host bits)
```

### CIDR to Mask Cheatsheet

| CIDR | Subnet Mask | Hosts per subnet |
|---|---|---|
| /8  | 255.0.0.0 | 16,777,214 |
| /16 | 255.255.0.0 | 65,534 |
| /24 | 255.255.255.0 | 254 |
| /25 | 255.255.255.128 | 126 |
| /26 | 255.255.255.192 | 62 |
| /27 | 255.255.255.224 | 30 |
| /28 | 255.255.255.240 | 14 |
| /29 | 255.255.255.248 | 6 |
| /30 | 255.255.255.252 | 2 |
| /31 | 255.255.255.254 | 2 (point-to-point, RFC 3021) |
| /32 | 255.255.255.255 | 1 (single host route) |

**Formula:**
- Total addresses in subnet = 2^(32 - prefix)
- Usable hosts = 2^(32 - prefix) - 2  (subtract network + broadcast)

---

## Network Address, Broadcast, Host Range

Given an IP and prefix, you can calculate the three key values:

### Step-by-step: `192.168.1.130/26`

**Step 1: Write the mask**
```
/26 = 11111111.11111111.11111111.11000000 = 255.255.255.192
```

**Step 2: Find the network address** (AND the IP with the mask)
```
IP:     11000000.10101000.00000001.10000010  (192.168.1.130)
Mask:   11111111.11111111.11111111.11000000  (255.255.255.192)
AND:    11000000.10101000.00000001.10000000  = 192.168.1.128

Network Address = 192.168.1.128
```

**Step 3: Find the broadcast address** (set all host bits to 1)
```
Network:   11000000.10101000.00000001.10000000
Host bits:                              ??????  ← last 6 bits (32-26=6)
Broadcast: 11000000.10101000.00000001.10111111 = 192.168.1.191

Broadcast Address = 192.168.1.191
```

**Step 4: Host range**
```
First host = Network + 1 = 192.168.1.129
Last host  = Broadcast - 1 = 192.168.1.190
Total usable hosts = 2^6 - 2 = 62
```

**Summary:**
```
Network:    192.168.1.128
First host: 192.168.1.129
Last host:  192.168.1.190
Broadcast:  192.168.1.191
Hosts:      62
```

---

## Quick Subnet Calculation Method

For a /26 on any Class C address (e.g. 192.168.1.x):

1. **Block size** = 256 - interesting octet of mask = 256 - 192 = **64**
2. **Subnets start at:** 0, 64, 128, 192
3. **Find which subnet** 130 falls in: 128 ≤ 130 < 192 → subnet is **192.168.1.128/26**
4. **Broadcast:** next subnet - 1 = 192 - 1 = 191

This method (block size = 256 - mask octet) works for any prefix ≥ /24.

---

## Subnetting Examples

### Divide 192.168.10.0/24 into 4 equal subnets

We need 4 subnets. 2^2 = 4, so borrow 2 bits → /26.

```
Block size = 256 - 192 = 64

Subnet 1: 192.168.10.0/26    hosts: .1 – .62    broadcast: .63
Subnet 2: 192.168.10.64/26   hosts: .65 – .126  broadcast: .127
Subnet 3: 192.168.10.128/26  hosts: .129 – .190 broadcast: .191
Subnet 4: 192.168.10.192/26  hosts: .193 – .254 broadcast: .255
```

### Divide 10.0.0.0/8 into subnets of exactly 1022 hosts

Need ≥ 1024 host addresses → 2^10 = 1024 → host bits = 10 → /22

```
10.0.0.0/22   → 10.0.0.0   – 10.0.3.255   (hosts .1 – .3.254)
10.0.4.0/22   → 10.0.4.0   – 10.0.7.255
10.0.8.0/22   → 10.0.8.0   – 10.0.11.255
...
Total /22 subnets in /8 = 2^(22-8) = 2^14 = 16,384 subnets
```

---

## IPv4 Address Classes (Historical)

Before CIDR, addresses were divided into classes. Still appears in interviews.

| Class | First octet range | Default mask | Network bits | Typical use |
|---|---|---|---|---|
| A | 1–126 | /8 (255.0.0.0) | 8 | Large orgs (16M hosts) |
| B | 128–191 | /16 (255.255.0.0) | 16 | Medium orgs (65K hosts) |
| C | 192–223 | /24 (255.255.255.0) | 24 | Small orgs (254 hosts) |
| D | 224–239 | N/A | — | Multicast |
| E | 240–255 | N/A | — | Reserved/experimental |

**Note:** 127.x.x.x is reserved for loopback (127.0.0.1 = localhost). It's not Class A in practical use.

---

## Private IP Ranges (RFC 1918)

These ranges are **not routable on the public internet** — used inside private networks (home, office, cloud VPCs).

| Range | CIDR | Class | Addresses |
|---|---|---|---|
| 10.0.0.0 – 10.255.255.255 | 10.0.0.0/8 | A | 16,777,216 |
| 172.16.0.0 – 172.31.255.255 | 172.16.0.0/12 | B | 1,048,576 |
| 192.168.0.0 – 192.168.255.255 | 192.168.0.0/16 | C | 65,536 |

**Other special ranges:**
```
127.0.0.0/8    — Loopback (127.0.0.1 = localhost)
169.254.0.0/16 — Link-local (APIPA — assigned when DHCP fails)
0.0.0.0/0      — Default route (all traffic)
255.255.255.255 — Limited broadcast
```

---

## Variable Length Subnet Masking (VLSM)

VLSM lets you divide a network into **unequal-sized** subnets to minimize wasted IPs.

### Example: Allocate 192.168.1.0/24 for:
- **LAN A**: 100 hosts
- **LAN B**: 50 hosts
- **LAN C**: 25 hosts
- **WAN links**: 2 hosts each (×2 links)

**Strategy: Allocate largest first.**

**LAN A (100 hosts):** Need 2^7 = 128 → /25
```
192.168.1.0/25   → .0 – .127    (126 usable)
```

**LAN B (50 hosts):** Need 2^6 = 64 → /26
```
192.168.1.128/26 → .128 – .191  (62 usable)
```

**LAN C (25 hosts):** Need 2^5 = 32 → /27
```
192.168.1.192/27 → .192 – .223  (30 usable)
```

**WAN link 1 (2 hosts):** /30
```
192.168.1.224/30 → .224 – .227  (2 usable: .225, .226)
```

**WAN link 2 (2 hosts):** /30
```
192.168.1.228/30 → .228 – .231  (2 usable: .229, .230)
```

**Result:** Used 232/256 addresses. Much more efficient than /24 blocks for each.

---

## Supernetting (Route Summarization / Aggregation)

The reverse of subnetting — combine multiple subnets into one CIDR block to reduce routing table entries.

### Can these be summarized?
```
192.168.0.0/24
192.168.1.0/24
192.168.2.0/24
192.168.3.0/24
```

Write the third octets in binary:
```
0 = 00000000
1 = 00000001
2 = 00000010
3 = 00000011
    000000  ← 6 bits match
```

Common bits: 22 (16 from first two octets + 6 from third). Result: **192.168.0.0/22**

This single /22 route covers all four /24s — advertise one route instead of four.

---

## IPv6 Fundamentals

IPv6 uses **128-bit** addresses, written as eight groups of four hex digits.

```
2001:0db8:85a3:0000:0000:8a2e:0370:7334

Shortening rules:
1. Drop leading zeros in each group:
   2001:db8:85a3:0:0:8a2e:370:7334

2. Replace one (longest) run of consecutive all-zero groups with :::
   2001:db8:85a3::8a2e:370:7334
```

### IPv6 Special Addresses

```
::1             — Loopback (equivalent to 127.0.0.1)
::              — Unspecified (0.0.0.0)
fe80::/10       — Link-local (auto-assigned, not routable)
fc00::/7        — Unique local (private, like RFC 1918)
2000::/3        — Global unicast (public internet)
ff00::/8        — Multicast
```

### IPv6 Subnet Size

A /48 is given to each organization. A /64 is a standard subnet.

```
/48  = organization prefix (65,536 possible /64 subnets)
/64  = single subnet (18 quintillion host addresses)
/128 = single host
```

IPv6 eliminates NAT — every device can have a globally routable address.

---

## Subnetting in Python

```python
import ipaddress

# Parse a network
net = ipaddress.ip_network("192.168.1.0/26", strict=True)
print(net.network_address)    # 192.168.1.0
print(net.broadcast_address)  # 192.168.1.63
print(net.netmask)            # 255.255.255.192
print(net.num_addresses)      # 64
print(list(net.hosts())[:3])  # [192.168.1.1, 192.168.1.2, 192.168.1.3]

# Check if an IP is in a subnet
ip = ipaddress.ip_address("192.168.1.45")
print(ip in net)              # True

# Subnet a /24 into four /26s
parent = ipaddress.ip_network("192.168.10.0/24")
for subnet in parent.subnets(new_prefix=26):
    print(subnet)
# 192.168.10.0/26
# 192.168.10.64/26
# 192.168.10.128/26
# 192.168.10.192/26

# Supernet
a = ipaddress.ip_network("192.168.0.0/24")
b = ipaddress.ip_network("192.168.1.0/24")
print(a.supernet())           # 192.168.0.0/23

# Summarize a list of networks
networks = list(ipaddress.collapse_addresses([
    ipaddress.ip_network("192.168.0.0/24"),
    ipaddress.ip_network("192.168.1.0/24"),
    ipaddress.ip_network("192.168.2.0/24"),
    ipaddress.ip_network("192.168.3.0/24"),
]))
print(networks)  # [IPv4Network('192.168.0.0/22')]
```

---

## Interview Q&A

**Q: What is the difference between a subnet mask and a CIDR prefix?**

They represent the same thing differently. `255.255.255.0` and `/24` both mean "the first 24 bits are the network portion." CIDR notation is more compact and supports variable-length prefixes (VLSM), which classful subnet masks originally didn't.

**Q: What is the network address and broadcast address used for?**

- **Network address** (all host bits = 0): identifies the subnet itself. Not assignable to hosts. Used in routing tables.
- **Broadcast address** (all host bits = 1): a packet sent to this address reaches every host in the subnet. Not assignable.

That's why the usable host count is `2^n - 2` (subtract these two).

**Q: A host has IP 10.20.30.40/22. What is its subnet?**

/22 → mask = 255.255.252.0. Interesting octet is third (252). Block size = 256 - 252 = 4. Third octet 30 → which block? 28, 32... 28 ≤ 30 < 32. Network = **10.20.28.0/22**. Broadcast = 10.20.31.255.

**Q: Why do we use /30 for point-to-point WAN links?**

A /30 gives exactly 4 addresses: network, host1, host2, broadcast — 2 usable. No waste. You could use /31 (RFC 3021, only 2 addresses, no dedicated broadcast) on modern routers, but /30 is more universally compatible.

**Q: Explain the difference between 0.0.0.0/0 and 0.0.0.0.**

- `0.0.0.0` as an IP: means "any/unspecified" address — a server binding to `0.0.0.0` listens on all interfaces
- `0.0.0.0/0` as a route: the **default route** — matches any destination IP. The "last resort" entry in a routing table

**Q: What is a /32 route?**

A host route — covers exactly one IP address. Used to inject a specific host into a routing table (e.g., a loopback IP on a router, or a virtual IP on a load balancer).

---

## Quick Reference — Subnet Math at a Glance

```
Given: IP/prefix
─────────────────────────────────────────────
1. Mask = first (prefix) bits set to 1
2. Network = IP AND mask
3. Broadcast = network OR (NOT mask)
4. First host = network + 1
5. Last host = broadcast - 1
6. Hosts = 2^(32-prefix) - 2
```

---

## Links to Refer

- [Subnet Calculator](https://www.subnet-calculator.com/)
- [CIDR.xyz — visual CIDR explorer](https://cidr.xyz/)
- [RFC 1918 — Private Address Space](https://datatracker.ietf.org/doc/html/rfc1918)
- [RFC 4291 — IPv6 Addressing](https://datatracker.ietf.org/doc/html/rfc4291)
- [Professor Messer Subnetting](https://www.professormesser.com/network-plus/n10-008/n10-008-video/subnetting-n10-008/)
