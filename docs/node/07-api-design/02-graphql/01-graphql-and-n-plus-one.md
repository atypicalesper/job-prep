# GraphQL — Core Concepts and the N+1 Problem

---

## GraphQL vs REST

```
REST:                           GraphQL:
Multiple endpoints              Single endpoint (/graphql)
Server defines shape            Client defines shape
Over/under-fetching common      Exactly what you need
Versioning via URL              Schema evolution with deprecation
HTTP caching native             HTTP caching harder
Good for: simple APIs           Good for: complex data, multiple clients
```

---

## Schema Definition

The GraphQL schema is the contract between the server and all its clients. It is written in Schema Definition Language (SDL) and defines every type, every field on each type, and the root operation types: `Query` (reads), `Mutation` (writes), and `Subscription` (real-time events). Unlike a REST API where the shape of the response is determined by the server implementation, a GraphQL schema is the authoritative specification — clients know exactly what fields are available and what types they return before making any request. `!` after a type means the field is non-nullable; its absence means the field may be null. Input types (`input`) are separate from output types to enforce the distinction between data you send and data you receive.

```graphql
type User {
  id: ID!
  name: String!
  email: String!
  posts: [Post!]!
  createdAt: String!
}

type Post {
  id: ID!
  title: String!
  content: String!
  author: User!
  comments: [Comment!]!
  tags: [String!]!
}

type Comment {
  id: ID!
  body: String!
  author: User!
  post: Post!
}

type Query {
  user(id: ID!): User
  users(limit: Int, offset: Int): [User!]!
  post(id: ID!): Post
}

type Mutation {
  createUser(input: CreateUserInput!): User!
  updateUser(id: ID!, input: UpdateUserInput!): User!
  deleteUser(id: ID!): Boolean!
}

type Subscription {
  postCreated: Post!
  commentAdded(postId: ID!): Comment!
}

input CreateUserInput {
  name: String!
  email: String!
}
```

---

## The N+1 Problem

GraphQL's resolver model — one function per field — is elegant but creates a structural trap. When a list query returns N items and each item has a resolver that independently queries the database for related data, the result is N+1 database queries (1 for the list + N for each item's related data). This happens silently and is invisible in development with small datasets, but in production with 100 users it becomes 101 queries, and the problem scales linearly. DataLoader is the standard solution.

```javascript
// Query: give me 10 users and their posts
const query = `
  query {
    users(limit: 10) {
      id
      name
      posts {         # ← This causes N+1!
        id
        title
      }
    }
  }
`;

// Without DataLoader — what happens:
const resolvers = {
  Query: {
    users: () => db.query('SELECT * FROM users LIMIT 10'), // 1 query
  },
  User: {
    posts: (user) => db.query('SELECT * FROM posts WHERE user_id = $1', [user.id])
    // ↑ Called ONCE PER USER — 10 users = 10 additional queries!
    // Total: 11 queries instead of 2
  }
};
```

---

## DataLoader — The Solution

DataLoader is a batching and caching utility for data fetching. Its fundamental trick is to collect all individual `.load(key)` calls that happen within a single event loop tick and deliver them together to a batch function, which performs one database query for all keys at once. The resolver model remains clean — each resolver calls `loader.load(user.id)` as if it were making one request — but DataLoader coalesces all those calls into a single `WHERE id = ANY(...)` query. The batch function's contract is strict: it must return a Promise that resolves to an array in the **same order and same length** as the input keys array. DataLoader uses that ordering to route each result back to the correct resolver.

