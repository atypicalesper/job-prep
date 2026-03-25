# Kubernetes for Node.js Applications

---

## Core Concepts

Kubernetes is a container orchestration platform that automates the deployment, scaling, and lifecycle management of containerized applications. Rather than managing individual containers, Kubernetes operates on declarative specifications: you describe the desired state (three replicas of this image, routable at this hostname, with these secrets injected) and Kubernetes continuously works to reconcile actual state with the desired state. Understanding the core resource types is essential before reading any manifest — each type addresses a specific problem in the lifecycle of a production service.

```
Pod:          Smallest deployable unit. One or more containers sharing network + storage.
              Each pod gets its own IP. Pods are ephemeral — don't store state in them.

Deployment:   Manages ReplicaSets. Ensures N replicas of a pod always run.
              Handles rolling updates and rollbacks.

Service:      Stable network endpoint for a set of pods (pods come and go, service DNS is stable).
              Types: ClusterIP (internal), NodePort (external), LoadBalancer (cloud LB).

ConfigMap:    Non-secret config data (key-value or files).
Secrets:      Base64-encoded sensitive data (DB passwords, API keys).

Ingress:      HTTP/HTTPS routing rules — maps paths/hostnames to services.
              Requires an ingress controller (nginx-ingress, traefik).

Namespace:    Virtual cluster for isolation (dev/staging/prod in same cluster).
HPA:          Horizontal Pod Autoscaler — scales pod count based on CPU/memory/custom metrics.
```

---

## Deployment Manifest

A Deployment manifest is the primary way to run stateless workloads in Kubernetes. It declares the desired number of pod replicas, the container image, how to roll out updates, and the health check behavior. The manifest below represents a production-ready configuration with several important properties: resource requests and limits prevent one pod from starving others, readiness and liveness probes enable zero-downtime rolling updates, pod anti-affinity distributes replicas across nodes to survive node failures, and the preStop hook gives the load balancer time to drain connections before shutdown. Every field here is intentional — running without resource limits in a shared cluster is one of the most common causes of production incidents.

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: production
  labels:
    app: api-server
    version: "1.5.2"
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-server
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1         # allow 1 extra pod during update
      maxUnavailable: 0   # never reduce below 3 pods (zero downtime)
  template:
    metadata:
      labels:
        app: api-server
    spec:
      containers:
        - name: api-server
          image: my-registry/api-server:1.5.2
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: redis-url
          envFrom:
            - configMapRef:
                name: app-config  # load all keys from ConfigMap as env vars

          # Resource limits — CRITICAL for stability:
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"     # 0.25 cores
            limits:
              memory: "512Mi"
              cpu: "1000m"    # 1 core

          # Health checks:
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 3
            # Pod only receives traffic when ready probe passes

          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 3
            # Pod is restarted if liveness probe fails

          startupProbe:
            httpGet:
              path: /health/live
              port: 3000
            failureThreshold: 30
            periodSeconds: 10
            # Allows 300s for slow startup before liveness kicks in

          # Graceful shutdown:
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 10"]
                # Give time for load balancer to route away before shutdown

      # Graceful termination:
      terminationGracePeriodSeconds: 30

      # Pod disruption budget respected during node drains:
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app
                      operator: In
                      values: [api-server]
                topologyKey: kubernetes.io/hostname
                # Prefer spreading pods across different nodes
```

---

## Health Check Endpoints in Node.js

Kubernetes uses health check endpoints to make two distinct decisions: whether to restart a pod and whether to route traffic to it. These are fundamentally different decisions that require different information, which is why liveness and readiness must be separate endpoints with different semantics. A liveness probe answers "is this process still functioning?" — it should be as cheap as possible, just returning 200, because a slow or failing liveness probe causes unnecessary pod restarts. A readiness probe answers "is this pod ready to serve traffic?" — it should check all dependencies (database, cache) because if those are unavailable, the pod should be removed from the load balancer rotation rather than served 500 errors to real users. The graceful shutdown logic ensures in-flight requests complete cleanly when Kubernetes terminates a pod.

```javascript
// Separate readiness and liveness probes:
app.get('/health/live', (req, res) => {
  // Liveness: is the app alive? (not deadlocked, not OOM)
  // Should be VERY cheap — just return 200.
  // If this fails, Kubernetes restarts the pod.
  res.json({ status: 'alive', pid: process.pid });
});

