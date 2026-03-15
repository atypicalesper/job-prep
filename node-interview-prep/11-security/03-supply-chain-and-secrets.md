# Supply Chain Security, SBOM & Secrets Management

## Supply Chain Attacks

A supply chain attack targets the **software supply chain** — the dependencies, build tools, and infrastructure used to build and deliver software, rather than attacking the end product directly.

### Famous Incidents

| Incident | Year | Attack Vector |
|----------|------|---------------|
| SolarWinds | 2020 | Malicious code injected into build system |
| event-stream (npm) | 2018 | Malicious maintainer added malicious package |
| colors.js sabotage | 2022 | Maintainer intentionally broke their own package |
| ua-parser-js | 2021 | Maintainer's account compromised, crypto-miner injected |
| node-ipc | 2022 | Maintainer added geopolitical protest code |
| PyTorch (torchtriton) | 2022 | Typosquatting on PyPI |

### Attack Vectors

```
1. Typosquatting
   npm install lodahs   ← looks like 'lodash'
   npm install crossenv ← looks like 'cross-env'
   Targets: fast typists, CI pipelines

2. Dependency Confusion
   Company has internal package 'mycompany-utils' on private registry
   Attacker publishes 'mycompany-utils' to public npm with higher version
   npm resolves public (higher version) over private → executes attacker code

3. Account Takeover
   Maintainer credentials stolen → malicious version published
   Package downloads trigger malicious postInstall script

4. Malicious PR merge
   PR adds malicious code, maintainer merges without careful review

5. Abandoned packages
   Maintainer transfers ownership, new owner adds malware
```

---

## Defending Against Supply Chain Attacks

### 1. Lock Files — ALWAYS commit them

```bash
# package-lock.json or yarn.lock or pnpm-lock.yaml
# Locks exact versions AND hashes of every transitive dependency

# Never install without lockfile in production
npm ci                  # installs EXACTLY what's in lockfile
npm install --frozen-lockfile  # yarn equivalent

# NOT this in production (updates lockfile)
npm install
```

### 2. Dependency Auditing

```bash
# Built-in audit
npm audit
npm audit --audit-level high  # fail only on high/critical
npm audit fix                  # auto-fix

# More detailed
npx better-npm-audit audit --level moderate

# Snyk (comprehensive)
npx snyk test
npx snyk monitor  # continuous monitoring
```

### 3. Subresource Integrity (SRI) for CDN scripts

```html
<!-- Hash ensures the CDN file hasn't been tampered with -->
<script
  src="https://cdn.example.com/lib.js"
  integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
  crossorigin="anonymous"
></script>
```

### 4. Constrain Permissions (npm)

```json
// .npmrc — prevent postinstall scripts (use with care)
// Some packages legitimately need postinstall (esbuild, puppeteer)
ignore-scripts=true

// Or allowlist specific packages
```

```bash
# Review what postinstall scripts run
npm install --ignore-scripts
# Then manually run trusted scripts:
npx prisma generate
```

### 5. Private Registry + Proxying

```
Developer → Private Registry (Artifactory, Verdaccio, GitHub Packages)
               ↓ (proxy/allowlist)
            Public npm Registry (only approved packages)
```

```yaml
# .npmrc
registry=https://registry.mycompany.com
@mycompany:registry=https://registry.mycompany.com

# Artifactory config: allowlist specific packages
# All others blocked — prevents dependency confusion
```

### 6. Pinning exact versions (controversial)

```json
// package.json — pin exact versions (no ^)
{
  "dependencies": {
    "express": "4.18.2",      // exact, NOT "^4.18.2"
    "lodash": "4.17.21"
  }
}
```

Trade-off: security patches won't auto-apply, but rogue minor version can't sneak in.

### 7. Automated Dependency Updates

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      production-dependencies:
        dependency-type: "production"
    ignore:
      - dependency-name: "*"
        update-types: ["version-update:semver-major"]
```

---

## SBOM — Software Bill of Materials

An SBOM is a machine-readable inventory of all software components in your application.

### Why SBOM?

- **Vulnerability tracking:** If Log4Shell is discovered, immediately know if you're affected
- **License compliance:** Know if any dependency has a restrictive license (GPL, AGPL)
- **Regulatory compliance:** Required by US Executive Order 14028, EU Cyber Resilience Act
- **Audit:** Prove to customers what's in your software

### Formats

| Format | Standard Body | Use Case |
|--------|--------------|---------|
| SPDX | Linux Foundation | Open source, regulatory |
| CycloneDX | OWASP | Security-focused, richer metadata |

### Generating SBOM

```bash
# CycloneDX for Node.js
npm install -g @cyclonedx/cyclonedx-npm
cyclonedx-npm --output-file sbom.json

