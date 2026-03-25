# API Versioning Strategies

## Why Version APIs?

Breaking changes are inevitable as products evolve. Versioning lets you evolve the API without breaking existing clients.

**Breaking changes:**
- Removing a field or endpoint
- Renaming a field
- Changing a field's type
- Changing response structure
- Changing authentication method

**Non-breaking changes:**
- Adding optional fields to response
- Adding new endpoints
- Adding optional request parameters

---

## Strategy 1: URL Path Versioning

URL path versioning is the most widely adopted strategy because it is explicit, easy to test in a browser or `curl`, and trivial to route at the infrastructure level (nginx, API gateways) based on the path prefix. The downside is a theoretical violation of REST purity: the version is not a property of the resource, but of the representation of the resource — ideally captured in content negotiation headers. In practice, developer ergonomics win and URL versioning is the de facto standard for public APIs.

```
GET /api/v1/users
GET /api/v2/users
```

### Implementation in Express

```js
const express = require('express');
const app = express();

// v1 router
const v1 = express.Router();
v1.get('/users', (req, res) => {
  res.json({ users: [{ id: 1, name: 'Alice', address: '123 Main St' }] }); // flat address
});

// v2 router — address is now an object
const v2 = express.Router();
v2.get('/users', (req, res) => {
  res.json({
    users: [{
      id: 1,
      name: 'Alice',
      address: { street: '123 Main St', city: 'NYC', zip: '10001' },
    }],
  });
});

app.use('/api/v1', v1);
app.use('/api/v2', v2);
```

**Pros:**
- Easy to see version in URL
- Easy to test in browser
- Simple proxy/routing by path prefix

**Cons:**
- URL should represent a resource, not a version
- Can't vary version by content type
- Clients must change URLs when upgrading

**Used by:** Stripe, Twitter v1, Twilio

---

## Strategy 2: Header Versioning

Header versioning keeps URLs stable and clean — the same URL always refers to the same logical resource, and the version is metadata about the representation. This is more correct from a REST perspective and avoids baking a version into every client's hardcoded URL. The practical challenge is that headers are invisible in a browser address bar and require tools like Postman or curl flags to test. Caching is also more complex: CDNs must be configured with a `Vary: API-Version` directive to cache different versions of the same URL separately.

```
GET /api/users
API-Version: 2024-01-15
```

### Implementation

```js
function versionMiddleware(req, res, next) {
  const version = req.headers['api-version'] || 'v1';
  req.apiVersion = version;
  res.setHeader('API-Version', version);
  next();
}

app.use(versionMiddleware);

app.get('/api/users', (req, res) => {
  if (req.apiVersion === 'v2' || req.apiVersion >= '2024-01-15') {
    return res.json(getUsersV2());
  }
  return res.json(getUsersV1());
});
```

### Date-based versioning (Stripe's approach since 2023)

```js
const VERSIONS = ['2023-01-01', '2023-06-01', '2024-01-15'];

function resolveVersion(requestedVersion) {
  if (!requestedVersion) return VERSIONS[0]; // default to oldest (safest for compat)
  const valid = VERSIONS.find(v => v <= requestedVersion);
  return valid || VERSIONS[0];
}

// Changelog-style:
// 2024-01-15: address changed from string to object
// 2023-06-01: pagination changed from page/limit to cursor-based
```

**Pros:**
- Clean URLs
- Version is metadata, not resource identifier
- Easy to have per-account default version

**Cons:**
- Not visible in browser/curl without extra flags
- Harder to test without tools
- Caching can be tricky (must Vary on the header)

```
Vary: API-Version   // tell CDNs/proxies to cache separately per version
```

**Used by:** Stripe, GitHub

---

## Strategy 3: Accept Header / Content Negotiation

```
GET /api/users
Accept: application/vnd.myapi.v2+json
```

```js
app.get('/api/users', (req, res) => {
  const accept = req.headers['accept'] || '';
  const match = accept.match(/application\/vnd\.myapi\.v(\d+)\+json/);
  const version = match ? parseInt(match[1]) : 1;

  res.setHeader('Content-Type', `application/vnd.myapi.v${version}+json`);

  if (version >= 2) return res.json(getUsersV2());
  return res.json(getUsersV1());
});
```

