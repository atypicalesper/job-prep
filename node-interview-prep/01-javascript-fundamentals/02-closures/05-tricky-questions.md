# Closures — Tricky Interview Questions

---

## Q1: What is the output?

```javascript
function makeCounter() {
  let count = 0;
  return {
    increment: () => ++count,
    decrement: () => --count,
    value: () => count
  };
}

const c1 = makeCounter();
const c2 = makeCounter();

c1.increment();
c1.increment();
c2.increment();
console.log(c1.value()); // ?
console.log(c2.value()); // ?
```

**Output:** `2` then `1`

**Why:** Each call to `makeCounter()` creates a NEW closure with its own `count` variable. `c1` and `c2` don't share state.

---

## Q2: The Shared Closure Trap

```javascript
const counters = [];

for (var i = 0; i < 3; i++) {
  counters.push({
    value: () => i  // all share same i
  });
}

console.log(counters[0].value()); // ?
console.log(counters[1].value()); // ?
console.log(counters[2].value()); // ?
```

**Output:** `3 3 3`

**Why:** `var i` is shared. All three closures reference the same `i`, which is 3 after the loop.

**Fix:**
```javascript
for (let i = 0; i < 3; i++) {
  counters.push({ value: () => i });
}
// Now: 0 1 2
```

---

## Q3: Closure Over a Mutated Variable

```javascript
function multiplier(factor) {
  return (number) => number * factor;
}

let x = 2;
const double = multiplier(x);
x = 10; // change x AFTER creating closure

console.log(double(5)); // ?
```

**Output:** `10`

**Why:** The closure captures `factor` (which is a copy of `x` at call time — value `2`). Wait — actually `factor` IS `2` at the time `multiplier(x)` is called. `x = 10` after doesn't affect `factor`.

**So output is actually: `10`?** No. Let me re-read.

`multiplier(x)` passes the value `2` as `factor`. The closure captures `factor = 2`. So `double(5)` = `5 * 2 = 10`.

**Output: `10`** ✅ (factor was 2, 5 × 2 = 10)

---

## Q4: Shared Reference Trap

```javascript
function makeAdders() {
  const adders = [];
  let n = 0;
  while (n < 3) {
    adders.push((x) => x + n); // n is shared!
    n++;
  }
  return adders;
}

const adders = makeAdders();
console.log(adders[0](10)); // ?
console.log(adders[1](10)); // ?
console.log(adders[2](10)); // ?
```

**Output:** `13 13 13` (10 + 3, because n is 3 after loop)

**Fix:**
```javascript
function makeAdders() {
  return [0, 1, 2].map(n => (x) => x + n);
  // map creates new 'n' binding per iteration
}
// Now: 10, 11, 12
```

---

## Q5: Closure Modifying Outer Variable

```javascript
function outer() {
  let x = 10;

  function inner() {
    x = 20; // modifies outer's x
  }

  inner();
  return x;
}

console.log(outer()); // ?
```

**Output:** `20`

**Why:** Closures don't just READ outer variables — they can WRITE to them. `inner()` directly modifies `x` in `outer()`'s scope.

---

## Q6: The Stale Closure Bug

```javascript
function Counter() {
  const [count, setCount] = useState(0); // hypothetical React-like

  function handleClick() {
    setTimeout(() => {
      console.log(count); // stale! always logs initial count
      setCount(count + 1); // wrong! always sets to 1
    }, 1000);
  }

  return { handleClick };
}
```

**Why:** The closure captures `count` at the time `handleClick` is created. After state updates, `handleClick` still references the OLD `count`.

**Fix (React pattern):**
```javascript
setCount(prevCount => prevCount + 1); // use functional update
```

---

## Q7: What Does This Return?

```javascript
function createSecret(key) {
  function getSecret() {
    return key;
  }
  key = key + '!'; // modify after function creation
  return getSecret;
}

const fn = createSecret('hello');
console.log(fn()); // ?
```

**Output:** `hello!`

**Why:** Closures capture a **reference** to the variable `key`, not the value at definition time. By the time `getSecret` is returned (and `fn()` is called), `key` has already been modified to `'hello!'`.

---

## Q8: Multiple Closures Sharing State

```javascript
function shared() {
  let data = [];

  function add(item) {
    data.push(item);
  }

  function get() {
    return [...data]; // returns copy
  }

  function clear() {
    data = []; // replaces reference
  }

  return { add, get, clear };
}

const store = shared();
store.add('a');
store.add('b');
console.log(store.get()); // ['a', 'b']
store.clear();
console.log(store.get()); // []
store.add('c');
console.log(store.get()); // ['c']
```

**Output:** `['a', 'b']` → `[]` → `['c']`

**Lesson:** All three functions (`add`, `get`, `clear`) close over the SAME `data` variable. `clear()` reassigns `data` to a new array — all functions now see the new array.

---

## Q9: Closure Memory Leak

```javascript
function leaky() {
  const bigData = new Array(1000000).fill('leak');

  return function() {
    // bigData is referenced by this closure
    return bigData.length;
  };
}

const fns = [];
for (let i = 0; i < 100; i++) {
  fns.push(leaky()); // 100 closures, each holding 1M array!
}
```

**Problem:** 100 closures × ~8MB each = ~800MB memory leak if `fns` is never cleared.

**Fix:**
```javascript
function notLeaky() {
  const bigData = new Array(1000000).fill('leak');
  const length = bigData.length; // extract only what's needed

  return function() {
    return length; // bigData not captured
  };
}
```

---

## Q10: Closure in Class Methods

```javascript
class Timer {
  constructor() {
    this.count = 0;
    this.start = this.start.bind(this); // needed?
  }

  start() {
    setInterval(function() {
      this.count++; // 'this' is what here?
      console.log(this.count);
    }, 1000);
  }
}

const t = new Timer();
t.start();
```

**Output:** `NaN NaN NaN...` (or TypeError in strict mode)

**Why:** `function` inside `setInterval` has its own `this`. In non-strict mode, `this` is the global object (`window` or `global`) — not the Timer instance. `global.count` is `undefined`, `undefined++` is `NaN`.

**Fix:**
```javascript
start() {
  setInterval(() => {        // arrow function — lexical this
    this.count++;            // 'this' is the Timer instance
    console.log(this.count);
  }, 1000);
}
```

