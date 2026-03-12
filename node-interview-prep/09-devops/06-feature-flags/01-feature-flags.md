# Feature Flags in Production

## What Are Feature Flags?

Feature flags (feature toggles) decouple **code deployment** from **feature release**. You ship code behind a flag, then enable it for users independently.

```
Without flags:  deploy code = feature goes live immediately
With flags:     deploy code → code is dormant → flip flag → feature goes live
```

---

## Flag Types

| Type | Example | Lifespan |
|---|---|---|
| **Release toggle** | Enable new checkout flow | Days–weeks, then removed |
| **Experiment / A/B** | Show button A to 50%, B to 50% | Days–weeks |
| **Ops / kill switch** | Disable expensive feature under load | Permanent |
| **Permission toggle** | Enable beta feature for paid users only | Long-lived |

---

## Implementation Patterns

### 1. Simple in-memory flags (for small projects)

```js
// config/flags.js
const FLAGS = {
  NEW_CHECKOUT: process.env.FLAG_NEW_CHECKOUT === 'true',
  DARK_MODE: process.env.FLAG_DARK_MODE === 'true',
};

module.exports = { isEnabled: (flag) => FLAGS[flag] ?? false };

// Usage
const { isEnabled } = require('./config/flags');

app.get('/checkout', (req, res) => {
  if (isEnabled('NEW_CHECKOUT')) {
    return newCheckoutHandler(req, res);
  }
  return legacyCheckoutHandler(req, res);
});
```

### 2. Redis-backed flags (dynamic, no redeploy)

```js
class FeatureFlags {
  constructor(redisClient) {
    this.redis = redisClient;
    this.cache = new Map();
    this.cacheTTL = 30_000; // 30s local cache to avoid Redis on every request
  }

  async isEnabled(flag, userId = null) {
    const cacheKey = `${flag}:${userId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.cacheTTL) return cached.value;

    const config = await this.redis.hGetAll(`flag:${flag}`);
    if (!config || config.enabled !== 'true') {
      this.cache.set(cacheKey, { value: false, ts: Date.now() });
      return false;
    }

    let result = true;

    // Percentage rollout
    if (config.rollout_percent && userId) {
      const hash = require('crypto')
        .createHash('md5').update(flag + userId).digest('hex');
      const bucket = parseInt(hash.slice(0, 8), 16) % 100;
      result = bucket < parseInt(config.rollout_percent);
    }

    // User whitelist
    if (config.whitelist && userId) {
      const whitelist = JSON.parse(config.whitelist);
      result = whitelist.includes(userId);
    }

    this.cache.set(cacheKey, { value: result, ts: Date.now() });
    return result;
  }

  async setFlag(flag, config) {
    await this.redis.hSet(`flag:${flag}`, {
      enabled: String(config.enabled),
      rollout_percent: String(config.rolloutPercent ?? 100),
      whitelist: JSON.stringify(config.whitelist ?? []),
    });
    this.cache.clear(); // invalidate local cache
  }
}

// Usage
const flags = new FeatureFlags(redisClient);

// Enable for 10% of users
await flags.setFlag('NEW_CHECKOUT', { enabled: true, rolloutPercent: 10 });

// Check in request handler
app.get('/checkout', async (req, res) => {
  const newFlow = await flags.isEnabled('NEW_CHECKOUT', req.user.id);
  if (newFlow) return newCheckoutHandler(req, res);
  return legacyCheckoutHandler(req, res);
});
```

### 3. LaunchDarkly / Unleash SDK (production-grade)

```js
// npm install @launchdarkly/node-server-sdk
const { init } = require('@launchdarkly/node-server-sdk');

const ldClient = init(process.env.LAUNCHDARKLY_SDK_KEY);
await ldClient.waitForInitialization();

// Feature check with user context
const variation = await ldClient.variation(
  'new-checkout-flow',
  { key: req.user.id, email: req.user.email, plan: req.user.plan },
  false // default value
);

if (variation) {
  // use new flow
}