app.get('/health/ready', async (req, res) => {
  // Readiness: can the app handle traffic?
  // Check dependencies. If not ready, pod is removed from load balancer
  // (not restarted — stays running, just doesn't get traffic).
  try {
    await Promise.all([
      db.query('SELECT 1'),
      redis.ping(),
    ]);
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'not ready', error: err.message });
  }
});

// Startup probe endpoint (same as liveness):
// preStop hook ensures graceful drain:
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, stopping gracefully...');
  isShuttingDown = true;

  // Stop accepting new connections:
  server.close(async () => {
    // Flush pending DB operations, close connections:
    await db.$disconnect();
    await redis.quit();
    process.exit(0);
  });

  // Force exit after 25s (before k8s 30s terminationGracePeriodSeconds):
  setTimeout(() => process.exit(1), 25_000);
});

// Middleware to reject requests during shutdown:
app.use((req, res, next) => {
  if (isShuttingDown) {
    res.setHeader('Connection', 'close');
    res.status(503).json({ error: 'Server is shutting down' });
    return;
  }
  next();
});
```

---

## Service and Ingress

Pods are ephemeral — they are created, destroyed, and rescheduled constantly. A Kubernetes Service provides a stable network identity (DNS name and virtual IP) that persists across pod lifecycles, abstracting away the underlying pod IPs. The Service uses label selectors to dynamically discover which pods belong to it and maintains an endpoint list of their IPs. An Ingress then sits in front of Services and provides HTTP/HTTPS routing rules: mapping hostnames and URL paths to backend Services, handling TLS termination, and applying annotations for rate limiting and body size limits. An Ingress requires an Ingress Controller (nginx-ingress, Traefik) to be installed in the cluster — the Ingress resource itself is just a configuration declaration.

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: api-server
  namespace: production
spec:
  selector:
    app: api-server
  ports:
    - port: 80
      targetPort: 3000
      protocol: TCP
  type: ClusterIP  # only accessible within cluster

---
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  namespace: production
  annotations:
    nginx.ingress.kubernetes.io/rate-limit: "100"           # requests per second
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"     # auto TLS
spec:
  ingressClassName: nginx
  tls:
    - hosts: [api.example.com]
      secretName: api-tls
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-server
                port:
                  number: 80
```

---

## Horizontal Pod Autoscaler

The HPA automatically adjusts the number of pod replicas in response to observed metrics, allowing a service to scale out under load and scale back in when demand drops — without manual intervention. It queries metrics from the Kubernetes metrics-server (for CPU/memory) or from Prometheus via an adapter (for custom metrics like requests per second). The `behavior` section is critical for production use: the `stabilizationWindowSeconds` prevents thrashing by requiring the metric to consistently exceed the threshold before scaling, and the `policies` limit how aggressively scaling events add or remove pods. Scale-down stabilization should be more conservative than scale-up because removing pods too quickly during a traffic burst will immediately trigger another scale-up event.

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-server-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-server
  minReplicas: 3
  maxReplicas: 20
  metrics:
    # Scale on CPU:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70  # scale up when avg CPU > 70%

    # Scale on memory:
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80

    # Scale on custom metric (requests per second from Prometheus):
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "100"  # scale when avg rps > 100 per pod

  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60  # wait 60s before scaling up again
      policies:
        - type: Pods
          value: 4               # add at most 4 pods per scaling event
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300 # wait 5 min before scaling down
      policies:
        - type: Percent
          value: 25              # remove at most 25% of pods per event
          periodSeconds: 60
```

---

## ConfigMap and Secrets

Kubernetes ConfigMaps and Secrets both inject configuration into pods, but they serve different purposes and have different security properties. ConfigMaps hold non-sensitive key-value data (log levels, feature flags, server ports) that is safe to store in version control. Secrets hold sensitive data (passwords, API keys, TLS certificates) and are base64-encoded — critically, base64 is encoding, not encryption. By default, Kubernetes Secrets are stored unencrypted in etcd, meaning anyone with cluster access can read them. For genuine security, enable etcd encryption at rest, use Sealed Secrets (encrypted in git, decrypted by a cluster controller), or integrate HashiCorp Vault to inject secrets at pod startup. The bash commands below cover the essential operations for managing these resources.

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: production
data:
  LOG_LEVEL: "info"
  NODE_ENV: "production"
  PORT: "3000"
  MAX_CONNECTIONS: "100"

---
# secrets.yaml (values are base64 encoded, but NOT encrypted at rest by default)
# Use Sealed Secrets or Vault for proper secrets management
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: production
type: Opaque
data:
  database-url: cG9zdGdyZXM6Ly8...  # base64 encoded
  redis-url: cmVkaXM6Ly8...
  jwt-secret: c2VjcmV0...
```

