# CSS Fundamentals

## The Cascade

When multiple rules target the same element, the browser resolves conflicts in this order:

```
1. Origin & importance   (!important > author > user-agent)
2. Specificity           (inline > ID > class/attr/pseudo > element)
3. Source order          (last rule wins on ties)
```

### Specificity Calculation

```
Selector                    | (a, b, c)  | Value
----------------------------|------------|-------
*                           | (0, 0, 0)  | 0
p                           | (0, 0, 1)  | 1
.card                       | (0, 1, 0)  | 10
#header                     | (1, 0, 0)  | 100
p.intro                     | (0, 1, 1)  | 11
#nav a:hover                | (1, 1, 1)  | 111
style="..."  (inline)       | (1, 0, 0, 0)| 1000
```

**Tip**: Avoid `!important` — it breaks the natural cascade and makes debugging painful. Raise specificity deliberately, or use CSS layers (`@layer`).

---

## Box Model

Every element is a rectangular box:

```
┌────────────────────────── margin ──────────────────────────┐
│  ┌──────────────────────── border ─────────────────────┐   │
│  │  ┌─────────────────── padding ─────────────────┐    │   │
│  │  │                                             │    │   │
│  │  │              content area                  │    │   │
│  │  │                                             │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

```css
/* Default: width/height applies to content only */
box-sizing: content-box;  /* total width = width + padding + border */

/* Almost always what you want */
box-sizing: border-box;   /* total width = width (includes padding + border) */

/* Apply globally */
*, *::before, *::after {
  box-sizing: border-box;
}
```

---

## Flexbox

One-dimensional layout — row or column.

```css
.container {
  display: flex;
  flex-direction: row;          /* row | row-reverse | column | column-reverse */
  justify-content: space-between; /* main axis alignment */
  align-items: center;          /* cross axis alignment */
  gap: 1rem;
  flex-wrap: wrap;              /* allow items to wrap */
}

.item {
  flex: 1 1 200px;  /* grow shrink basis */
  /* flex: 1  =  flex: 1 1 0% */
  align-self: flex-start; /* override align-items for this item */
}
```

### Common Flex Patterns

```css
/* Center anything */
.center {
  display: flex;
  justify-content: center;
  align-items: center;
}

/* Sticky footer */
body {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
main { flex: 1; }

/* Space between with wrapping cards */
.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}
.card { flex: 1 1 280px; }
```

---

## CSS Grid

Two-dimensional layout — rows and columns simultaneously.

```css
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: auto;
  gap: 1.5rem;
}

/* Named areas */
.layout {
  display: grid;
  grid-template-areas:
    "header header header"
    "sidebar main   main"
    "footer  footer footer";
  grid-template-columns: 240px 1fr;
  grid-template-rows: auto 1fr auto;
  min-height: 100vh;
}

header  { grid-area: header; }
.sidebar { grid-area: sidebar; }
main    { grid-area: main; }
footer  { grid-area: footer; }

/* Item spanning */
.hero {
  grid-column: 1 / -1;     /* span all columns */
  grid-row: span 2;
}
```

### Responsive Grid Without Media Queries

```css
/* Auto-fill: pack as many as fit */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

/* auto-fit vs auto-fill:
   auto-fill: keeps empty tracks
   auto-fit: collapses empty tracks (items stretch to fill row) */
```

---

## Positioning

```css
position: static;    /* default — in normal flow */
position: relative;  /* offset from normal position, still in flow */
position: absolute;  /* removed from flow, relative to nearest positioned ancestor */
position: fixed;     /* relative to viewport, stays on scroll */
position: sticky;    /* relative until threshold, then fixed */

/* Stacking context */
.modal {
  position: fixed;
  z-index: 100;      /* only meaningful on positioned elements */
}
```

**Stacking context** is created by: `position` + `z-index`, `opacity < 1`, `transform`, `filter`, `will-change`, `isolation: isolate`. Children can't exceed their parent stacking context.

---

## Custom Properties (CSS Variables)

```css
:root {
  --color-primary: #4f46e5;
  --spacing-base: 1rem;
  --radius: 0.5rem;
}

.button {
  background: var(--color-primary);
  padding: var(--spacing-base) calc(var(--spacing-base) * 2);
  border-radius: var(--radius);
  /* Fallback value */
  color: var(--btn-text, white);
}

/* Scoped variables — override per component */
.card {
  --color-primary: #0ea5e9;
}
```

---

## Pseudo-classes & Pseudo-elements

```css
/* State pseudo-classes */
a:hover, a:focus, a:active { }
input:focus-visible { }
li:first-child, li:last-child, li:nth-child(2n) { }
p:not(.special) { }
input:required, input:invalid, input:checked { }

/* Structural */
:is(h1, h2, h3) { }          /* matches any in list */
:where(h1, h2, h3) { }       /* same but zero specificity */
.parent:has(> .child) { }    /* parent has direct child */

/* Pseudo-elements (two colons) */
p::before { content: "→ "; }
p::after  { content: ""; display: block; }
::selection { background: #4f46e5; color: white; }
::placeholder { color: #9ca3af; }
```

---

## Responsive Design Basics

```css
/* Mobile-first: base styles for small screens, enhance upward */
.container {
  padding: 1rem;
}

@media (min-width: 768px) {
  .container {
    padding: 2rem;
    max-width: 1200px;
    margin-inline: auto;
  }
}

/* Common breakpoints (Tailwind defaults) */
/* sm:  640px  */
/* md:  768px  */
/* lg:  1024px */
/* xl:  1280px */

/* Prefer min-width (mobile-first) over max-width (desktop-first) */

/* Fluid typography */
h1 {
  font-size: clamp(1.5rem, 4vw, 3rem);
}

/* Logical properties — work with writing direction */
.card {
  margin-block: 1rem;     /* top + bottom */
  padding-inline: 1.5rem; /* left + right (flips in RTL) */
}
```

---

## Common Gotchas

```css
/* Margin collapse — vertical margins between siblings merge */
p { margin-bottom: 1rem; }
p + p { margin-top: 1rem; }
/* Gap between them = 1rem, not 2rem */

/* Fix: use gap on flex/grid parent instead of margins */

/* z-index not working — check for stacking context */
/* overflow: hidden clips position:sticky children */

/* % height requires parent to have explicit height */
.fill-parent {
  height: 100%; /* only works if parent has explicit height */
  /* Use min-height: 100vh or flex/grid on parent instead */
}
```
