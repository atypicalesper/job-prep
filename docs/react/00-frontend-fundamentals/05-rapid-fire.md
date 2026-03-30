# Frontend Rapid Fire Q&A

Quick interview questions with concise answers. Aim to recall each answer in under 30 seconds.

---

## HTML

**Q: What's the difference between `<section>` and `<div>`?**
`<section>` is semantic — it groups thematically related content and implies a heading. `<div>` is a generic container with no semantic meaning.

**Q: What does `<!DOCTYPE html>` do?**
Tells the browser to render in standards mode (not quirks mode). Without it, browsers make guesses about which legacy rendering rules to apply.

**Q: When should you use `<button>` vs `<a>`?**
`<a>` navigates to a URL. `<button>` performs an action. Never use `<a href="#">` for actions — it's not keyboard-friendly and misleads AT.

**Q: What is the difference between `defer` and `async` on a script tag?**
Both download without blocking HTML parsing. `defer` executes in document order after parsing completes. `async` executes as soon as downloaded, potentially out of order and interrupting parsing.

**Q: What's `alt=""` vs no `alt` attribute on an image?**
`alt=""` tells screen readers to skip the image (decorative). No `alt` attribute causes screen readers to announce the file name — always set `alt`.

**Q: What does `tabindex="-1"` do?**
Removes an element from the natural tab order but still allows it to be focused programmatically via `.focus()`. Used for modal focus management.

**Q: What is a `data-*` attribute?**
Custom attributes for embedding data in HTML elements, accessible via `el.dataset.keyName`. Used to pass data to JS without polluting the DOM.

---

## CSS

**Q: What is the difference between `display: none` and `visibility: hidden`?**
`display: none` removes the element from layout entirely — it takes no space. `visibility: hidden` hides it but preserves its layout space.

**Q: Explain the CSS Box Model.**
Every element is a box: content → padding → border → margin (outside to inside). By default (`content-box`), width/height applies to the content area. `border-box` makes width include padding and border.

**Q: What is specificity and how is it calculated?**
A score determining which CSS rule wins when multiple apply: inline styles (1-0-0-0) > ID selectors (0-1-0-0) > class/attribute/pseudo-class (0-0-1-0) > element (0-0-0-1).

**Q: What is the difference between `em` and `rem`?**
`em` is relative to the element's own font-size (or parent's if font-size itself). `rem` is always relative to the root (`<html>`) font-size — predictable and unaffected by nesting.

**Q: What triggers a reflow (layout) vs a repaint?**
**Reflow**: changes to geometry (width, height, position, font-size, adding/removing elements). **Repaint**: changes to visuals without geometry (color, background, visibility). Reflow is more expensive — it recalculates the entire layout.

**Q: What is `will-change` for?**
A hint to the browser that an element will be animated, allowing the GPU layer to be promoted ahead of time. Use sparingly — overuse wastes memory.

**Q: What is a CSS stacking context?**
An isolated rendering layer where `z-index` only applies within the context. Created by `position` + non-`auto` `z-index`, `opacity < 1`, `transform`, `filter`, `isolation: isolate`, etc.

**Q: What is the difference between `flexbox` and `grid`?**
Flexbox is one-dimensional (row OR column). Grid is two-dimensional (rows AND columns simultaneously). Use flex for components, grid for page layouts.

**Q: What does `position: sticky` do?**
Acts as `relative` until the element reaches a specified scroll threshold, then behaves as `fixed` within its scrolling container. Requires a `top`/`left` value to activate.

**Q: What is margin collapse?**
Adjacent vertical margins between block elements merge into the larger of the two. Prevented by flex/grid parent, padding, border, or `overflow: hidden`.

---

## JavaScript & DOM

**Q: What is event delegation?**
Attaching a single event listener to a parent element instead of individual children. Uses event bubbling — `e.target` identifies which child was clicked. Efficient for dynamic lists.

**Q: What is the difference between `e.stopPropagation()` and `e.preventDefault()`?**
`stopPropagation()` stops the event from bubbling up (or capturing down). `preventDefault()` cancels the browser's default behaviour (form submit, link navigation).

**Q: What is the difference between `innerHTML` and `textContent`?**
`textContent` sets raw text safely — HTML is not parsed. `innerHTML` parses HTML, enabling XSS if set from user input.

**Q: What is `getBoundingClientRect()`?**
Returns a DOMRect with `top`, `left`, `width`, `height` relative to the viewport. Causes a synchronous reflow — batch reads before writes.

**Q: What is `requestAnimationFrame` used for?**
Schedules a callback before the next browser paint, synced to the display refresh rate (usually 60fps). Used for smooth animations — avoids `setInterval`/`setTimeout` which drift.

**Q: What is an IntersectionObserver?**
An API to asynchronously observe when elements enter or exit the viewport (or a parent). Used for lazy loading, infinite scroll, and animation on scroll. More performant than scroll event listeners.

**Q: What is a MutationObserver?**
Watches for DOM changes (added/removed nodes, attribute changes). Replaces the deprecated `DOMNodeInserted` event.

---

## Browser & Performance

**Q: What is the Critical Rendering Path?**
The sequence from HTML bytes to pixels: HTML → DOM, CSS → CSSOM, DOM+CSSOM → Render Tree → Layout → Paint → Composite. Optimising it reduces time-to-first-paint.

**Q: What is render-blocking?**
CSS is render-blocking by default — browsers won't paint until CSSOM is built. Synchronous `<script>` blocks both parsing and rendering. Use `defer`, `async`, or inline critical CSS to reduce blocking.

**Q: What is LCP, FID/INP, CLS?**
Core Web Vitals: **LCP** (Largest Contentful Paint) — how fast the main content loads. **INP** (Interaction to Next Paint) — responsiveness. **CLS** (Cumulative Layout Shift) — visual stability.

**Q: What is layout thrashing?**
Forcing multiple browser reflow cycles in a loop by interleaving DOM reads and writes. Fix: batch all reads first, then all writes.

**Q: What is the difference between `localStorage` and `sessionStorage`?**
Both are ~5MB string key-value stores. `localStorage` persists across sessions. `sessionStorage` is cleared when the tab closes.

**Q: What is CORS?**
Cross-Origin Resource Sharing — a browser security mechanism that restricts cross-origin HTTP requests. The server signals allowed origins via `Access-Control-Allow-Origin` header. Preflight OPTIONS request is sent for non-simple requests.

**Q: What is `Content-Security-Policy`?**
An HTTP header that controls which resources a page can load, mitigating XSS by blocking inline scripts and restricting external resource origins.

**Q: What is a service worker?**
A script that runs in the background, separate from the page. Powers offline support (caching), push notifications, and background sync. Acts as a programmable network proxy.

---

## Accessibility

**Q: What is the difference between ARIA roles and semantic HTML?**
Semantic HTML conveys meaning natively — always prefer it. ARIA fills gaps where no semantic element exists. First rule of ARIA: don't use it if a native HTML element works.

**Q: What is `aria-live`?**
Announces dynamic content changes to screen readers without user interaction. `polite` waits for the user to finish; `assertive` interrupts immediately.

**Q: What is focus trapping and when do you need it?**
Keeping keyboard focus within a modal or dialog while it's open. Required so keyboard users can't tab through content behind the overlay.

**Q: What is `prefers-reduced-motion`?**
A CSS media query that detects if the user has requested reduced animations (system setting). Disable or simplify animations when matched.

```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```
