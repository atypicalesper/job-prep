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

Parsing is the process of turning raw JavaScript source text into a structured representation the engine can work with. The scanner (lexer) breaks the character stream into tokens; the parser then applies grammar rules to assemble those tokens into an Abstract Syntax Tree — a tree of nodes where each node represents a syntactic construct (declaration, expression, statement). The AST is the foundation for every subsequent step: Ignition walks it to generate bytecode, and tools like Babel and ESLint also operate on ASTs.

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

TurboFan does not work directly on bytecode or a conventional linear IR. Instead, it builds a graph where every operation is a free-floating node connected by typed edges. This representation is called a "sea of nodes" and it exists because it makes many compiler optimizations easier to express — nodes can be freely reordered as long as their data and effect dependencies are satisfied. Most imperative compilers use linear basic-block representations; the sea-of-nodes approach is less common but enables TurboFan's aggressive loop optimizations.

TurboFan builds a "sea of nodes" — a graph where operations are nodes connected by:
- **Value edges** (data flow)
- **Effect edges** (side effects ordering)
- **Control edges** (branches)

This representation enables aggressive reordering and elimination.

### Optimization Phases

Once TurboFan has built the sea-of-nodes graph, it applies a sequence of optimization passes, each transforming the graph to produce more efficient machine code. These phases run in order and build on each other — inlining, for example, exposes more opportunities for type specialization, which in turn enables escape analysis. Understanding these phases explains why "hot" code (run thousands of times) can end up dramatically faster than cold code even for identical logic.

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

Every time you add a property to an object for the first time, V8 creates a new hidden class and records the transition from the previous one. This forms a linked transition chain. All objects that share the same construction path (same property names in the same order) end up at the same terminal shape. V8 can then compile property accesses to a direct memory offset load — no hash table lookup needed.

```
Shape0 {}
  → add .x → Shape1 {x: offset0}
    → add .y → Shape2 {x: offset0, y: offset1}
```

### What Breaks Hidden Classes

Any operation that makes two objects follow different property addition paths gives them different shapes, even if they end up with the same set of properties. Once shapes diverge, V8 cannot use the fast offset-based access path — it falls back to a generic lookup. These are the four most common culprits in real codebases.

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

The simplest fix for all shape-related issues is to initialize every property in the constructor, even if the value is `null` or `0`. This guarantees that all instances follow the same shape transition chain from construction, share the same terminal hidden class, and benefit from fast property access and inline cache hits.

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

Each IC call site progresses through a state machine as V8 observes what types flow through it. A monomorphic site has seen exactly one shape and has a fast-path compiled directly to an offset lookup. As more distinct shapes appear, V8 must maintain a small lookup table (polymorphic, 2–4 entries) and eventually gives up caching entirely (megamorphic). State transitions are one-way — once megamorphic, the call site stays slow for the lifetime of the compiled function.

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

V8's memory is divided into a heap organized by object age and object type. The design is based on the "generational hypothesis": most objects die young, so it pays to use a fast, cheap collector for new objects and a more thorough but infrequent collector for objects that survive. Understanding this structure helps explain both how GC pauses happen and how to write code that minimizes GC pressure.

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

Most objects are short-lived — they're created for a single function call, array map, or render cycle and then become garbage immediately. Scavenge exploits this by using two equal-sized semi-spaces and copying only the live (surviving) objects from one to the other. Dead objects are simply abandoned in the old space — no time is spent sweeping them. The copy also compacts survivors, eliminating fragmentation. Because young generation is small (a few MB), the entire collection takes roughly 1ms.

Cheney's algorithm — semi-space copying:
1. Allocate into "from-space"
2. When full: scan from roots, copy live objects to "to-space"
3. Swap from/to labels
4. Objects that survive 2 scavenges → promoted to Old Space

**Characteristics:** O(live objects), not O(heap size). Very fast (~1ms). Runs frequently.

### Mark-Sweep-Compact (Major — Old Gen)

Objects that survive two Scavenge cycles are promoted to Old Space, which can grow to hundreds of MB. Old Space needs a different collector because Cheney's copying algorithm would require an equally large "to-space" — impractical at that scale. Mark-Sweep-Compact uses a three-phase approach that operates in place: mark live objects, sweep dead ones, then compact the survivors. It is more thorough but also heavier — in modern V8 it runs incrementally and concurrently to avoid long pauses.

**Mark phase:** Start from roots (stack, globals, handles). DFS/BFS, mark each reachable object. V8 uses **tri-color marking**:
- White = not visited
- Gray = visited, children not yet scanned
- Black = visited + children scanned

**Sweep phase:** Reclaim white (unreachable) objects. Adds to free-lists.

**Compact phase:** Move live objects together to reduce fragmentation. Updates all pointers.

### Incremental + Concurrent GC

The original Mark-Sweep-Compact GC was "stop-the-world" — JavaScript execution paused entirely for the duration of marking and sweeping, causing visible jank spikes. V8's "Orinoco" GC project solved this by breaking the collection into smaller increments interleaved with JS execution and moving as much work as possible to background threads. The result is that most GC work is invisible to the main thread, with only brief synchronization points.

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

JavaScript has a single `number` type (IEEE 754 double), but V8 internally uses multiple representations to avoid heap allocation for the common case of small integers. Understanding this distinction matters for performance-critical numeric code: mixing integer and float arithmetic, or exceeding the SMI range, forces heap allocations that increase GC pressure.

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

V8 tracks the "elements kind" of every array — a label describing what types of values it contains and whether it has holes (sparse indices). Arrays with uniform, dense elements use a flat typed backing store (like a C array), which enables fast iteration and bounds-checked access. Adding a value of a different type or creating a hole downgrades the elements kind to a more general (slower) representation. Crucially, transitions are one-way: once downgraded, an array never goes back to a more efficient representation even if you remove the offending element.

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

TurboFan compiles code speculatively — it assumes observed types will hold in the future and emits machine code tailored to those types. When a value arrives that violates the assumption (a string where only numbers were seen), TurboFan cannot use its compiled code anymore. It **deoptimizes**: discards the compiled machine code, reconstructs the interpreter state, and falls back to Ignition bytecode. Repeated deoptimization on the same function (a "deopt loop") is a significant performance problem because V8 may stop recompiling it.

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

The patterns below directly target the V8 internals described above. Each maps to a specific optimization mechanism: consistent shapes keep IC states monomorphic, rest params avoid the legacy unoptimized `arguments` object, typed arrays bypass the elements-kind downgrade path entirely, and stable function references keep hidden classes clean. These are micro-optimizations — apply them in hot code paths (render loops, data transforms, animation callbacks) where profiling confirms they matter.

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
