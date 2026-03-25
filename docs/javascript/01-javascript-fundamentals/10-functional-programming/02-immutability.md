# Immutability in JavaScript

Immutability means **never modifying a value after it's created** — instead, produce a new value with the desired changes. It's a cornerstone of predictable state, concurrent safety, and functional programming.

---

## `const` ≠ Immutable

The most common misconception:

```js
const num = 42;
num = 43; // ❌ TypeError — reassignment blocked

const obj = { name: 'Alice', age: 30 };
obj.age = 31;          // ✅ allowed — mutation, not reassignment
obj.role = 'admin';    // ✅ allowed
obj = { name: 'Bob' }; // ❌ TypeError — reassignment blocked

const arr = [1, 2, 3];
arr.push(4);    // ✅ allowed — mutation
arr[0] = 99;   // ✅ allowed
arr = [1, 2];  // ❌ TypeError

// const prevents re-binding the variable, NOT mutation of the value
```

---

## Primitive Immutability

Primitives are **always immutable** — operations return new values:

```js
let str = 'hello';
str.toUpperCase(); // returns 'HELLO' — original unchanged
console.log(str);  // 'hello'

str = str.toUpperCase(); // must reassign to "change" it

let n = 5;
n + 1; // returns 6 — n is still 5

// String "mutation" is always a new string
const greeting = 'hello world';
greeting.replace('world', 'JS'); // new string — greeting unchanged

// Numbers, booleans, null, undefined, Symbol, BigInt — all immutable
```

---

## Object.freeze

Shallow-freezes an object — prevents adding, removing, or changing properties:

```js
const config = Object.freeze({
  apiUrl: 'https://api.example.com',
  timeout: 5000,
  retries: 3,
});

config.apiUrl = 'changed';     // silently fails (throws in strict mode)
config.newProp = 'value';      // silently fails
delete config.timeout;         // silently fails

Object.isFrozen(config); // true

// ⚠️ SHALLOW only — nested objects are NOT frozen
const state = Object.freeze({
  user: { name: 'Alice', age: 30 }, // NOT frozen
  count: 0,
});

state.count = 1;          // fails (primitive — frozen)
state.user.age = 99;      // ✅ succeeds — nested object is mutable!
state.user = {};           // fails — property reassignment blocked
```

### Deep Freeze

```js
function deepFreeze(obj) {
  // Freeze all own properties recursively
  Object.getOwnPropertyNames(obj).forEach(name => {
    const value = obj[name];
    if (typeof value === 'object' && value !== null) {
      deepFreeze(value);
    }
  });
  return Object.freeze(obj);
}

const config = deepFreeze({
  db: { host: 'localhost', port: 5432 },
  api: { key: 'secret', timeout: 5000 },
});

config.db.host = 'changed'; // ❌ throws in strict mode — deeply frozen
```

### Object.freeze vs Object.seal vs Object.preventExtensions

```js
const obj = { a: 1, b: 2 };

// preventExtensions — can't add new properties, can change existing
Object.preventExtensions(obj);
obj.c = 3;   // fails
obj.a = 99;  // ✅ succeeds
delete obj.b; // ✅ succeeds

// seal — can't add or delete, can change existing values
Object.seal(obj);
obj.c = 3;   // fails
obj.a = 99;  // ✅ succeeds
delete obj.b; // fails

// freeze — can't add, delete, OR change
Object.freeze(obj);
obj.c = 3;   // fails
obj.a = 99;  // fails
delete obj.b; // fails

// Check state
Object.isExtensible(obj); // false
Object.isSealed(obj);     // true
Object.isFrozen(obj);     // true (freeze implies seal implies non-extensible)
```

---

## Immutable Update Patterns

### Objects

The spread operator (`{...obj}`) is the idiomatic way to produce a modified copy of an object in JavaScript. It creates a **shallow** clone — nested objects are still shared by reference and must be spread again if they need to change. The pattern for a nested update is to spread every level of the path from the root down to the changed leaf. This is verbose for deeply nested trees, which is why Immer exists. For simple top-level updates, spread is zero-dependency and immediately readable.

