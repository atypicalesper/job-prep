# MongoDB — Patterns and Interview Questions

---

## Document Model vs Relational

MongoDB stores data as BSON documents (Binary JSON) rather than rows in tables. The fundamental difference from SQL is that related data can either be embedded directly in the document (denormalization) or stored in a separate collection and referenced by ID (normalization). There is no join at the storage level — MongoDB's `$lookup` aggregation stage performs joins in memory. The design question is always: should this data live inside the parent document or in its own collection? The answer depends on access patterns, data size, and how frequently the data changes independently.

```javascript
// SQL: users + posts are separate tables, JOIN to combine
// MongoDB: embed related data or reference

// Option 1: Embedding (denormalized)
{
  _id: ObjectId("..."),
  name: "Alice",
  email: "alice@example.com",
  addresses: [                       // embedded array
    { type: "home", city: "NYC", zip: "10001" },
    { type: "work", city: "Brooklyn", zip: "11201" }
  ],
  preferences: { theme: "dark", notifications: true }
}
// ✅ Single read gets everything
// ❌ Addresses can't be queried independently
// ❌ Document size limit: 16MB

// Option 2: Referencing (normalized)
// users collection:
{ _id: ObjectId("user1"), name: "Alice" }

// posts collection:
{ _id: ObjectId("post1"), title: "Hello", authorId: ObjectId("user1") }
// ✅ Independent querying
// ❌ Multiple reads (or $lookup) for related data
```

---

## Embed vs Reference — Decision Rules

```
Embed when:
- Data is always accessed together ("owns" relationship)
- Small, bounded subdocuments (addresses, settings)
- No independent access needed
- 1:few relationship

Reference when:
- Data accessed independently
- Data can grow unboundedly (posts by user)
- Data shared between documents
- 1:many or many:many
- Avoid duplication (user name in 1000 posts)
```

---

## CRUD with Mongoose

Mongoose is an ODM (Object Document Mapper) for MongoDB and Node.js. It adds schema validation, type casting, and a query API on top of the native MongoDB driver. Defining a schema is optional in raw MongoDB but important in application code — it enforces structure, provides defaults, enables validators, and generates TypeScript types. Indexes defined in the schema are synced to the database when the model is first used (or during explicit `syncIndexes()`).

```javascript
import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  age: { type: Number, min: 0, max: 150 },
  tags: [String],
  address: {
    city: String,
    country: { type: String, default: 'US' }
  },
  createdAt: { type: Date, default: Date.now }
});

// Indexes:
UserSchema.index({ email: 1 });           // unique already creates index
UserSchema.index({ name: 'text' });       // full-text search
UserSchema.index({ age: 1, name: 1 });   // compound index

const User = mongoose.model('User', UserSchema);

// Create:
const user = await User.create({ name: 'Alice', email: 'alice@example.com' });

// Read:
const alice = await User.findById('...');
const users = await User.find({ age: { $gte: 18 } }).sort({ name: 1 }).limit(20);
const count = await User.countDocuments({ 'address.country': 'US' });

// Update:
await User.updateOne({ _id: id }, { $set: { name: 'Alicia' } });
await User.findByIdAndUpdate(id, { $push: { tags: 'premium' } }, { new: true });

// Delete:
await User.deleteOne({ _id: id });
await User.deleteMany({ createdAt: { $lt: cutoffDate } });
```

---

## Query Operators

MongoDB queries are expressed as JSON-like filter documents rather than SQL strings. Operators are prefixed with `$` and can be nested to build arbitrarily complex predicates. The query document is implicitly an `AND` of all top-level conditions; explicit `$and`, `$or`, and `$nor` allow combining conditions with different logical relationships. Array operators like `$all` and `$elemMatch` let you query into embedded arrays without destructuring them first.

```javascript
// Comparison:
{ age: { $gt: 25, $lte: 50 } }          // 25 < age <= 50
{ status: { $in: ['active', 'trial'] } } // status is one of these
{ role: { $nin: ['admin', 'root'] } }    // role not in array
{ email: { $ne: null } }                 // not null

// Logical:
{ $and: [{ age: { $gt: 18 } }, { country: 'US' }] }
{ $or: [{ age: { $lt: 18 } }, { parentalConsent: true }] }
{ $nor: [{ banned: true }, { suspended: true }] }
{ banned: { $not: { $eq: true } } }

// Element:
{ middleName: { $exists: false } }       // field doesn't exist
{ age: { $type: 'number' } }             // field is a number

// Array:
{ tags: 'nodejs' }                       // contains 'nodejs'
{ tags: { $all: ['nodejs', 'js'] } }     // contains both
{ tags: { $size: 3 } }                   // exactly 3 elements
{ 'scores.0': { $gt: 90 } }             // first score > 90

// Regex:
{ name: { $regex: '^alice', $options: 'i' } }  // starts with alice (case-insensitive)

// Text search (requires text index):
{ $text: { $search: 'node javascript', $caseSensitive: false } }
```

