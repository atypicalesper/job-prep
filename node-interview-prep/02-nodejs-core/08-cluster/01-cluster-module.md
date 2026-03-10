# Cluster Module in Node.js

---

## Why Cluster?

```
Node.js is single-threaded → uses only 1 CPU core.
A server with 8 cores runs Node.js at 12.5% CPU capacity.

Cluster: fork N worker processes that ALL share the same port.
OS distributes connections across workers.
Each worker is an independent Node.js process with its own memory.
```

---

## Basic Cluster Setup

```javascript
const cluster = require('cluster');
const os = require('os');
const http = require('http');

const NUM_WORKERS = os.cpus().length;

if (cluster.isPrimary) {
  console.log(`Primary PID ${process.pid} starting ${NUM_WORKERS} workers`);

  // Fork workers:
  for (let i = 0; i < NUM_WORKERS; i++) {
    cluster.fork();
  }

  // Restart dead workers:
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
    cluster.fork();
  });

  cluster.on('online', (worker) => {
    console.log(`Worker ${worker.process.pid} is online`);
  });

} else {
  // Workers share this port:
  http.createServer((req, res) => {
    res.writeHead(200);
    res.end(`Hello from worker PID: ${process.pid}\n`);
  }).listen(3000, () => {
    console.log(`Worker ${process.pid} listening on port 3000`);
  });
}
```

---

## Production-Ready Cluster with Express

```javascript
const cluster = require('cluster');
const os = require('os');

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;

  console.log(`Master ${process.pid} is running`);

  // Fork workers:
  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork();
    worker.on('message', (msg) => {
      if (msg.type === 'WORKER_READY') {
        console.log(`Worker ${worker.process.pid} ready`);
      }
    });
  }

  // Zero-downtime restart on SIGUSR2:
  let restartInProgress = false;
  process.on('SIGUSR2', () => {
    if (restartInProgress) return;
    restartInProgress = true;
    console.log('Rolling restart initiated...');

    const workerIds = Object.keys(cluster.workers);
    let i = 0;

    function restartNext() {
      if (i >= workerIds.length) {
        restartInProgress = false;
        console.log('Rolling restart complete');
        return;
      }

      const worker = cluster.workers[workerIds[i]];
      if (!worker) { i++; restartNext(); return; }

      // Start new worker first, then kill old one:
      const newWorker = cluster.fork();
      newWorker.on('listening', () => {
        worker.kill('SIGTERM');
        i++;
        setTimeout(restartNext, 100); // stagger restarts
      });
    }

    restartNext();
  });

  // Graceful shutdown:
  process.on('SIGTERM', () => {
    console.log('Master received SIGTERM, shutting down workers...');
    for (const id in cluster.workers) {
      cluster.workers[id]?.kill('SIGTERM');
    }
    process.exit(0);
  });

  cluster.on('exit', (worker, code, signal) => {
    if (!restartInProgress && code !== 0) {
      console.log(`Worker ${worker.process.pid} crashed. Restarting...`);
      cluster.fork();
    }
  });

} else {
  // Worker code:
  const express = require('express');
  const app = express();

  app.get('/health', (req, res) => res.json({ pid: process.pid, status: 'ok' }));
  app.get('/', (req, res) => res.json({ worker: process.pid }));

  const server = app.listen(3000, () => {
    process.send?.({ type: 'WORKER_READY' });
  });

  // Graceful worker shutdown:
  process.on('SIGTERM', () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
```

---

## IPC Between Primary and Workers