// Multivariate flag (A/B/C test)
const buttonColor = await ldClient.variation(
  'cta-button-color',
  { key: req.user.id },
  'blue' // default
);
// returns 'blue', 'green', or 'red' based on flag config
```

---

## Gradual Rollout Pattern

```
Phase 1: Internal (0.1%)  → just engineers
Phase 2: Canary (1%)      → random 1% of users
Phase 3: Early access (5%) → opted-in users
Phase 4: Gradual (10% → 25% → 50% → 100%)
Phase 5: Flag removed      → code cleanup
```

```js
// Sticky bucketing — same user always gets same bucket
function getUserBucket(userId, flagName, buckets = 100) {
  const hash = require('crypto')
    .createHash('sha256')
    .update(`${flagName}:${userId}`)
    .digest('hex');
  return parseInt(hash.slice(0, 8), 16) % buckets;
}

// bucket is deterministic per user per flag
// userId=42, flag=new-checkout → bucket 73 (always)
// if rollout_percent=75, then bucket 73 < 75 → enabled ✓
// if rollout_percent=50, then bucket 73 >= 50 → disabled ✗
```

---

## Kill Switch Pattern

Ops toggles that immediately disable expensive or broken features under load:

```js
class CircuitBreakerFlag {
  constructor(flags, fallback) {
    this.flags = flags;
    this.fallback = fallback;
  }

  async run(flagName, primaryFn, args) {
    const enabled = await this.flags.isEnabled(flagName);
    if (!enabled) return this.fallback(...args);
    try {
      return await primaryFn(...args);
    } catch (err) {
      // Auto-disable flag after N failures (optional)
      console.error(`Flag ${flagName} triggered error:`, err);
      return this.fallback(...args);
    }
  }
}

// In practice: add oncall runbook with: "To disable ML recommendations under load: redis-cli HSET flag:ml-recs enabled false"
```

---

## Testing with Feature Flags

```js
// Don't test both branches in every test — use context overrides
describe('Checkout', () => {
  it('uses new flow when flag is on', async () => {
    jest.spyOn(flags, 'isEnabled').mockResolvedValue(true);
    const res = await request(app).post('/checkout').send(payload);
    expect(res.body.flow).toBe('new');
  });

  it('uses legacy flow when flag is off', async () => {
    jest.spyOn(flags, 'isEnabled').mockResolvedValue(false);
    const res = await request(app).post('/checkout').send(payload);
    expect(res.body.flow).toBe('legacy');
  });
});
```

---

## Flag Hygiene

**Technical debt:** Old flags never removed = permanent complexity. Each flag is a branch in every test.

```js
// Bad: flag from 18 months ago still in code
if (flags.isEnabled('MIGRATE_TO_POSTGRES')) { // always true in prod, never removed
  return postgresQuery();
}

// Fix: track flags with expiry comments + automated linting
// TODO(flag): MIGRATE_TO_POSTGRES — expires 2024-03-01, remove after
```

**Automated cleanup:** Use ESLint custom rule or grep CI check:

```bash
# CI check: fail if expired flags are still in code
grep -r "TODO(flag)" src/ | while read line; do
  expiry=$(echo "$line" | grep -o 'expires [0-9-]*' | cut -d' ' -f2)
  if [[ "$expiry" < "$(date +%Y-%m-%d)" ]]; then
    echo "EXPIRED FLAG: $line"
    exit 1
  fi
done
```

---

## Interview Q&A

**Q: How do feature flags enable trunk-based development?**

All engineers commit to main/trunk. Long-lived feature branches are replaced by flags. Incomplete features ship in the codebase but are gated behind an off flag. This eliminates merge conflicts from long-lived branches.

---

**Q: What's the difference between a feature flag and a configuration value?**

Configuration changes behavior for everyone (e.g., timeout = 5000ms). Feature flags target specific users/groups and are typically temporary. The line blurs with ops kill switches, which look like config but are often managed by the same system.

---

**Q: How would you A/B test a new feature and measure its impact?**

1. Create a flag with 50/50 split, consistent per user (sticky bucketing)
2. Log which variant each user gets with a `variant` property in analytics events
3. Wait for statistical significance (use a sample size calculator)
4. Compare conversion/retention/error rates between variants
5. Roll out winner to 100%, remove flag