```js
const user = { id: 1, name: 'Alice', age: 30, role: 'user' };

// Update top-level property
const updated = { ...user, age: 31 };

// Add property
const withRole = { ...user, role: 'admin', lastLogin: new Date() };

// Remove property (omit)
const { role, ...withoutRole } = user;

// Rename property
const { name: username, ...rest } = user;
const renamed = { ...rest, username };

// Conditional update
const toggled = { ...user, active: !user.active };

// Merge
const defaults = { theme: 'dark', lang: 'en', fontSize: 14 };
const prefs = { theme: 'light' };
const merged = { ...defaults, ...prefs }; // { theme: 'light', lang: 'en', fontSize: 14 }
```

### Nested Objects

Every level in the path to a changed value must be explicitly spread to produce new references for those ancestor nodes. Unchanged sibling subtrees are reused as-is (structural sharing), so the operation is efficient even for large state trees — only the nodes along the mutation path are newly allocated. This depth-proportional verbosity is the main motivation for adopting Immer on projects with deeply nested state.

```js
// ❌ Mutation
state.user.address.city = 'NYC';

// ✅ Immutable — spread all levels
const newState = {
  ...state,
  user: {
    ...state.user,
    address: {
      ...state.user.address,
      city: 'NYC',
    },
  },
};

// Gets verbose for deeply nested structures → use Immer
```

### Arrays

All of JavaScript's mutable array methods (`push`, `pop`, `splice`, `sort`, `reverse`, `fill`, `copyWithin`) have non-mutating equivalents using spread, `filter`, `map`, and `slice`. The key habit is: never call a mutating method on an array you didn't just create. When you need `sort` or `reverse` (which mutate in place), spread first to create a copy. For arrays of objects, updating one item by id with `.map()` is the standard pattern — it is O(n) but correct; for large arrays where performance matters, consider a normalized `Map` keyed by id instead.

```js
const items = [1, 2, 3, 4, 5];

// Add
const appended  = [...items, 6];           // [1,2,3,4,5,6]
const prepended = [0, ...items];           // [0,1,2,3,4,5]
const inserted  = [...items.slice(0, 2), 99, ...items.slice(2)]; // [1,2,99,3,4,5]

// Remove
const removed     = items.filter(x => x !== 3);       // [1,2,4,5]
const removedIdx  = items.filter((_, i) => i !== 2);  // [1,2,4,5]

// Update
const updated = items.map(x => x === 3 ? 99 : x);    // [1,2,99,4,5]
const updatedIdx = items.map((x, i) => i === 2 ? 99 : x);

// Sort / reverse without mutation
const sorted   = [...items].sort((a, b) => a - b);
const reversed = [...items].reverse(); // note: reverse() also mutates original
const safeRev  = [...items].reverse(); // safe because spread creates new array first

// Objects in arrays
const users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];

// Update one item by id
const updateUser = (id, changes) =>
  users.map(u => u.id === id ? { ...u, ...changes } : u);

// Remove by id
const removeUser = (id) => users.filter(u => u.id !== id);

// Add or update (upsert)
const upsert = (newUser) => {
  const exists = users.some(u => u.id === newUser.id);
  return exists
    ? users.map(u => u.id === newUser.id ? { ...u, ...newUser } : u)
    : [...users, newUser];
};
```

---

## Immer

Immer lets you write mutations that produce immutable results. Used by Redux Toolkit internally.

```bash
npm install immer
```

```js
import { produce, enableMapSet } from 'immer';
enableMapSet(); // enable Map/Set support

const state = {
  user: { name: 'Alice', prefs: { theme: 'dark' } },
  notifications: [],
  count: 0,
};

// produce(baseState, recipe) — recipe receives a "draft" you can mutate freely
const nextState = produce(state, draft => {
  draft.user.prefs.theme = 'light';  // looks like mutation
  draft.notifications.push({ id: 1, msg: 'Hello' });
  draft.count += 1;
  delete draft.user.prefs.fontSize;
});

// state is unchanged
console.log(state.user.prefs.theme);    // 'dark'
console.log(nextState.user.prefs.theme); // 'light'
console.log(state === nextState);        // false — different references
console.log(state.notifications === nextState.notifications); // false — mutated path
console.log(state.user === nextState.user);    // false — changed
console.log(state.count === nextState.count);  // false

// Structural sharing — unchanged parts are reused
// Only the path you mutated gets new references
```