---

## Aggregation Pipeline

The aggregation pipeline is MongoDB's answer to SQL's `GROUP BY`, `JOIN`, `HAVING`, and derived columns — all in one composable system. A pipeline is an ordered array of stages; each stage transforms the stream of documents produced by the previous stage. The key mental model: documents flow through stages like water through a pipe, with each stage either filtering, reshaping, joining, or computing values. Order matters — a `$match` placed early reduces the number of documents all subsequent stages must process, making it much cheaper.

```javascript
// Pipeline: array of stages, each transforms the documents
const result = await Order.aggregate([
  // Stage 1: Filter
  { $match: { createdAt: { $gte: new Date('2024-01-01') }, status: 'completed' } },

  // Stage 2: Join with users collection
  { $lookup: {
    from: 'users',
    localField: 'userId',
    foreignField: '_id',
    as: 'user'
  }},
  { $unwind: '$user' },         // flatten the array from $lookup

  // Stage 3: Group and aggregate
  { $group: {
    _id: '$user.country',
    totalRevenue: { $sum: '$amount' },
    orderCount: { $sum: 1 },
    avgOrderValue: { $avg: '$amount' },
    uniqueCustomers: { $addToSet: '$userId' }
  }},

  // Stage 4: Add computed field
  { $addFields: {
    uniqueCustomerCount: { $size: '$uniqueCustomers' }
  }},

  // Stage 5: Sort
  { $sort: { totalRevenue: -1 } },

  // Stage 6: Limit
  { $limit: 10 },

  // Stage 7: Shape output
  { $project: {
    country: '$_id',
    totalRevenue: 1,
    orderCount: 1,
    avgOrderValue: { $round: ['$avgOrderValue', 2] },
    uniqueCustomerCount: 1,
    _id: 0
  }}
]);
```

---

## Indexes in MongoDB

MongoDB indexes serve the same fundamental purpose as SQL indexes: allow the query planner to find matching documents without scanning the entire collection. Without an index, MongoDB performs a `COLLSCAN` (collection scan) — reading every document. MongoDB indexes are B-Tree-based by default. Compound indexes follow the same left-prefix rule as SQL: only queries that filter or sort on the leftmost field(s) of the index can use it. Special index types — sparse (skip missing-field documents), partial (only documents matching a condition), TTL (auto-expire), text (full-text), and wildcard — handle cases where a standard B-Tree index is insufficient.

```javascript
// Single field:
db.users.createIndex({ email: 1 });         // ascending
db.users.createIndex({ score: -1 });        // descending

// Compound:
db.orders.createIndex({ userId: 1, createdAt: -1 }); // user's orders, newest first

// Unique:
db.users.createIndex({ email: 1 }, { unique: true });

// Sparse (only indexes documents that have the field):
db.users.createIndex({ phone: 1 }, { sparse: true });

// TTL (auto-delete after N seconds):
db.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Documents deleted when expiresAt field value is in the past

// Partial (index subset of documents):
db.products.createIndex(
  { price: 1 },
  { partialFilterExpression: { status: 'active' } }
);

// Text:
db.articles.createIndex({ title: 'text', body: 'text' });

// Wildcard (index all fields in subdocument):
db.products.createIndex({ 'attributes.$**': 1 });
```

---

## Transactions in MongoDB (4.0+)

MongoDB 4.0 added multi-document ACID transactions, which allow multiple operations across multiple documents (and collections) to be committed or rolled back atomically — similar to SQL transactions. Before 4.0, only single-document operations were atomic. Multi-document transactions are more expensive than in PostgreSQL because MongoDB was not designed with locking primitives optimized for them. Use them when you genuinely need cross-document atomicity; for most cases, schema design that keeps related data in one document (embedding) avoids the need for transactions.

```javascript
const session = await mongoose.startSession();
session.startTransaction();

try {
  // Transfer money between accounts — must be atomic:
  await Account.updateOne(
    { _id: fromId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { session }
  );

  const result = await Account.updateOne(
    { _id: toId },
    { $inc: { balance: amount } },
    { session }
  );

  if (result.modifiedCount === 0) throw new Error('Recipient not found');

  await Transaction.create([{
    from: fromId, to: toId, amount, type: 'transfer'
  }], { session });

  await session.commitTransaction();
} catch (err) {
  await session.abortTransaction();
  throw err;
} finally {
  session.endSession();
}
```

---

## Common Anti-patterns

