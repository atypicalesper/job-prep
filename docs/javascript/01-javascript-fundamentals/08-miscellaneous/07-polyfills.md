# Polyfills

## What is a Polyfill?

A **polyfill** is code that implements a feature on browsers/environments that don't natively support it. The name comes from Polyfilla (a UK spackling paste) — you fill in the gaps.

```js
// Polyfill for Array.prototype.flat (not in IE)
if (!Array.prototype.flat) {
  Array.prototype.flat = function(depth = 1) {
    return depth > 0
      ? this.reduce((acc, val) =>
          acc.concat(Array.isArray(val) ? val.flat(depth - 1) : val), [])
      : this.slice();
  };
}
```

**Polyfill vs Transpile vs Shim:**

| Term | What it does | Tool |
|---|---|---|
| Polyfill | Adds missing API at runtime | core-js, polyfill.io |
| Transpile | Converts new syntax to old syntax | Babel, SWC |
| Shim | Broader term — patches environment (APIs + behaviour) | es-shims |

Babel transpiles `const` → `var`, arrow functions → `function` — but it **cannot** transpile `Promise` or `fetch`. Those need polyfills.

---

## Writing Polyfills — Core Patterns

### Array methods

```js
// Array.prototype.includes
if (!Array.prototype.includes) {
  Array.prototype.includes = function(value, fromIndex = 0) {
    const len = this.length;
    let i = fromIndex < 0 ? Math.max(0, len + fromIndex) : fromIndex;
    for (; i < len; i++) {
      if (this[i] === value || (Number.isNaN(this[i]) && Number.isNaN(value))) {
        return true;
      }
    }
    return false;
  };
}

// Array.from
if (!Array.from) {
  Array.from = function(arrayLike, mapFn, thisArg) {
    const arr = [];
    for (let i = 0; i < arrayLike.length; i++) {
      arr.push(mapFn ? mapFn.call(thisArg, arrayLike[i], i) : arrayLike[i]);
    }
    return arr;
  };
}
```

### Object methods

```js
// Object.assign
if (!Object.assign) {
  Object.assign = function(target, ...sources) {
    if (target == null) throw new TypeError('Cannot convert undefined/null to object');
    const to = Object(target);
    for (const source of sources) {
      if (source != null) {
        for (const key in source) {
          if (Object.prototype.hasOwnProperty.call(source, key)) {
            to[key] = source[key];
          }
        }
      }
    }
    return to;
  };
}

// Object.create (simplified)
if (!Object.create) {
  Object.create = function(proto) {
    function F() {}
    F.prototype = proto;
    return new F();
  };
}
```

### String methods

```js
// String.prototype.trimStart / trimEnd
if (!String.prototype.trimStart) {
  String.prototype.trimStart = function() {
    return this.replace(/^\s+/, '');
  };
}
if (!String.prototype.trimEnd) {
  String.prototype.trimEnd = function() {
    return this.replace(/\s+$/, '');
  };
}

// String.prototype.padStart
if (!String.prototype.padStart) {
  String.prototype.padStart = function(targetLength, padString = ' ') {
    const str = String(this);
    if (str.length >= targetLength) return str;
    const pad = String(padString).repeat(Math.ceil((targetLength - str.length) / padString.length));
    return pad.slice(0, targetLength - str.length) + str;
  };
}
```

### Promise polyfill (simplified skeleton)