# SPDX
npx spdx-sbom-generator -p . -o sbom.spdx

# Syft (multi-ecosystem, Docker images too)
brew install syft
syft packages dir:. -o cyclonedx-json > sbom.json
syft packages nginx:latest -o spdx-json  # Docker image SBOM
```

### SBOM in CI/CD

```yaml
# GitHub Actions
- name: Generate SBOM
  uses: anchore/sbom-action@v0
  with:
    path: .
    format: cyclonedx-json
    output-file: sbom.json

- name: Scan SBOM for vulnerabilities
  uses: anchore/scan-action@v3
  with:
    sbom: sbom.json
    fail-build: true
    severity-cutoff: high
```

### Scanning SBOM for vulnerabilities

```bash
# Grype — scan SBOM against vulnerability databases
grype sbom:./sbom.json

# Output:
# NAME          INSTALLED  FIXED-IN  TYPE  VULNERABILITY   SEVERITY
# lodash        4.17.20    4.17.21   npm   CVE-2021-23337  High
# glob-parent   3.1.0      5.1.2     npm   CVE-2020-28469  High
```

---

## Secrets Management

### The Problem

```
BAD:
  .env file committed to git → all secrets exposed
  Secrets in Docker image → anyone who pulls image sees secrets
  Hardcoded in source → stays in git history forever

GOOD:
  Secrets injected at runtime from a secrets manager
  Short-lived credentials, auto-rotated
  Audit log of who accessed what
```

### HashiCorp Vault

The most widely used secrets manager.

```
                    ┌─────────────────────────────────────┐
                    │              Vault                    │
                    │                                       │
                    │  ┌──────────┐  ┌────────────────┐   │
                    │  │  KV      │  │  Dynamic       │   │
                    │  │ Secrets  │  │  Secrets       │   │
                    │  │(static)  │  │(DB creds, AWS) │   │
                    │  └──────────┘  └────────────────┘   │
                    │                                       │
                    │  Auth Methods: AppRole, k8s, JWT, OIDC│
                    │  Audit: who accessed what, when       │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │          Your Application            │
                    │  vault token → read secret → use     │
                    └─────────────────────────────────────┘
```

### Vault — Basic Usage

```js
import Vault from 'node-vault';

const vault = Vault({
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN, // or use AppRole auth
});

// Read a static secret (KV v2)
async function getSecret(path) {
  const { data } = await vault.read(`secret/data/${path}`);
  return data.data;
}

const dbCreds = await getSecret('production/database');
// { username: 'app_user', password: 'super-secret' }
```

### Dynamic Database Credentials (Vault's killer feature)

```
Traditional:                        With Vault Dynamic Secrets:
  One set of creds                    App requests creds at startup
  Shared across all instances         Vault creates a unique DB user
  Never rotated (fear of breakage)    TTL: 1 hour, auto-deleted
  One breach = all compromised        Each app has own credentials
```

```js
// Vault generates a unique, time-limited DB credential
async function getDatabaseCredentials() {
  const { data } = await vault.read('database/creds/my-app-role');
  // Returns: { username: 'v-app-AbCd1234', password: 'A1B2-...', lease_duration: 3600 }

  return {
    host: process.env.DB_HOST,
    username: data.username,   // unique per request
    password: data.password,   // expires in 1 hour
    database: 'myapp',
  };
}

// Renew before expiry
async function renewLease(leaseId) {
  await vault.write('sys/leases/renew', {
    lease_id: leaseId,
    increment: 3600,
  });
}
```

### AppRole Authentication (for services)

```bash
# Setup (Vault admin)
vault auth enable approle
vault write auth/approle/role/my-app \
  secret_id_ttl=10m \
  token_num_uses=10 \
  token_ttl=20m \
  token_max_ttl=30m \
  secret_id_num_uses=40 \
  policies=my-app-policy

# Get role-id (stored in config, not secret)
vault read auth/approle/role/my-app/role-id

# Get secret-id (short-lived, injected at deploy time)
vault write -f auth/approle/role/my-app/secret-id
```

```js
// Application startup — authenticate with AppRole
async function vaultLogin() {
  const { auth } = await vault.approleLogin({
    role_id: process.env.VAULT_ROLE_ID,
    secret_id: process.env.VAULT_SECRET_ID,  // short-lived, injected at deploy
  });

  vault.token = auth.client_token;  // now authenticated
  scheduleTokenRenewal(auth.lease_duration);
}
```

### Kubernetes Auth (most common in k8s environments)

```js
// Pod's service account token auto-mounted
const token = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf-8');

