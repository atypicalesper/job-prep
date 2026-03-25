# MongoDB — Tricky Interview Questions

---

## Schema Design Patterns

MongoDB is schema-flexible, but that does not mean schema-free in practice. Applications impose a schema through their queries and code. The patterns below address specific performance or scalability problems that arise when the naive schema choice does not scale. Each pattern involves a deliberate trade-off: trading storage efficiency for write simplicity, or read speed for data duplication. Understanding when to apply each pattern is what separates experienced MongoDB practitioners from beginners.

### Bucket Pattern
```javascript
// Problem: Storing time-series data (IoT sensor readings)
// Naive: one document per reading → millions of tiny docs → index bloat

// ❌ Naive approach:
{ sensorId: 'S1', ts: ISODate('2024-01-01T00:00:00'), temp: 22.5 }
{ sensorId: 'S1', ts: ISODate('2024-01-01T00:01:00'), temp: 22.6 }
// ... 1,440 docs per sensor per day

// ✅ Bucket pattern: group readings into hourly buckets
{
  sensorId: 'S1',
  date: ISODate('2024-01-01T00:00:00'),   // bucket start
  count: 60,
  measurements: [
    { ts: ISODate('2024-01-01T00:00:00'), temp: 22.5 },
    { ts: ISODate('2024-01-01T00:01:00'), temp: 22.6 },
    // ... up to 60 readings per doc
  ],
  minTemp: 22.1,
  maxTemp: 23.0,
  sumTemp: 1350.0                         // precomputed for fast avg
}
// Benefits: 60x fewer documents, better cache utilization, precomputed stats
```

### Outlier Pattern
```javascript
// Problem: a few documents have huge arrays that blow past normal limits
// Example: celebrity social accounts with millions of followers

// ❌ Standard: { userId: '...', followers: [id1, id2, ...2M_ids] }
// Hits 16MB limit fast!

// ✅ Outlier pattern:
{
  _id: ObjectId('...'),
  username: 'celebrity',
  followerCount: 2000000,
  hasOverflow: true,              // flag to signal extra docs exist
  followers: [id1, id2, ..., id1000]  // first 1000
}
// Overflow documents:
{ mainId: ObjectId('...'), page: 2, followers: [id1001, ..., id2000] }
{ mainId: ObjectId('...'), page: 3, followers: [id2001, ..., id3000] }

// Normal users (99.9%): single document, fast reads
// Celebrities: query mainId, paginate overflow
```

### Extended Reference Pattern
```javascript
// Problem: $lookup is expensive; frequently joined data
// Solution: duplicate the most-read fields alongside the reference

// Instead of just storing the reference:
{ orderId: '...', customerId: ObjectId('cust1') }

// Store a subset of the referenced doc's fields:
{
  orderId: '....',
  customer: {
    _id: ObjectId('cust1'),
    name: 'Alice Chen',        // duplicated for fast reads
    email: 'alice@example.com' // duplicated
    // NOT duplicating: address, payment methods (changes often / rarely needed here)
  },
  items: [...]
}
// Trade-off: data duplication → must update denormalized copies on write
// Use when: fields rarely change, reads >> writes, join data is always needed
```

### Computed Pattern
```javascript
// Problem: expensive aggregation run on every read
// Solution: pre-compute and store derived values, update on write

// Products with ratings:
{
  productId: '...',
  name: 'Widget Pro',
  // Precomputed stats updated on every review write:
  ratingStats: {
    count: 1247,
    sum: 4612,
    avg: 3.7,                  // recomputed on each new review
    distribution: { 1: 42, 2: 89, 3: 234, 4: 401, 5: 481 }
  }
}

// On new review: use $inc/$set to update stats atomically
await Product.updateOne(
  { _id: productId },
  {
    $inc: { 'ratingStats.count': 1, 'ratingStats.sum': newRating },
    $set: { 'ratingStats.avg': (sum + newRating) / (count + 1) }
  }
);
// Never re-aggregate all reviews — O(1) write, O(1) read
```

---

## Performance & Explain Plans

MongoDB's `.explain('executionStats')` is the equivalent of PostgreSQL's `EXPLAIN ANALYZE`. It reveals whether the query used an index (`IXSCAN`) or scanned the entire collection (`COLLSCAN`), how many documents were examined vs returned (selectivity), and whether the query is "covered" (all data served from the index without loading documents). A `totalDocsExamined` that is much larger than `nReturned` means the index is poorly selective and the query examines many documents only to discard most of them.

