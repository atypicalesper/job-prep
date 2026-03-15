# V8 Engine — Deep Dive

## V8 Pipeline Overview

```
JavaScript Source
       ↓
  ┌─────────┐
  │  Blink  │  (HTML parser encounters <script>)
  └────┬────┘
       ↓
  ┌─────────┐
  │  Parser │  → AST (Abstract Syntax Tree)
  └────┬────┘
       ↓
  ┌─────────────┐
  │  Ignition   │  → Bytecode  (interpreter, fast startup)
  │ (interpreter)│
  └──────┬──────┘
         │ profiling data (hot loops, functions)
         ↓
  ┌─────────────┐
  │  TurboFan   │  → Optimized Machine Code
  │  (JIT comp) │
  └──────┬──────┘
         │ deopt (type assumption violated)
         ↓
  ┌─────────────┐
  │  Ignition   │  (back to bytecode)
  └─────────────┘
```

---

## Parsing

### Scanner → Tokens → AST

```js
const x = 1 + 2;
```

Tokens: `const`, `x`, `=`, `1`, `+`, `2`, `;`

AST fragment:
```
VariableDeclaration
  └── VariableDeclarator
        ├── id: Identifier(x)
        └── init: BinaryExpression(+)
              ├── left: Literal(1)
              └── right: Literal(2)
```

**Lazy parsing:** V8 doesn't fully parse all functions upfront. Functions not immediately called get a "pre-parse" (syntax check only). Full parse happens on first call. This speeds up startup.

```js
// Immediately invoked → eagerly parsed
(function() { /* ... */ })();

// Not invoked yet → lazily parsed (faster startup)
function heavyInit() { /* ... */ }
```

---

## Ignition — Bytecode Interpreter

Ignition produces a compact bytecode that's:
- Faster to generate than machine code
- Smaller memory footprint
- Provides profiling info for TurboFan

```
Bytecode for: function add(a, b) { return a + b; }

  LdaNamedProperty a0, [0]  // load a
  Add a1, [1]               // add b
  Return
```

Register-based VM (unlike stack-based in Java/.NET).

---

## TurboFan — JIT Compiler

TurboFan kicks in for "hot" code (run many times). It makes **speculative optimizations** based on observed types.

### Sea of Nodes IR
TurboFan builds a "sea of nodes" — a graph where operations are nodes connected by:
- **Value edges** (data flow)
- **Effect edges** (side effects ordering)
- **Control edges** (branches)

This representation enables aggressive reordering and elimination.

### Optimization Phases
1. **Inlining** — replace function call with body
2. **Type specialization** — emit int32 add instead of generic add
3. **Escape analysis** — allocate on stack instead of heap
4. **Dead code elimination**
5. **Loop invariant code motion**

---

## Hidden Classes (Shapes / Maps)

The most important V8 optimization to understand.

V8 assigns a **hidden class** to every object. Objects with the same shape (same properties in same order) share a hidden class → property access is O(1) offset lookup.

```js
function Point(x, y) {
  this.x = x;  // transition to Shape1 {x}
  this.y = y;  // transition to Shape2 {x, y}
}

const p1 = new Point(1, 2);  // Shape2
const p2 = new Point(3, 4);  // Shape2 — SAME hidden class ✓
```

### Shape Transition Chain
```
Shape0 {}
  → add .x → Shape1 {x: offset0}
    → add .y → Shape2 {x: offset0, y: offset1}
```

### What Breaks Hidden Classes

```js
// 1. Different property order
const a = {}; a.x = 1; a.y = 2;  // Shape: {x,y}
const b = {}; b.y = 1; b.x = 2;  // Shape: {y,x} — DIFFERENT!

// 2. Adding properties after construction
function Car(make) {
  this.make = make;
}
const c = new Car('Toyota');
c.color = 'red';  // new shape, not shared with other Car instances

// 3. delete operator — creates "deprecated shape"
delete c.make;    // very bad — turns into slow object

// 4. Dynamic property names
const key = getKey();
obj[key] = value;  // can't predict at compile time
```

### Fix: Initialize all properties in constructor

```js
// GOOD
class Car {
  constructor(make, model) {
    this.make = make;    // always set
    this.model = model;  // always set
    this.color = null;   // even if null — maintains shape
  }
}
```

---

## Inline Caches (ICs)

At each **call site** (location in bytecode), V8 caches the type of object seen.

### IC States

```
UNINITIALIZED → first execution
MONOMORPHIC   → always same type (fast path!)
POLYMORPHIC   → 2-4 different types (slower)
MEGAMORPHIC   → 5+ different types (no cache, slow)
```

```js
function getX(obj) {
  return obj.x;  // IC at this call site
}

getX({ x: 1 });          // → MONOMORPHIC (Shape1)
getX({ x: 2 });          // → MONOMORPHIC (same Shape1)
getX({ x: 1, y: 2 });    // → POLYMORPHIC (Shape1, Shape2)
getX({ x: 1, z: 3 });    // → POLYMORPHIC
getX({ a: 1, x: 2 });    // → MEGAMORPHIC — V8 stops caching
```

**Practical tip:** If you have a utility function called with many different object shapes, V8 won't optimize it. Consider typed classes or separate functions.

---

## Memory Management

### Heap Zones

```
V8 Heap
├── New Space (Young Generation)
│   ├── Semi-space 1 (from-space / nursery)  ~1-8MB
│   └── Semi-space 2 (to-space)
├── Old Space
│   ├── Old object space (long-lived objects)
│   ├── Code space (compiled bytecode + machine code)
│   ├── Map space (hidden class descriptors)
│   └── Large object space (>512KB blobs, not moved)
└── Read-only space (builtins, constants)
```

