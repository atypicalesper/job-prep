# Testing React

## Tools

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

```jsx
test('renders correctly', () => {
  const { container } = render(<Button>Click me</Button>);
  expect(container.firstChild).toMatchSnapshot();
});
```

**When to use:** UI components that rarely change. Avoid for large trees or components with lots of dynamic content — snapshots become noisy and meaningless.

---

## Testing React Query / SWR

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
