# Playwright Advanced — Web Scraping, Testing & Automation

## Why Playwright Over Puppeteer/Selenium?

| | Playwright | Puppeteer | Selenium |
|---|---|---|---|
| Browsers | Chromium, Firefox, WebKit | Chromium only | All (via drivers) |
| Auto-waits | ✅ Smart waits built-in | Manual | Manual |
| Network interception | ✅ Full | Limited | Limited |
| Parallel execution | ✅ Native | Manual | With Grid |
| Multiple tabs/windows | ✅ | ✅ | ✅ |
| Mobile emulation | ✅ | ✅ | Limited |
| Tracing/debugging | ✅ Built-in | Limited | External tools |
| API testing | ✅ (APIRequestContext) | ❌ | ❌ |

---

## Core Architecture

```
Playwright Test Runner
   ├── Browser (Chromium / Firefox / WebKit)
   │     └── BrowserContext (isolated — like incognito per test)
   │           ├── Page (tab)
   │           └── Page (tab)
   └── Worker (parallel test execution)
```

Each `BrowserContext` is fully isolated: separate cookies, storage, network state. Creates a "new user" per test without relaunching the browser.

---

## Setup & Configuration

```bash
npm init playwright@latest
npx playwright install  # downloads browsers
```

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,       // run all tests in parallel
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 30_000,

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',  // capture trace on first retry
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
    { name: 'mobile',   use: { ...devices['iPhone 14'] } },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## Smart Locators (Anti-Fragile Selectors)

```ts
// BEST — semantic, role-based (accessible + stable)
page.getByRole('button', { name: 'Submit' })
page.getByRole('textbox', { name: 'Email' })
page.getByRole('heading', { level: 1 })
page.getByLabel('Password')
page.getByPlaceholder('Enter email...')
page.getByText('Welcome back')
page.getByAltText('Company logo')
page.getByTitle('Close dialog')
page.getByTestId('submit-btn')  // data-testid="submit-btn"

// OK — CSS/XPath when semantic isn't possible
page.locator('.card:nth-child(2)')
page.locator('xpath=//button[@type="submit"]')
page.locator('text=Submit').first()

// BAD — fragile, implementation-coupled
page.locator('#app > div > form > button:nth-child(3)')
page.locator('[class="btn-primary btn-large"]')
```

### Chaining & filtering

```ts
// Find "Edit" button inside the row with "John Doe"
const row = page.getByRole('row', { name: 'John Doe' });
await row.getByRole('button', { name: 'Edit' }).click();

// Filter by has text
page.locator('.card').filter({ hasText: 'Premium Plan' }).click();

// nth match
page.locator('.item').nth(2).click();
page.locator('.item').first().click();
page.locator('.item').last().click();
```

---

## Actions & Auto-Waiting

Playwright automatically waits for elements to be:
- Visible
- Stable (not animating)
- Enabled
- Attached to DOM

```ts
// Interactions — all auto-wait
await page.goto('https://example.com');
await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');
await page.getByRole('textbox', { name: 'Password' }).fill('secret');
await page.getByRole('button', { name: 'Login' }).click();

// Select dropdown
await page.getByRole('combobox', { name: 'Country' }).selectOption('US');

// Checkbox
await page.getByRole('checkbox', { name: 'Remember me' }).check();
await page.getByRole('checkbox').uncheck();

// Upload file
await page.getByLabel('Upload').setInputFiles('path/to/file.pdf');
await page.getByLabel('Upload').setInputFiles(['file1.png', 'file2.png']);

// Keyboard
await page.getByRole('textbox').press('Enter');
await page.keyboard.press('Control+A');
await page.keyboard.type('Hello World', { delay: 50 });

// Hover
await page.getByRole('button', { name: 'Menu' }).hover();

// Drag and drop
await page.locator('#source').dragTo(page.locator('#target'));

// Scroll
await page.mouse.wheel(0, 500);
await page.locator('.infinite-list').scroll({ direction: 'down', speed: 'fast' });
```

---

## Assertions

```ts
import { expect } from '@playwright/test';

// Element assertions (auto-retry until timeout)
await expect(page.getByRole('heading')).toBeVisible();
await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();
await expect(page.getByRole('checkbox')).toBeChecked();
await expect(page.locator('.spinner')).toBeHidden();
await expect(page.getByRole('textbox')).toBeEmpty();
await expect(page.getByRole('textbox')).toHaveValue('expected@email.com');
await expect(page.locator('.count')).toHaveText('42');
await expect(page.locator('.count')).toContainText('42');
await expect(page.locator('ul li')).toHaveCount(5);
await expect(page.locator('.card')).toHaveClass(/active/);
await expect(page.locator('.card')).toHaveCSS('color', 'rgb(255, 0, 0)');
await expect(page.locator('img')).toHaveAttribute('alt', 'Logo');

// Page assertions
await expect(page).toHaveURL('https://example.com/dashboard');
await expect(page).toHaveURL(/dashboard/);
await expect(page).toHaveTitle('My App - Dashboard');

// Soft assertions — don't stop on failure, collect all
await expect.soft(page.getByText('Name')).toBeVisible();
await expect.soft(page.getByText('Email')).toBeVisible();
// test continues even if above fail
expect(page.errors).toHaveLength(0);
```

---

## Network Interception & Mocking

