# Frontend Cheatsheet

## HTML Quick Reference

```html
<!-- Document shell -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Title</title>
</head>
<body></body>
</html>

<!-- Semantic structure -->
<header> <nav> <main> <article> <section> <aside> <footer>

<!-- Form essentials -->
<form action="" method="POST">
  <label for="x">Label</label>
  <input type="text|email|password|number|tel|date|search|url|checkbox|radio" id="x" name="x" />
  <textarea id="x" rows="4"></textarea>
  <select id="x"><option value="">Choose</option></select>
  <fieldset><legend>Group</legend></fieldset>
  <button type="submit|button|reset">Submit</button>
</form>

<!-- Images -->
<img src="" alt="description" loading="lazy" decoding="async" />
<img srcset="sm.jpg 400w, lg.jpg 800w" sizes="(max-width:600px) 100vw, 800px" src="" alt="" />
<picture>
  <source media="(max-width:600px)" srcset="mobile.webp" />
  <img src="desktop.jpg" alt="" />
</picture>
```

---

## CSS Quick Reference

```css
/* Box model */
*, *::before, *::after { box-sizing: border-box; }

/* Visually hidden */
.sr-only { position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }

/* Flexbox */
.flex { display:flex; gap:1rem; align-items:center; justify-content:space-between; flex-wrap:wrap; }
.flex-center { display:flex; align-items:center; justify-content:center; }
.flex-col { display:flex; flex-direction:column; }
.flex-1 { flex:1 1 0%; }

/* Grid */
.grid-auto { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px,1fr)); gap:1rem; }
.grid-2 { display:grid; grid-template-columns:repeat(2,1fr); gap:1rem; }

/* Positioning */
.relative { position:relative; }
.absolute-fill { position:absolute; inset:0; }
.fixed-top { position:fixed; top:0; left:0; right:0; z-index:100; }
.sticky-top { position:sticky; top:0; z-index:10; }

/* Typography */
.truncate { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.line-clamp-2 { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.fluid-text { font-size:clamp(1rem, 2.5vw, 1.5rem); }

/* Spacing helpers */
.container { max-width:1200px; margin-inline:auto; padding-inline:1.5rem; }

/* Transitions */
.transition { transition:all 0.2s ease; }
.hover-lift:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,0.15); }

/* Responsive */
@media (max-width:768px) { }    /* mobile */
@media (min-width:768px) { }    /* tablet+ */
@media (min-width:1024px) { }   /* desktop+ */
@media (prefers-color-scheme:dark) { }
@media (prefers-reduced-motion:reduce) { * { animation-duration:0.01ms !important; } }

/* Custom properties */
:root { --primary:#4f46e5; --spacing:1rem; --radius:0.5rem; }
color: var(--primary, fallback);
```

---

## Specificity Reference

```
Inline style         1-0-0-0  (strongest)
#id                  0-1-0-0
.class, [attr], :pseudo-class  0-0-1-0
element, ::pseudo-element      0-0-0-1
* combinator         0-0-0-0  (weakest)
```

---

## DOM Quick Reference

```js
// Select
document.getElementById('id')
document.querySelector('.class')           // first match
document.querySelectorAll('[data-x]')      // NodeList
el.closest('.parent')                      // walk up

// Manipulate
el.textContent = 'text'                    // safe
el.innerHTML = '<b>html</b>'               // XSS risk — sanitize user input
el.classList.add/remove/toggle/contains('cls')
el.dataset.key                             // data-key attribute
el.setAttribute/getAttribute/removeAttribute()

// Create & insert
const el = document.createElement('div')
parent.append(el)           // end
parent.prepend(el)          // start
ref.before(el)              // before ref
ref.after(el)               // after ref
el.remove()

// Template (batched, avoids reflow)
const tpl = document.createElement('template')
tpl.innerHTML = `<div class="card">...</div>`
parent.append(tpl.content.cloneNode(true))

// Geometry
el.getBoundingClientRect()  // {top,left,width,height} — viewport-relative
el.offsetWidth / offsetHeight
window.scrollY / scrollX
```

---

## Events Quick Reference

```js
el.addEventListener('click', handler, { once, passive, capture })
el.removeEventListener('click', handler)

// Delegation
parent.addEventListener('click', e => {
  const item = e.target.closest('.item')
  if (!item) return
})

// Custom events
el.dispatchEvent(new CustomEvent('my:event', { detail: {}, bubbles: true }))
el.addEventListener('my:event', e => e.detail)

// Common events
click, dblclick, mouseenter, mouseleave
keydown, keyup               — e.key, e.code, e.metaKey
submit, change, input, focus, blur
scroll, resize               — use passive:true
DOMContentLoaded, load
visibilitychange             — document.visibilityState
pointerdown, pointerup       — e.pointerType ('mouse'|'touch'|'pen')

e.preventDefault()           // stop browser default
e.stopPropagation()          // stop bubbling
```

---

## Web APIs Quick Reference

```js
// Fetch
const res = await fetch(url, { method, headers, body, signal })
res.ok / res.status / res.json() / res.text() / res.blob()
AbortSignal.timeout(5000)

// Storage
localStorage.setItem(k, v) / getItem(k) / removeItem(k) / clear()
sessionStorage  // same API, cleared on tab close

// URL
new URL('https://x.com/path?q=1')
  .searchParams.get/set/append()

// History (SPA routing)
history.pushState(state, '', '/path')
history.replaceState(state, '', '/path')
window.addEventListener('popstate', e => e.state)

// Animation
const id = requestAnimationFrame(callback)
cancelAnimationFrame(id)

// Observers
new IntersectionObserver(entries => {}, { threshold: 0.1 }).observe(el)
new MutationObserver(mutations => {}).observe(el, { childList, attributes, subtree })
new ResizeObserver(entries => {}).observe(el)

// Clipboard
await navigator.clipboard.writeText('text')
await navigator.clipboard.readText()

// Performance
performance.now()
performance.mark('name')
performance.measure('name', 'start', 'end')
```

---

## Accessibility Quick Reference

```html
<!-- ARIA -->
role="button|dialog|alert|navigation|main|list|listitem"
aria-label="accessible name"
aria-labelledby="id-of-label"
aria-describedby="id-of-description"
aria-expanded="true|false"
aria-hidden="true"              <!-- hides from AT -->
aria-live="polite|assertive"   <!-- announce dynamic content -->
aria-disabled="true"
tabindex="0"                    <!-- add to tab order -->
tabindex="-1"                   <!-- focusable via JS only -->

<!-- Focus -->
:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }
```

**Contrast**: 4.5:1 minimum for normal text (WCAG AA)

**ARIA rules**: Use native HTML first. Never override semantics without purpose. Test with screen reader.
