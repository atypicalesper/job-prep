# PM2 and Process Management in Production

---

## PM2 Basics

```bash
# Install:
npm install -g pm2

# Start with cluster mode (use all CPU cores):
pm2 start dist/server.js --name my-api -i max
# -i max = number of instances = CPU count
# -i 0   = same thing
# -i 4   = exactly 4 instances

# Start with config file (recommended):
pm2 start ecosystem.config.js

# Essential commands:
pm2 list                    # show all processes + status
pm2 logs my-api             # stream logs
pm2 logs my-api --lines 100 # last 100 lines
pm2 monit                   # interactive monitoring dashboard
pm2 status                  # alias for list
pm2 info my-api             # detailed process info

# Control:
pm2 stop my-api             # stop process
pm2 restart my-api          # hard restart (brief downtime)
pm2 reload my-api           # zero-downtime rolling restart ✅
pm2 delete my-api           # remove from PM2

# Persist across reboots:
pm2 startup                 # generates startup command (run as sudo)
pm2 save                    # save current process list
```

---

## ecosystem.config.js

```javascript
module.exports = {
  apps: [{
    name: 'my-api',
    script: 'dist/server.js',

    // Cluster mode — fork CPU-count processes:
    instances: 'max',     // or specific number like 4
    exec_mode: 'cluster',

    // Environment:
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    env_staging: {
      NODE_ENV: 'staging',
      PORT: 3001,
    },

    // Auto-restart on crash:
    watch: false,               // don't watch files in production (dev only)
    max_memory_restart: '500M', // restart if memory exceeds 500MB
    restart_delay: 1000,        // wait 1s before restarting crashed process

    // Crash protection:
    min_uptime: '10s',          // must stay up at least 10s to be "stable"
    max_restarts: 10,           // max restarts within min_uptime window
    exp_backoff_restart_delay: 100, // exponential backoff on restarts

    // Logs:
    log_file: '/var/log/my-api/combined.log',
    out_file: '/var/log/my-api/out.log',
    error_file: '/var/log/my-api/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,           // merge logs from all cluster instances

    // Signals:
    kill_timeout: 10000,        // ms to wait for graceful shutdown before SIGKILL
    listen_timeout: 8000,       // ms to wait for app to be "ready"

    // Graceful shutdown support:
    wait_ready: true,           // wait for process.send('ready') before marking alive
  }]
};

// Start with staging env:
// pm2 start ecosystem.config.js --env staging
```

---

## Zero-Downtime Deployment

```bash
# Rolling restart — PM2 restarts workers one by one:
pm2 reload my-api

# During reload:
# - Worker 1 gets SIGINT → finishes in-flight requests → exits
# - New worker 1 starts → becomes ready
# - Worker 2 gets SIGINT → finishes → exits
# - New worker 2 starts → etc.
# At no point are ALL workers down.

# With graceful shutdown in your app:
process.on('SIGINT', async () => {
  console.log('SIGINT received — starting graceful shutdown');
  server.close(async () => {
    await db.end();        // close DB pool
    await redis.quit();    // close Redis connection
    process.exit(0);
  });

  // Tell PM2 we're starting shutdown (stops traffic to this worker):
  if (process.send) process.send('disconnect'); // optional signal to PM2

  // Force exit after 8 seconds (less than kill_timeout):
  setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 8000);
});

// Signal readiness to PM2 (for wait_ready: true):
server.listen(PORT, () => {
  console.log(`Worker ${process.pid} ready on port ${PORT}`);
  if (process.send) process.send('ready'); // tells PM2 worker is healthy
});
```

---

## Health Monitoring

```javascript
// Health check endpoint that PM2/load balancer can poll:
app.get('/health', async (req, res) => {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid,
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
    },
    db: 'unknown',
    redis: 'unknown',
  };

  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, r) => setTimeout(() => r(new Error('DB timeout')), 2000))
    ]);
    checks.db = 'ok';
  } catch {
    checks.db = 'error';
    checks.status = 'degraded';
  }

  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'error';
  }

  const statusCode = checks.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(checks);
});
```

---

## PM2 Plus / Monitoring

```bash
# Built-in monitoring:
pm2 monit   # CPU, memory, event loop delay per instance

# Key metrics to watch:
# - Restart count (should be 0 in stable system)
# - Memory (watch for leaks — steady growth)
# - CPU (spikes indicate blocking operations)
# - Event loop delay (high delay = event loop blocked)

# Log rotation (install pm2-logrotate):
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 30      # keep 30 log files
pm2 set pm2-logrotate:compress true  # gzip old logs

# Check for memory leaks:
pm2 monit    # watch heapUsed trend
# If heapUsed grows steadily → memory leak
# pm2 set maxMemoryRestart 500M → restarts as temporary mitigation
```

---

## Systemd Alternative (without PM2)

```ini
# /etc/systemd/system/my-api.service

[Unit]
Description=My API Service
After=network.target

[Service]
Type=simple
User=nodeapp
WorkingDirectory=/app
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=my-api

# Environment:
Environment=NODE_ENV=production
EnvironmentFile=/app/.env

# Security:
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

```bash
# Systemd commands:
sudo systemctl enable my-api    # enable on boot
sudo systemctl start my-api
sudo systemctl stop my-api
sudo systemctl restart my-api
sudo systemctl status my-api
journalctl -u my-api -f         # stream logs
```

---

## Interview Questions

**Q: What is the difference between `pm2 restart` and `pm2 reload`?**
A: `restart` hard-kills and restarts all instances — brief downtime, all instances down simultaneously. `reload` is zero-downtime — restarts one instance at a time (rolling), new instance starts accepting connections before old one shuts down. Always use `reload` in production. `restart` for when the process is hanging and won't exit gracefully.

**Q: What happens if your Node.js app doesn't handle SIGTERM?**
A: PM2 sends SIGTERM, waits `kill_timeout` milliseconds, then sends SIGKILL. SIGKILL immediately terminates — no cleanup, in-flight requests are dropped, DB transactions are aborted, file handles may not be flushed. This causes dropped requests during deploys. Always handle SIGTERM: close the server, drain connections, close DB/Redis, then exit.

**Q: How do you set the correct number of cluster instances?**
A: `instances: 'max'` uses CPU count (one per logical core). For I/O-bound services (typical Node.js API), this is usually optimal. One more instance than cores doesn't help because there's nothing to parallelize. For services with heavy CPU work, consider one fewer than core count so system operations still have CPU. Monitor actual CPU usage to find the sweet spot.
