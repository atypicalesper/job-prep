# Network Troubleshooting

A systematic toolkit for diagnosing network issues — from "can't reach the server" to "why is this API slow."

---

## The OSI Troubleshooting Approach

Start at Layer 1, work up. Most issues are at L3–L7 in cloud/dev contexts, but the discipline matters.

```
L7 — Application  Is the app returning the right response?
L6 — Presentation Is TLS valid? Encoding correct?
L5 — Session      Is the session established/maintained?
L4 — Transport    Can I connect to the port? TCP handshake OK?
L3 — Network      Can I reach the IP? Route correct?
L2 — Data Link    Is the interface up? ARP resolving?
L1 — Physical     Is the cable plugged in? Wi-Fi connected?
```

---

## Core Tools

### ping — ICMP reachability

```bash
ping google.com           # continuous (Ctrl+C to stop)
ping -c 4 8.8.8.8         # 4 packets
ping -i 0.2 google.com    # 200ms interval
ping6 google.com          # IPv6

# Output:
64 bytes from 142.250.80.46: icmp_seq=1 ttl=117 time=12.3 ms
64 bytes from 142.250.80.46: icmp_seq=2 ttl=117 time=11.8 ms
# ttl=117 → started at 128, 11 hops
# time → round-trip latency
```

**Ping success ≠ port open**. A host can respond to ICMP while blocking TCP 80.
**Ping fail ≠ host down**. Many servers/firewalls drop ICMP.

---

### traceroute / tracert — path discovery

```bash
traceroute google.com        # UDP (default on Linux)
traceroute -T google.com     # TCP SYN (bypasses more firewalls)
traceroute -I google.com     # ICMP
traceroute -p 443 google.com # specific port
tracert google.com           # Windows

# Output:
 1  192.168.1.1 (192.168.1.1)  1.245 ms  1.108 ms  0.989 ms
 2  10.0.0.1 (10.0.0.1)  5.432 ms  5.211 ms  5.398 ms
 3  * * *                  ← ICMP blocked at this hop (still forwarding)
 4  72.14.209.1  8.123 ms  7.989 ms  8.245 ms
 5  google.com  10.456 ms
```

**Interpreting `* * *`**: that hop doesn't respond to probe packets, but it may still be forwarding. If later hops respond, the `* * *` hop is just filtering — not a break.

**High latency at one hop**: check if it persists to subsequent hops. If later hops are fast, the problem hop is just deprioritizing ICMP responses (normal).

---

### dig / nslookup — DNS

```bash
# dig (preferred on Linux/macOS)
dig google.com                    # A record
dig google.com AAAA               # IPv6
dig google.com MX                 # mail servers
dig google.com NS                 # name servers
dig google.com TXT                # text records (SPF, DKIM)
dig +short google.com             # just the IP(s)
dig @8.8.8.8 google.com           # use specific resolver
dig @1.1.1.1 google.com +short    # Cloudflare resolver
dig +trace google.com             # follow the full delegation chain
dig -x 142.250.80.46              # reverse DNS (PTR)
dig google.com +noall +answer     # just the answer section

# nslookup (cross-platform, simpler)
nslookup google.com
nslookup google.com 8.8.8.8       # use 8.8.8.8 as resolver
nslookup -type=MX google.com
```

**Debugging DNS issues**:

```bash
# 1. Check what resolver you're using
cat /etc/resolv.conf     # Linux
scutil --dns             # macOS

# 2. Compare local resolver vs public
dig @127.0.0.1 internal.company.com   # local
dig @8.8.8.8 internal.company.com     # public (shouldn't resolve)

# 3. Check TTL (how long until record refreshes)
dig +nocmd +noall +answer +ttlid google.com
# 3600 = cached for 1 hour

# 4. Flush DNS cache
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder  # macOS
sudo systemd-resolve --flush-caches  # Linux (systemd)
ipconfig /flushdns                   # Windows
```

---

### curl — HTTP testing

```bash
# Basic request
curl https://example.com

# Verbose (headers, TLS, timing)
curl -v https://example.com
curl -vvv https://example.com  # even more verbose

# Headers only
curl -I https://example.com  # HEAD request
curl -D - https://example.com  # dump response headers

# Custom headers + body
curl -X POST https://api.example.com/data \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer token123' \
  -d '{"key": "value"}'

# Follow redirects
curl -L https://example.com

# Timing breakdown
curl -o /dev/null -s -w "\
  dns:        %{time_namelookup}s\n\
  tcp:        %{time_connect}s\n\
  tls:        %{time_appconnect}s\n\
  ttfb:       %{time_starttransfer}s\n\
  total:      %{time_total}s\n\
  http_code:  %{http_code}\n" https://example.com

# DNS time:        0.020s
# TCP connect:     0.045s
# TLS handshake:   0.120s
# Time to first byte: 0.180s
# Total:           0.210s

# Test specific IP (bypass DNS)
curl --resolve example.com:443:1.2.3.4 https://example.com

# Test with HTTP/2
curl --http2 -v https://example.com

# Certificate info
curl -v --no-progress-meter https://example.com 2>&1 | grep -A20 'Certificate'

# Ignore TLS errors (NEVER in production)
curl -k https://self-signed.example.com
```

