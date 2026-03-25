# Docker for Node.js Applications

---

## Dockerfile Best Practices

A Dockerfile is a recipe that describes how to build a container image layer by layer. Each instruction (`FROM`, `COPY`, `RUN`) creates a new immutable layer, and Docker caches layers so that a rebuild only re-executes instructions whose inputs have changed. The most important principle for Node.js is multi-stage builds: use one stage to install all dependencies and compile TypeScript, then copy only the compiled output into a minimal production image. This keeps the production image small (no TypeScript compiler, no dev dependencies, no build tools) and reduces the attack surface. The second most important principle is layer-cache ordering: copy `package.json` and run `npm ci` before copying source code, so the expensive `npm ci` step is only re-run when dependencies change, not on every code edit.

```dockerfile
# ✅ Production-ready multi-stage Dockerfile for Node.js

# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package files first (layer caching — only re-runs if package.json changes)
COPY package*.json ./

# Use npm ci for reproducible builds (uses package-lock.json)
# --omit=dev to skip devDependencies initially
RUN npm ci

# Stage 2: Build (TypeScript compilation, etc.)
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build TypeScript:
RUN npm run build

# Stage 3: Production image (minimal)
FROM node:20-alpine AS production
WORKDIR /app

# Security: don't run as root
RUN addgroup -g 1001 -S nodejs && adduser -S nodeuser -u 1001

# Install only production dependencies:
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built app:
COPY --from=builder /app/dist ./dist
# Or for non-TypeScript:
# COPY --from=builder /app/src ./src

# Set ownership:
RUN chown -R nodeuser:nodejs /app
USER nodeuser

# Environment:
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Health check:
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start:
CMD ["node", "dist/server.js"]
```

---

## .dockerignore

A `.dockerignore` file works like `.gitignore` but for the Docker build context — the directory tree sent to the Docker daemon when you run `docker build`. Without it, Docker sends your entire project directory including `node_modules` (potentially hundreds of megabytes), `.git` history, and `.env` files containing secrets. This makes builds slow and risks baking secrets into intermediate image layers. The `.dockerignore` exclusions below cover the most common sources of bloat and accidental secret exposure in Node.js projects.

```
node_modules
dist
.git
.gitignore
*.md
.env
.env.*
*.log
coverage
.nyc_output
Dockerfile*
docker-compose*
```

---

## docker-compose.yml for Development

Docker Compose solves the multi-container development problem: your Node.js app needs a database, a cache, and sometimes a message broker all running together locally. Without Compose, you would need to manually start each container, connect them on the same network, and pass the right environment variables. Compose describes the entire environment as a single YAML file, so `docker-compose up` brings up all services at once with correct networking. The key development pattern is mounting your source directory as a volume so code changes are reflected immediately (via nodemon), while using a named volume for `node_modules` to prevent the host's version from overriding the container's. The `depends_on` with health checks ensures the app only starts once its dependencies are ready.

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      target: deps   # Use deps stage for dev (has all packages)
    command: npm run dev  # nodemon for hot reload
    volumes:
      - .:/app            # Mount source code
      - /app/node_modules # Don't override node_modules from host
    ports:
      - "3000:3000"
      - "9229:9229"       # Debug port
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/mydb
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: mydb
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data

volumes:
  postgres-data:
  redis-data:
```

---

## Key Docker Concepts

Understanding Docker's layer caching model is the key to making builds fast. Every instruction in a Dockerfile produces a cached layer identified by the instruction itself and the content of any files it touched. When Docker detects that a layer's inputs are unchanged, it reuses the cached result and skips the instruction entirely — this is why the ordering of `COPY` and `RUN` instructions matters significantly. If source code changes but `package.json` hasn't, the `npm ci` layer cache hit saves the most expensive step. The commands below cover the essential build, run, and inspect operations for daily development.

```bash
# Layer caching:
# Each instruction creates a layer
# Layers are cached — only rebuild from changed layer onwards
# COPY package*.json first so npm install is cached if package.json unchanged

# Build:
docker build -t myapp:latest .
docker build -t myapp:latest --target production .

# Run:
docker run -d -p 3000:3000 --name myapp \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... \
  myapp:latest

# Compose:
docker-compose up -d          # start services
docker-compose down           # stop and remove containers
docker-compose logs -f app    # follow logs
docker-compose exec app sh    # shell into container

