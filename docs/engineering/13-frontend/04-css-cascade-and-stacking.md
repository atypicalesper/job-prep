# CSS Cascade, Specificity & Stacking Contexts

---

## The Cascade

The cascade is the algorithm that determines which CSS declaration wins when multiple rules target the same element and property.

Priority order (highest to lowest):

1. **Transition declarations** (active CSS transitions override everything)
2. **Important declarations** — `!important` user-agent
3. **Important declarations** — `!important` user styles
4. **Important declarations** — `!important` author styles (your CSS)
5. **Animation declarations** (active `@keyframes`)
6. **Normal declarations** — author styles (your CSS)
7. **Normal declarations** — user styles
8. **Normal declarations** — user-agent (browser defaults)

Within each origin, the cascade resolves ties via **layers → specificity → order**.

---

## Cascade Layers (`@layer`)

`@layer` (CSS 2022+) lets you explicitly control cascade priority between groups of rules — without resorting to specificity hacks or `!important`.

```css
/* Declaration order establishes priority: later layers win */
@layer reset, base, components, utilities;

@layer reset {
  * { margin: 0; padding: 0; box-sizing: border-box; }
}

@layer components {
  .btn { background: blue; }
}

@layer utilities {
  .bg-red { background: red !important; } /* !important within a layer */
}
```

**Key rule**: a declaration in a **later-declared layer** beats an earlier layer, regardless of specificity. An unlayered rule beats all layered rules.

```css
@layer base { .btn { color: blue; } }   /* layer: base */
.btn { color: red; }                     /* unlayered → wins */
```

### Why layers matter

Before `@layer`, a utility class like `.text-red` (specificity: 0-1-0) could be overridden by a component's `.card p` (specificity: 0-1-1). With layers, utility classes in a higher-priority layer beat component styles regardless of specificity. This is how Tailwind v4 uses layers.

---

## Specificity

Specificity is a weight calculated per selector. Represented as `(A, B, C)`:

| Selector type | Adds |
|---|---|
| Inline style (`style=""`) | `(1, 0, 0, 0)` — separate column, always wins over selectors |
| ID selector (`#id`) | `(0, 1, 0, 0)` |
| Class, pseudo-class, attribute (`.class`, `:hover`, `[attr]`) | `(0, 0, 1, 0)` |
| Type selector, pseudo-element (`div`, `::before`) | `(0, 0, 0, 1)` |
| Universal selector, combinators (`*`, `>`, `+`, `~`) | `(0, 0, 0, 0)` |

Specificity columns **do not carry over**: 11 classes never beat 1 ID (0-11-0 vs 0-1-0 — compare left to right).

```css
#header .nav li a         /* 0-1-1-2 */
.nav li.active a:hover    /* 0-0-3-2 */
```

### `:is()`, `:not()`, `:has()` and specificity

`:is()`, `:not()`, `:has()` take the **specificity of their most specific argument**:
```css
:is(h1, .title, #hero) { } /* specificity: (0,1,0,0) — from #hero */
:not(.active) { }           /* specificity: (0,0,1,0) — from .active */
```

`:where()` always has **zero specificity** — useful for resets and base styles that should be easily overridden:
```css
:where(h1, h2, h3) { font-size: 1rem; } /* (0,0,0,0) — easily overridden */
```

---

## The Box Model