```javascript
import DataLoader from 'dataloader';

// DataLoader batches multiple loads into one:
// Instead of: SELECT * FROM posts WHERE user_id = 1
//             SELECT * FROM posts WHERE user_id = 2
//             ...x10
// It batches: SELECT * FROM posts WHERE user_id = ANY([1,2,3,...,10])

function createPostsLoader() {
  return new DataLoader(async (userIds: readonly string[]) => {
    // Called once with ALL collected user IDs:
    const posts = await db.query(
      'SELECT * FROM posts WHERE user_id = ANY($1)',
      [userIds]
    );

    // Group posts by user_id:
    const postsByUserId = new Map<string, Post[]>();
    for (const post of posts) {
      const existing = postsByUserId.get(post.user_id) || [];
      existing.push(post);
      postsByUserId.set(post.user_id, existing);
    }

    // Return results in SAME ORDER as input keys (DataLoader requirement!):
    return userIds.map(id => postsByUserId.get(id) || []);
  });
}

// Context created per-request (loaders are per-request, not global):
function createContext({ req }) {
  return {
    userId: req.user?.id,
    loaders: {
      posts: createPostsLoader(),
      users: createUsersLoader(),
      comments: createCommentsLoader(),
    }
  };
}

// Resolver uses loader:
const resolvers = {
  User: {
    posts: (user, _, { loaders }) => loaders.posts.load(user.id)
    // DataLoader collects all user.id calls within one tick
    // then batches them into a single DB query!
  }
};
```

---

## DataLoader with Caching

DataLoader has an optional per-request cache keyed by the load key. When a resolver calls `loader.load('user:1')` and the same key is loaded again later in the same request — perhaps by a different part of the query tree — DataLoader returns the same Promise rather than issuing a duplicate load. This per-request caching is distinct from a shared application cache: it only lives for the duration of one request and is garbage collected when the request context is freed. For mutations, disable caching or clear specific keys to ensure the mutation's effects are visible to subsequent reads within the same request.

```javascript
// DataLoader caches within a request by default:
// Multiple resolvers loading the same user ID → one DB call per request

const loader = new DataLoader(batchFn, {
  cache: true,              // default — cache within request
  maxBatchSize: 100,        // max keys per batch
  batchScheduleFn: (callback) => setTimeout(callback, 0) // when to batch
});

// Disable caching (for mutations where data changes):
const freshLoader = new DataLoader(batchFn, { cache: false });

// Clear specific cache entries after mutation:
loader.clear('user:1');
loader.clearAll();

// Prime the cache (preload known data):
loader.prime('user:1', { id: '1', name: 'Alice' });
```

---

## Full Apollo Server Setup

Apollo Server is the most widely used Node.js GraphQL server library. It integrates with Express (and other frameworks) via middleware and handles the HTTP layer, query parsing, validation, execution, and response formatting. The `context` function runs once per request and is the correct place to create per-request DataLoader instances (not global ones), verify authentication tokens, and attach the authenticated user to the context. Error formatting in the `formatError` hook is how you prevent internal error details from leaking to clients in production.

```javascript
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import DataLoader from 'dataloader';

const server = new ApolloServer({
  typeDefs,
  resolvers,
  // Format errors for production:
  formatError: (formattedError, error) => {
    // Don't expose internal errors in production:
    if (process.env.NODE_ENV === 'production') {
      if (!(error instanceof GraphQLError)) {
        return { message: 'Internal server error' };
      }
    }
    return formattedError;
  },
});

await server.start();

app.use('/graphql',
  cors(),
  express.json(),
  expressMiddleware(server, {
    context: async ({ req }) => {
      // Verify JWT:
      const token = req.headers.authorization?.replace('Bearer ', '');
      const user = token ? verifyJwt(token) : null;

      return {
        user,
        // Fresh loaders per request:
        loaders: {
          users: new DataLoader(async (ids) => {
            const users = await db.query('SELECT * FROM users WHERE id = ANY($1)', [ids]);
            const map = new Map(users.map(u => [u.id, u]));
            return ids.map(id => map.get(id) ?? null);
          }),
          posts: createPostsLoader(),
        }
      };
    }
  })
);
```

---

## Mutations and Subscriptions