```js
// Real polyfills use es6-promise or core-js/promise — this shows the shape
class PromisePolyfill {
  constructor(executor) {
    this.state = 'pending';
    this.value = undefined;
    this.callbacks = [];

    const resolve = (val) => {
      if (this.state !== 'pending') return;
      this.state = 'fulfilled';
      this.value = val;
      this.callbacks.forEach(cb => cb.onFulfilled?.(val));
    };

    const reject = (reason) => {
      if (this.state !== 'pending') return;
      this.state = 'rejected';
      this.value = reason;
      this.callbacks.forEach(cb => cb.onRejected?.(reason));
    };

    try { executor(resolve, reject); }
    catch (e) { reject(e); }
  }

  then(onFulfilled, onRejected) {
    return new PromisePolyfill((resolve, reject) => {
      const handle = () => {
        try {
          if (this.state === 'fulfilled') {
            resolve(onFulfilled ? onFulfilled(this.value) : this.value);
          } else {
            reject(onRejected ? onRejected(this.value) : this.value);
          }
        } catch (e) { reject(e); }
      };
      if (this.state === 'pending') this.callbacks.push({ onFulfilled: () => handle(), onRejected: () => handle() });
      else queueMicrotask(handle);
    });
  }
}
```

### fetch polyfill

```js
// Real one: github.com/github/fetch or use axios
// Pattern — check and assign:
if (!window.fetch) {
  window.fetch = function(url, options = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(options.method || 'GET', url);
      Object.entries(options.headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.onload = () => resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: () => Promise.resolve(JSON.parse(xhr.responseText)),
        text: () => Promise.resolve(xhr.responseText),
      });
      xhr.onerror = () => reject(new TypeError('Network request failed'));
      xhr.send(options.body || null);
    });
  };
}
```

---

## Production Approach: core-js + Babel

Never hand-write polyfills for production. Use:

```bash
npm install core-js@3
npm install --save-dev @babel/preset-env
```

```json
// babel.config.json
{
  "presets": [
    ["@babel/preset-env", {
      "useBuiltIns": "usage",  // only imports polyfills actually used in your code
      "corejs": 3,
      "targets": "> 0.25%, not dead"
    }]
  ]
}
```

`useBuiltIns: "usage"` — Babel scans your code and auto-inserts `import 'core-js/...'` only for features you actually use. Far smaller bundle than importing all of core-js.

---

## polyfill.io — Runtime Polyfill Service

Send a `<script>` tag; the CDN detects the browser's UA and returns only what that browser needs:

```html
<script src="https://polyfill.io/v3/polyfill.min.js?features=Promise,fetch,Array.prototype.flat"></script>
```

Chrome 120 gets an empty (or tiny) response. IE 11 gets a full bundle. Zero JS sent to modern browsers.

---

## Feature Detection Pattern

```js
// GOOD — detect the feature, not the browser
if ('IntersectionObserver' in window) {
  // native
} else {
  // load polyfill dynamically
  import('intersection-observer').then(() => { /* now safe */ });
}

// BAD — UA sniffing breaks with new browser versions
if (navigator.userAgent.includes('Trident')) { /* IE */ }
```

Dynamic import pattern — only loads polyfill when actually needed:

```js
async function loadPolyfillsIfNeeded() {
  const polyfills = [];
  if (!window.fetch) polyfills.push(import('whatwg-fetch'));
  if (!window.Promise) polyfills.push(import('promise-polyfill/src/polyfill'));
  if (!window.IntersectionObserver) polyfills.push(import('intersection-observer'));
  await Promise.all(polyfills);
}

loadPolyfillsIfNeeded().then(() => bootstrapApp());
```

---

## Common Interview Polyfills to Know by Heart

### bind

```js
Function.prototype.myBind = function(thisArg, ...outerArgs) {
  const fn = this;
  return function(...innerArgs) {
    return fn.apply(thisArg, [...outerArgs, ...innerArgs]);
  };
};
```

### call / apply

```js
Function.prototype.myCall = function(thisArg, ...args) {
  thisArg = thisArg ?? globalThis;
  const sym = Symbol('fn');
  thisArg[sym] = this;
  const result = thisArg[sym](...args);
  delete thisArg[sym];
  return result;
};

Function.prototype.myApply = function(thisArg, args = []) {
  return this.myCall(thisArg, ...args);
};
```

### new operator

```js
function myNew(Constructor, ...args) {
  const obj = Object.create(Constructor.prototype);
  const result = Constructor.apply(obj, args);
  // If constructor returns an object, use that; otherwise use obj
  return result instanceof Object ? result : obj;
}
```