```ts
test('mock API response', async ({ page }) => {
  // Intercept and mock
  await page.route('**/api/users', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 1, name: 'Tarun' }]),
    })
  );

  await page.goto('/users');
  await expect(page.getByText('Tarun')).toBeVisible();
});

test('mock with delay (simulate slow network)', async ({ page }) => {
  await page.route('**/api/data', async route => {
    await new Promise(r => setTimeout(r, 2000));
    await route.fulfill({ status: 200, body: '{"data":[]}' });
  });
});

test('intercept and modify request headers', async ({ page }) => {
  await page.route('**/api/**', route =>
    route.continue({
      headers: { ...route.request().headers(), 'X-Test': 'true' }
    })
  );
});

test('block tracking / ads', async ({ page }) => {
  await page.route('**/*.{png,jpg,jpeg,gif,webp}', route => route.abort());
  await page.route('**/analytics/**', route => route.abort());
});

// Capture requests
const requests: string[] = [];
page.on('request', req => requests.push(req.url()));
page.on('response', res => console.log(res.url(), res.status()));
```

---

## Advanced Patterns

### Page Object Model (POM)

```ts
// pages/LoginPage.ts
import { type Page, expect } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Login' }).click();
  }

  async expectLoginError(message: string) {
    await expect(this.page.getByRole('alert')).toContainText(message);
  }
}

// tests/login.spec.ts
import { test } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

test('invalid credentials shows error', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('bad@email.com', 'wrongpass');
  await loginPage.expectLoginError('Invalid credentials');
});
```

### Custom fixtures

```ts
// fixtures.ts
import { test as base } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';

type Fixtures = {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  authenticatedPage: Page;  // pre-logged-in page
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  // Fixture that logs in before every test
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForURL('/dashboard');
    await use(page);
  },
});
```

### Reuse authentication state (massive speed boost)

```ts
// auth.setup.ts — runs once, saves storage state
import { test as setup } from '@playwright/test';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('user@test.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL('/dashboard');

  // Save storage state (cookies + localStorage)
  await page.context().storageState({ path: 'auth.json' });
});

// playwright.config.ts — use saved state
projects: [
  { name: 'setup', testMatch: /auth\.setup\.ts/ },
  {
    name: 'chromium',
    use: { storageState: 'auth.json' },  // pre-authenticated!
    dependencies: ['setup'],
  },
]
```

---

## Scraping Patterns

```ts
// Extract structured data
const products = await page.locator('.product-card').evaluateAll(cards =>
  cards.map(card => ({
    name:  card.querySelector('.name')?.textContent?.trim(),
    price: card.querySelector('.price')?.textContent?.trim(),
    href:  card.querySelector('a')?.href,
  }))
);

// Paginate through results
const results: Product[] = [];
let pageNum = 1;

while (true) {
  await page.goto(`/products?page=${pageNum}`);
  const items = await page.locator('.product').all();
  if (items.length === 0) break;

  for (const item of items) {
    results.push({
      name: await item.locator('.name').textContent(),
      price: await item.locator('.price').textContent(),
    });
  }

  const nextBtn = page.getByRole('link', { name: 'Next' });
  if (!(await nextBtn.isVisible())) break;
  pageNum++;
}

// Handle infinite scroll
while (true) {
  const prevCount = await page.locator('.item').count();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  const newCount = await page.locator('.item').count();
  if (newCount === prevCount) break; // no more items loaded
}
```

---

## AI-Driven Automation (Playwright + LLM)

Playwright is increasingly used with LLMs for intelligent scraping:

```ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// Take screenshot, ask Claude what to click
async function intelligentClick(page: Page, goal: string) {
  const screenshot = await page.screenshot({ encoding: 'base64' });

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshot } },
        { type: 'text', text: `Goal: ${goal}\nReturn the CSS selector or text of the element to click. JSON: {"selector": "...", "text": "..."}` }
      ]
    }]
  });

  const { text } = JSON.parse(response.content[0].text);
  await page.getByText(text).click();
}
```

---

## Debugging

```bash
# Run in headed mode with slow-mo
npx playwright test --headed --slowmo=500

# Run one test with debug inspector
npx playwright test login.spec.ts --debug

# Codegen — record actions as test code
npx playwright codegen https://example.com

# View HTML report
npx playwright show-report

# View trace (recorded on failure)
npx playwright show-trace trace.zip
```

```ts
// In test — pause execution and open browser inspector
await page.pause();

// Verbose logging
process.env.DEBUG = 'pw:api';
```

---

## Interview Q&A

**Q: How does Playwright's auto-waiting work?**

Before each action (click, fill, etc.) Playwright runs actionability checks: the element must be visible, stable (not mid-animation), attached to DOM, and enabled. It retries these checks up to the configured timeout (default 30s). This eliminates 90% of flaky test issues that come from manual `sleep()`/`waitForTimeout()` calls in other frameworks.

**Q: How do you handle authentication in Playwright so you're not logging in for every test?**

Use storage state. Run a setup project once that logs in and saves `page.context().storageState()` to a JSON file. All subsequent tests in the project use `storageState: 'auth.json'` to start pre-authenticated. No repeated login, no performance penalty, no network calls for auth in your tests.

**Q: How do you test a multi-step form reliably across slow networks?**

Use network interception to simulate conditions: `page.route('**/submit', route => route.fulfill({ delay: 3000 }))`. Assert loading states appear and disappear. Assert error handling works when `route.fulfill({ status: 500 })`. Never use `waitForTimeout` — use `waitForResponse` or wait for specific DOM changes.

**Q: What's the difference between `page.locator()` and `page.$`?**

`page.locator()` returns a `Locator` object that is lazy — it doesn't query the DOM until you interact with it. It retries automatically and supports chaining/filtering. `page.$()` executes immediately and returns an `ElementHandle` or null — no retries, no auto-waiting. Use `Locator` for all tests; `ElementHandle` is essentially deprecated for test code.