```javascript
// Always check your queries with .explain('executionStats')
const result = await db.collection('orders').find(
  { userId: ObjectId('...'), status: 'pending' }
).explain('executionStats');

// Key fields to check:
// executionStats.executionStages.stage:
//   "COLLSCAN" → ❌ full collection scan, no index used
//   "IXSCAN"   → ✅ index scan
//   "FETCH"    → retrieve full docs after index scan (can be avoided with covered query)

// executionStats.totalDocsExamined vs nReturned:
//   If examined >> returned, index selectivity is poor

// Covered query (no FETCH — fastest possible):
// Index covers ALL fields in query + projection
db.users.createIndex({ status: 1, email: 1 });
db.users.find({ status: 'active' }, { email: 1, _id: 0 });
// Only hits index, never touches document storage

// Index intersection: MongoDB can combine two indexes
// But a compound index is usually more efficient than relying on this

// ESR rule for compound indexes:
// Equality fields first, Sort fields second, Range fields last
db.orders.createIndex({ userId: 1, createdAt: -1, status: 1 });
// Query: { userId: ..., status: { $in: [...] } } sorted by createdAt desc
// ✅ Equality (userId) → Sort (createdAt) → Range (status)
```

---

## Change Streams

Change streams let your application subscribe to a real-time feed of changes to a collection, database, or entire deployment. Internally, they tail MongoDB's oplog (operations log) and deliver change events as documents. Unlike polling, change streams push events to your application the moment they occur. A critical feature is the resume token: every event has a unique token that lets you restart the stream from exactly that point after a crash or restart, ensuring no events are missed.

```javascript
// Change streams: real-time notifications of collection changes
// Requires replica set or sharded cluster (uses oplog)

const collection = db.collection('orders');

// Watch all changes:
const changeStream = collection.watch();
changeStream.on('change', (event) => {
  console.log(event.operationType); // 'insert' | 'update' | 'delete' | 'replace'
  console.log(event.fullDocument);  // the document after change (insert/replace)
  console.log(event.documentKey);   // { _id: ObjectId('...') }
  console.log(event.updateDescription); // { updatedFields: {...}, removedFields: [...] }
});

// Filter specific operations:
const pipeline = [{ $match: { operationType: { $in: ['insert', 'update'] } } }];
const stream = collection.watch(pipeline, { fullDocument: 'updateLookup' });
// fullDocument: 'updateLookup' → fetch full doc after update (default: only diff)

// Resume token: survive restarts
let resumeToken;
stream.on('change', (event) => {
  resumeToken = event._id;          // save to persistent storage
  processChange(event);
});

// On restart:
const newStream = collection.watch(pipeline, { resumeAfter: resumeToken });

// Use cases: cache invalidation, search index sync, audit logging,
// real-time dashboards, CDC (change data capture) pipelines
```

---

## Read Preferences & Replica Sets

A MongoDB replica set is a group of nodes that all hold the same data: one primary that accepts all writes, and one or more secondaries that replicate from the primary asynchronously. Read preference controls which node your reads go to. Reading from a secondary can reduce load on the primary but risks reading stale data (replication lag is typically milliseconds but can be higher under load). Write concern controls how many nodes must acknowledge a write before the operation returns, trading throughput for durability.

```javascript
// Replica set: 1 primary + N secondaries (typically 3 nodes total)
// Primary: all writes. Reads default to primary.
// Secondaries: async replication. Can serve reads (stale by milliseconds).

// Read preference modes:
// primary (default): always read from primary → strong consistency
// primaryPreferred: try primary, fallback to secondary if unavailable
// secondary: always read from secondary → may read stale data
// secondaryPreferred: try secondary, fallback to primary
// nearest: lowest network latency (any node)

// In Mongoose:
mongoose.connect(uri, {
  replicaSet: 'rs0',
  readPreference: 'secondaryPreferred'  // spread read load
});

// Per-query read preference:
const users = await User
  .find({ status: 'active' })
  .read('secondary');  // ok to read slightly stale data for analytics

// Write concern: how many nodes must acknowledge before write returns
await Order.create(
  { userId: '...', amount: 100 },
  { writeConcern: { w: 'majority', j: true, wtimeout: 5000 } }
  // w: 'majority' → majority of replica set must acknowledge
  // j: true → write must be flushed to journal (survives crash)
);

// Read concern:
// local: read from primary, data may not be replicated yet
// majority: only return data acknowledged by majority (may be slightly stale)
// linearizable: most consistent, slowest
```

