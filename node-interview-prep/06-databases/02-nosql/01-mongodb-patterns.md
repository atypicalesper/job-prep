# MongoDB — Patterns and Interview Questions

---

## Document Model vs Relational

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
