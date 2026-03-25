# Testing React

## Tools

React testing works in layers: unit tests for individual components and hooks, integration tests for user flows that span multiple components, and end-to-end tests for full browser scenarios. The stack below covers all three layers. React Testing Library is the standard for component testing because it renders real DOM (via jsdom) and queries by accessibility roles and text — the same signals a real user relies on. MSW intercepts network requests at the service worker level, meaning your code uses the real `fetch` API without needing to mock it, giving you more confidence that requests are formed correctly.

| Tool | Role |
|---|---|
| **Vitest / Jest** | Test runner, assertions |
| **@testing-library/react** | Component rendering, user interactions |
| **@testing-library/user-event** | Realistic user event simulation |
| **MSW (Mock Service Worker)** | Network mocking at the service worker level |
| **Playwright / Cypress** | End-to-end browser testing |

---

## Guiding Principle

> "The more your tests resemble the way your software is used, the more confidence they can give you." — Kent C. Dodds

Test behavior, not implementation. Query by accessible roles/text, not CSS classes or internal state.

---

## Setup

Vitest is the recommended test runner for Vite-based React projects — it shares Vite's config and transform pipeline, making TypeScript, JSX, and path aliases work without additional configuration. The `jsdom` environment simulates a browser DOM in Node.js, allowing components to render and interact with virtual DOM nodes. The `@testing-library/jest-dom` package adds custom matchers like `toBeInTheDocument()` and `toBeVisible()` that make test assertions more readable.

```bash
npm install --save-dev @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

```js
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
});

// src/test/setup.ts
import '@testing-library/jest-dom';
```

---

## Rendering & Querying

`render` mounts a component into a jsdom document and returns utilities for querying the rendered output. `screen` is the global query object that searches the entire rendered document — prefer it over the `container` return value because `screen` encourages accessible queries. The query priority list below reflects how real users perceive your UI: by role and label first, by text content second, by test IDs as a last resort. Test IDs are an escape hatch for elements with no accessible name — not a first choice.

```jsx
import { render, screen } from '@testing-library/react';

test('shows greeting', () => {
  render(<Greeting name="Alice" />);
  expect(screen.getByText('Hello, Alice!')).toBeInTheDocument();
});
```

### Query Priority (use in this order)

1. `getByRole` — most accessible, closest to what users see
2. `getByLabelText` — form inputs
3. `getByPlaceholderText`
4. `getByText`
5. `getByDisplayValue`
6. `getByAltText` — images
7. `getByTitle`
8. `getByTestId` — last resort

```jsx
// Good
screen.getByRole('button', { name: /submit/i });
screen.getByLabelText(/email/i);

// Avoid (brittle)
container.querySelector('.btn-primary');
screen.getByTestId('submit-btn');
```

---

## User Interactions

`userEvent` from `@testing-library/user-event` v14+ simulates real user interactions by dispatching the full sequence of browser events that each action produces. Typing with `userEvent.type` fires `pointerdown`, `keydown`, `keypress`, `input`, `keyup` events in order — unlike `fireEvent.change` which dispatches only a single synthetic event. This matters because many components and libraries listen for `keydown` or `input` events specifically. Always call `userEvent.setup()` and await interactions — the async API handles timers and focus management correctly.

```jsx
import userEvent from '@testing-library/user-event';

test('submits form', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();

  render(<LoginForm onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
  await user.type(screen.getByLabelText(/password/i), 'secret123');
  await user.click(screen.getByRole('button', { name: /log in/i }));

  expect(onSubmit).toHaveBeenCalledWith({
    email: 'alice@example.com',
    password: 'secret123',
  });
});
```

**`userEvent` vs `fireEvent`:** `userEvent` simulates real browser events (focus, keydown, keypress, keyup, input, change) in the correct order. `fireEvent` dispatches a single synthetic event — less realistic.

---

## Async Queries

```jsx
test('loads data', async () => {
  render(<UserList />);

  // getBy throws immediately if not found
  // findBy waits (default 1000ms)
  const items = await screen.findAllByRole('listitem');
  expect(items).toHaveLength(3);
});
```

| Query type | Found | Not found | Multiple |
|---|---|---|---|
| `getBy` | returns el | **throws** | **throws** |
| `queryBy` | returns el | returns `null` | **throws** |
| `findBy` | returns Promise | **rejects** after timeout | **rejects** |
| `getAllBy` | returns array | **throws** | returns array |
| `queryAllBy` | returns array | returns `[]` | returns array |
| `findAllBy` | resolves array | **rejects** | resolves array |

---

## Testing Hooks

```jsx
import { renderHook, act } from '@testing-library/react';

