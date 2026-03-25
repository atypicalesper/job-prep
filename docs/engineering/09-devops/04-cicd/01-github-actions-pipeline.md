# CI/CD with GitHub Actions for Node.js

---

## Complete Pipeline

A CI/CD pipeline automates the path from a code change to a running deployment, enforcing quality gates at each stage so that only code that passes lint, type checks, unit tests, integration tests, and security scans can reach production. GitHub Actions models this as a workflow of jobs, where each job runs on a fresh Ubuntu virtual machine and jobs can declare dependencies via `needs` to form a directed acyclic graph. The pipeline below follows a standard progression: quality checks and tests run in parallel after a push or pull request; the Docker image is built only if all checks pass; and deployment to staging or production is gated on the target branch. Using `image-digest` (a SHA256 content hash) rather than a mutable tag for deployment guarantees that exactly the image that passed tests is what gets deployed.

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  # ─── 1. Quality Checks ────────────────────────────────────────────────────
  quality:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'   # caches ~/.npm directory

      - name: Install dependencies
        run: npm ci   # uses package-lock.json exactly — no surprises

      - name: TypeScript check
        run: npm run typecheck  # tsc --noEmit

      - name: Lint
        run: npm run lint       # eslint

      - name: Check formatting
        run: npm run format:check  # prettier --check

  # ─── 2. Unit Tests ────────────────────────────────────────────────────────
  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    needs: quality
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - run: npm ci

      - name: Run unit tests
        run: npm run test:unit -- --coverage --ci
        env:
          CI: true

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          file: ./coverage/lcov.info

  # ─── 3. Integration Tests ─────────────────────────────────────────────────
  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: quality

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 3s
          --health-retries 5
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - run: npm ci

      - name: Run migrations
        run: npm run db:migrate
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/testdb

      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/testdb
          REDIS_URL: redis://localhost:6379
          JWT_SECRET: test-secret-minimum-32-characters-long

  # ─── 4. Security Scan ─────────────────────────────────────────────────────
  security:
    name: Security Scan
    runs-on: ubuntu-latest
    needs: quality
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - run: npm ci

      - name: Audit dependencies
        run: npm audit --audit-level=high
        # Fails if high or critical vulnerabilities found

      - name: Run Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

  # ─── 5. Build & Push Docker Image ─────────────────────────────────────────
  build:
    name: Build Docker Image
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests, security]
    if: github.event_name == 'push'  # only on push, not PR
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
      image-digest: ${{ steps.push.outputs.digest }}

    steps:
      - uses: actions/checkout@v4

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}  # auto-provided

      - name: Docker metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=sha,prefix=sha-
            type=semver,pattern={{version}}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push
        id: push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha        # use GitHub Actions cache for layers
          cache-to: type=gha,mode=max

  # ─── 6. Deploy to Staging ─────────────────────────────────────────────────
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/develop'
    environment:
      name: staging
      url: https://api.staging.example.com

    steps:
      - uses: actions/checkout@v4

      - name: Set up kubectl
        uses: azure/setup-kubectl@v3

      - name: Configure kubeconfig
        run: |
          echo "${{ secrets.KUBE_CONFIG_STAGING }}" | base64 -d > kubeconfig
          echo "KUBECONFIG=$(pwd)/kubeconfig" >> $GITHUB_ENV

      - name: Deploy to staging
        run: |
          kubectl set image deployment/api-server \
            api-server=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}@${{ needs.build.outputs.image-digest }} \
            -n staging
          kubectl rollout status deployment/api-server -n staging --timeout=5m

      - name: Run smoke tests
        run: |
          sleep 10  # wait for pods to warm up
          curl -f https://api.staging.example.com/health/ready

  # ─── 7. Deploy to Production ──────────────────────────────────────────────
  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    environment:
      name: production
      url: https://api.example.com
    # Requires manual approval (set in GitHub environment settings)

    steps:
      - uses: actions/checkout@v4

      - name: Configure kubeconfig
        run: echo "${{ secrets.KUBE_CONFIG_PROD }}" | base64 -d > kubeconfig

      - name: Deploy to production
        env:
          KUBECONFIG: ./kubeconfig
        run: |
          kubectl set image deployment/api-server \
            api-server=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}@${{ needs.build.outputs.image-digest }} \
            -n production
          kubectl rollout status deployment/api-server -n production --timeout=10m

      - name: Notify Slack on success
        if: success()
        uses: slackapi/slack-github-action@v1
        with:
          channel-id: 'deploys'
          slack-message: '✅ Production deploy succeeded: ${{ github.sha }}'
        env:
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}

      - name: Notify Slack on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          channel-id: 'deploys'
          slack-message: '🚨 Production deploy FAILED: ${{ github.sha }}'
        env:
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

---

## Reusable Workflow

As a GitHub organization grows and accumulates multiple repositories, each defining its own test workflow, the testing logic drifts: one repo uses Node 18, another uses 20; one uploads coverage, another doesn't. Reusable Workflows solve this by extracting common job definitions into a shared file that other workflows invoke via `uses:`. The calling workflow passes typed `inputs` and `secrets`, making the interface explicit. The result is a single place to update testing standards — update the reusable workflow and all repositories that call it benefit immediately. This is the GitHub Actions equivalent of a shared library for CI configuration.

```yaml
# .github/workflows/reusable-test.yml
name: Reusable Test Workflow
on:
  workflow_call:
    inputs:
      node-version:
        required: false
        type: string
        default: '20'
    secrets:
      CODECOV_TOKEN:
        required: true

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm test -- --coverage

# Usage in another workflow:
# jobs:
#   test:
#     uses: ./.github/workflows/reusable-test.yml
#     with:
#       node-version: '20'
#     secrets:
#       CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
```