const { auth } = await vault.kubernetesLogin({
  role: 'my-app',
  jwt: token,
});
vault.token = auth.client_token;
```

---

## AWS Secrets Manager / Parameter Store

```js
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });

async function getSecret(secretName) {
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  return JSON.parse(response.SecretString);
}

// In Lambda/ECS: IAM role automatically provides credentials
// No explicit credentials needed!
const dbCreds = await getSecret('prod/myapp/database');
```

### Automatic Secret Rotation (AWS)

```json
// Rotation config in secrets manager
{
  "RotationEnabled": true,
  "RotationRules": {
    "AutomaticallyAfterDays": 30
  },
  "RotationLambdaARN": "arn:aws:lambda:us-east-1:123:function:rotate-db-secret"
}
```

---

## Environment Variables Best Practices

```bash
# .env.example — commit this (no real values)
DATABASE_URL=postgresql://user:password@host:5432/db
REDIS_URL=redis://host:6379
JWT_SECRET=<generate with: openssl rand -base64 32>
AWS_REGION=us-east-1

# .env — NEVER commit
DATABASE_URL=postgresql://prod_user:real_password@prod-host:5432/mydb
JWT_SECRET=actual-secret-here
```

```js
// Validate env vars at startup — fail fast
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().default(3000),
  REDIS_URL: z.string().url().optional(),
});

export const env = envSchema.parse(process.env);
// Throws with helpful error if any required env var is missing
```

---

## Secrets in Docker & CI/CD

### Docker — Never put secrets in image

```dockerfile
# BAD — secret baked into image layer
ENV DATABASE_URL=postgresql://user:password@host/db

# GOOD — inject at runtime
# docker run -e DATABASE_URL=$DATABASE_URL myapp
# or use docker secrets / k8s secrets
```

### Docker BuildKit secrets (for build-time secrets)

```dockerfile
# Dockerfile
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm install
# Secret not stored in any layer!
```

```bash
docker build --secret id=npmrc,src=.npmrc .
```

### GitHub Actions Secrets

```yaml
# Repository secrets set in GitHub Settings
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  VAULT_TOKEN: ${{ secrets.VAULT_TOKEN }}

# OIDC — no long-lived secrets needed for AWS
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::123456789012:role/github-actions
    aws-region: us-east-1
    # GitHub OIDC token exchanged for short-lived AWS credentials
    # NO AWS_ACCESS_KEY_ID needed!
```

---

## Interview Questions

**Q: What is a supply chain attack and how do you defend against it?**
Supply chain attacks target software dependencies or build infrastructure rather than your code directly (e.g., compromised npm package). Defenses: lock files (commit package-lock.json, use `npm ci`), regular `npm audit`, lock to exact versions for critical deps, use a private registry with allowlist, review postinstall scripts, automated tools like Snyk/Dependabot.

**Q: What is an SBOM and why does it matter?**
Software Bill of Materials is a machine-readable inventory of all software components. Allows you to quickly check if a newly disclosed CVE affects your application, track license compliance, and meet regulatory requirements (US EO 14028, EU CRA). Generated with tools like Syft, CycloneDX, SPDX.

**Q: What are Vault dynamic secrets and why are they better than static credentials?**
Dynamic secrets are credentials generated on-demand with a TTL (e.g., 1 hour). Each application instance gets unique credentials that auto-expire. Benefits: blast radius is minimal if credentials leak (they expire), each app has an audit trail, no credential sprawl or "the password nobody changes." Static shared passwords are a single point of failure.

**Q: How do you avoid secrets in environment variables?**
Best practice: use a secrets manager (Vault, AWS Secrets Manager) and fetch secrets at application startup, not via environment variables. In Kubernetes, use k8s secrets or a Vault sidecar injector. For CI/CD, use OIDC federation (GitHub Actions → AWS IAM role) to avoid long-lived credentials entirely.

**Q: What is dependency confusion and how do you prevent it?**
Attacker publishes a package to public npm with the same name as your private internal package but a higher version number. npm resolves public (higher version). Prevention: use a private registry that proxies public npm but blocks packages matching private namespace patterns (Artifactory scoped packages allowlist), or use npm's `publishConfig` to pin private packages to internal registry.
