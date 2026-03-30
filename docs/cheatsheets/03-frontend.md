# Frontend Cheatsheet

## HTML Semantic Elements

```html
<header> <nav> <main> <article> <section> <aside> <footer>
<figure> <figcaption> <time datetime="2024-01-01">
<details> <summary> <dialog> <template> <slot>
```

## Forms

```html
<form action="" method="POST" novalidate>
  <label for="x">Label</label>
  <input type="email|text|password|number|tel|date|checkbox|radio" id="x" name="x"
         required autocomplete="email" aria-describedby="hint" />
  <fieldset><legend>Group</legend></fieldset>
  <button type="submit|button|reset">Go</button>
</form>
```

## Images

```html
<img src="" alt="desc" loading="lazy" decoding="async" />
<img srcset="sm.jpg 400w, lg.jpg 800w" sizes="(max-width:600px) 100vw, 800px" src="" alt="" />
<picture>
  <source media="(max-width:600px)" srcset="m.webp" type="image/webp" />
  <img src="d.jpg" alt="" />
</picture>
```

---

## CSS Box Model & Layout

```css
*, *::before, *::after { box-sizing: border-box; }

/* Flexbox */
.flex { display:flex; gap:1rem; align-items:center; justify-content:space-between; flex-wrap:wrap; }
.center { display:flex; align-items:center; justify-content:center; }
.item { flex: 1 1 0%; }          /* grow shrink basis */

/* Grid */
.auto-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px,1fr)); gap:1rem; }
.layout {
  display:grid;
  grid-template-areas: "header header" "sidebar main" "footer footer";
  grid-template-columns: 240px 1fr;
}

/* Positioning */
position: static | relative | absolute | fixed | sticky;
.sticky { position:sticky; top:0; z-index:10; }
.abs-fill { position:absolute; inset:0; }

/* Stacking context created by: position+z-index, opacity<1, transform, filter, isolation:isolate */
```

## CSS Specificity

```
Inline style    1-0-0-0
#id             0-1-0-0
.class, [attr]  0-0-1-0
element         0-0-0-1
*               0-0-0-0
```

## Responsive

```css
/* Mobile-first */
@media (min-width: 640px)  { }   /* sm */
@media (min-width: 768px)  { }   /* md */
@media (min-width: 1024px) { }   /* lg */
@media (prefers-color-scheme: dark) { }
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}

/* Fluid type */
font-size: clamp(1rem, 2.5vw, 1.5rem);
/* Logical props */
margin-block: 1rem; padding-inline: 1.5rem;
```

## CSS Variables

```css
:root { --primary: #4f46e5; --spacing: 1rem; }
color: var(--primary, #000);     /* with fallback */
```

## Pseudo

```css
:hover :focus-visible :active :disabled
:first-child :last-child :nth-child(2n)
:not(.special) :is(h1,h2,h3) :where(h1,h2,h3)
.parent:has(> .child) {}
::before ::after ::selection ::placeholder
```

---

## DOM Quick Reference

```js
// Select
document.getElementById('id')
document.querySelector('.cls')          // first
document.querySelectorAll('[data-x]')   // all, static NodeList
el.closest('.parent')                   // walk up

// Modify
el.textContent = 'safe'
el.innerHTML   = '<b>danger</b>'        // XSS risk
el.classList.add / remove / toggle / contains / replace
el.dataset.key                          // data-key attribute
el.setAttribute / getAttribute / removeAttribute

// Create
const el = document.createElement('div')
parent.append(el)           // end
parent.prepend(el)          // start
ref.before(el); ref.after(el)
el.remove()

// Template (batched DOM insert)
const tpl = document.createElement('template')
tpl.innerHTML = `<div>...</div>`
parent.append(tpl.content.cloneNode(true))

// Geometry
el.getBoundingClientRect()              // viewport-relative {top,left,width,height}
window.scrollY / scrollX
```

## Events

```js
el.addEventListener('click', fn, { once, passive, capture })
parent.addEventListener('click', e => {
  const item = e.target.closest('.item'); if (!item) return
})
e.preventDefault()       // stop browser default
e.stopPropagation()      // stop bubbling

// Custom
el.dispatchEvent(new CustomEvent('my:event', { detail:{}, bubbles:true }))
```

## Common Event Names

```
click dblclick mouseenter mouseleave
keydown keyup  →  e.key e.code e.metaKey
input change submit focus blur
scroll resize  →  use passive:true
DOMContentLoaded load
visibilitychange  →  document.visibilityState
pointerdown pointerup  →  e.pointerType
```

---

## Web APIs Quick Reference

```js
// Fetch
const res = await fetch(url, { method, headers, body, signal })
res.ok / res.status / await res.json() / res.text()
AbortSignal.timeout(5000)
const [a, b] = await Promise.all([fetchA(), fetchB()])

// Storage (~5MB, strings only)
localStorage.setItem(k, JSON.stringify(v))
JSON.parse(localStorage.getItem(k) ?? 'null')
localStorage.removeItem(k)

// URL
const url = new URL(href)
url.searchParams.get/set/append('key')
history.pushState({}, '', '/path')
history.replaceState({}, '', '/path')
window.addEventListener('popstate', e => e.state)

// Observers
new IntersectionObserver(entries => {}, { threshold: 0.1 }).observe(el)
new MutationObserver(muts => {}).observe(el, { childList: true, subtree: true })
new ResizeObserver(entries => {}).observe(el)

// Animation
const id = requestAnimationFrame(callback)
cancelAnimationFrame(id)

// Clipboard
await navigator.clipboard.writeText(text)

// Performance
performance.now()                    // high-res timestamp
performance.mark('x'); performance.measure('label', 'start', 'end')
```

---

## Accessibility Quick Reference

```html
<!-- Roles -->
role="button|dialog|alert|navigation|main|list|listitem|tab|tabpanel"

<!-- Properties -->
aria-label="name"
aria-labelledby="id"
aria-describedby="id"
aria-expanded="true|false"
aria-hidden="true"
aria-live="polite|assertive"
aria-disabled="true"
aria-required="true"
aria-invalid="true"

tabindex="0"   <!-- add to tab order -->
tabindex="-1"  <!-- focusable via JS only -->
```

```css
/* Never remove focus without replacement */
:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }

/* Visually hidden */
.sr-only { position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
```

**Contrast**: 4.5:1 normal text, 3:1 large text (WCAG AA)
