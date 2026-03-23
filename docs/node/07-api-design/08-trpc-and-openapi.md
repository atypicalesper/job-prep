# tRPC & OpenAPI — Type-Safe APIs

## OpenAPI (formerly Swagger)

OpenAPI is a specification for describing REST APIs. It's language-agnostic and generates documentation, client SDKs, and server stubs.

### OpenAPI 3.1 Spec Structure

```yaml
# openapi.yaml
openapi: 3.1.0
info:
  title: User API
  version: 1.0.0
  description: API for managing users

servers:
  - url: https://api.example.com/v1
  - url: http://localhost:3000/v1

paths:
  /users:
    get:
      operationId: listUsers
      summary: List all users
      tags: [Users]
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            minimum: 1
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
      responses:
        '200':
          description: Paginated users
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserListResponse'
        '401':
          $ref: '#/components/responses/Unauthorized'

    post:
      operationId: createUser
      summary: Create a user
      tags: [Users]
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
      responses:
        '201':
          description: Created user
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '422':
          $ref: '#/components/responses/ValidationError'

  /users/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
          format: uuid
    get:
      operationId: getUser
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '404':
          $ref: '#/components/responses/NotFound'

components:
  schemas:
    User:
      type: object
      required: [id, email, createdAt]
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        name:
          type: string
        createdAt:
          type: string
          format: date-time

    CreateUserRequest:
      type: object
      required: [email, password]
      properties:
        email:
          type: string
          format: email
        password:
          type: string
          minLength: 8
        name:
          type: string

    UserListResponse:
      type: object
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/User'
        pagination:
          $ref: '#/components/schemas/Pagination'

    Pagination:
      type: object
      properties:
        page: { type: integer }
        limit: { type: integer }
        total: { type: integer }
        pages: { type: integer }

  responses:
    Unauthorized:
      description: Authentication required
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    NotFound:
      description: Resource not found
    ValidationError:
      description: Validation failed

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

---

## Code-First OpenAPI Generation

Instead of writing YAML by hand, generate the spec from code.

### With Zod + Fastify + @asteasolutions/zod-to-openapi

```ts
import { z } from 'zod';
import { extendZodWithOpenApi, OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import Fastify from 'fastify';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

// Define schemas
const UserSchema = registry.register(
  'User',
  z.object({
    id: z.string().uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }),
    email: z.string().email(),
    name: z.string().optional(),
    createdAt: z.string().datetime(),
  })
);

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

// Register paths
registry.registerPath({
  method: 'post',
  path: '/users',
  summary: 'Create a user',
  tags: ['Users'],
  request: {
    body: {
      content: { 'application/json': { schema: CreateUserSchema } }
    }
  },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: UserSchema } }
    }
  }
});

// Generate spec
const generator = new OpenApiGeneratorV31(registry.definitions);
const spec = generator.generateDocument({
  openapi: '3.1.0',
  info: { title: 'My API', version: '1.0.0' },
  servers: [{ url: '/v1' }],
});

// Serve spec + Swagger UI
app.get('/openapi.json', () => spec);
app.get('/docs', (req, res) => {
  res.send(`<!DOCTYPE html>
    <html><head><title>API Docs</title></head><body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui' })
    </script></body></html>`);
});
```

### With Hono + Zod OpenAPI

```ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

const app = new OpenAPIHono();

const UserRoute = createRoute({
  method: 'get',
  path: '/users/{id}',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            id: z.string().uuid(),
            email: z.string().email(),
          }),
        },
      },
      description: 'Get user',
    },
    404: {
      description: 'Not found',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
  },
});

app.openapi(UserRoute, async (c) => {
  const { id } = c.req.valid('param'); // fully typed, validated
  const user = await db.findUser(id);
  if (!user) return c.json({ message: 'Not found' }, 404);
  return c.json(user, 200);
});

app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: { title: 'My API', version: '1.0.0' },
});
```

---

## Client Generation from OpenAPI

```bash
# Generate TypeScript client from spec
npx openapi-typescript-codegen --input openapi.yaml --output ./src/api/client

# Or with openapi-generator-cli
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-fetch \
  -o ./src/api/client
```

Generated client:
```ts
// Auto-generated, never edit manually
export class UsersApi {
  async createUser(body: CreateUserRequest): Promise<User> {
    const response = await fetch('/v1/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.json();
  }

  async getUser(id: string): Promise<User> {
    return fetch(`/v1/users/${id}`).then(r => r.json());
  }
}
```

---

## tRPC — End-to-End Typesafe APIs

tRPC eliminates the API layer abstraction — the server's TypeScript types become the client's types directly. No code generation, no spec files.

```
Traditional API:
  Server (types) → OpenAPI spec → generate client → Client (types)
  Type drift: server changes → spec not updated → client has wrong types

tRPC:
  Server (types) → import Router type → Client (same types)
  Types are always in sync (monorepo)
```

### Architecture

```
packages/
  api/
    src/
      router/
        index.ts      ← root router (exports AppRouter type)
        users.ts
        posts.ts
  web/
    src/
      utils/trpc.ts   ← typed client (imports AppRouter)
      pages/...
```

### Server Setup

```ts
// packages/api/src/router/users.ts
import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';

export const usersRouter = router({
  // Query
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const user = await ctx.db.user.findUnique({ where: { id: input.id } });
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
      return user;
    }),