---

### netstat / ss — connections & ports

```bash
# ss (modern, faster, Linux)
ss -tuln          # listening ports (TCP+UDP, numeric)
ss -tnp           # TCP connections with process names
ss -s             # summary statistics
ss -tan state established  # only established TCP

# netstat (classic, cross-platform)
netstat -an       # all connections, numeric
netstat -tlnp     # listening TCP + PIDs (Linux)
netstat -rn       # routing table
netstat -s        # protocol statistics

# macOS
netstat -anv      # verbose
lsof -i :3000     # what's using port 3000
lsof -i tcp       # all TCP connections

# Find what's using a port
ss -tlnp | grep :443
lsof -i :443
fuser 443/tcp     # Linux
```

```bash
# Check if port is open on remote host
nc -zv google.com 443       # TCP connection test
nc -zvu google.com 53       # UDP
nc -w 3 -zv 10.0.0.5 22     # timeout after 3s

# Telnet alternative
telnet example.com 80
# Then type: GET / HTTP/1.0\n\n
```

---

### tcpdump — packet capture

```bash
# Capture all traffic on interface
tcpdump -i eth0

# Capture HTTP traffic
tcpdump -i eth0 port 80 -A   # -A = print as ASCII

# Capture TCP on 443 to specific host
tcpdump -i eth0 tcp and port 443 and host 8.8.8.8

# Save to file for Wireshark
tcpdump -i eth0 -w capture.pcap

# Read from file
tcpdump -r capture.pcap

# Filter by network
tcpdump -i eth0 net 192.168.1.0/24

# DNS queries only
tcpdump -i eth0 port 53 -v

# Show packet contents in hex+ASCII
tcpdump -i eth0 -XX port 80 host example.com

# Common filters:
#   host 1.2.3.4          — from/to this IP
#   src 1.2.3.4           — from this IP only
#   dst 1.2.3.4           — to this IP only
#   port 80               — TCP or UDP port 80
#   tcp                   — TCP only
#   'tcp[tcpflags] & tcp-syn != 0'  — SYN packets only
```

---

### nmap — port scanning

```bash
# Scan common ports
nmap google.com

# Scan specific ports
nmap -p 80,443,8080 google.com

# Scan range
nmap -p 1-1000 192.168.1.1

# Detect services/versions
nmap -sV 192.168.1.1

# OS detection
nmap -O 192.168.1.1

# Fast scan (top 100 ports)
nmap -F 192.168.1.0/24

# Stealth SYN scan
nmap -sS 192.168.1.1

# UDP scan (slower)
nmap -sU -p 53,67,161 192.168.1.1
```

**Only scan hosts you have permission to scan**.

---

### Wireshark — packet analysis (GUI)

Graphical packet capture/analysis. Open `capture.pcap` from tcpdump, or capture live.

Useful display filters:
```
http                           # all HTTP
http.request.method == "POST"  # HTTP POSTs
dns                            # DNS
tcp.flags.syn == 1             # TCP SYN packets
ip.addr == 192.168.1.10        # packets to/from IP
tcp.port == 443                # TCP 443
ssl.handshake.type == 1        # TLS ClientHello
```

Follow TCP Stream: right-click a packet → Follow → TCP Stream. Shows entire conversation in human-readable form.

---

## Systematic Troubleshooting Workflows

### "I can't reach the server"

```
1. Can you ping the server?
   YES → L3 reachable, issue is L4-L7
   NO  → check L1-L3

2. If NO ping:
   a. ping your gateway (192.168.1.1)?
      NO  → local issue: cable, Wi-Fi, NIC
      YES → routing issue between you and server
   b. traceroute → where does it stop?

3. If YES ping but can't connect:
   a. nc -zv server 443 → port open?
      NO  → firewall blocking, service not running, wrong port
      YES → L4 OK, issue is L5-L7 (TLS, app)
   b. curl -v https://server → TLS error? App error?

4. Check DNS separately:
   dig +short server.example.com
   If wrong IP → DNS issue (caching, wrong record)
```

### "The API is slow"

```
curl timing breakdown:
  dns:  0.020s → normal (< 100ms ok)
  tcp:  0.200s → HIGH (normally < 50ms local, < 150ms cross-region)
  tls:  0.400s → ok-ish (50-200ms normal)
  ttfb: 2.100s → HIGH ← server processing slow
  total: 2.1s

Interpretation:
  High DNS  → resolver slow, consider 8.8.8.8 or local caching
  High TCP  → network congestion or geographic distance
  High TLS  → TLS 1.2 vs 1.3, OCSP stapling, session resumption
  High TTFB → server slow: DB query, external API call, CPU bound
```

