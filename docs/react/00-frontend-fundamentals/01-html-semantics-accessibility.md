# HTML Semantics & Accessibility

## Semantic HTML

Semantic tags communicate meaning to browsers, search engines, and screen readers — not just visual structure.

```html
<!-- Non-semantic -->
<div class="header">
  <div class="nav">...</div>
</div>

<!-- Semantic -->
<header>
  <nav aria-label="Main navigation">...</nav>
</header>
```

### Key Semantic Elements

| Element | Purpose |
|---------|---------|
| `<header>` | Introductory content or nav for its section |
| `<nav>` | Primary navigation links |
| `<main>` | Dominant content of the `<body>` (one per page) |
| `<article>` | Self-contained content (blog post, card, comment) |
| `<section>` | Thematically grouped content with a heading |
| `<aside>` | Tangentially related content (sidebar, callout) |
| `<footer>` | Footer for its nearest sectioning element |
| `<figure>` + `<figcaption>` | Image/diagram with optional caption |
| `<time datetime="2024-01-01">` | Machine-readable date/time |

---

## Document Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Page Title</title>
  <meta name="description" content="150-160 char description" />
  <link rel="canonical" href="https://example.com/page" />
</head>
<body>
  <header>
    <nav>...</nav>
  </header>
  <main>
    <article>
      <h1>Only one h1 per page</h1>
      <section>
        <h2>Section heading</h2>
      </section>
    </article>
  </main>
  <footer>...</footer>
</body>
</html>
```

**Heading hierarchy** — don't skip levels (h1 → h2 → h3). Screen readers use headings as a page outline.

---

## Forms

```html
<form action="/submit" method="POST" novalidate>
  <!-- Label must reference input id -->
  <label for="email">Email address</label>
  <input
    type="email"
    id="email"
    name="email"
    autocomplete="email"
    required
    aria-describedby="email-hint"
  />
  <span id="email-hint">We'll never share your email.</span>

  <!-- Grouping related inputs -->
  <fieldset>
    <legend>Preferred contact</legend>
    <label><input type="radio" name="contact" value="email" /> Email</label>
    <label><input type="radio" name="contact" value="phone" /> Phone</label>
  </fieldset>

  <button type="submit">Subscribe</button>
</form>
```

### Input Types (use the right one — mobile keyboards adapt)

| Type | Use case |
|------|----------|
| `email` | Email — triggers email keyboard on mobile |
| `tel` | Phone numbers — numeric keyboard |
| `number` | Numeric input with spinners |
| `date` | Date picker (native) |
| `search` | Search field — adds clear button in some browsers |
| `url` | URL input — validates format |
| `password` | Masked input |

---

## Accessibility (a11y)

### ARIA Roles and Attributes

ARIA fills semantic gaps — use native HTML elements first.

```html
<!-- Role: announces element purpose to AT -->
<div role="alert">Form submitted successfully!</div>
<div role="dialog" aria-modal="true" aria-labelledby="dialog-title">
  <h2 id="dialog-title">Confirm deletion</h2>
</div>

<!-- aria-label: overrides accessible name -->
<button aria-label="Close dialog">✕</button>

<!-- aria-labelledby: points to another element's text -->
<nav aria-labelledby="nav-heading">
  <h2 id="nav-heading" class="sr-only">Site navigation</h2>
</nav>

<!-- aria-describedby: supplementary description -->
<input aria-describedby="pwd-requirements" type="password" />
<p id="pwd-requirements">Must be 8+ characters with a number.</p>

<!-- aria-expanded: for toggles -->
<button aria-expanded="false" aria-controls="menu">Menu</button>
<ul id="menu" hidden>...</ul>

<!-- aria-live: announce dynamic changes -->
<div aria-live="polite" aria-atomic="true">
  <!-- Content injected here is read by screen readers -->
</div>
```

### Focus Management

```css
/* Never suppress focus outlines without a replacement */
:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}

/* Visually hidden but accessible */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

```js
// Trap focus inside a modal
function trapFocus(modal) {
  const focusable = modal.querySelectorAll(
    'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  modal.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  });
  first.focus();
}
```

### Colour Contrast

- **WCAG AA**: 4.5:1 for normal text, 3:1 for large text (18pt / 14pt bold)
- **WCAG AAA**: 7:1 for normal text

Tools: browser DevTools colour picker, `axe` extension, `eslint-plugin-jsx-a11y`.

---

## Images

```html
<!-- Informative image: describe what it conveys -->
<img src="chart.png" alt="Q3 revenue grew 42% year-over-year" />

<!-- Decorative image: empty alt, screen reader skips it -->
<img src="divider.svg" alt="" role="presentation" />

<!-- Responsive images -->
<img
  src="hero-800.jpg"
  srcset="hero-400.jpg 400w, hero-800.jpg 800w, hero-1200.jpg 1200w"
  sizes="(max-width: 600px) 100vw, 800px"
  alt="..."
  loading="lazy"
  decoding="async"
/>

<!-- Art direction with <picture> -->
<picture>
  <source media="(max-width: 600px)" srcset="hero-mobile.webp" type="image/webp" />
  <source media="(max-width: 600px)" srcset="hero-mobile.jpg" />
  <img src="hero-desktop.jpg" alt="..." />
</picture>
```