---

## Q11: The once() Pattern

```javascript
function once(fn) {
  let result;
  let executed = false;
  return function(...args) {
    if (!executed) {
      executed = true;
      result = fn.apply(this, args);
    }
    return result;
  };
}

const init = once((name) => {
  console.log(`Initialized: ${name}`);
  return name.toUpperCase();
});

console.log(init('alice')); // Initialized: alice / ALICE
console.log(init('bob'));   // (nothing logged) / ALICE
console.log(init('carol')); // (nothing logged) / ALICE
```

**Output:**
```
Initialized: alice
ALICE
ALICE
ALICE
```

**Why:** `executed` and `result` are shared across all calls via closure. First call sets both and returns result. Subsequent calls return the cached `result`.

---

## Q12: Closure vs Object Method — this Binding

```javascript
const obj = {
  name: 'Alice',
  greet: function() {
    const inner = function() {
      console.log(this.name); // 'this' is NOT obj
    };
    inner();
  }
};

obj.greet(); // ?
```

**Output:** `undefined` (strict) or whatever `global.name` is

**Fix 1:** Arrow function
```javascript
greet: function() {
  const inner = () => console.log(this.name); // lexical this = obj
  inner();
}
```

**Fix 2:** self/that pattern
```javascript
greet: function() {
  const self = this;
  const inner = function() { console.log(self.name); };
  inner();
}
```

---

## Q13: What Does This Print?

```javascript
function createFunctions() {
  const functions = [];
  for (let i = 0; i < 5; i++) {
    functions.push(function() { return i * i; });
  }
  return functions;
}

const fns = createFunctions();
console.log(fns[0]()); // ?
console.log(fns[3]()); // ?
```

**Output:** `0` and `9`

**Why:** `let` creates a new binding per iteration. `fns[0]` captures `i = 0`, `fns[3]` captures `i = 3`. Each closure has its own `i`.

---

## Q14: Closure in Asynchronous Event Handlers

```javascript
function attachHandlers() {
  const elements = ['a', 'b', 'c'];

  elements.forEach((name, index) => {
    setTimeout(() => {
      console.log(`${index}: ${name}`);
    }, index * 100);
  });
}

attachHandlers();
```

**Output:**
```
0: a
1: b
2: c
```

**Why:** Arrow function in `forEach` callback + `setTimeout` arrow function both correctly close over `name` and `index`. `forEach` with arrow function creates proper per-iteration bindings.

---

## Q15: Recursive Closure

```javascript
function makeFactorial() {
  function factorial(n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1); // recursive call via closure
  }
  return factorial;
}

const fact = makeFactorial();
const anotherRef = fact;

// What if we null out fact?
// fact = null;
// anotherRef(5) still works because factorial internally
// calls 'factorial' (the closed-over name), not 'fact'

console.log(anotherRef(5)); // 120
```

**Output:** `120`

**Key lesson:** The recursive call uses the internal name `factorial`, not the external `fact` or `anotherRef` variable. Named function expressions are safer for recursion.

---

## Q16: setTimeout in a var Loop — Classic

```javascript
for (var i = 0; i < 4; i++) {
  setTimeout(function() {
    console.log(i);
  }, i * 100);
}
```

**Output:** `4 4 4 4`

**Why:** `var i` is function-scoped (or global-scoped here). By the time the first `setTimeout` fires, the loop has finished and `i` is `4`. All four callbacks close over the same `i`.

**Fix 1: IIFE**
```javascript
for (var i = 0; i < 4; i++) {
  (function(j) {
    setTimeout(function() { console.log(j); }, j * 100);
  })(i);
}
// Output: 0 1 2 3
```

**Fix 2: let**
```javascript
for (let i = 0; i < 4; i++) {
  setTimeout(() => console.log(i), i * 100);
}
// Output: 0 1 2 3
```

---

## Q17: IIFE Doesn't Help If You Close Over the Wrong Thing

```javascript
var funcs = [];
for (var i = 0; i < 3; i++) {
  (function() {
    funcs.push(function() { return i; }); // still closes over outer i!
  })();
}
console.log(funcs[0](), funcs[1](), funcs[2]());
```

**Output:** `3 3 3`

**Why:** The IIFE creates a new scope, but it never captures `i` as a parameter. The inner function still closes over the outer `var i`. The IIFE is useless here — you must pass `i` as an argument: `(function(j) { ... })(i)`.

---

## Q18: Closure Over Object Reference

```javascript
function makeLogger() {
  let config = { level: 'info' };

  return {
    log: () => console.log(config.level),
    setLevel: (lvl) => { config.level = lvl; },
    getConfig: () => config
  };
}

const logger = makeLogger();
const ref = logger.getConfig();
ref.level = 'debug';

logger.log(); // ?
```

**Output:** `debug`

**Why:** `getConfig()` returns a reference to the same `config` object the closure holds. Mutating `ref.level` mutates the object inside the closure. If you want immutability, return `{ ...config }` instead.

---

## Q19: Closure Over Reassigned Variable

```javascript
function outer() {
  let x = 1;

  function getX() { return x; }
  function setX(v) { x = v; }

  x = 2;

  return { getX, setX };
}

const o = outer();
console.log(o.getX()); // ?
o.setX(99);
console.log(o.getX()); // ?
```

**Output:** `2` then `99`

**Why:** `getX` and `setX` both close over the same `x`. By the time `outer()` returns, `x` is already `2` (reassigned before return). Then `setX(99)` mutates it to `99`. Closures see the **live** variable, not a snapshot.

---

## Q20: Private Variable — Can You Break In?

```javascript
function createVault(secret) {
  return {
    check: (guess) => guess === secret
  };
}

const vault = createVault('p@ssw0rd');
console.log(vault.secret);          // ?
console.log(vault.check('wrong'));   // ?
console.log(vault.check('p@ssw0rd')); // ?
```

**Output:** `undefined`, `false`, `true`

**Why:** `secret` is a parameter of `createVault` — it lives in the closure scope, not on the returned object. There is no way to access it from outside except through the `check` method. This is the **private variable pattern**.

---

## Q21: Module Pattern — Accidental Shared State