test('useCounter', () => {
  const { result } = renderHook(() => useCounter(0));

  expect(result.current.count).toBe(0);

  act(() => result.current.increment());
  expect(result.current.count).toBe(1);
});
```

`act` ensures React processes state updates and effects before assertions.

---

## Mocking Network Requests (MSW)

Mock Service Worker (MSW) intercepts HTTP requests at the network level using a service worker in the browser or Node.js's `http` module in tests. Unlike mocking `fetch` directly, MSW lets your application code use the real `fetch` API without any modification — the mock is transparent. This means your tests verify that the correct URL is called, the correct request body is sent, and the component responds correctly to various server responses (success, loading, error). The handler setup follows the same pattern as a real API route handler, making tests easy to read and maintain.

```js
// src/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/users', () =>
    HttpResponse.json([{ id: 1, name: 'Alice' }])
  ),
];

// src/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';
export const server = setupServer(...handlers);

// vitest setup
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

Override for specific tests:
```js
test('shows error on network failure', async () => {
  server.use(http.get('/api/users', () => new HttpResponse(null, { status: 500 })));
  render(<UserList />);
  expect(await screen.findByText(/error/i)).toBeInTheDocument();
});
```

---

## Testing Context

Components that consume Context must be rendered inside the appropriate Provider. Rather than wrapping every test individually, the pattern is to create a `renderWithProviders` utility that wraps the component under test with all required Providers at configured initial state. This utility can be placed in a shared test helpers file and imported wherever needed, keeping tests concise while providing the full context environment the component expects.

```jsx
function renderWithProviders(ui, { initialState = {} } = {}) {
  function Wrapper({ children }) {
    return (
      <ThemeProvider>
        <AuthProvider initialUser={initialState.user}>
          {children}
        </AuthProvider>
      </ThemeProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}

test('shows user name when logged in', () => {
  renderWithProviders(<Header />, { initialState: { user: { name: 'Alice' } } });
  expect(screen.getByText('Alice')).toBeInTheDocument();
});
```

---

## Snapshot Testing

Snapshot testing captures the rendered output of a component and stores it as a serialized string file. On subsequent test runs, the output is compared against the stored snapshot — any difference fails the test. This is useful as a regression check for stable, rarely-changing UI components where you want to be notified if the HTML structure changes unexpectedly. The weakness is that snapshots are easy to update blindly (`jest --updateSnapshot`) and large snapshots become meaningless diffs. Prefer targeted assertions with `getByRole`/`toBeInTheDocument` for component behavior; use snapshots only as a secondary check on structure.

```jsx
test('renders correctly', () => {
  const { container } = render(<Button>Click me</Button>);
  expect(container.firstChild).toMatchSnapshot();
});
```

**When to use:** UI components that rarely change. Avoid for large trees or components with lots of dynamic content — snapshots become noisy and meaningless.

---

## Testing React Query / SWR

React Query and SWR manage server state and maintain an internal cache. Tests that render components using these libraries must provide their respective Provider with a fresh `QueryClient` per test — otherwise cached results from one test bleed into the next. Setting `retry: false` in the test client prevents React Query from retrying failed requests (which it does by default in production), making error state tests immediate instead of waiting for retry backoff delays.

```jsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('displays data', async () => {
  render(<UserProfile id={1} />, { wrapper: createWrapper() });
  expect(await screen.findByText('Alice')).toBeInTheDocument();
});
```

---

## Common Patterns & Gotchas

```jsx
// ✅ Wait for async updates
await screen.findByText('Loaded');

// ✅ Check element is gone
await waitForElementToBeRemoved(() => screen.queryByText('Loading...'));

// ❌ Don't test implementation details
expect(component.state.isOpen).toBe(true); // wrong

// ✅ Test user-visible behavior
expect(screen.getByRole('dialog')).toBeVisible();

// ✅ Test accessibility
expect(screen.getByRole('button', { name: /close/i })).toBeEnabled();
```

---

## E2E with Playwright

Playwright drives a real browser (Chromium, Firefox, or WebKit) against your running application, testing the full stack from UI to network to server. Unlike unit tests that mock everything and test components in isolation, E2E tests verify that all layers work together correctly — the most realistic form of testing. Playwright's auto-waiting eliminates most `sleep()` calls: it waits for elements to be visible, for navigation to complete, and for network requests to settle before proceeding. Use E2E tests for critical user journeys (login, checkout, core CRUD flows) but avoid testing every edge case at this level — they are slow and flaky compared to unit tests.

```js
// playwright.config.ts
export default { use: { baseURL: 'http://localhost:3000' } };

// tests/login.spec.ts
test('user can log in', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('alice@example.com');
  await page.getByLabel('Password').fill('secret');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByText('Welcome, Alice')).toBeVisible();
});
```

---

## Testing Checklist

- [ ] Component renders without crashing
- [ ] Happy path: user can complete the main flow
- [ ] Error states: network errors, validation errors
- [ ] Loading states: skeleton/spinner shown
- [ ] Empty states: empty list, no results
- [ ] Accessibility: roles, labels, focus management
- [ ] Edge cases: empty strings, 0, null props
