# Callbacks and Callback Hell

## The Callback Pattern

A callback is a function passed as an argument to another function, to be called when an async operation completes. It's the original async pattern in JavaScript/Node.js.

```javascript
// Synchronous callback (not async):
[1,2,3].forEach(n => console.log(n));

// Asynchronous callback:
fs.readFile('data.txt', 'utf8', function(err, data) {
  // Called later, after file is read
  if (err) throw err;
  console.log(data);
});
console.log('This runs BEFORE the file is read');
```

---

## Error-First Callbacks (Node.js Convention)

Node.js standardized the callback signature: **first arg is error, second is result**.

```javascript
// The Node.js callback convention:
function(err, result) {
  if (err) {
    // handle error
    return;
  }
  // use result
}
```

Examples:
```javascript
const fs = require('fs');

// Reading a file
fs.readFile('config.json', 'utf8', (err, data) => {
  if (err) {
    console.error('Failed to read file:', err.message);
    return;
  }
  const config = JSON.parse(data);
  console.log(config);
});

// Writing a file
fs.writeFile('output.txt', 'Hello', (err) => {
  if (err) throw err;
  console.log('Written successfully');
});
```

---

## Callback Hell (Pyramid of Doom)

When async operations depend on each other, callbacks nest deeply:

```javascript
// Reading a user, then their orders, then the first order's items:
getUser(userId, (err, user) => {
  if (err) return handleError(err);

  getOrders(user.id, (err, orders) => {
    if (err) return handleError(err);

    getOrderItems(orders[0].id, (err, items) => {
      if (err) return handleError(err);

      getProductDetails(items[0].productId, (err, product) => {
        if (err) return handleError(err);

        updateInventory(product.id, items[0].qty, (err) => {
          if (err) return handleError(err);

          sendConfirmation(user.email, (err) => {
            if (err) return handleError(err);
            console.log('Done!');
            // 6 levels deep — "pyramid of doom"
          });
        });
      });
    });
  });
});
```

---

## Problems with Callbacks

### 1. Inversion of Control

You hand control of your code to someone else:

```javascript
// You're trusting thirdPartyLib to:
// - Call your callback exactly once
// - Call it asynchronously
// - Pass the right arguments
// - Not swallow errors

thirdPartyLib.doSomething(myCallback);
// What if it calls myCallback twice?
// What if it never calls it?
// What if it calls it synchronously?
// These are all real bugs in callback-based libraries.
```

### 2. Error Handling is Manual and Easy to Forget

```javascript
// Easy to forget error check at every level:
getUser(id, (err, user) => {
  // Forgot 'if (err) return;' — continues with user = undefined!
  getOrders(user.id, (err, orders) => { // TypeError: Cannot read 'id' of undefined
    // ...
  });
});
```

### 3. No Composition

You can't combine callback-based functions easily:

```javascript
// Can't do this with callbacks:
const result = await getUser(id) + await getExtra(id);

// With callbacks, you need complex coordination:
let user, extra, done = 0;
getUser(id, (err, u) => { user = u; if (++done === 2) combine(); });
getExtra(id, (err, e) => { extra = e; if (++done === 2) combine(); });
function combine() { console.log(user, extra); }
```

### 4. No Stack Traces in Async Context

```javascript
function a(cb) {
  setTimeout(() => {
    try {
      cb();
    } catch(e) {
      // Stack trace starts from setTimeout, not from where a() was called
      // You lose the caller context
    }
  }, 100);
}
```

---

## Escaping Callback Hell

### Strategy 1: Named Functions (flatten the pyramid)

```javascript
// ❌ Nested anonymous:
getUser(id, (err, user) => {
  getOrders(user.id, (err, orders) => { /* ... */ });
});

// ✅ Named functions (flat):
function onUser(err, user) {
  if (err) return handleError(err);
  getOrders(user.id, onOrders);
}

function onOrders(err, orders) {
  if (err) return handleError(err);
  getOrderItems(orders[0].id, onItems);
}

getUser(id, onUser);
```

### Strategy 2: Promisify

Convert callback-based functions to Promise-based:

```javascript
// Manual promisification:
function readFilePromise(path, encoding) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, encoding, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

// Node.js built-in promisify:
const { promisify } = require('util');
const readFile = promisify(fs.readFile);

// Now use with async/await:
async function main() {
  const data = await readFile('config.json', 'utf8');
  const config = JSON.parse(data);
  console.log(config);
}
```

### Strategy 3: Use fs/promises (modern Node.js)

```javascript
const fs = require('fs/promises'); // promise-based API built in
// Or: import { readFile } from 'fs/promises';

async function readConfig() {
  const data = await fs.readFile('config.json', 'utf8');
  return JSON.parse(data);
}
```

---

## util.promisify — Deep Dive

```javascript
const util = require('util');

// Works with standard (err, result) callbacks:
const stat = util.promisify(fs.stat);
const sleep = util.promisify(setTimeout);

// Custom promisification with Symbol:
function customAsync(value, callback) {
  setTimeout(() => callback(null, value * 2, value + 1), 100);
  // Passes TWO result values — standard promisify takes only first!
}

// Tell promisify to use multiple results:
customAsync[util.promisify.custom] = (value) => {
  return new Promise((resolve) => {
    setTimeout(() => resolve([value * 2, value + 1]), 100);
  });
};

const custom = util.promisify(customAsync);
const [doubled, incremented] = await custom(5); // [10, 6]
```

---

## Interview Questions

**Q: What is the callback convention in Node.js?**
A: Error-first callbacks: the first parameter is always an error object (null if no error), and subsequent parameters are the result values. This makes error handling consistent across all Node.js APIs.

**Q: What is callback hell and what problems does it cause?**
A: Callback hell (pyramid of doom) is deeply nested callbacks for sequential async operations. Problems: hard to read/maintain, difficult error handling (must check at every level), no ability to compose or reuse async logic, inversion of control (trusting external code to call your callback correctly).

**Q: How do you convert a callback-based function to a Promise?**
A: Wrap in `new Promise((resolve, reject) => {...})`, call the original function inside, and call `resolve` on success or `reject` on error. Or use `util.promisify()` for standard Node.js error-first callbacks.

**Q: What is inversion of control in the context of callbacks?**
A: When you pass a callback to a library/function, you give up control of WHEN and HOW your code runs. The callee decides if it calls your callback once, twice, never, synchronously, or asynchronously. Promises solve this by providing a contract about how callbacks work.