### Curried Producer (reusable updater)

When `produce` is called with only a recipe and no base state, it returns a **curried producer** — a reusable function that accepts a base state as its first argument and optional extra arguments after. This is the preferred pattern for defining named state-update operations: each operation is a pure function (base state in, next state out) that can be composed, tested in isolation, and used anywhere — in reducers, event handlers, or as `Array.prototype.reduce` accumulator functions.

```js
import { produce } from 'immer';

// Create a reusable updater function
const addItem = produce((draft, item) => {
  draft.items.push(item);
});

const removeItem = produce((draft, id) => {
  const idx = draft.items.findIndex(i => i.id === id);
  if (idx !== -1) draft.items.splice(idx, 1);
});

const toggleDone = produce((draft, id) => {
  const item = draft.items.find(i => i.id === id);
  if (item) item.done = !item.done;
});

// Use as pure functions
const state1 = addItem(initialState, { id: 1, text: 'Buy milk', done: false });
const state2 = removeItem(state1, 1);
const state3 = toggleDone(state2, 2);
```

### Immer with useReducer

Wrapping a `useReducer` reducer with `produce` eliminates all the spread syntax from every case in the switch. You write mutations against the `draft` and Immer handles producing the immutable next state. This pattern is also used by Redux Toolkit's `createSlice`, which wraps every case reducer with Immer automatically. The `draft` is only valid inside the recipe — do not store references to `draft` or its sub-properties outside the `produce` call.

```js
import { produce } from 'immer';

const reducer = produce((draft, action) => {
  switch (action.type) {
    case 'increment':
      draft.count += 1;
      break;
    case 'addTodo':
      draft.todos.push({ id: Date.now(), text: action.payload, done: false });
      break;
    case 'toggleTodo':
      const todo = draft.todos.find(t => t.id === action.payload);
      if (todo) todo.done = !todo.done;
      break;
    case 'removeTodo':
      draft.todos = draft.todos.filter(t => t.id !== action.payload);
      break;
  }
  // No need to return — Immer handles it
  // But you CAN return a completely new state: return { ...draft, reset: true }
});

const [state, dispatch] = useReducer(reducer, { count: 0, todos: [] });
```

### Immer with Maps and Sets

By default Immer only instruments plain objects and arrays. Calling `enableMapSet()` once at application startup extends this support to `Map` and `Set`, allowing you to call `draft.myMap.set(key, value)` or `draft.mySet.add(item)` inside a recipe. Without `enableMapSet()`, mutations on `Map` or `Set` values inside a draft will silently bypass Immer's tracking and produce corrupted results.

```js
import { produce, enableMapSet } from 'immer';
enableMapSet();

const state = { users: new Map([[1, 'Alice'], [2, 'Bob']]) };

const next = produce(state, draft => {
  draft.users.set(3, 'Charlie');
  draft.users.delete(1);
});
```

### Immer Gotchas

Immer's draft is a `Proxy` that intercepts mutations and records them. Three common mistakes break this contract: (1) both mutating the draft and returning a new value — Immer can only apply one approach per recipe; (2) storing a reference to the draft or any draft sub-object outside the `produce` call — the proxy is revoked after `produce` completes and any access will throw; (3) using an `async` recipe — Immer recipes must be synchronous because the proxy revocation happens immediately after the recipe returns.

```js
// ❌ Don't return AND mutate the draft
produce(state, draft => {
  draft.count++; // mutation
  return { ...draft, extra: true }; // return — picks one approach
  // Immer will throw: "don't return a draft"
});

// ✅ Mutate draft OR return new state — not both
produce(state, draft => { draft.count++; });                   // mutation
produce(state, draft => { return { ...state, count: state.count + 1 }; }); // replace

// ❌ Don't store draft references outside produce
let leaked;
produce(state, draft => { leaked = draft.items; }); // leaked is now a revoked proxy

// ❌ Async recipes not supported directly
produce(state, async draft => { /* doesn't work */ });
// Use produceWithPatches or handle async outside produce
```

