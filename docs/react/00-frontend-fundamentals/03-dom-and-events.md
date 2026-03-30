# DOM & Events

## The DOM

The Document Object Model is a tree of nodes representing the HTML document. JavaScript interacts with it via the `document` API.

```
document
└── <html>
    ├── <head>
    │   └── <title>
    └── <body>
        ├── <header>
        └── <main>
            └── <p id="intro">Hello</p>
```

---

## Selecting Elements

```js
// Single element
document.getElementById('intro')           // fastest, by id
document.querySelector('.card')            // first match, CSS selector
document.querySelector('[data-id="3"]')    // attribute selector

// Collections (live HTMLCollection vs static NodeList)
document.getElementsByClassName('card')    // live HTMLCollection
document.getElementsByTagName('p')         // live HTMLCollection
document.querySelectorAll('.card')         // static NodeList

// Relative traversal
el.parentElement
el.children                    // live HTMLCollection of element children
el.firstElementChild
el.lastElementChild
el.nextElementSibling
el.previousElementSibling
el.closest('.container')       // walk up until selector matches
```

---

## Manipulating Elements

```js
// Reading/writing content
el.textContent = 'Hello'         // text only, safe
el.innerHTML   = '<b>Bold</b>'   // parses HTML — XSS risk if user-controlled
el.outerHTML                     // includes element itself

// Attributes
el.getAttribute('href')
el.setAttribute('aria-expanded', 'true')
el.removeAttribute('disabled')
el.hasAttribute('required')
el.dataset.userId                // reads data-user-id attribute

// Classes
el.classList.add('active')
el.classList.remove('active')
el.classList.toggle('open')
el.classList.contains('visible')
el.classList.replace('old', 'new')

// Styles (prefer classes over inline styles)
el.style.color = '#4f46e5'
el.style.setProperty('--custom-prop', 'value')
getComputedStyle(el).getPropertyValue('color')  // resolved final value
```

---

## Creating & Inserting Elements

```js
// Create
const div = document.createElement('div')
div.className = 'card'
div.textContent = 'Hello'

// Insert
parent.appendChild(div)
parent.prepend(div)                // insert at start
parent.insertBefore(div, refNode)
refNode.after(div)                 // modern — inserts after refNode
refNode.before(div)

// Template literals → fragment (avoids repeated reflows)
function createCard(title, body) {
  const tpl = document.createElement('template')
  tpl.innerHTML = `<div class="card"><h2>${title}</h2><p>${body}</p></div>`
  return tpl.content.cloneNode(true)
}
document.querySelector('.grid').append(createCard('Hello', 'World'))

// Remove
el.remove()
parent.removeChild(child)

// Clone
const copy = el.cloneNode(true)   // true = deep clone (includes children)
```

---

## Events

### addEventListener

```js
// Preferred over el.onclick = ... (multiple listeners, removeEventListener)
el.addEventListener('click', handler, options)

// Options
el.addEventListener('click', handler, {
  once: true,       // auto-remove after first call
  passive: true,    // signal no preventDefault — improves scroll perf
  capture: true,    // fire during capture phase instead of bubble
})

el.removeEventListener('click', handler)  // same function reference required
```

### Event Phases

```
Document
   │  (capture phase — top down)
   ▼
  <div>
   │
   ▼
  <button>  ← target phase
   │
   ▲  (bubble phase — bottom up)
   │
<div>
```

```js
el.addEventListener('click', handler)          // bubble (default)
el.addEventListener('click', handler, true)    // capture

// Stop propagation
e.stopPropagation()       // don't bubble/capture further
e.stopImmediatePropagation() // also skip other listeners on same element

// Prevent default browser behavior (form submit, link navigation, etc.)
e.preventDefault()
```

### Event Delegation

Attach one listener to a parent instead of many to children — efficient for dynamic lists.

```js
// ❌ One listener per item — expensive for large lists
items.forEach(item => item.addEventListener('click', handler))

// ✅ One listener on parent
document.querySelector('.list').addEventListener('click', e => {
  const item = e.target.closest('.item')
  if (!item) return           // click was on whitespace
  console.log(item.dataset.id)
})
```

### Common Events

```js
// Mouse
click, dblclick, mouseenter, mouseleave, mousemove, mousedown, mouseup

// Keyboard
keydown, keyup, keypress (deprecated)
e.key          // 'Enter', 'ArrowUp', 'a'
e.code         // 'KeyA' — physical key, layout-independent
e.metaKey, e.ctrlKey, e.shiftKey, e.altKey

// Form
submit, change, input, focus, blur, focusin, focusout
e.target.value

// Window / Document
DOMContentLoaded  // DOM ready, before images/stylesheets
load              // everything loaded
resize, scroll
visibilitychange  // tab hidden/shown — document.visibilityState

// Pointer (replaces mouse + touch)
pointerdown, pointerup, pointermove, pointercancel
e.pointerType   // 'mouse' | 'touch' | 'pen'
```

---

## Custom Events

```js
// Dispatch
const event = new CustomEvent('cart:updated', {
  detail: { itemCount: 3 },
  bubbles: true,
  cancelable: true,
})
document.dispatchEvent(event)

// Listen
document.addEventListener('cart:updated', e => {
  console.log(e.detail.itemCount)
})
```

---

## Performance Tips

```js
// Batch DOM reads before writes — avoid layout thrashing
// ❌ Forces multiple reflows
items.forEach(item => {
  const h = item.offsetHeight       // read — forces reflow
  item.style.height = h * 2 + 'px' // write — invalidates layout
})

// ✅ Read all, then write all
const heights = items.map(item => item.offsetHeight)  // all reads
items.forEach((item, i) => item.style.height = heights[i] * 2 + 'px')  // all writes

// Debounce resize/scroll handlers
function debounce(fn, delay) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}
window.addEventListener('resize', debounce(onResize, 150), { passive: true })

// IntersectionObserver — lazy-load or animate on enter
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible')
      observer.unobserve(e.target)
    }
  })
}, { threshold: 0.1 })

document.querySelectorAll('.animate').forEach(el => observer.observe(el))
```

---

## MutationObserver

Watch for DOM changes without polling.

```js
const observer = new MutationObserver(mutations => {
  for (const m of mutations) {
    if (m.type === 'childList') {
      console.log('children changed', m.addedNodes, m.removedNodes)
    }
    if (m.type === 'attributes') {
      console.log(`${m.attributeName} changed`)
    }
  }
})

observer.observe(targetNode, {
  childList: true,       // watch children add/remove
  attributes: true,      // watch attribute changes
  subtree: true,         // watch all descendants
  attributeFilter: ['class', 'aria-expanded'],  // only these attributes
})

observer.disconnect()
```