---

## Sharding Concepts

Sharding is MongoDB's horizontal scaling strategy: data is distributed across multiple independent servers (shards) based on a shard key. Each shard holds a subset of the data. The shard key is the most consequential architectural decision in a sharded deployment — once chosen, it is difficult to change. A poor shard key creates "hotspots" where one shard receives a disproportionate share of writes (monotonically increasing keys) or where the number of shards is fundamentally limited (low cardinality keys). A good shard key distributes writes evenly and allows most queries to be routed to a single shard.

```javascript
// Sharding: horizontal partitioning across multiple machines
// Needed when: single server can't handle data volume or write throughput

// Shard key selection is critical — hard to change later
// Good shard key: high cardinality, even distribution, query isolation

// ❌ Bad shard key: { createdAt: 1 }  — monotonically increasing
//   All writes go to the "max" shard (hotspot)

// ❌ Bad shard key: { country: 1 }    — low cardinality
//   Only as many shards as countries

// ✅ Good shard key: { userId: 1, _id: 1 }
//   High cardinality (many unique users), even distribution

// Hashed sharding: MongoDB hashes the key for even distribution
db.orders.createIndex({ userId: 'hashed' });
sh.shardCollection('mydb.orders', { userId: 'hashed' });
// Pros: perfectly even distribution
// Cons: range queries scan all shards

// Ranged sharding: preserves order
sh.shardCollection('mydb.metrics', { sensorId: 1, ts: 1 });
// Pros: range queries hit one shard
// Cons: risk of hotspots if key is monotonic

// Zones: pin certain key ranges to specific shards
// Example: pin EU users to EU datacenter shards
sh.addTagRange('mydb.users', { region: 'EU', _id: MinKey }, { region: 'EU', _id: MaxKey }, 'eu-shard');
```

---

## Atlas Search & Vector Search

Atlas Search is a full-text search engine built into MongoDB Atlas, powered by Apache Lucene. It provides relevance-scored search, fuzzy matching, autocomplete, highlighting, and faceted navigation — capabilities that MongoDB's built-in `$text` operator cannot match. Atlas Vector Search extends this to semantic (meaning-based) similarity search using embeddings: you store pre-computed vector embeddings alongside documents and query with a vector to find the semantically nearest documents. This is the foundation of retrieval-augmented generation (RAG) systems.

```javascript
// Atlas Search: full-text search powered by Lucene (not $text)
// Advantages over $text: relevance scoring, fuzzy matching, autocomplete, facets

// Define search index (via Atlas UI or API):
{
  "mappings": {
    "dynamic": true,   // auto-index all string fields
    "fields": {
      "title": [{ "type": "string", "analyzer": "lucene.standard" }],
      "tags":  [{ "type": "string" }]
    }
  }
}

// Query with $search aggregation stage:
const results = await Product.aggregate([
  {
    $search: {
      index: 'product_search',
      compound: {
        must: [{ text: { query: 'wireless headphones', path: ['title', 'description'] } }],
        filter: [{ range: { path: 'price', gte: 50, lte: 500 } }]
      },
      highlight: { path: ['title', 'description'] }
    }
  },
  { $limit: 20 },
  { $project: { title: 1, price: 1, score: { $meta: 'searchScore' }, highlights: { $meta: 'searchHighlights' } } }
]);

// Vector Search (Atlas Vector Search): semantic similarity
// Store embeddings as arrays of floats
{
  _id: ObjectId('...'),
  text: "How to handle Node.js streams?",
  embedding: [0.023, -0.145, 0.892, ...]  // 1536-dim OpenAI embedding
}

// kNN vector search:
const similar = await Article.aggregate([
  {
    $vectorSearch: {
      index: 'vector_index',
      path: 'embedding',
      queryVector: await getEmbedding(userQuery),
      numCandidates: 150,
      limit: 10
    }
  }
]);
```

---

## Tricky Interview Q&A

These questions target the gaps between MongoDB and SQL intuitions, and between expected and actual behavior of specific operators. They are the questions developers get wrong in interviews because MongoDB's document replacement semantics, atomic operators, and concurrency model differ fundamentally from SQL's row-based update model.

**Q: What happens when you do `updateOne` without `$set`?**
```javascript
// ❌ This REPLACES the entire document (except _id):
await User.updateOne({ _id: id }, { name: 'Alice' });
// Document becomes: { _id: ..., name: 'Alice' }
// All other fields (email, age, etc.) are GONE

// ✅ Use $set to update specific fields:
await User.updateOne({ _id: id }, { $set: { name: 'Alice' } });
```

