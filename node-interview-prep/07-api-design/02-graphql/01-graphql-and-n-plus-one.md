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