---

## Branch Protection + Required Checks

A CI pipeline is only as effective as its enforcement. Without branch protection, developers can bypass the pipeline entirely by pushing directly to `main` or merging a PR before checks complete. Branch protection rules in GitHub make CI checks mandatory: a pull request cannot be merged unless the required status checks have passed. This transforms the pipeline from advisory to gatekeeping. The settings below represent a standard production configuration; the "Require branches to be up to date" rule in particular prevents the "passing-on-my-branch, broken-on-main" class of merge-race bugs.

```
GitHub repository settings → Branches → Branch protection rules:
  Branch name pattern: main
  ✓ Require a pull request before merging
    ✓ Require approvals: 1
    ✓ Dismiss stale pull request approvals when new commits are pushed
  ✓ Require status checks to pass before merging
    Required checks: quality, unit-tests, integration-tests, security
  ✓ Require branches to be up to date before merging
  ✓ Require signed commits
  ✓ Include administrators
```

---

## Caching Strategy

CI runner machines are ephemeral — they start fresh on every run, meaning `node_modules`, build artifacts, and Docker image layers are re-created from scratch each time without caching. For a Node.js project with hundreds of dependencies, `npm ci` alone can take two to four minutes. The `actions/cache` action solves this by persisting directories between runs, keyed by a hash of the inputs that produced them. The key design principle is: make the cache key deterministic and invalidated only when the content should change. `hashFiles('**/package-lock.json')` means the `node_modules` cache is reused whenever `package-lock.json` is unchanged, which is the vast majority of CI runs. Docker layer caching via `type=gha` extends the same principle to image builds.

```yaml
# Efficient caching for faster CI:
- name: Cache node_modules
  uses: actions/cache@v4
  with:
    path: ~/.npm
    key: npm-${{ runner.os }}-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      npm-${{ runner.os }}-

# For Turborepo or nx monorepo:
- name: Cache turbo build
  uses: actions/cache@v4
  with:
    path: .turbo
    key: turbo-${{ runner.os }}-${{ github.sha }}
    restore-keys: |
      turbo-${{ runner.os }}-

# Docker layer caching with GitHub Actions cache:
- uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
    # Caches each Dockerfile layer separately
```

---

## Environment Variables and Secrets

Secrets management in CI/CD is a distinct problem from application secrets management: the pipeline itself needs credentials (to push Docker images, deploy to Kubernetes, send Slack notifications) but those credentials must never appear in logs, workflow YAML, or repository history. GitHub Secrets provides the first line of defense — secrets are encrypted at rest, never echoed in logs, and only exposed to authorized workflows. Environment-scoped secrets take this further by scoping credentials to specific deployment environments (staging, production) with optional manual approval gates. For organizations that need secret rotation, audit logs, or dynamic short-lived credentials, fetching from an external vault (AWS Secrets Manager, HashiCorp Vault) at runtime is the most robust approach.

```yaml
# Three ways to pass secrets:
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      # 1. Direct from GitHub Secrets:
      - run: npm run deploy
        env:
          API_KEY: ${{ secrets.API_KEY }}

      # 2. From GitHub Environments (per-environment secrets):
      #    Set environment: staging or environment: production
      #    Different secrets per environment

      # 3. From external vault (AWS Secrets Manager, Vault):
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Get secrets from AWS
        run: |
          SECRET=$(aws secretsmanager get-secret-value \
            --secret-id prod/api/secrets \
            --query SecretString \
            --output text)
          echo "DATABASE_URL=$(echo $SECRET | jq -r .database_url)" >> $GITHUB_ENV
```

---

## Interview Questions

**Q: What is the difference between `npm install` and `npm ci` in CI?**
A: `npm ci` (Clean Install): deletes `node_modules`, installs exactly what's in `package-lock.json` — no version resolution, no lock file modification. Faster, deterministic, fails if lock file is missing or doesn't match package.json. Always use in CI. `npm install` resolves versions (may update lock file), installs missing packages — non-deterministic in edge cases. For development only.

**Q: How do you keep secrets out of CI/CD pipelines?**
A: (1) GitHub Secrets — encrypted, never appear in logs, accessed as `${{ secrets.NAME }}`. (2) Environment secrets — scoped to specific environments (staging/prod) with approval gates. (3) External secret stores (AWS Secrets Manager, HashiCorp Vault) — fetched at runtime, rotatable without changing CI config. Never: hardcode in workflows, store in repo, echo secrets (GitHub masks known secrets but not derived values).

**Q: How do you prevent bad deploys with zero rollback time?**
A: (1) Kubernetes rolling updates — `kubectl rollout undo` reverts in seconds. (2) Feature flags — deploy code dark, enable per cohort. (3) Canary deployments — route 5% traffic to new version, watch metrics, then fully roll out. (4) Blue/green — maintain two environments, switch load balancer. (5) `needs` in GitHub Actions to gate deploy on all tests passing. (6) Monitor error rate and latency post-deploy with automatic rollback via alerting.

**Q: How do you handle database migrations in a CI/CD pipeline?**
A: Options: (1) Run migrations as a pre-deploy step (Init Container in K8s or migration job before `kubectl rollout`). Risk: migration runs before new code — both old and new code must work with both old and new schema simultaneously (backward-compatible migrations). (2) Never do `DROP COLUMN` or rename columns directly — add new column, deploy code using new column, backfill, then remove old column in a separate deploy. Always test migrations against a copy of production data.