---

**Q: What does `{ $inc: { views: 1 } }` guarantee?**
A: It's an **atomic operation** — safe for concurrent updates. No read-modify-write race condition. MongoDB handles concurrency at the document level. Two simultaneous `$inc` calls will each increment by 1, resulting in +2 total. If you instead read `views`, add 1, and write back, you'd have a lost update.

---

**Q: Why can `$lookup` hurt performance and how do you mitigate it?**
A: `$lookup` is an in-memory join — for each document in the pipeline, MongoDB fetches matching docs from the foreign collection. Costs: two collection scans without proper indexes, result set held in memory (100MB limit). Mitigations:
1. Create an index on the foreign collection's `localField`
2. Use `$match` BEFORE `$lookup` to minimize input documents
3. Use the pipeline form of `$lookup` with `$match` inside to filter joined docs
4. Consider denormalizing hot paths using the Extended Reference pattern

---

**Q: What is the difference between `deleteMany` and `drop`?**
A: `deleteMany({})` removes all documents but preserves the collection, indexes, and metadata — slower for large collections (removes docs one-by-one). `drop()` deletes the entire collection including all indexes — O(1), much faster. If you're clearing a collection, `drop()` + recreate indexes is faster for large datasets.

---

**Q: How does MongoDB handle concurrent writes to the same document?**
A: MongoDB uses document-level locking (WiredTiger storage engine). Only one write can modify a document at a time — subsequent writes queue and execute serially. This means atomic operators like `$inc`, `$push`, `$addToSet` are safe without application-level locking. For multi-document operations requiring atomicity, use transactions.

---

**Q: What is the oplog and why does it matter?**
A: The operations log (oplog) is a capped collection in the `local` database that records all write operations in a replica set. Secondaries tail the oplog to replicate changes from the primary. Change streams are built on the oplog. If a secondary falls too far behind and the oplog is overwritten (oplog window), it must do a full resync — so size your oplog appropriately for your write volume.

---

**Q: When does `upsert: true` create vs update?**
```javascript
// upsert: if no document matches filter, insert one
await User.updateOne(
  { email: 'alice@example.com' },  // filter
  { $set: { name: 'Alice', lastLogin: new Date() }, $setOnInsert: { createdAt: new Date() } },
  { upsert: true }
);
// If exists → updates name + lastLogin
// If new → creates doc with name + lastLogin + createdAt
// $setOnInsert: fields only set on INSERT, ignored on UPDATE
```

---

**Q: What causes a "WriteConflict" error in transactions?**
A: Two concurrent transactions try to modify the same document. MongoDB uses optimistic concurrency — it detects the conflict at commit time. One transaction succeeds; the other gets `WriteConflict` (error code 112). You must retry the transaction. This is different from locking (pessimistic) — transactions don't block each other upfront. Always wrap multi-document transactions in a retry loop.

---

**Q: What is the 16MB document size limit and how do you work around it?**
A: MongoDB documents are capped at 16MB (BSON limit). For larger data:
1. **GridFS**: splits files into 255KB chunks stored in two collections (`fs.files` + `fs.chunks`). Good for images, videos, large files.
2. **Bucket pattern**: for unbounded arrays, group into fixed-size bucket documents.
3. **Overflow documents**: main doc links to additional docs (outlier pattern).
4. **External storage**: store binary data in S3, save URL reference in MongoDB.

---

**Q: How would you paginate efficiently in MongoDB?**
```javascript
// ❌ Skip-based pagination: O(n) — MongoDB must scan and discard
const page3 = await Product.find({}).skip(200).limit(20); // scans 220 docs

// ✅ Cursor-based pagination: O(log n) with index
// Return _id of last item on page:
const page1 = await Product.find({}).sort({ _id: 1 }).limit(20);
const lastId = page1[page1.length - 1]._id;

// Next page: start after last seen _id
const page2 = await Product.find({ _id: { $gt: lastId } }).sort({ _id: 1 }).limit(20);

// With compound sort (e.g., by createdAt, then _id for tiebreaker):
const page2 = await Product.find({
  $or: [
    { createdAt: { $lt: lastCreatedAt } },
    { createdAt: lastCreatedAt, _id: { $gt: lastId } }
  ]
}).sort({ createdAt: -1, _id: 1 }).limit(20);
```

---

