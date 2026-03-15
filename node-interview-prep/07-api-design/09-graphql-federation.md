# GraphQL Federation — Apollo Federation v2

## The Problem: GraphQL at Scale

A monolithic GraphQL schema works for one team. For multiple teams owning different domains, it becomes a coordination nightmare.

```
Without Federation:
  All teams → single schema → single service
  Team A wants new User field → PR to shared schema → review bottleneck
  Team B's deploy blocks on Team A's schema review

With Federation:
  Team A owns users subgraph → deploys independently
  Team B owns products subgraph → deploys independently
  Gateway composes them into one unified schema for clients
```

---

## Architecture

```
Clients (web, mobile)
        ↓
┌──────────────────────────────────────────────┐
│              Apollo Router (Gateway)          │
│   Receives queries, plans, routes to subgraphs│
│   Composes unified supergraph schema          │
└────────┬──────────────┬──────────────┬────────┘
         ↓              ↓              ↓
  ┌─────────────┐ ┌──────────┐ ┌────────────┐
  │Users Subgraph│ │Products  │ │ Orders     │
  │ (Team Auth) │ │ Subgraph │ │ Subgraph   │
  │             │ │(Team Cat)│ │(Team Orders│
  └─────────────┘ └──────────┘ └────────────┘
         ↓              ↓              ↓
    Users DB       Products DB     Orders DB
```

---

## Core Concepts

### Supergraph
The composed schema clients query — union of all subgraph schemas.

### Subgraph
An independent GraphQL service that owns part of the schema. Must use the Federation spec (directives).

### Entity
A type that can be **referenced and extended across subgraphs**. Identified by `@key`.

---

## Defining a Subgraph

### Users Subgraph

```typescript
// users-service/src/schema.ts
import { buildSubgraphSchema } from '@apollo/subgraph';
import { gql } from 'graphql-tag';

const typeDefs = gql`
  # Tell federation this is the primary definition of User
  type User @key(fields: "id") {
    id: ID!
    email: String!
    name: String
    createdAt: String!
  }

  type Query {
    user(id: ID!): User
    me: User
  }

  type Mutation {
    createUser(email: String!, name: String): User
    updateUser(id: ID!, name: String): User
  }
`;

const resolvers = {
  User: {
    // __resolveReference: called by gateway when another subgraph
    // references a User entity by its @key (id)
    __resolveReference(reference: { id: string }) {
      return db.user.findUnique({ where: { id: reference.id } });
    },
  },
  Query: {
    user: (_, { id }) => db.user.findUnique({ where: { id } }),
    me: (_, __, { userId }) => db.user.findUnique({ where: { id: userId } }),
  },
  Mutation: {
    createUser: (_, args) => db.user.create({ data: args }),
    updateUser: (_, { id, ...data }) =>
      db.user.update({ where: { id }, data }),
  },
};

export const schema = buildSubgraphSchema({ typeDefs, resolvers });
```

### Products Subgraph (extends User)

```typescript
// products-service/src/schema.ts
const typeDefs = gql`
  # Reference User from users subgraph — don't redefine fields
  # @external marks fields owned by another subgraph
  type User @key(fields: "id") {
    id: ID!
    # Add products field to User (owned by products subgraph)
    wishlist: [Product!]!
  }

  type Product @key(fields: "id") {
    id: ID!
    name: String!
    price: Float!
    inventory: Int!
  }

  type Query {
    product(id: ID!): Product
    products(category: String): [Product!]!
    featuredProducts: [Product!]!
  }
`;

const resolvers = {
  User: {
    __resolveReference(reference: { id: string }) {
      // Products subgraph doesn't need user data — return stub
      return { id: reference.id };
    },
    // Resolve the wishlist field that products subgraph contributes to User
    wishlist: (user: { id: string }) =>
      db.wishlist.findMany({ where: { userId: user.id } })
        .then(items => db.product.findMany({
          where: { id: { in: items.map(i => i.productId) } }
        })),
  },
  Product: {
    __resolveReference: (ref: { id: string }) =>
      db.product.findUnique({ where: { id: ref.id } }),
  },
  Query: {
    product: (_, { id }) => db.product.findUnique({ where: { id } }),
    products: (_, { category }) => db.product.findMany({
      where: category ? { category } : undefined,
    }),
  },
};
```

### Orders Subgraph (uses both User and Product)

```typescript
const typeDefs = gql`
  # Reference types from other subgraphs
  type User @key(fields: "id") {
    id: ID!
    orders: [Order!]!    # Orders subgraph contributes this field to User
  }

  type Product @key(fields: "id") {
    id: ID!
    orderHistory: [OrderItem!]!  # Contributed to Product type
  }

  type Order @key(fields: "id") {
    id: ID!
    user: User!
    items: [OrderItem!]!
    total: Float!
    status: OrderStatus!
    createdAt: String!
  }

  type OrderItem {
    product: Product!
    quantity: Int!
    price: Float!
  }

  enum OrderStatus {
    PENDING
    PROCESSING
    SHIPPED
    DELIVERED
  }

  type Query {
    order(id: ID!): Order
    orders(userId: ID): [Order!]!
  }

  type Mutation {
    placeOrder(userId: ID!, items: [OrderItemInput!]!): Order
  }

  input OrderItemInput {
    productId: ID!
    quantity: Int!
  }
`;
```

---

## Apollo Router (Gateway) — Configuration