---

## Structural Sharing

Efficient immutable updates share unchanged subtrees:

```
Before:           After updating user.age:
    state               newState
   /     \             /         \
user    settings     user      settings  ← same reference (unchanged)
 / \               / \
name age          name age  ← new reference
                  ↑
                  same   new
```

This is why immutable updates are efficient even for large state trees — only the changed path gets new allocations.

---

## Immutable Data Structure Libraries

```js
// Immer (recommended) — transparent mutable API, structural sharing
import { produce } from 'immer';

// Immutable.js — persistent data structures with value equality
import { Map, List, fromJS } from 'immutable';
const map1 = Map({ a: 1, b: 2 });
const map2 = map1.set('a', 99);
map1.get('a');  // 1
map2.get('a');  // 99
map1 === map2;  // false
map1.equals(Map({ a: 1, b: 2 })); // true — value equality

// Drawbacks of Immutable.js: different API from plain JS,
// interop issues with libraries expecting plain objects

// structuredClone (native ES2022) — deep clone
const copy = structuredClone(complexObject);
// Handles: nested objects, arrays, Maps, Sets, Date, RegExp, ArrayBuffer
// Does NOT handle: functions, class instances (loses prototype), DOM nodes
```

---

## Why Immutability Matters

### 1. Change Detection — O(1) reference equality

```js
// Without immutability — deep comparison required
function hasChanged(prev, next) {
  return JSON.stringify(prev) !== JSON.stringify(next); // O(n)
}

// With immutability — reference comparison
function hasChanged(prev, next) {
  return prev !== next; // O(1) — React.memo, Redux, useMemo all use this
}

// React.memo / PureComponent
const MyComponent = React.memo(({ user }) => <div>{user.name}</div>);
// Re-renders only if user reference changes — not if user.name changes in-place
```

### 2. Time Travel / Undo

```js
// With immutability, history is just an array of states
const history = [state0, state1, state2, state3];
const undo = () => history[currentIndex - 1]; // always available
const redo = () => history[currentIndex + 1];
```

### 3. Concurrency Safety

```js
// Mutable shared state causes race conditions
let counter = 0;
async function increment() {
  const val = counter; // read
  await someAsyncWork();
  counter = val + 1;   // write — may overwrite concurrent updates!
}

// Immutable operations are inherently thread-safe
// Each operation creates a new value — no shared mutable state
```

### 4. Predictability / Debugging

```js
// Mutation makes it impossible to trace when state changed
function processUser(user) {
  user.age++; // who changed this? when?
  sendEmail(user);
  user.emailSent = true; // surprise side effect
}

// Immutable: state changes are explicit and traceable
function processUser(user) {
  const aged = { ...user, age: user.age + 1 };
  sendEmail(aged);
  return { ...aged, emailSent: true };
}
```

---

## Tricky Questions

**Q: Does `Object.freeze` make an object truly immutable?**

No — it's shallow. Nested objects remain mutable. You need `deepFreeze` or Immer for true deep immutability.

**Q: Is `const` immutability?**

No. `const` prevents rebinding the variable, not mutation of the value. `const obj = {}; obj.x = 1` is perfectly valid.

**Q: What's the difference between Immer's `produce` returning nothing vs returning a value?**

If the recipe function returns `undefined` (no return statement), Immer uses the mutated draft. If it returns a value, Immer uses that as the new state and discards the draft. You can't do both.

**Q: Why does Redux require immutability?**

Redux uses `===` to detect state changes. If you mutate state in place, `prevState === nextState` is `true` even after mutation, so React-Redux won't trigger re-renders.

**Q: Is `[...arr].sort()` truly non-mutating?**

Yes — `[...arr]` creates a shallow copy, then `.sort()` mutates the copy. But the copy only contains references, so if arr contains objects, sorting reorders the *references* without mutating the objects themselves.