**Pros:**
- REST-purist approach — URLs are stable resource identifiers
- Version is part of content negotiation

**Cons:**
- Complex to implement and document
- Not intuitive for developers
- Browser testing is awkward

**Used by:** GitHub API v3 (partially), some hypermedia APIs

---

## Strategy 4: Query Parameter Versioning

```
GET /api/users?version=2
GET /api/users?api-version=2024-01-15
```

```js
app.get('/api/users', (req, res) => {
  const version = req.query.version || '1';
  if (version === '2') return res.json(getUsersV2());
  return res.json(getUsersV1());
});
```

**Pros:** Simple to implement and test

**Cons:** Query params are for filtering/sorting; version is not a query parameter semantically. Pollutes cache keys.

**Used by:** Microsoft Azure REST APIs (`api-version=2023-01-01`)

---

## Strategy Comparison

| Strategy | URL clarity | REST purity | Cache-friendly | Dev experience |
|---|---|---|---|---|
| URL path | ✓ obvious | ✗ URL≠resource | ✓ | ✓ easy |
| Header | ✓ clean URL | ✓ | ⚠ need Vary | ⚠ need tools |
| Accept header | ✓ clean URL | ✓✓ | ⚠ need Vary | ✗ complex |
| Query param | ⚠ pollutes | ✗ | ✗ | ✓ easy |

---

## Versioning Architecture Patterns

The naive approach to versioning — duplicating route handlers for each version — quickly becomes unmaintainable as the number of versions and endpoints grows. Two architectural patterns address this: the transformation layer (adapter pattern) keeps a single canonical business logic implementation and transforms inputs/outputs per version at the boundary; and sunset headers allow you to communicate deprecation timelines to clients without removing endpoints immediately. Both patterns reduce the long-term cost of maintaining multiple API versions.

### Transformation layer (adapter pattern)

Instead of duplicating route handlers per version, transform inputs/outputs:

```js
// transformers/users.js
const transformers = {
  v1: {
    response: (user) => ({
      id: user.id,
      name: user.name,
      address: `${user.address.street}, ${user.address.city}`, // flatten for v1
    }),
  },
  v2: {
    response: (user) => user, // v2 gets the native format
  },
};

// Single handler, versioned transformation
app.get('/api/users/:id', async (req, res) => {
  const version = req.apiVersion;
  const user = await UserService.findById(req.params.id);
  const transformer = transformers[version] || transformers.v1;
  res.json(transformer.response(user));
});
```

### Sunset headers

Tell clients a version is being deprecated:

```js
app.use('/api/v1', (req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', 'Sat, 01 Jan 2025 00:00:00 GMT');
  res.setHeader('Link', '</api/v2/users>; rel="successor-version"');
  next();
});
```

### API versioning in OpenAPI/Swagger

```yaml
# openapi.yaml
openapi: 3.1.0
info:
  title: My API
  version: '2024-01-15'
servers:
  - url: https://api.example.com/v2
    description: Current stable version
  - url: https://api.example.com/v1
    description: Legacy (sunset 2025-01-01)
```

---

## Interview Q&A

**Q: Which versioning strategy does Stripe use and why?**

Stripe uses date-based header versioning (`Stripe-Version: 2024-01-15`). Each API key has a default version (the version at time of key creation). This means old integrations never see breaking changes unless they opt in. New features are available immediately on the latest version.

---

**Q: How do you handle a breaking change without a version bump?**

Field aliases + deprecation: add the new field alongside the old one, mark old as deprecated in docs, monitor usage via analytics, remove after a sunset period.

```json
{
  "address": "123 Main St",           // deprecated
  "addressObject": {                   // new format
    "street": "123 Main St",
    "city": "NYC"
  }
}
```

---

**Q: How do you avoid version sprawl?**

1. Use Stripe's date-based model — every change gets a date, no major versions
2. Minimize breaking changes via additive design (never remove, only add optional fields)
3. Set a clear deprecation policy (e.g., old versions supported for 18 months)
4. Monitor version usage via metrics — sunset versions with zero traffic

---

**Q: Should internal microservice APIs be versioned?**

Usually not strictly — internal services are deployed together and can be changed atomically. But if teams are decoupled or deployments are staggered, use the Consumer-Driven Contract testing pattern (Pact.js) rather than explicit versioning.