```yaml
# router.yaml
supergraph:
  # Introspect subgraphs and compose (dev)
  # Or use managed federation (Apollo Studio)
  introspect: true

subgraphs:
  users:
    routing_url: http://users-service:4001/graphql
  products:
    routing_url: http://products-service:4002/graphql
  orders:
    routing_url: http://orders-service:4003/graphql

# Headers forwarding
headers:
  all:
    request:
      - propagate:
          named: authorization
      - propagate:
          named: x-user-id
```

```bash
# Dev: compose schema from running subgraphs
npx rover dev --supergraph-config supergraph.yaml

# Or with rover compose (static)
rover supergraph compose --config supergraph.yaml > supergraph.graphql

# Start Apollo Router
./router --config router.yaml --supergraph supergraph.graphql
```

---

## Query Planning

The gateway analyzes a query and creates a **query plan** — deciding which subgraphs to call and in what order.

```graphql
# Client query
query GetUserDashboard($userId: ID!) {
  user(id: $userId) {
    name        # from Users subgraph
    email       # from Users subgraph
    wishlist {  # from Products subgraph
      name
      price
    }
    orders {    # from Orders subgraph
      id
      total
      status
      items {
        product { name }   # back to Products subgraph
        quantity
      }
    }
  }
}
```

Query plan:
```
Fetch(users):
  user(id: $userId) { name email }

Parallel:
  Fetch(products) using user.id:
    wishlist { name price }

  Fetch(orders) using user.id:
    orders { id total status items { quantity } }
    → For each order item:
      Fetch(products) using item.productId:
        product { name }
```

The router handles all this orchestration — clients don't know about subgraph topology.

---

## Directives Reference

```graphql
# @key — defines the entity's primary key
type User @key(fields: "id") { id: ID! }

# Composite key
type Product @key(fields: "id sku") { id: ID!, sku: String! }

# @external — field defined in another subgraph
type User @key(fields: "id") {
  id: ID! @external
}

# @requires — this field resolver needs another field from this subgraph
type Product @key(fields: "id") {
  id: ID!
  size: String @external
  weight: Float @external
  shippingEstimate: Float @requires(fields: "size weight")
    # Resolver receives size and weight in object
}

# @provides — optimization hint: this subgraph can provide these fields
# (avoids extra round-trip to owning subgraph)
type Order {
  product: Product @provides(fields: "name price")
}

# @override — take ownership of a field from another subgraph (migration)
type Product @key(fields: "id") {
  id: ID!
  price: Float @override(from: "legacy-service")
  # Now prices-service owns this field, legacy-service no longer queried for it
}

# @inaccessible — internal field, not exposed in supergraph
type User @key(fields: "id") {
  id: ID!
  internalScore: Float @inaccessible
}

# @shareable — multiple subgraphs can resolve this field
type Coordinates {
  lat: Float! @shareable
  lng: Float! @shareable
}
```

---

## Managed Federation (Apollo Studio)

In production, instead of a static `supergraph.yaml`, subgraphs publish their schemas to Apollo Studio.

```bash
# In CI/CD for each subgraph:
rover subgraph publish my-graph@production \
  --name users \
  --schema schema.graphql \
  --routing-url https://users-service.prod/graphql
```

Apollo Studio:
1. Validates new schema doesn't break existing queries
2. Composes new supergraph
3. Pushes hot-reload config to running routers (no restart needed)

This enables **schema checks** — fail CI if a change breaks existing client queries.

```bash
# Check before publish
rover subgraph check my-graph@production \
  --name users \
  --schema schema.graphql
```

---

## vs Schema Stitching

| Aspect | Apollo Federation | Schema Stitching |
|--------|------------------|------------------|
| Approach | Spec-based, annotations in schema | Config-based, external merging |
| Ownership model | Each type owned/extended by subgraph | Configured at gateway level |
| `__resolveReference` | Yes — subgraph resolves its own entities | No — gateway resolves |
| Performance | Query planning built-in | Manual batching with DataLoader |
| Adoption | Industry standard | Less common for new projects |
| Incremental migration | `@override` directive | Awkward |

---

## Interview Questions

**Q: What is GraphQL Federation and why use it?**
Federation allows multiple independent GraphQL services (subgraphs) to compose into a single schema for clients. Each team owns their domain schema and deploys independently. The gateway (Apollo Router) composes the schemas and routes queries. Use it when multiple teams need to contribute to the same GraphQL API without schema coordination bottlenecks.

**Q: What is an entity in GraphQL Federation?**
An entity is a type that can be referenced across subgraphs, defined with `@key` directive specifying its unique identifier(s). Each subgraph that references the entity must implement `__resolveReference` to resolve the entity from its key. The gateway uses `__resolveReference` to stitch together data from multiple subgraphs in a single query.

**Q: How does the gateway know which subgraph to call?**
The Apollo Router builds a query plan by analyzing the query against the composed supergraph schema. It knows which fields belong to which subgraph (tracked during composition). For entity references (e.g., `user.orders` where User is from users-subgraph and orders is from orders-subgraph), it fetches the User first, extracts the `@key` fields (id), then passes that to the orders-subgraph as a `_representations` query.

**Q: What is `@requires` and when do you use it?**
`@requires` declares that a field resolver needs additional fields from the same entity to compute its value. For example, `shippingEstimate @requires(fields: "weight dimensions")` tells the gateway to include `weight` and `dimensions` in the subgraph query so the resolver has them available. It's an optimization hint that prevents unnecessary extra round-trips.