```javascript
const counterModule = (function() {
  let count = 0;
  return {
    inc() { return ++count; },
    dec() { return --count; },
    val() { return count; }
  };
})();

const a = counterModule;
const b = counterModule;

a.inc();
a.inc();
console.log(b.val()); // ?
```

**Output:** `2`

**Why:** There's only ONE IIFE invocation — `a` and `b` are the same object reference. They share the same closure and the same `count`. This is a common module-pattern trap: if you want independent instances, you need a factory function, not a singleton IIFE.

---

## Q22: Module Pattern — Late Initialization Gotcha

```javascript
const mod = (function() {
  let initialized = false;
  let data;

  function init() {
    if (initialized) return;
    data = { items: [1, 2, 3] };
    initialized = true;
  }

  function getItems() {
    return data.items; // what if init() wasn't called?
  }

  return { init, getItems };
})();

try {
  console.log(mod.getItems());
} catch (e) {
  console.log(e.constructor.name);
}
```

**Output:** `TypeError`

**Why:** `data` is `undefined` when `getItems()` is called before `init()`. The closure captures `data`, but it's never assigned a value. Accessing `.items` on `undefined` throws `TypeError`. Guard: `if (!data) throw new Error('call init() first')`.

---

## Q23: Closure Memory Leak with DOM-like References

```javascript
function setupHandler() {
  const hugePayload = new Array(1_000_000).fill('x');

  const element = {
    listeners: []
  };

  element.listeners.push(function onClick() {
    // doesn't use hugePayload at all
    console.log('clicked');
  });

  // Is hugePayload leaked?
  return element;
}
```

**Answer:** **Yes, potentially.** V8 is smart about this in many cases and will optimize away unused variables. But in older engines or when `eval` is present in the same scope, `hugePayload` stays alive because `onClick` closes over the entire scope of `setupHandler`. The safe pattern is to define `onClick` outside `setupHandler` or explicitly null out `hugePayload` before returning.

---

## Q24: Closure Leak — eval Prevents Optimization

```javascript
function leakyWithEval() {
  const bigArray = new Array(1_000_000).fill('data');

  return function(code) {
    return eval(code); // eval keeps ENTIRE scope alive
  };
}

const fn = leakyWithEval();
console.log(fn('bigArray.length')); // ?
```

**Output:** `1000000`

**Why:** `eval` can access any variable in the enclosing scope. The engine cannot optimize away `bigArray` because `eval` might reference it. This is why `eval` inside closures is a guaranteed memory leak for all variables in scope — the engine must keep everything alive.

---

## Q25: Event Listener Closure Leak

```javascript
function attachListener(emitter) {
  const context = { data: new Array(100000).fill('ctx') };

  const handler = () => {
    console.log(context.data.length);
  };

  emitter.on('event', handler);

  // Returns nothing — no way to remove handler!
}

const EventEmitter = require('events');
const ee = new EventEmitter();
for (let i = 0; i < 100; i++) {
  attachListener(ee); // 100 closures, each holding 100k array
}
```

**Problem:** Each call creates a new closure holding `context`. The handler is never removed from the emitter. Even if `attachListener` returns, the emitter holds a reference to `handler`, which holds `context`.

**Fix:**
```javascript
function attachListener(emitter) {
  const context = { data: new Array(100000).fill('ctx') };
  const handler = () => console.log(context.data.length);
  emitter.on('event', handler);
  return () => emitter.off('event', handler); // return cleanup function
}
```

---

## Q26: Stale Closure in setInterval

```javascript
function startPolling() {
  let count = 0;

  const id = setInterval(() => {
    count++;
    console.log(count);
    if (count >= 3) clearInterval(id);
  }, 100);

  return () => count; // return getter
}

const getCount = startPolling();
// After 400ms...
setTimeout(() => {
  console.log('Final:', getCount()); // ?
}, 500);
```

**Output:**
```
1
2
3
Final: 3
```

**Why:** Both the `setInterval` callback and the returned getter close over the same `count`. The interval mutates `count`, and the getter reads it. By 500ms, the interval has fired 3 times and cleared itself. `getCount()` sees `3`.

**This is NOT a stale closure** — both functions share the same live binding. Stale closures happen when you capture a value that gets replaced (like React state), not a mutable `let`.

---

## Q27: Stale Closure in React-like Scenario — Deep Dive

```javascript
// Simulating React's useState
function useState(initial) {
  let state = initial;
  const setState = (val) => { state = val; };
  return [state, setState]; // state is captured BY VALUE here
}

let [count, setCount] = useState(0);

setCount(5);
console.log(count); // ?
```

**Output:** `0`