# Inspect:
docker stats           # live resource usage
docker logs myapp -f   # follow container logs
docker inspect myapp   # full container info
```

---

## Node.js Specific Docker Tips

Several Node.js behaviors interact with Docker in non-obvious ways. The choice of base image affects not just image size but compatibility with native Node.js addons: Alpine uses musl libc instead of glibc, which can break packages that compile C extensions. Signal handling is the most common production gotcha — if Node.js is not running as PID 1 with the exec form of `CMD`, it will never receive `SIGTERM` from Docker and will be force-killed after the stop timeout expires, losing in-flight requests. Graceful shutdown, which closes the HTTP server and drains connections before exiting, is not optional in production deployments.

```dockerfile
# 1. Use Alpine for smaller images:
# node:20-alpine vs node:20-slim vs node:20
# Alpine: ~50MB, Slim: ~170MB, Full: ~1GB
# Alpine uses musl libc — sometimes causes issues with native addons

# 2. Set NODE_ENV=production to skip dev deps and optimizations:
ENV NODE_ENV=production

# 3. Handle signals properly (PID 1 issue):
# Containers run your app as PID 1, which doesn't handle signals by default
# Use exec form CMD (not shell form):
CMD ["node", "server.js"]  # ✅ node gets signals directly
# NOT: CMD node server.js  # ❌ runs in sh, signals not forwarded

# Or use a process manager:
CMD ["dumb-init", "node", "server.js"]  # dumb-init properly handles signals

# 4. Graceful shutdown:
process.on('SIGTERM', async () => {
  console.log('SIGTERM received — shutting down gracefully');
  server.close(async () => {
    await db.end();
    process.exit(0);
  });
  // Force exit if not done in time:
  setTimeout(() => process.exit(1), 10000);
});
```

---

## Container Security

By default, processes in Docker containers run as root (UID 0), which means that if an attacker achieves code execution inside the container, they have root access to everything the container can reach — including mounted volumes and the Docker socket if it's exposed. Running as a non-root user is the most impactful single hardening step because it limits what a compromised container can do. Beyond user privilege, the principle is defense-in-depth: use minimal base images (smaller attack surface), scan images for known CVEs, pin to specific image digests rather than mutable tags, and never run containers with elevated Linux capabilities unless absolutely required.

```dockerfile
# 1. Non-root user (shown above)
# 2. Read-only filesystem where possible:
docker run --read-only --tmpfs /tmp myapp

# 3. No privileged:
# Never: docker run --privileged

# 4. Scan for vulnerabilities:
docker scout quickview myapp:latest
# Or: trivy image myapp:latest

# 5. Use specific image tags (not :latest in production):
FROM node:20.11.0-alpine3.19  # exact version
```

---

## Interview Questions

**Q: What is a multi-stage build and why use it?**
A: Multi-stage builds use multiple FROM statements. Earlier stages compile/build the app; the final stage copies only the artifacts (not build tools, dev dependencies, or intermediate files). Results in smaller, more secure production images. A TypeScript app compiled in stage 2 produces only `dist/` in the final image — no TypeScript compiler or node_modules/.

**Q: What is the difference between CMD and ENTRYPOINT?**
A: `CMD` provides defaults that can be overridden when running the container. `ENTRYPOINT` sets the executable that always runs. `CMD ["--port", "3000"]` + `ENTRYPOINT ["node", "server.js"]` → `node server.js --port 3000`. Override CMD: `docker run image --port 4000`. Override ENTRYPOINT: `docker run --entrypoint sh image`.

**Q: How do you handle environment variables securely in Docker?**
A: Never bake secrets into the image (they persist in layers). Use `-e` flags or `--env-file` at runtime. Better: Docker secrets (Swarm) or Kubernetes Secrets. In production: use secret managers (AWS Secrets Manager, Vault) and inject at startup. Use `.env.example` committed to git (no values), `.env` gitignored.

**Q: Why does your Node.js app not receive SIGTERM in a container?**
A: If you use shell form `CMD node server.js`, Docker runs `/bin/sh -c "node server.js"`. Node becomes a child of sh (PID 2). Docker sends SIGTERM to PID 1 (sh), which may not forward it to node. Use exec form `CMD ["node", "server.js"]` — node runs as PID 1 and receives signals directly.