  // Mutation
  create: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      name: z.string().min(1).max(100),
    }))
    .mutation(async ({ input, ctx }) => {
      return ctx.db.user.create({ data: input });
    }),

  // Subscription (WebSocket)
  onUpdate: publicProcedure
    .input(z.object({ userId: z.string() }))
    .subscription(({ input }) => {
      return observable<User>((emit) => {
        const unsub = userUpdateEmitter.on(input.userId, (user) => {
          emit.next(user);
        });
        return unsub;
      });
    }),
});
```

```ts
// packages/api/src/router/index.ts
import { router } from '../trpc';
import { usersRouter } from './users';
import { postsRouter } from './posts';

export const appRouter = router({
  users: usersRouter,
  posts: postsRouter,
});

export type AppRouter = typeof appRouter;
```

```ts
// packages/api/src/trpc.ts
import { initTRPC, TRPCError } from '@trpc/server';
import { createContext } from './context';

const t = initTRPC.context<typeof createContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Protected procedure — checks auth
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, userId: ctx.session.userId } });
});
```

### Client Setup (Next.js)

```ts
// packages/web/src/utils/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@myapp/api'; // just a type import!

export const trpc = createTRPCReact<AppRouter>();
```

```tsx
// packages/web/src/app/providers.tsx
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from '../utils/trpc';

export function Providers({ children }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          headers: () => ({
            authorization: getAuthToken(),
          }),
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

### Client Usage — Fully Typed

```tsx
// Full TypeScript autocomplete, no type casting
function UserProfile({ id }: { id: string }) {
  // Type: { id: string, email: string, name: string | null, ... }
  const { data: user, isLoading } = trpc.users.getById.useQuery({ id });

  const createUser = trpc.users.create.useMutation({
    onSuccess: (newUser) => {
      // newUser is fully typed
      console.log('Created:', newUser.email);
    },
  });

  if (isLoading) return <Spinner />;
  if (!user) return <NotFound />;

  return (
    <div>
      <h1>{user.name}</h1>    {/* IDE autocomplete works! */}
      <p>{user.email}</p>
    </div>
  );
}

// Subscriptions
function LiveFeed({ userId }: { userId: string }) {
  trpc.users.onUpdate.useSubscription({ userId }, {
    onData(user) {
      console.log('User updated:', user); // fully typed
    },
  });
}
```

---

## tRPC vs REST + OpenAPI

| Aspect | REST + OpenAPI | tRPC |
|--------|---------------|------|
| Type safety | Generated (can drift) | Native (always in sync) |
| Client generation | Build step required | No generation needed |
| Caching | HTTP cache (ETags, etc.) | React Query cache |
| Discoverability | Swagger UI, standard HTTP | Requires TypeScript |
| Cross-language | Yes | No (TS/JS only) |
| Batching | Manual | Automatic (httpBatchLink) |
| Subscriptions | SSE or WebSocket manually | Built-in |
| Public API | Yes | Not recommended |
| Microservices | Yes | Possible (each has type) |

**Use tRPC when:**
- TypeScript monorepo (Next.js full-stack, T3 stack)
- Internal API (no external consumers)
- Want maximum type safety without code gen
- Small-medium team

**Use REST + OpenAPI when:**
- Public-facing API
- Multi-language clients
- Mobile clients
- Need HTTP caching semantics
- External consumers (partners, third-party integrations)

---

## tRPC Error Handling

```ts
import { TRPCError } from '@trpc/server';

// Server
const getUser = publicProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ input }) => {
    const user = await db.findUser(input.id);

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `User ${input.id} not found`,
      });
    }

    return user;
  });

// Client
const { data, error } = trpc.users.getById.useQuery({ id });

if (error) {
  if (error.data?.code === 'NOT_FOUND') {
    return <NotFound />;
  }
  if (error.data?.code === 'UNAUTHORIZED') {
    redirect('/login');
  }
  return <ErrorMessage message={error.message} />;
}
```

---

## Interview Questions

**Q: What is OpenAPI and why is it useful?**
OpenAPI is a standard specification for describing REST APIs (methods, endpoints, request/response schemas, auth). Benefits: auto-generates documentation (Swagger UI), client SDKs in any language, server stubs, and enables contract-first API design. The spec is the source of truth shared between backend and consumers.

**Q: What's the difference between spec-first and code-first OpenAPI?**
Spec-first: write the YAML/JSON spec manually, generate server stubs from it. More rigorous contract. Code-first: write code, annotate/derive the spec automatically (e.g., Hono + Zod OpenAPI, FastAPI). Faster iteration but risk of the spec becoming an afterthought.

**Q: How does tRPC achieve type safety without code generation?**
tRPC exports the router type (`AppRouter`) which encodes all procedure names, input schemas, and output types. The client imports this type (type-only, zero runtime cost). `@trpc/react-query` uses TypeScript generics parameterized by `AppRouter` to provide typed `.useQuery()`, `.useMutation()` etc. Since it's all TypeScript, renaming a procedure or changing a schema causes a compile error immediately.

**Q: When would you choose tRPC over REST?**
tRPC is ideal for TypeScript monorepos (T3 stack, Next.js full-stack apps) where client and server are developed together. It eliminates the client-generation step and type drift. Choose REST+OpenAPI for public APIs, multi-language clients, mobile apps, or when HTTP caching is important.