These are the mistakes that cause MongoDB applications to fail at scale. The most dangerous is the unbounded growing array: embedding an ever-growing list (posts, comments, events) in a parent document will eventually hit MongoDB's 16MB BSON document limit and degrade performance long before that. A close second is issuing queries without indexes — a `COLLSCAN` on a large collection in production can bring down an entire service. Knowing these anti-patterns lets you recognize and fix them in code review before they reach production.

```javascript
// ❌ Growing arrays — embedding unbounded data:
// Bad: { userId: '1', posts: [post1, post2, ...100000posts] }
// 16MB document limit! Also: every update rewrites the whole document
// Fix: separate posts collection with userId reference

// ❌ Querying without indexes:
await User.find({ age: { $gt: 25 } }); // COLLSCAN if no index on age!
// Fix: await User.find({ age: { $gt: 25 } }).explain() to check, then add index

// ❌ Using _id as string instead of ObjectId:
// Bad: { _id: '507f1f77bcf86cd799439011' } // string
// Good: { _id: ObjectId('507f1f77bcf86cd799439011') }
// Indexes and queries on ObjectId are more efficient

// ❌ Updating with $set on entire document (overwrites everything):
await User.updateOne({ _id: id }, { name: 'Alice' }); // REPLACES the document!
// Fix:
await User.updateOne({ _id: id }, { $set: { name: 'Alice' } }); // updates field only

// ❌ Not using projection (fetching unnecessary data):
const users = await User.find({}); // fetches every field
// Fix:
const users = await User.find({}, { name: 1, email: 1 }); // only needed fields
```

---

## Interview Questions

**Q: When would you choose MongoDB over PostgreSQL?**
A: MongoDB for: flexible/evolving schemas (different products with different attributes), document-oriented data that's accessed as a unit (user profile + settings + preferences together), rapid prototyping, content management. PostgreSQL for: relational data with complex joins, ACID transactions across multiple tables, complex queries, financial data. Many modern apps use both — PostgreSQL for core relational data, MongoDB for catalog/content.

**Q: What is the aggregation pipeline?**
A: A sequence of stages that transform documents. Each stage takes the output of the previous. Common stages: `$match` (filter, like WHERE), `$group` (aggregate, like GROUP BY), `$sort`, `$limit`, `$skip`, `$project` (reshape, like SELECT), `$lookup` (join with another collection), `$unwind` (flatten arrays), `$addFields`, `$facet` (multiple aggregations in one pass). More powerful than SQL for nested document operations.

**Q: What are the ACID guarantees in MongoDB?**
A: Single-document operations are always ACID (atomically written). Multi-document transactions (4.0+) provide ACID guarantees similar to relational DBs, but with performance overhead. Without multi-document transactions, use: embedded documents to keep related data atomic, or the two-phase commit pattern for distributed transactions.

**Q: What is the `$lookup` equivalent to in SQL?**
A: `$lookup` is a LEFT JOIN. It joins documents from another collection based on matching fields. Result is an array of matched documents embedded in the parent. Use `$unwind` to deconstruct the array (turning 1 parent with N children into N documents). Performance note: `$lookup` is more expensive in MongoDB than joins in PostgreSQL — normalize your schema carefully.

**Q: What is the difference between `$match` placed before vs after `$group`?**
A: `$match` before `$group` filters documents before aggregation — indexes can be used, reducing the number of docs processed. `$match` after `$group` filters the aggregated results. Always push `$match` as early as possible in the pipeline. MongoDB optimizer will move a trailing `$match` before a `$sort` if it can, but won't always move it before `$group`.

**Q: What is an upsert race condition and how do you prevent it?**
A: When two concurrent upserts match zero documents and both try to insert, one will fail with a duplicate key error (if a unique index exists). Without a unique index, you get two documents inserted. Fix: always have a unique index on the filter field used for upserts. Catch and retry `E11000 duplicate key` errors — the second writer's upsert will then match the inserted doc and update it.

**Q: How does `$addToSet` differ from `$push`?**
A: `$push` always appends to an array (allows duplicates). `$addToSet` only appends if the value doesn't already exist (set semantics). `$addToSet` is atomic but requires a full array scan to check for duplicates — avoid on large arrays. For large sets, consider a separate collection with a unique index instead.

**Q: What is projection exclusion vs inclusion and can you mix them?**
```javascript
// Inclusion: specify fields to return (all others omitted)
db.users.find({}, { name: 1, email: 1 })      // returns _id, name, email

// Exclusion: specify fields to omit (all others returned)
db.users.find({}, { password: 0, token: 0 })  // returns everything except these

// ❌ Cannot mix inclusion and exclusion (except _id):
db.users.find({}, { name: 1, password: 0 })   // Error!

// ✅ _id is special — can be excluded from an inclusion projection:
db.users.find({}, { name: 1, email: 1, _id: 0 })  // returns only name, email
```