### Scavenge GC (Minor — Young Gen)

Cheney's algorithm — semi-space copying:
1. Allocate into "from-space"
2. When full: scan from roots, copy live objects to "to-space"
3. Swap from/to labels
4. Objects that survive 2 scavenges → promoted to Old Space

**Characteristics:** O(live objects), not O(heap size). Very fast (~1ms). Runs frequently.

### Mark-Sweep-Compact (Major — Old Gen)

**Mark phase:** Start from roots (stack, globals, handles). DFS/BFS, mark each reachable object. V8 uses **tri-color marking**:
- White = not visited
- Gray = visited, children not yet scanned
- Black = visited + children scanned

**Sweep phase:** Reclaim white (unreachable) objects. Adds to free-lists.

**Compact phase:** Move live objects together to reduce fragmentation. Updates all pointers.

### Incremental + Concurrent GC

V8 uses "Orinoco" GC improvements:
- **Incremental marking:** Break marking into small steps, interleave with JS execution
- **Concurrent marking:** Mark on background threads while JS runs
- **Concurrent sweeping:** Sweep on background threads
- **Parallel scavenge:** Multiple threads for minor GC

```
Timeline:
JS  ████░░███░░░██░░░████
GC       ██   ███  ██
              (background, concurrent)
```

---

## Numbers in V8

V8 represents numbers as:

**SMI (Small Integer):** If integer fits in 31 bits (or 32 on 64-bit systems), stored as tagged immediate — no heap allocation!

```js
// SMIs — no allocation
let x = 42;      // SMI
let y = -5;      // SMI
let z = 2**30;   // SMI on 64-bit

// Heap-allocated (HeapNumber)
let a = 1.5;     // double, heap allocated
let b = 2**31;   // exceeds SMI range
let c = NaN;     // heap allocated
```

**Implication:** Pure integer arithmetic is faster than float arithmetic.

---

## Arrays in V8

V8 has multiple internal array representations:

| Elements Kind | Example | Storage |
|--------------|---------|---------|
| PACKED_SMI_ELEMENTS | `[1,2,3]` | int32 array |
| PACKED_DOUBLE_ELEMENTS | `[1.5,2.5]` | float64 array |
| PACKED_ELEMENTS | `[1,'a',{}]` | pointer array |
| HOLEY_SMI_ELEMENTS | `[1,,3]` | sparse SMI |
| HOLEY_DOUBLE_ELEMENTS | `[1.5,,3.5]` | sparse double |
| HOLEY_ELEMENTS | `[1,,{}]` | sparse pointer |
| DICTIONARY_ELEMENTS | `a[9999]=1` | hash map |

**Transitions are one-way (downgrade only):**
```
PACKED_SMI → PACKED_DOUBLE (add a float)
           → PACKED_ELEMENTS (add a string)
           → HOLEY_* (delete or create hole)
```

```js
// PACKED_SMI_ELEMENTS — fastest
const arr = [1, 2, 3];

// Transition to PACKED_DOUBLE — slower
arr.push(1.5);

// Transition to PACKED_ELEMENTS — slowest
arr.push('hello');

// AVOID: creating holes
const a = [1, 2, 3];
delete a[1];  // → HOLEY — can't go back!

// AVOID: pre-allocating
const b = new Array(100);  // HOLEY immediately
// Better: push incrementally
```

---

## Deoptimization

When TurboFan's assumption is violated, it **deoptimizes** — throws away compiled code and falls back to Ignition bytecode.

```js
function add(a, b) {
  return a + b;
}

// TurboFan optimizes assuming both are numbers
for (let i = 0; i < 100000; i++) add(i, i);

// Suddenly pass a string → DEOPT
add('hello', 'world');  // → back to Ignition
```

**Detecting deoptimizations:**
```bash
node --trace-deopt app.js
node --trace-opt app.js
```

---

## Practical Performance Tips

```js
// 1. Keep object shapes consistent
class Config {
  constructor() {
    this.host = '';
    this.port = 0;
    this.timeout = 0;  // always init all fields
  }
}

// 2. Avoid arguments object (old V8) — use rest params
function bad()  { return Array.from(arguments); }  // slow
function good(...args) { return args; }             // fast

// 3. Use typed arrays for numeric computation
const slow = [1.1, 2.2, 3.3];            // PACKED_DOUBLE (OK)
const fast = new Float64Array([1.1, 2.2]); // true typed array, faster

// 4. Don't create functions in hot loops
// BAD
for (const item of items) {
  item.process = function() { /* ... */ }; // new function each iter
}
// GOOD
function process() { /* ... */ }
for (const item of items) {
  item.process = process;
}

// 5. Avoid polymorphic functions
function log(value) {
  console.log(value); // called with string, number, object → megamorphic
}
// Better: separate functions per type if performance critical
```

---

## Interview Questions

**Q: What is a "deoptimization" in V8?**
TurboFan compiles hot code with type assumptions (e.g., "a is always int"). When a violating value arrives, V8 discards the compiled code and falls back to Ignition bytecode. Repeated deoptimization is a perf problem.

**Q: Why is `delete obj.key` bad for performance?**
It can change the object's hidden class to a "deprecated" shape, turning property access from O(1) offset lookup into dictionary lookup. Use `obj.key = undefined` instead if you just want to clear the value.

**Q: What's the difference between SMI and HeapNumber?**
SMI = small integer stored as tagged value directly in the pointer (no allocation). HeapNumber = double precision float stored on the heap. Integer operations on SMIs are much faster.

**Q: Why should you initialize all class properties in the constructor?**
It ensures all instances have the same hidden class shape, enabling V8 to use fast property access (inline cache hits). Adding properties later creates new shapes and breaks optimizations.