**Why:** `useState` returns `state` by value (it's a number). `count` gets the value `0`. Calling `setCount(5)` updates the internal `state` variable inside `useState`'s closure, but `count` is just a plain variable holding `0`. This is why React re-renders — to re-call the component and get a fresh `[state, setState]` pair.

---

## Q28: Stale Closure Fix with Ref Pattern

```javascript
function useRef(initial) {
  return { current: initial };
}

function Component() {
  const countRef = useRef(0);

  function handleClick() {
    countRef.current++;
  }

  function logLater() {
    setTimeout(() => {
      console.log(countRef.current); // always fresh!
    }, 1000);
  }

  handleClick();
  handleClick();
  handleClick();
  logLater();
}

Component();
```

**Output (after 1s):** `3`

**Why:** `countRef` is an object — both `handleClick` and `logLater` close over the same object reference. Mutations to `.current` are visible to all closures. This is the Ref pattern that avoids stale closures: close over a mutable container instead of a primitive.

---

## Q29: Closure in Recursive Function — Stack Sharing

```javascript
function makeAccumulator() {
  const calls = [];

  function recurse(n) {
    calls.push(n);
    if (n <= 0) return calls;
    return recurse(n - 1);
  }

  return recurse;
}

const acc = makeAccumulator();
console.log(acc(3)); // ?
console.log(acc(2)); // ?
```

**Output:** `[3, 2, 1, 0]` then `[3, 2, 1, 0, 2, 1, 0]`

**Why:** The `calls` array is captured once by the closure and persists across invocations. The first call pushes `3, 2, 1, 0`. The second call pushes `2, 1, 0` onto the SAME array. The closure outlives each recursion because `calls` was created in `makeAccumulator`, not in `recurse`.

---

## Q30: Recursive Closure — Name Reassignment

```javascript
let factorial = function(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
};

const f = factorial;
factorial = function() { return 0; };

console.log(f(5)); // ?
```

**Output:** `0`

**Why:** `f(5)` calls the original function with `n = 5`. Inside, it does `5 * factorial(4)` — but `factorial` now points to the new function that returns `0`. So result is `5 * 0 = 0`.

**Fix:** Use a named function expression:
```javascript
const factorial = function fact(n) {
  if (n <= 1) return 1;
  return n * fact(n - 1); // 'fact' is immutable inside the expression
};
```

---

## Q31: Generator Closure — Shared State

```javascript
function* counter() {
  let count = 0;
  while (true) {
    const reset = yield count++;
    if (reset) count = 0;
  }
}

const gen = counter();
console.log(gen.next().value);       // ?
console.log(gen.next().value);       // ?
console.log(gen.next(true).value);   // ?
console.log(gen.next().value);       // ?
```

**Output:** `0`, `1`, `0`, `1`

**Why:** Generators are closures that pause. `count` lives in the generator's closure scope. Each `yield` suspends and resumes in the same scope. `gen.next(true)` passes `true` as the result of the `yield` expression, so `reset` is `true` and `count` resets to `0`. Then `yield count++` yields `0` and increments to `1`.

---

## Q32: Generator Closure — Independent Instances

```javascript
function* idMaker() {
  let id = 0;
  while (true) yield id++;
}

const gen1 = idMaker();
const gen2 = idMaker();

console.log(gen1.next().value); // ?
console.log(gen1.next().value); // ?
console.log(gen2.next().value); // ?
console.log(gen1.next().value); // ?
```

**Output:** `0`, `1`, `0`, `2`

**Why:** Each call to `idMaker()` creates a new generator with its own closure over `id`. `gen1` and `gen2` have independent `id` counters — same concept as creating two instances from a factory function.

---

## Q33: JSON.stringify Destroys Closures

```javascript
function createUser(name) {
  let loginCount = 0;

  return {
    name,
    login() { loginCount++; },
    getLogins() { return loginCount; },
  };
}

const user = createUser('Alice');
user.login();
user.login();

const serialized = JSON.stringify(user);
const deserialized = JSON.parse(serialized);

console.log(deserialized.name);       // ?
console.log(typeof deserialized.login); // ?
console.log(typeof deserialized.getLogins); // ?
```

**Output:** `Alice`, `undefined`, `undefined`

**Why:** `JSON.stringify` drops functions entirely — they are not valid JSON. The closure over `loginCount` is lost. This is a fundamental limitation: closures are runtime constructs and cannot be serialized. If you need to serialize state, extract it explicitly: `{ name, loginCount: user.getLogins() }`.

---

## Q34: Closure Serialization — The Hidden State Problem

```javascript
function makeStateful(initial) {
  let state = initial;
  return {
    get: () => state,
    set: (v) => { state = v; },
    toJSON() { return { state }; } // custom serializer
  };
}

const s = makeStateful(42);
s.set(100);

const json = JSON.stringify(s);
console.log(json); // ?

const restored = JSON.parse(json);
console.log(restored.state); // ?
console.log(restored.get);   // ?
```

**Output:** `{"state":100}`, `100`, `undefined`

**Why:** `toJSON()` is called by `JSON.stringify` and captures the closure's state. But after parsing, you just get a plain object — no closure, no methods. You'd need a `fromJSON` factory to reconstruct the closure: `makeStateful(restored.state)`.

---

## Q35: Closures with eval — Scope Invasion

```javascript
function outer() {
  let secret = 'hidden';

  function inner() {
    return eval('secret');
  }

  return inner;
}

console.log(outer()()); // ?
```

**Output:** `hidden`

**Why:** `eval` executes in the current scope. `inner` closes over `outer`'s scope, so `eval('secret')` can access `secret`. This is one reason `eval` is dangerous: it can access private closure variables that were never intended to be exposed.

**Note:** Indirect eval `(0, eval)('secret')` would throw `ReferenceError` because it runs in global scope.

---

## Q36: Named vs Anonymous Function Expression in Closure

```javascript
const fns = [];

for (let i = 0; i < 3; i++) {
  fns.push(function logger() {
    console.log(logger.name, i);
  });
}

fns[0](); // ?
fns[1](); // ?

// Can you reassign logger?
try {
  fns[0] = function() { console.log('replaced'); };
  fns[0]();
} catch(e) {
  console.log(e.message);
}
```

**Output:**
```
logger 0
logger 1
replaced
```

**Why:** The name `logger` is available inside the function itself (useful for recursion), but it's read-only inside the function body — you can't reassign it. However, `fns[0]` is just an array slot — you can freely reassign that external reference. The internal `logger` name and the external `fns[i]` reference are independent.

---

## Q37: Closure and the delete Operator

```javascript
function outer() {
  let x = 10;

  return function() {
    delete x; // does this work?
    return x;
  };
}

console.log(outer()()); // ?
```

**Output:** `10`

**Why:** `delete` only works on object properties. It cannot delete local variables, function parameters, or closure variables. `delete x` silently fails (returns `false` in non-strict, throws in strict with qualified names). The closure's `x` is untouched.

---

## Q38: delete on Closure-Returned Object Property

```javascript
function makeObj() {
  let internal = 'secret';

  return {
    value: internal,
    getInternal: () => internal
  };
}

const obj = makeObj();
delete obj.value;

console.log(obj.value);         // ?
console.log(obj.getInternal()); // ?
```

**Output:** `undefined`, `secret`

**Why:** `delete obj.value` removes the `value` property from the object. But `getInternal` still closes over the `internal` variable in `makeObj`'s scope — `delete` has no effect on closure-captured variables. The property `value` was just a copy of `internal` at creation time; deleting it doesn't touch the closure.

---

## Q39: Arguments Object in Closures

```javascript
function outer() {
  function inner() {
    console.log(arguments[0]);
  }
  return inner;
}

const fn = outer('hello');
fn('world'); // ?
```

**Output:** `world`

**Why:** Each regular function has its own `arguments` object. `inner`'s `arguments` refers to `inner`'s own arguments, NOT `outer`'s. When `fn('world')` is called, `arguments[0]` inside `inner` is `'world'`. To access `outer`'s arguments, save them: `const outerArgs = arguments;`.

---

## Q40: Arguments Object — Arrow Function Difference

```javascript
function outer() {
  const inner = () => {
    console.log(arguments[0]);
  };
  return inner;
}

const fn = outer('hello');
fn('world'); // ?
```

**Output:** `hello`

**Why:** Arrow functions do NOT have their own `arguments` object. They inherit `arguments` from the enclosing non-arrow function. So `arguments` inside the arrow `inner` refers to `outer`'s `arguments`, which is `['hello']`. This is a classic difference between arrow and regular functions.

---

## Q41: Arrow Function Closure — No Own this

```javascript
const obj = {
  value: 42,
  getValueArrow: () => {
    return this.value;
  },
  getValueRegular: function() {
    return this.value;
  }
};

console.log(obj.getValueArrow());   // ?
console.log(obj.getValueRegular()); // ?
```

**Output:** `undefined`, `42`

**Why:** Arrow functions capture `this` from their **lexical** enclosing scope. The enclosing scope of the object literal is the module/global scope (where `this` is `undefined` in strict mode or `module.exports` in Node). `getValueRegular` is a regular function, so `this` is determined by the call site — `obj.getValueRegular()` makes `this === obj`.

---

## Q42: Arrow Closure Cannot Be Rebound

```javascript
const arrow = () => this;
const bound = arrow.bind({ x: 1 });
const called = arrow.call({ x: 2 });

console.log(bound());    // ?
console.log(called);     // ?
console.log(bound() === called); // ?
```

**Output:** `{}` (or `undefined`), `{}` (or `undefined`), `true`

**Why:** `bind`, `call`, and `apply` have **no effect** on arrow functions' `this`. The arrow's `this` is permanently set by the enclosing lexical scope at creation time. You cannot override it. Both `bound()` and `called` return the same `this` (module scope in Node.js = `{}`).

---

## Q43: Closure in async/await — Captured Before Await

```javascript
async function process() {
  let value = 'before';

  const promise = new Promise(resolve => {
    setTimeout(() => resolve('done'), 100);
  });

  const logger = () => console.log(value);

  value = 'after';

  await promise;

  value = 'awaited';

  logger(); // ?
}

process();
```

**Output:** `awaited`

**Why:** `logger` closes over the variable `value`, not a snapshot. By the time `logger()` is called (after the `await`), `value` has been reassigned to `'awaited'`. The `await` pauses execution, but the closure still references the same live binding.

---

## Q44: Async Closure — Parallel Stale Values

```javascript
async function fetchAll() {
  let result = '';

  const tasks = [1, 2, 3].map(async (n) => {
    const val = await Promise.resolve(n);
    result += val; // race condition!
    return result;
  });

  const results = await Promise.all(tasks);
  console.log(results); // ?
  console.log(result);  // ?
}

fetchAll();
```

**Output:** `['1', '12', '123']`, `'123'`

**Why:** All three async functions close over the same `result`. Since microtasks from `Promise.resolve` resolve in order within the same tick, they execute sequentially: first appends `'1'`, second appends `'2'` to `'12'`, third appends `'3'` to `'123'`. Each returns `result` at that moment. This works here but is **unreliable** with real async — don't mutate shared closure variables concurrently.

---

## Q45: Async Closure — setTimeout vs Promise Ordering

```javascript
async function test() {
  let x = 0;

  setTimeout(() => { x = 1; console.log('timeout:', x); }, 0);

  await Promise.resolve();
  console.log('after await:', x);

  await new Promise(r => setTimeout(r, 10));
  console.log('after timer:', x);
}

test();
```

**Output:**
```
after await: 0
timeout: 1
after timer: 1
```

**Why:** The closure over `x` is shared by all three callbacks. After `await Promise.resolve()`, the microtask resumes before `setTimeout` fires, so `x` is still `0`. The `setTimeout` callback runs next (macro task), setting `x` to `1`. The second await waits 10ms, by which time `x` is `1`.

---

## Q46: IIFE Returning an IIFE

```javascript
const result = (function(x) {
  return (function(y) {
    return x + y;
  })(3);
})(2);

console.log(result); // ?
```

**Output:** `5`

**Why:** Outer IIFE passes `x = 2`. Inner IIFE passes `y = 3`. Inner function closes over `x` from outer scope. Returns `2 + 3 = 5`. This is a common pattern for immediately computing values with intermediate scoping.

---

## Q47: IIFE with Void Operator Edge Case

```javascript
void function() {
  var x = 1;
  console.log(x);
}();

// console.log(x); // what happens?
```

**Output:** `1` (from inside), then `ReferenceError` if uncommented

**Why:** `void` makes the function declaration into an expression, so it can be immediately invoked. The `var x` is scoped to the IIFE — it doesn't leak. `void` always returns `undefined`, so the IIFE's return value is discarded.

---

## Q48: IIFE — Block Scope vs Function Scope

```javascript
{
  let blockScoped = 'block';
}

(function() {
  var funcScoped = 'func';
})();

try { console.log(blockScoped); } catch(e) { console.log('block error'); }
try { console.log(funcScoped); } catch(e) { console.log('func error'); }
```

**Output:** `block error`, `func error`

**Why:** Both are contained. The block `{}` with `let` contains `blockScoped`. The IIFE contains `funcScoped` via function scope. Both throw `ReferenceError`. In modern JS, blocks with `let`/`const` are often preferred over IIFEs for simple scoping.

---

## Q49: Closure with Default Parameters

```javascript
function outer(x = 10) {
  return function(y = x * 2) {
    return x + y;
  };
}

console.log(outer()()); // ?
console.log(outer(5)()); // ?
console.log(outer(5)(1)); // ?
```

**Output:** `30`, `15`, `6`

**Why:**
- `outer()`: `x = 10`, inner's default `y = 10 * 2 = 20`, returns `10 + 20 = 30`
- `outer(5)`: `x = 5`, inner's default `y = 5 * 2 = 10`, returns `5 + 10 = 15`
- `outer(5)(1)`: `x = 5`, `y = 1` (explicit), returns `5 + 1 = 6`

The default parameter `y = x * 2` closes over `x` from the outer function's parameter scope.

---

## Q50: Default Parameter Creates Its Own Scope

```javascript
let x = 'outer';

function test(a = () => x, x = 'inner') {
  console.log(a()); // ?
  console.log(x);   // ?
}

try {
  test();
} catch(e) {
  console.log(e.constructor.name);
}
```

**Output:** `ReferenceError`

**Why:** Default parameters have their own scope (between the outer scope and the function body). When `a`'s default `() => x` is evaluated, it looks for `x` in the parameter scope. `x` is declared in the parameter list (as the second param), but it hasn't been initialized yet — it's in the TDZ (Temporal Dead Zone). This throws `ReferenceError`.

---

## Q51: WeakRef and Closures

```javascript
function createCached(compute) {
  let weakRef = null;

  return function() {
    let cached = weakRef?.deref();
    if (cached !== undefined) {
      console.log('cache hit');
      return cached;
    }
    const result = compute();
    weakRef = new WeakRef(result);
    console.log('cache miss');
    return result;
  };
}

const getData = createCached(() => ({ data: [1, 2, 3] }));
const r1 = getData();
const r2 = getData();
console.log(r1 === r2); // ?
```

**Output:** `cache miss`, `cache hit`, `true`

**Why:** The closure captures `weakRef`. First call: no cached value, creates the object and stores a `WeakRef`. Second call: `deref()` returns the object (still alive because `r1` holds a strong reference). `r1 === r2` is `true` — same object. If `r1` were released and GC ran, `deref()` would return `undefined` and recompute.

---

## Q52: WeakRef Closure — GC Can Break It

```javascript
function makeWeakClosure() {
  let obj = { value: 42 };
  const ref = new WeakRef(obj);

  obj = null; // remove strong reference

  return function() {
    const derefed = ref.deref();
    return derefed?.value ?? 'gone';
  };
}

const fn = makeWeakClosure();
// At this point, obj is eligible for GC
// Result is non-deterministic:
console.log(fn()); // 42 or 'gone' — depends on GC timing
```

**Answer:** Output is **non-deterministic**. Could be `42` if GC hasn't run, or `'gone'` if it has.

**Why:** After `obj = null`, the only reference to `{ value: 42 }` is the `WeakRef`. `WeakRef` does not prevent GC. The closure captures `ref`, but `ref.deref()` may return `undefined` at any point after GC collects the target. Never rely on `WeakRef.deref()` for correctness — only for caching/optimization.

---

## Q53: Closure with for...in and var

```javascript
const obj = { a: 1, b: 2, c: 3 };
const fns = {};

for (var key in obj) {
  fns[key] = function() { return key; };
}

console.log(fns.a()); // ?
console.log(fns.b()); // ?
console.log(fns.c()); // ?
```

**Output:** `c`, `c`, `c`

**Why:** Same classic loop closure problem, but with `for...in`. `var key` is function-scoped — all closures share the same `key`, which ends at `'c'` (last enumerable property). Fix: use `const` or `let` in the `for...in` — `for (const key in obj)` creates a new binding per iteration.

---

## Q54: Closure Captures Variable, Not Value — Proof with Increment

```javascript
function createIncrementors() {
  let n = 0;
  return {
    a: () => n++,
    b: () => n++,
    val: () => n
  };
}

const inc = createIncrementors();
inc.a();
inc.b();
inc.a();
console.log(inc.val()); // ?
```

**Output:** `3`

**Why:** `a` and `b` both close over the same `n`. Each `n++` increments the shared variable. Three calls = `n` is `3`. This definitively proves closures capture the variable binding, not the value.

---

## Q55: Closure with Promise.all and Index

```javascript
async function parallel() {
  const results = [];

  const promises = [10, 20, 30].map((val, i) => {
    return new Promise(resolve => {
      setTimeout(() => {
        results[i] = val * 2;
        resolve();
      }, (3 - i) * 100); // reverse order: 300ms, 200ms, 100ms
    });
  });

  await Promise.all(promises);
  console.log(results); // ?
}

parallel();
```

**Output:** `[20, 40, 60]`

**Why:** Each callback in `map` has its own `val` and `i` (block-scoped by the arrow function parameter). Even though timers fire in reverse order (index 2 first, then 1, then 0), each writes to its own `results[i]`. The closure correctly captures each iteration's values.

---

## Q56: Immediately Resolved Promise with Closure

```javascript
for (var i = 0; i < 3; i++) {
  Promise.resolve(i).then(val => {
    console.log('val:', val, 'i:', i);
  });
}
```

**Output:**
```
val: 0 i: 3
val: 1 i: 3
val: 2 i: 3
```

**Why:** `Promise.resolve(i)` captures the VALUE of `i` at each iteration (0, 1, 2) — it's passed as an argument. But the `.then` callback also closes over `var i`, which is `3` by the time microtasks execute. So `val` differs but `i` is always `3`.

---

## Q57: Closure in Array Methods — Accumulator Pattern

```javascript
function makeMultiplier() {
  let factor = 1;

  return {
    setFactor: (f) => { factor = f; },
    multiply: (arr) => arr.map(x => x * factor)
  };
}

const m = makeMultiplier();
const arr = [1, 2, 3];

const r1 = m.multiply(arr);
m.setFactor(10);
const r2 = m.multiply(arr);

console.log(r1); // ?
console.log(r2); // ?
```

**Output:** `[1, 2, 3]`, `[10, 20, 30]`

**Why:** `multiply`'s inner `x => x * factor` closes over `factor`. When `factor` changes via `setFactor`, subsequent calls to `multiply` see the new value. `r1` was computed when `factor` was `1`; `r2` when it was `10`. The arrays `r1` and `r2` are separate — `map` always returns a new array.

---

## Q58: Closure with Symbol as Private Key

```javascript
const _count = Symbol('count');

function makeCounter() {
  const state = { [_count]: 0 };

  return {
    inc() { state[_count]++; },
    val() { return state[_count]; }
  };
}

const c = makeCounter();
c.inc();
c.inc();
console.log(c.val()); // ?
console.log(c[_count]); // ?
console.log(Object.keys(c)); // ?
```

**Output:** `2`, `undefined`, `[]`

**Why:** `state` is private to the closure — `c` is the returned object, which has `inc` and `val` but NOT `state`. `c[_count]` is `undefined` because `_count` is a property on `state`, not on `c`. Double privacy: closure hides `state`, Symbol hides the key even from `Object.keys`.

---

## Q59: Two Closures, Same Scope, Different Timing

```javascript
function setup() {
  let x = 0;

  const later = () => x;

  x = 100;

  const now = () => x;

  return { later, now };
}

const { later, now } = setup();
console.log(later()); // ?
console.log(now());   // ?
```

**Output:** `100`, `100`

**Why:** Both `later` and `now` close over the same `x`. It doesn't matter that `later` was defined before `x = 100` — closures capture the **variable**, not the value at definition time. By the time either is called, `x` is `100`.

---

## Q60: Closure Over catch Block Variable

```javascript
const handlers = [];

for (let i = 0; i < 3; i++) {
  try {
    throw i;
  } catch (e) {
    handlers.push(() => e);
  }
}

console.log(handlers[0]()); // ?
console.log(handlers[1]()); // ?
console.log(handlers[2]()); // ?
```

**Output:** `0`, `1`, `2`

**Why:** Each `catch (e)` creates a new block-scoped binding for `e`. The closures capture their own `e`. This works the same way as `let` in a loop — each iteration gets its own `e`. Even with `var i`, the `catch` block creates a fresh binding.

---

## Q61: Closure Over Variable Declared After Function

```javascript
function outer() {
  function inner() {
    return typeof x;
  }

  const result = inner();
  let x = 10;

  return result;
}

console.log(outer()); // ?
```

**Output:** `ReferenceError` (TDZ)

**Why:** `let x` is hoisted to the top of `outer`'s scope but is in the Temporal Dead Zone until the declaration line. When `inner()` is called before `let x = 10`, accessing `x` throws `ReferenceError`. If `var x` were used instead, `typeof x` would return `'undefined'` (hoisted, initialized to `undefined`).

---

## Q62: Closure and Hoisting Interaction

```javascript
function outer() {
  const fns = [];

  fns.push(() => a);
  var a = 1;
  fns.push(() => a);
  a = 2;
  fns.push(() => a);

  return fns;
}

const [f1, f2, f3] = outer();
console.log(f1(), f2(), f3()); // ?
```

**Output:** `2 2 2`

**Why:** All three arrow functions close over the same `var a`. `var` is hoisted and exists for the entire function scope. By the time any of them is called (after `outer()` returns), `a` is `2`. It doesn't matter when each closure was created — they all see the final value of `a`.

---

## Q63: Closure Inside try/finally

```javascript
function tricky() {
  let x = 1;

  try {
    x = 2;
    return function() { return x; };
  } finally {
    x = 3;
  }
}

console.log(tricky()()); // ?
```

**Output:** `3`

**Why:** The `return` in `try` prepares the return value (the function). But `finally` always executes before the function actually returns. `finally` sets `x = 3`. The returned function closes over `x`, which is now `3`. The `finally` block mutated the closed-over variable before the function was ever called.

---

## Q64: Closure Over for...of Iterator Variable

```javascript
const fns = [];

for (const val of [10, 20, 30]) {
  fns.push(() => val);
}

console.log(fns[0](), fns[1](), fns[2]()); // ?
```

**Output:** `10 20 30`

**Why:** `const` in `for...of` creates a new binding per iteration, just like `let` in a `for` loop. Each closure captures its own `val`. If you used `var` it wouldn't work — but you can't use `var` with `for...of`'s iteration variable and get different behavior because `for...of` with `var` still reassigns each iteration.

Actually — with `var`, `for...of` would still work because `var val` gets reassigned each iteration but the closures fire immediately-ish... **No** — `var` would still produce `30 30 30` because `var` is function-scoped and all closures share it.

---

## Q65: Double Closure — Currying with Shared State

```javascript
function createApi(baseUrl) {
  let requestCount = 0;

  return function(endpoint) {
    return function(params) {
      requestCount++;
      return `[${requestCount}] ${baseUrl}/${endpoint}?${params}`;
    };
  };
}

const api = createApi('https://api.com');
const getUsers = api('users');
const getPosts = api('posts');

console.log(getUsers('page=1'));
console.log(getPosts('limit=10'));
console.log(getUsers('page=2'));
```

**Output:**
```
[1] https://api.com/users?page=1
[2] https://api.com/posts?limit=10
[3] https://api.com/users?page=2
```

**Why:** `requestCount` is in `createApi`'s scope. Both `getUsers` and `getPosts` are created from the same `api` call, so they share the same `requestCount`. Each inner function call increments the shared counter. Three levels of closure: `baseUrl` → `endpoint` → `params`, all sharing `requestCount`.

---

## Q66: Closure Captured Variable vs Parameter Copy

```javascript
function outer(arr) {
  const fn = () => arr.length;
  arr.push(4);
  return fn;
}

const myArr = [1, 2, 3];
const fn = outer(myArr);
myArr.push(5);

console.log(fn()); // ?
```

**Output:** `5`

**Why:** `arr` is a reference to `myArr` (objects/arrays are passed by reference). The closure captures `arr`, which points to the same array. After `outer` pushes `4` (length 4), then `myArr.push(5)` adds another (length 5). When `fn()` runs, `arr.length` is `5`.

---

## Q67: Closure in Promise Constructor

```javascript
let resolveFromOutside;

const p = new Promise(resolve => {
  resolveFromOutside = resolve;
});

p.then(val => console.log('Resolved:', val));

resolveFromOutside('hello');
console.log('After resolve');
```

**Output:**
```
After resolve
Resolved: hello
```

**Why:** The Promise constructor's executor runs synchronously. It captures `resolve` into `resolveFromOutside` via closure. Calling `resolveFromOutside('hello')` resolves the promise, but `.then` callbacks are microtasks — they execute after the current synchronous code finishes. So `'After resolve'` prints first.

---

## Q68: Closure with Proxy Trap

```javascript
function makePrivate(obj) {
  const privateKeys = new Set(['_secret', '_internal']);

  return new Proxy(obj, {
    get(target, prop) {
      if (privateKeys.has(prop)) return undefined;
      return target[prop];
    },
    set(target, prop, value) {
      if (privateKeys.has(prop)) return false;
      target[prop] = value;
      return true;
    }
  });
}

const o = makePrivate({ name: 'Alice', _secret: 42 });
console.log(o.name);    // ?
console.log(o._secret); // ?
o._secret = 100;
console.log(o._secret); // ?
```

**Output:** `Alice`, `undefined`, `undefined`

**Why:** The Proxy handlers close over `privateKeys`. The `get` trap intercepts property access — if the key is in `privateKeys`, it returns `undefined` instead of the real value. The `set` trap blocks writes. The closure makes `privateKeys` completely hidden from outside — it's a private configuration.

---

## Q69: Immediately Invoked Arrow Function Edge Case

```javascript
const result = (() => {
  let x = 1;
  return (() => {
    let y = 2;
    return (() => x + y)();
  })();
})();

console.log(result); // ?
// console.log(x);   // ?
```

**Output:** `3`, then `ReferenceError` if uncommented

**Why:** Three nested IIFEs using arrow functions. Innermost accesses `x` (from outer-outer) and `y` (from outer) via closure chain. Each IIFE creates its own scope. `x` and `y` are completely inaccessible outside — the only observable effect is the returned value `3`.

---

## Q70: Closure with Object Destructuring Default

```javascript
function create({ name, retries = 3 } = {}) {
  let attempts = 0;

  return function tryOnce() {
    attempts++;
    if (attempts <= retries) {
      return `${name}: attempt ${attempts}/${retries}`;
    }
    return `${name}: exhausted`;
  };
}

const fn = create({ name: 'fetch' });
console.log(fn()); // ?
console.log(fn()); // ?
console.log(fn()); // ?
console.log(fn()); // ?
```

**Output:**
```
fetch: attempt 1/3
fetch: attempt 2/3
fetch: attempt 3/3
fetch: exhausted
```

**Why:** Destructured parameters with defaults work just like regular parameters in closures. `name` and `retries` are captured along with `attempts`. The default `retries = 3` kicks in when the property is missing. The closure over `attempts` persists across calls, counting up.

---

## Q71: Closure Over Getter/Setter

```javascript
function makeComputed(initialValue) {
  let _value = initialValue;

  return {
    get value() { return _value; },
    set value(v) { _value = v * 2; }, // doubles on set
    rawGet: () => _value
  };
}

const c = makeComputed(5);
console.log(c.value);    // ?
c.value = 10;
console.log(c.value);    // ?
console.log(c.rawGet()); // ?
```

**Output:** `5`, `20`, `20`

**Why:** The getter and setter both close over `_value`. Setting `c.value = 10` invokes the setter, which stores `10 * 2 = 20`. The getter returns `_value` (now `20`). `rawGet` also closes over the same `_value` — all three access the same variable. Getters/setters in object literals are closures too.

---

## Q72: IIFE with Comma Operator

```javascript
const x = (1, function() { return 2; }, function() { return 3; })();
console.log(x); // ?
```

**Output:** `3`

**Why:** The comma operator evaluates all expressions left-to-right and returns the last one. So `(1, fn1, fn2)` evaluates to `fn2`. Then `fn2()` is called, returning `3`. The first two expressions are evaluated but their results are discarded.

---

## Q73: Closure Scope Chain — Three Levels

```javascript
function a() {
  let x = 1;
  function b() {
    let y = 2;
    function c() {
      let z = 3;
      return x + y + z;
    }
    x = 10; // modifies a's x
    return c;
  }
  return b;
}

console.log(a()()()); // ?
```

**Output:** `15`

**Why:** `a()` returns `b`. `b()` sets `x = 10` then returns `c`. `c()` accesses `x` (now `10`), `y` (`2`), and `z` (`3`). Closures chain through the scope hierarchy: `c` sees `b`'s scope and `a`'s scope. `x = 10` happens before `c` is ever called, so `c` sees `10`.

---

## Q74: Closure with bind Partial Application

```javascript
function multiply(a, b) {
  return a * b;
}

const double = multiply.bind(null, 2);
const triple = multiply.bind(null, 3);

const fns = [double, triple];
const results = fns.map(fn => fn(5));
console.log(results); // ?

// Is this a closure?
```

**Output:** `[10, 15]`

**Why:** `bind` creates a new function with pre-filled arguments. `double(5)` → `multiply(2, 5)` → `10`. This is **not technically a closure** in the traditional sense — `bind` creates a bound function exotic object, not a lexical closure. But the effect is similar: the partial argument `2` is "captured." True closure equivalent: `const double = (b) => multiply(2, b);`.

---

## Q75: Closure with new.target

```javascript
function Tracker() {
  if (!new.target) {
    return new Tracker();
  }

  let count = 0;

  this.track = function() {
    count++;
    return count;
  };
}

const t = Tracker(); // no 'new' keyword
console.log(t.track()); // ?
console.log(t.track()); // ?

const t2 = new Tracker();
console.log(t2.track()); // ?
```

**Output:** `1`, `2`, `1`

**Why:** `Tracker()` without `new` detects `!new.target` and calls `new Tracker()` internally. The returned instance has `track` closing over its own `count`. `t2` is a separate instance with its own closure. Both `t` and `t2` have independent `count` variables.

---

## Summary Cheatsheet

| Pattern | Closure captures | Common gotcha |
|---------|-----------------|---------------|
| Loop with var | Shared i | Use let or IIFE |
| setTimeout in loop | Shared variable | All callbacks see final value |
| Class method callback | Wrong this | Use arrow function |
| Mutable captured var | Reference | Modification affects all |
| Large object capture | Whole object | Extract only needed values |
| Stale closure (React) | Old state | Use functional updates |
| eval in closure | Entire scope | Prevents GC optimization |
| Arguments object | Own vs inherited | Arrow inherits, regular gets own |
| Default parameters | Parameter scope | Can hit TDZ |
| WeakRef in closure | Weak reference | GC can invalidate |
| Generator closure | Paused scope | Yields share same binding |
| JSON.stringify | N/A | Drops functions entirely |
| for...in with var | Shared key | Use const/let |
| try/finally | Mutated before return | finally runs before return |
| Async/await | Live binding | Value may change across await |