Mutations are the GraphQL equivalent of POST/PUT/DELETE — they change server state and return the updated data. Subscriptions are persistent connections (typically over WebSocket) where the server pushes updates to subscribed clients when relevant events occur. The `pubsub.publish` / `asyncIterator` pattern connects mutations to subscriptions: when a mutation creates a post, it publishes to a named channel; the subscription resolver filters events from that channel and forwards matching ones to each subscribed client. In production, replace the default in-memory PubSub with a Redis-backed implementation to support multiple server instances.

```javascript
const resolvers = {
  Mutation: {
    createPost: async (_, { input }, { user, loaders }) => {
      if (!user) throw new GraphQLError('Unauthorized', {
        extensions: { code: 'UNAUTHENTICATED' }
      });

      const post = await db.posts.create({ ...input, authorId: user.id });

      // Publish to subscribers:
      await pubsub.publish('POST_CREATED', { postCreated: post });

      // Clear relevant caches:
      loaders.posts.clear(user.id);

      return post;
    }
  },

  Subscription: {
    postCreated: {
      subscribe: () => pubsub.asyncIterator('POST_CREATED'),
      // Filter: only send posts from authors the user follows
      filter: (payload, variables, context) =>
        context.user.followingIds.includes(payload.postCreated.authorId)
    }
  }
};
```

---

## Query Complexity and Depth Limiting

GraphQL's flexibility is also its security risk: a client can craft a deeply nested query (`users { posts { comments { author { posts { ... } } } } }`) that causes exponential database queries and CPU time. Unlike REST where the server controls response shape, GraphQL servers must explicitly defend against malicious or accidental query abuse. Depth limiting prevents deeply nested queries. Complexity limiting assigns a cost score to each field and rejects queries that exceed a total budget. Both checks run during validation before any resolvers are called, so they add negligible overhead to legitimate queries while protecting against abuse.

```javascript
import depthLimit from 'graphql-depth-limit';
import { createComplexityLimitRule } from 'graphql-validation-complexity';

const server = new ApolloServer({
  typeDefs,
  resolvers,
  validationRules: [
    depthLimit(10), // max query depth
    createComplexityLimitRule(1000, { // max complexity score
      onCost: (cost) => console.log(`Query complexity: ${cost}`),
    }),
  ],
});

// Without these: a malicious client can nest deeply:
// { users { posts { comments { author { posts { comments { ... } } } } } } }
// This creates exponential DB queries!
```

---

## Interview Questions

**Q: What is the N+1 problem in GraphQL and how does DataLoader solve it?**
A: When resolving a list of N items, each item's resolver makes 1 more DB query — resulting in N+1 total queries (1 for the list + N for each item). DataLoader intercepts these individual loads within a single event loop tick, batches them into one query (with `IN` or `ANY`), and returns results to each individual resolver. Result: N+1 queries → 2 queries.

**Q: Why must DataLoader be created per-request and not globally?**
A: DataLoader caches values by key within its lifetime. A global DataLoader would cache stale data across requests — user A's data would be cached and served to user B. Per-request DataLoaders start fresh, provide correct per-request caching (same user ID loaded multiple times in one query → one DB call), and are garbage collected when the request finishes.

**Q: What is the DataLoader contract for the batch function?**
A: The batch function receives an array of keys and MUST return a Promise that resolves to an array of values in the EXACT SAME ORDER and LENGTH as the input keys. If a key has no result, return `null` for that position (or an Error). DataLoader maps results back to individual `.load()` calls by position.

**Q: How do you handle authorization in GraphQL vs REST?**
A: REST: authorization per route (middleware). GraphQL: all through one endpoint — authorization must happen in resolvers or as a middleware layer. Options: (1) In each resolver (fine-grained but verbose). (2) Schema directives (`@auth`). (3) GraphQL Shield library (permission rules as middleware). (4) Move auth check to a service layer called from resolvers. Never expose sensitive fields without checking permissions in the resolver.