### Promise.all / Promise.allSettled / Promise.race

```js
Promise.myAll = function(promises) {
  return new Promise((resolve, reject) => {
    const results = [];
    let count = 0;
    if (!promises.length) return resolve([]);
    promises.forEach((p, i) => {
      Promise.resolve(p).then(val => {
        results[i] = val;
        if (++count === promises.length) resolve(results);
      }).catch(reject);
    });
  });
};

Promise.myAllSettled = function(promises) {
  return Promise.myAll(promises.map(p =>
    Promise.resolve(p)
      .then(value => ({ status: 'fulfilled', value }))
      .catch(reason => ({ status: 'rejected', reason }))
  ));
};

Promise.myRace = function(promises) {
  return new Promise((resolve, reject) => {
    promises.forEach(p => Promise.resolve(p).then(resolve).catch(reject));
  });
};
```

### debounce / throttle

```js
// Trailing-edge debounce — fires after `delay` ms of quiet
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Timestamp throttle — fires at most once per `interval` ms (no drift)
function throttle(fn, interval) {
  let lastTime = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}
```

> For full implementations (leading edge, cancel/flush, maxWait, rAF throttle, React hooks) see [`08-debounce-throttle.md`](./08-debounce-throttle.md).

### deep clone (structuredClone polyfill)

```js
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof RegExp) return new RegExp(obj);
  if (Array.isArray(obj)) return obj.map(deepClone);
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, deepClone(v)])
  );
}
// Real answer in interviews: use structuredClone() (native since Node 17, Chrome 98)
```

### flatten

```js
function flatten(arr, depth = Infinity) {
  return depth > 0
    ? arr.reduce((acc, val) =>
        acc.concat(Array.isArray(val) ? flatten(val, depth - 1) : val), [])
    : arr.slice();
}
```

### curry

```js
function curry(fn) {
  return function curried(...args) {
    if (args.length >= fn.length) {
      return fn.apply(this, args);
    }
    return function(...more) {
      return curried.apply(this, [...args, ...more]);
    };
  };
}
```

### memoize

```js
function memoize(fn) {
  const cache = new Map();
  return function(...args) {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}
```

---

## Interview Q&A

**Q: What's the difference between a polyfill and transpilation?**

Transpilation converts syntax — `class`, arrow functions, `const` — to equivalent older syntax at build time. Polyfills add missing runtime APIs — `fetch`, `Promise`, `IntersectionObserver` — as JavaScript code that runs in the browser. You need both: Babel to handle syntax, core-js to handle missing APIs.

**Q: How would you polyfill `Promise.all` without using Promise.all internally?**

Track a results array, increment a counter on each resolve, resolve the outer promise when the counter equals the input array length. Reject immediately on any rejection. Handle the empty array edge case (resolve with []).

**Q: How do you prevent polyfills from bloating your bundle for modern users?**

Three approaches: (1) `useBuiltIns: "usage"` with Babel + core-js — only injects polyfills for features you use, targeted at your browserslist. (2) polyfill.io — CDN serves browser-specific bundles, modern browsers get nothing. (3) Differential loading — build two bundles (`type="module"` for modern, `nomodule` for legacy), include polyfills only in the legacy bundle.

**Q: Write a polyfill for `Function.prototype.bind`.**

See implementation above. Key points: preserve `this` via closure, support partial application, handle `new` construction (when used as constructor, `new` should ignore the bound `thisArg`). Full spec-compliant version also sets `bound.length` and `bound.name`.

**Q: What is feature detection and why is it better than browser detection?**

Feature detection checks if the actual API exists (`'fetch' in window`). Browser detection checks the UA string (`/Chrome/.test(navigator.userAgent)`). Feature detection is reliable because a feature either exists or it doesn't. UA strings are unreliable — browsers spoof them, new versions add features, and a browser update can add support without you knowing.