```javascript
// Primary can communicate with workers:

if (cluster.isPrimary) {
  const worker = cluster.fork();

  // Send to specific worker:
  worker.send({ type: 'CONFIG_UPDATE', config: newConfig });

  // Receive from worker:
  worker.on('message', (msg) => {
    if (msg.type === 'METRIC') {
      aggregatedMetrics.push(msg.data);
    }
  });

  // Broadcast to ALL workers:
  function broadcast(message) {
    for (const id in cluster.workers) {
      cluster.workers[id]?.send(message);
    }
  }

} else {
  // Worker receives:
  process.on('message', (msg) => {
    if (msg.type === 'CONFIG_UPDATE') {
      updateConfig(msg.config);
    }
  });

  // Worker sends to primary:
  setInterval(() => {
    process.send({ type: 'METRIC', data: getMemoryStats() });
  }, 5000);
}
```

---

## Cluster vs Worker Threads vs PM2

```
Cluster:
- Multiple processes, separate memory
- Each process = 1 Node.js instance
- OS distributes TCP connections
- Shared port, independent heap
- Crash isolation per worker
- IPC for communication
- Good for: web servers, I/O-bound services

Worker Threads:
- Multiple threads, same process
- Shared memory via SharedArrayBuffer
- No automatic load balancing
- Lower overhead
- Good for: CPU-intensive computation, not for HTTP servers

PM2 Cluster Mode:
- PM2 manages the cluster automatically
- `pm2 start app.js -i max` — forks CPU-count workers
- Zero-downtime reloads: pm2 reload app
- Automatic restart on crash
- Monitoring dashboard: pm2 monit
- Good for: production deployment, don't want to manage cluster manually

Recommendation:
- Use PM2 for most production deployments
- Write raw cluster code when you need custom IPC or restart behavior
- Use Worker Threads for heavy CPU work within a single service
```

---

## Shared State in Cluster

```javascript
// ❌ Problem: each worker has its own memory — can't share state
if (cluster.isPrimary) {
  cluster.fork(); // worker 1
  cluster.fork(); // worker 2
}

// In worker 1: users.set('alice', data)
// In worker 2: users.get('alice') → undefined! (different process)

// ✅ Solutions for shared state:

// 1. Redis — shared cache/session store:
const redis = require('redis');
const client = redis.createClient();

app.post('/session', async (req, res) => {
  await client.set(`session:${req.sessionId}`, JSON.stringify(req.body), { EX: 3600 });
  res.json({ ok: true });
});

// 2. Sticky sessions (same client → same worker) for in-memory state:
// nginx: ip_hash;
// load balancer: configure sticky sessions

// 3. Shared memory via SharedArrayBuffer (limited use case):
// Pass SharedArrayBuffer via primary to workers
// Use Atomics for thread-safe operations
```

---

## Interview Questions

**Q: What is the difference between the Cluster module and Worker Threads?**
A: Cluster creates separate OS processes — each worker has its own V8 heap, event loop, module cache, and full process isolation. Crash in one worker doesn't affect others. Communication via IPC (serialized). Worker Threads create OS threads within the same process — shared memory possible via SharedArrayBuffer, lower overhead, but a thread crash can take down the whole process. Use Cluster for HTTP servers (natural per-request isolation). Use Workers for CPU-bound computation.

**Q: How does the OS distribute connections across cluster workers?**
A: Two methods: (1) Round-robin (default on Linux/Mac) — the primary listens and distributes accepted connections to workers round-robin. (2) Direct (Windows default) — workers all call `listen()` and the OS picks which process handles each connection. Round-robin gives more even distribution; direct is faster but less balanced.

**Q: How do you do zero-downtime deploys with Cluster?**
A: Rolling restart — one by one, fork a new worker, wait for it to start listening, then kill the old one. While both old and new workers are running, connections are handled by both. The old worker finishes its in-flight requests and exits. No dropped connections. PM2's `pm2 reload` does this automatically.

**Q: How do you share session state across cluster workers?**
A: You can't use in-memory state — each worker has its own heap. Use an external store: Redis for sessions (`express-session` with `connect-redis`), Redis or PostgreSQL for cache. Alternatively, use sticky sessions (same client always routes to same worker) — but this breaks failover (if that worker dies, that client loses state). Redis is the robust solution.