### "SSL certificate error"

```bash
# Check certificate details
openssl s_client -connect example.com:443 -servername example.com

# Check expiry
echo | openssl s_client -connect example.com:443 2>/dev/null | \
  openssl x509 -noout -dates

# Check full chain
openssl s_client -connect example.com:443 -showcerts 2>/dev/null | \
  openssl x509 -noout -text | grep -A2 "Subject:"

# Common issues:
# - Expired certificate
# - Wrong hostname (CN mismatch)
# - Incomplete chain (intermediate CA missing)
# - Self-signed cert not trusted
# - TLS version mismatch
```

### "Connection refused vs timeout"

```
Connection refused (ECONNREFUSED):
  → Host reachable, port closed
  → Service not running, or listening on wrong interface (127.0.0.1 vs 0.0.0.0)
  → Firewall rejecting (RST packet sent back)

Connection timeout:
  → Packet dropped, no response
  → Firewall silently dropping
  → Host unreachable / wrong IP
  → Routing issue (packet going to wrong place)

Distinguish: nc -w 3 -zv host port
  → "Connection refused" immediately = ECONNREFUSED
  → hangs for 3s then "timed out" = timeout
```

---

## Linux Network Configuration

```bash
# View interfaces
ip addr show         # or: ip a
ip link show

# View routes
ip route show        # or: ip r
ip route get 8.8.8.8  # which route would be used?

# Add/delete IP
ip addr add 192.168.1.100/24 dev eth0
ip addr del 192.168.1.100/24 dev eth0

# Bring interface up/down
ip link set eth0 up
ip link set eth0 down

# Add/delete route
ip route add 10.0.0.0/8 via 192.168.1.254
ip route del 10.0.0.0/8

# DNS configuration
cat /etc/resolv.conf
# nameserver 8.8.8.8
# nameserver 1.1.1.1
# search internal.company.com

# /etc/hosts — override DNS locally
echo "127.0.0.1 myapp.local" >> /etc/hosts
```

---

## Node.js Network Debugging

```javascript
// Increase http agent concurrency (default: 5)
import http from 'http';
const agent = new http.Agent({ maxSockets: 50 });

// Debug DNS resolution
import dns from 'dns';
dns.resolve4('example.com', (err, addresses) => {
  console.log(addresses);
});

// Log all requests (debugging)
import https from 'https';
const originalRequest = https.request;
https.request = function(...args) {
  console.log('HTTPS request:', args[0]);
  return originalRequest.apply(this, args);
};

// Check ETIMEDOUT vs ECONNREFUSED vs ENOTFOUND
fetch('https://example.com')
  .catch(err => {
    // err.cause.code:
    // ENOTFOUND   → DNS failed
    // ECONNREFUSED → port closed
    // ETIMEDOUT   → no response
    // ECONNRESET  → connection dropped mid-way
    console.error(err.cause?.code);
  });
```

---

## Common Error Codes

| Code | Meaning | Likely Cause |
|---|---|---|
| `ECONNREFUSED` | Connection refused | Port closed, service down |
| `ETIMEDOUT` | Connection timed out | Firewall dropping, host unreachable |
| `ENOTFOUND` | DNS lookup failed | Wrong hostname, DNS down |
| `ECONNRESET` | Connection reset by peer | Server closed connection mid-transfer |
| `EHOSTUNREACH` | No route to host | Routing issue, interface down |
| `EADDRINUSE` | Address already in use | Port taken by another process |
| `EPIPE` | Broken pipe | Writing to closed socket |
| `SSL_ERROR_RX_RECORD_TOO_LONG` | SSL handshake failed | Connecting to HTTP port with HTTPS |

---

## Quick Reference Cheatsheet

```bash
# Is host reachable?
ping -c 3 HOST

# Is port open?
nc -zv HOST PORT

# DNS lookup
dig +short HOST

# HTTP test with timing
curl -o /dev/null -sw "%{http_code} %{time_total}s\n" https://HOST

# Listening ports
ss -tlnp

# Route to destination
ip route get HOST_IP

# Trace path
traceroute HOST

# Capture HTTP traffic
tcpdump -i eth0 port 80 -A -n

# Certificate expiry
echo | openssl s_client -connect HOST:443 2>/dev/null | openssl x509 -noout -dates

# What's using port X?
lsof -i :PORT        # macOS
ss -tlnp | grep PORT  # Linux
```

---

## Links to Refer

- [Julia Evans — Networking Zines](https://jvns.ca/)
- [curl --write-out variables](https://curl.se/docs/manpage.html#-w)
- [tcpdump filters cheatsheet](https://www.tcpdump.org/manpages/pcap-filter.7.html)
- [Brendan Gregg — USE Method](https://www.brendangregg.com/usemethod.html)