```
┌─────────────────────────────────────┐
│              margin                  │
│  ┌───────────────────────────────┐  │
│  │           border              │  │
│  │  ┌─────────────────────────┐ │  │
│  │  │        padding          │ │  │
│  │  │  ┌───────────────────┐  │ │  │
│  │  │  │     content       │  │ │  │
│  │  │  └───────────────────┘  │ │  │
│  │  └─────────────────────────┘ │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

`box-sizing: content-box` (default): `width` = content only. Border/padding add to total.
`box-sizing: border-box`: `width` = content + padding + border. Far more predictable — set globally.

**Margin collapse**: vertical margins between block-level siblings (and parent/first-child) collapse to the larger value, not the sum. Does NOT happen with flexbox/grid children, inline-block, floated elements, or elements with `overflow` not `visible`.

---

## Stacking Contexts

A stacking context is a 3D grouping of elements that are painted as a unit. Elements within a stacking context are painted in a defined order; elements outside cannot interleave with them.

### What creates a stacking context

- `position: relative/absolute/fixed/sticky` **and** `z-index` not `auto`
- `opacity` < 1
- `transform`, `filter`, `perspective`, `clip-path`, `mask`
- `will-change` with any of the above values
- `isolation: isolate` (explicit, no side effects)
- `mix-blend-mode` not `normal`
- Flex/grid children with `z-index` not `auto`
- `contain: paint`, `contain: layout`, `contain: content`

### Painting order within a stacking context

1. Background and borders of the element
2. Child stacking contexts with negative `z-index` (lowest first)
3. Block-level non-positioned descendants
4. Floating descendants
5. Inline descendants
6. Child stacking contexts with `z-index: 0` or `auto`
7. Child stacking contexts with positive `z-index` (lowest first)

### `z-index` only works within the same stacking context

```css
/* Common trap: */
.modal    { position: fixed; z-index: 1000; }
.tooltip  { position: relative; z-index: 9999; }
```

If `.tooltip` is inside a parent with `transform: translateZ(0)` (which creates a stacking context), the `z-index: 9999` is scoped to that parent — `.modal` at `z-index: 1000` in a higher-level context will paint on top.

Fix: `isolation: isolate` on the container to explicitly create a stacking context without unintended side effects, or move portals/modals to the document root (React portals pattern).

---

## Layout Systems

### Normal flow

Block boxes stack vertically; inline boxes flow horizontally. Block elements take full width; inline elements size to content.

### Flexbox

One-dimensional layout. Main axis (row/column) and cross axis. Key concepts:
- `flex-grow`: proportion of available space to take.
- `flex-shrink`: proportion to shrink when overflowing.
- `flex-basis`: base size before growth/shrink.
- `align-items`: cross-axis alignment of items. `align-content`: cross-axis alignment of lines (multi-line).
- `justify-content`: main-axis distribution.
- Flex items have an implicit `min-width: auto` — can prevent expected shrinking. Fix: `min-width: 0`.

### Grid

Two-dimensional layout. Define rows and columns explicitly or implicitly.

```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  /* auto-fill: create as many columns as fit */
  /* auto-fit: same, but collapses empty tracks */
  gap: 1rem;
}
```

Grid placement: `grid-column: 1 / span 2`, `grid-row: 2 / 4`, `grid-area: header`.

**Subgrid**: `grid-template-columns: subgrid` — child grid inherits parent track sizing. Useful for aligning nested content to parent grid lines.

---

## Containment (`contain`)

CSS containment tells the browser an element is independent of the rest of the page — enabling optimizations:

```css
.card {
  contain: content; /* = layout + style + paint */
}
```

| Value | Effect |
|---|---|
| `layout` | Internal layout doesn't affect outside; creates stacking context |
| `style` | Counters/quotes don't escape the element |
| `paint` | Descendants don't paint outside the border; creates stacking context |
| `size` | Element size doesn't depend on its children |
| `content` | `layout` + `style` + `paint` |
| `strict` | All of the above |

`content-visibility: auto` is a performance optimization that skips rendering off-screen elements entirely — combining `contain: content` with skip rendering.

---

## Interview Q&A

**Q: Two elements have `z-index: 9999` and `z-index: 1`. The `z-index: 1` element appears on top. Why?**
They're in different stacking contexts. The `z-index: 9999` element's parent has a stacking context (e.g., due to `transform`, `opacity`, or `will-change`) with a lower `z-index` than the other element's parent. `z-index` is relative within a stacking context — comparing values across contexts is meaningless.

**Q: What is specificity and why is `!important` considered bad practice?**
Specificity is the cascade's tiebreaker — higher-specificity rules win. `!important` bypasses specificity entirely, making it impossible to override without another `!important`. This leads to specificity arms races. Better solutions: use lower-specificity selectors, `:where()`, or `@layer` to control cascade priority without specificity hacks.

**Q: Why do vertical margins collapse?**
Originally to handle typography: a `<p>` with `margin-bottom: 1em` followed by another with `margin-top: 1em` should have 1em space between them, not 2em. The spec collapses them to the larger value. It doesn't apply in flex/grid context because they're designed for layout, not typography flow.

**Q: What does `will-change` do and when should you avoid it?**
`will-change` hints to the browser to promote the element to its own compositor layer (GPU texture) in advance. This makes animations that use `transform`/`opacity` very smooth — no repaint needed. But each layer uses GPU memory. Overusing `will-change` (setting it on many elements statically) exhausts GPU memory and can make performance worse. Only use it on elements that are actually about to animate, and remove it after the animation via JS.

**Q: What is the difference between `display: none`, `visibility: hidden`, and `opacity: 0`?**
`display: none`: removed from layout — takes no space, not accessible. `visibility: hidden`: invisible but still takes up space; not accessible (but `visibility: visible` on a descendant can make it accessible). `opacity: 0`: invisible, still takes up space, still accessible to screen readers and pointer events (unless `pointer-events: none` is also set). For animations, use `opacity`; for accessibility-aware hiding, use `visibility` with `pointer-events: none`.

**Q: How does `position: sticky` work?**
An element is `relative` until it reaches a defined offset (e.g., `top: 0`) relative to its nearest scrolling ancestor — then it becomes `fixed` within that ancestor's bounds. Sticky positioning requires: a non-`overflow: visible` scrolling ancestor, a non-`auto`/`visible` ancestor that establishes the sticky container boundaries. Common bug: `overflow: hidden` on a parent clips the sticky element's container, making it never stick.