**Q: What is `allowDiskUse` in aggregation and when do you need it?**
A: Aggregation pipeline stages have a 100MB memory limit. If a `$sort` or `$group` stage exceeds this, the operation fails with "exceeded memory limit." Setting `allowDiskUse: true` spills to disk (slower but doesn't fail). Better solutions: add an index to avoid in-memory sort, use `$match` early to reduce data size, or use `$bucket` / `$bucketAuto` instead of `$group`.

---

**Q: What is the difference between `find().count()` and `countDocuments()`?**
A: `find().count()` ignores `skip` and `limit` — returns total matches. `countDocuments()` is the preferred modern API: it uses a `$match` stage in a count aggregation, respects all query predicates, and uses indexes. `estimatedDocumentCount()` is fastest — uses collection metadata, no query predicates, no index needed. Use it for "how many docs total" checks.

---

**Q: How do you handle schema migrations in MongoDB?**
A: MongoDB is schemaless, but your application assumes a schema. Strategies:
1. **Lazy migration**: add a `schemaVersion` field. On read, detect old version and migrate in-app, write back new version.
2. **Background migration script**: bulk update documents in batches with `bulkWrite` to add/rename fields.
3. **Dual-read**: read both old and new field format, write only new format going forward.
4. **Avoid**: never do a blocking migration on a live production collection — use batched updates with `{ ordered: false }` and rate limiting.

---

**Q: What is a covered query and how do you create one?**
```javascript
// A covered query is satisfied entirely by an index — never touches documents.
// Requirements: query fields AND projection fields ALL in the index (and _id excluded)

// Create compound index:
db.users.createIndex({ status: 1, age: 1, email: 1 });

// Covered query:
db.users.find(
  { status: 'active', age: { $gte: 18 } },  // filter uses index fields
  { email: 1, _id: 0 }                       // projection only uses index fields
);
// explain() → IXSCAN with no FETCH stage → fastest possible read
```

---

**Q: What happens to indexes during a collection rename or migration?**
A: `renameCollection` preserves all indexes on the collection — they move with the collection atomically. However, if you're copying data to a new collection with `$out` in aggregation, you must re-create indexes on the output collection manually. `$out` creates a new collection with no indexes.

---

**Q: Explain the WiredTiger cache and how to size it.**
A: WiredTiger is MongoDB's default storage engine. It uses an in-memory cache (default: larger of 50% of (RAM - 1GB) or 256MB). Frequently accessed data and indexes are cached. When cache is full, WiredTiger evicts dirty pages to disk. Signs of cache pressure: high disk I/O, slow reads, `wiredTiger.cache.pages read into cache` metric growing. For read-heavy workloads, allocate more RAM. WiredTiger also uses file system cache (OS page cache) as a second cache layer.

---

**Q: What is `$facet` and when would you use it?**
```javascript
// $facet: run multiple aggregation pipelines on the same input in one pass
// Use case: search results page with multiple filter counts

const result = await Product.aggregate([
  { $match: { category: 'electronics' } },   // initial filter
  {
    $facet: {
      // Facet 1: paginated results
      results: [
        { $sort: { price: 1 } },
        { $skip: 0 },
        { $limit: 20 },
        { $project: { name: 1, price: 1 } }
      ],
      // Facet 2: count by brand
      byBrand: [
        { $group: { _id: '$brand', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ],
      // Facet 3: price range distribution
      priceRanges: [
        { $bucket: { groupBy: '$price', boundaries: [0, 50, 150, 500, 2000], default: 'Other' } }
      ],
      // Facet 4: total count
      totalCount: [{ $count: 'count' }]
    }
  }
]);
// Single aggregation → results + filter counts + total, all at once
```

---

**Q: How do you model a many-to-many relationship?**
```javascript
// Option A: Array of references on one side (good when one side is bounded)
// Students → courses (student has ≤ 20 courses):
{
  _id: ObjectId('student1'),
  name: 'Alice',
  enrolledCourses: [ObjectId('course1'), ObjectId('course2'), ObjectId('course5')]
}
// Query all courses for a student: $in lookup
// Query all students in a course: requires index on enrolledCourses

// Option B: Join collection (for large many-to-many or extra metadata on the link)
{
  _id: ObjectId('...'),
  studentId: ObjectId('student1'),
  courseId: ObjectId('course1'),
  enrolledAt: ISODate('...'),
  grade: 'A'
}
// Index: { studentId: 1, courseId: 1 } unique
// More flexible: can store relationship metadata
// Use for: enrollment systems, follows/followers, product-tags at scale
```