```bash
# Create secret from literal (never commit secrets to git!):
kubectl create secret generic app-secrets \
  --from-literal=database-url="postgres://..." \
  --from-literal=jwt-secret="$(openssl rand -hex 32)" \
  --namespace production

# Check rollout status:
kubectl rollout status deployment/api-server -n production

# Rollback:
kubectl rollout undo deployment/api-server -n production

# View logs:
kubectl logs -f deployment/api-server -n production --tail=100

# Exec into pod:
kubectl exec -it $(kubectl get pod -l app=api-server -n production -o jsonpath='{.items[0].metadata.name}') -- /bin/sh

# Port forward for debugging:
kubectl port-forward svc/api-server 3000:80 -n production
```

---

## CronJob — Scheduled Tasks

A CronJob creates a Job on a repeating schedule, where a Job in turn creates one or more Pods to run a task to completion. This is Kubernetes's solution to scheduled background work: database cleanup, report generation, cache warming, and similar periodic operations. Unlike a Deployment (which keeps pods running indefinitely), a Job pod runs once and exits; Kubernetes tracks whether it succeeded or failed. The `concurrencyPolicy: Forbid` setting prevents overlap: if a previous run is still in progress when the next schedule fires, the new run is skipped rather than allowed to run in parallel, which would cause duplicate processing. History limits prevent the cluster from accumulating stale Job and Pod objects indefinitely.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: cleanup-expired-sessions
  namespace: production
spec:
  schedule: "0 2 * * *"  # 2am every day (UTC)
  concurrencyPolicy: Forbid  # don't run if previous is still running
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: cleanup
              image: my-registry/api-server:1.5.2
              command: ["node", "scripts/cleanup-sessions.js"]
              env:
                - name: DATABASE_URL
                  valueFrom:
                    secretKeyRef:
                      name: app-secrets
                      key: database-url
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
```

---

## Interview Questions

**Q: What is the difference between liveness and readiness probes?**
A: Liveness: is the process alive? If it fails, Kubernetes restarts the pod — use for detecting deadlocks or fatal failures. Keep it cheap (no DB calls). Readiness: can the pod handle traffic? If it fails, the pod is removed from the Service's endpoint list but NOT restarted — use for checking dependencies (DB, Redis). During a rolling update, new pods only receive traffic after readiness passes, ensuring zero-downtime deploys.

**Q: How do you achieve zero-downtime rolling updates?**
A: Set `maxUnavailable: 0` and `maxSurge: 1` in the rolling update strategy. Kubernetes: (1) Creates a new pod, (2) Waits for it to pass readiness probe, (3) Removes an old pod. With a preStop hook (`sleep 10`) you give the load balancer time to stop routing to the old pod before it receives SIGTERM. The app handles SIGTERM gracefully (finish in-flight requests, close connections) within terminationGracePeriodSeconds.

**Q: How do you handle configuration and secrets in Kubernetes?**
A: ConfigMaps for non-sensitive config (log level, port). Secrets for sensitive data (DB passwords, API keys). Both are injected as env vars or volume mounts. But Kubernetes Secrets are only base64-encoded (not encrypted) by default — use Sealed Secrets (encrypted in git) or HashiCorp Vault with the Vault Agent injector for proper encryption at rest. Never hardcode secrets in container images or commit them to git.

**Q: How does HPA work and what are its limitations?**
A: HPA queries metrics (CPU, memory, or custom from Prometheus via metrics-server/prometheus-adapter) and adjusts replica count to maintain target utilization. Limitations: (1) Requires a few minutes to scale (metric collection period + stabilization window), (2) Can't scale faster than `maxSurge` allows, (3) Pods need resource requests set for CPU-based HPA to work, (4) Doesn't handle traffic spikes well — combine with pre-scaling at known peak times or KEDA for event-driven scaling.
