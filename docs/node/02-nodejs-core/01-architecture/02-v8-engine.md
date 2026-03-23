# V8 Engine

## What is V8?

V8 is Google's open-source JavaScript and WebAssembly engine, written in C++. It's used in Chrome and Node.js. V8 compiles JavaScript directly to native machine code (JIT) rather than interpreting it.

```
V8 Pipeline:
Source Code → Parser → AST → Ignition (bytecode) → TurboFan (machine code)
                                      ↑                    ↓
                              Interpreter           JIT Compiled
                              (runs fast,           (hot paths,
                               no warmup)           optimized)
```

---

## The Two-Tier Compiler

### Ignition — The Interpreter

- Generates **bytecode** from the AST
- Starts executing **immediately** (no warmup)
- Collects **profiling information** (type feedback)
- More predictable performance for cold code

### TurboFan — The Optimizing Compiler

- Takes hot bytecode + profiling data and compiles to **native machine code**
- Performs aggressive optimizations:
  - Inlining functions
  - Escape analysis
  - Dead code elimination
  - Bounds check elimination
- Can **deoptimize** (bail out) if assumptions are violated

```
Hot Function Execution:
1. Run in Ignition → collect type feedback
2. If called many times → TurboFan optimizes it
3. Native machine code runs → very fast
4. If types change → deoptimize → back to Ignition
```

---

## Hidden Classes (Shapes)

V8 uses **hidden classes** (also called "shapes" or "maps") to track object structure and enable fast property access.

When you create objects with the same properties in the same order, V8 assigns them the same hidden class, enabling fast property lookup.

```javascript
// ✅ Same hidden class — V8 can optimize
function createPoint(x, y) {
  return { x, y }; // always same order → same hidden class
}

const p1 = createPoint(1, 2); // hidden class: {x, y}
const p2 = createPoint(3, 4); // same hidden class → fast!

// ❌ Different hidden classes — V8 must handle polymorphically
function createUser(data) {
  const user = {};
  if (data.name)  user.name  = data.name;  // sometimes {name}
  if (data.email) user.email = data.email; // sometimes {email}
  if (data.age)   user.age   = data.age;   // sometimes {name, email, age}
  return user; // multiple possible shapes → slower
}

// ❌ Dynamic property deletion changes hidden class
const obj = { x: 1, y: 2, z: 3 };
delete obj.y; // creates new hidden class! → slower
// Prefer: obj.y = undefined; (keeps same hidden class)

// ❌ Adding properties after creation
const point = {};
point.x = 1; // transition from {} to {x}
point.y = 2; // transition from {x} to {x,y}
// More transitions = more overhead
```

---

## Inline Caches (ICs)

V8 caches property access information at call sites:

```javascript
function getX(obj) {
  return obj.x; // V8 caches: "obj has x at offset 8"
}

// If always called with same shape:
getX({ x: 1, y: 2 }); // monomorphic → fast
getX({ x: 2, y: 3 }); // same shape → still fast

// If called with different shapes:
getX({ x: 1 });           // monomorphic
getX({ x: 1, y: 2 });     // polymorphic (2 shapes)
getX({ x: 1, y: 2, z: 3 }); // polymorphic (3 shapes)
// Eventually "megamorphic" → generic slow path
```

**Tip:** Functions called with the same object shape are significantly faster (monomorphic ICs).

---

## Writing V8-Friendly Code

```javascript
// ✅ Initialize all properties in constructor
class Point {
  constructor(x, y) {
    this.x = x; // always same order
    this.y = y; // same hidden class for all instances
  }
}

// ❌ Don't add properties dynamically
const p = new Point(1, 2);
p.z = 3; // new hidden class!

// ✅ Use arrays for collections of same-type data
const nums = [1, 2, 3, 4, 5]; // V8 optimizes: SMI array

// ❌ Mixed types in arrays prevent optimization
const mixed = [1, 'two', 3, null]; // V8 uses generic array

// ✅ Functions with consistent argument types
function add(a, b) { return a + b; }
add(1, 2);   // V8 learns: both are numbers → optimize
add(1, 2);   // fast!

// ❌ Inconsistent types cause deoptimization
add('hello', 'world'); // now needs to handle strings!
// V8 deoptimizes add() → must re-profile

// ✅ Avoid arguments object in hot functions
function sum() {
  let total = 0;
  for (let i = 0; i < arguments.length; i++) { // arguments causes deopt
    total += arguments[i];
  }
  return total;
}

// Use rest params instead:
function sum(...nums) { return nums.reduce((a, b) => a + b, 0); }
```

---

## Deoptimization

When V8's assumptions are violated, it "bails out" and falls back to interpreted code:

```javascript
function add(a, b) {
  return a + b;
}

// V8 optimizes for number + number:
for (let i = 0; i < 10000; i++) add(1, 2);

// Then this causes deoptimization:
add('hello', 'world'); // V8: "my assumption was wrong, revert to interpreter"
add(1, 2); // now unoptimized again — must re-profile

// Common deoptimization triggers:
// - Changing object shape after creation
// - Using arguments object in optimized functions
// - try/catch in hot inner loops
// - Polymorphic function calls
// - eval() / with statement
```

---

## Garbage Collection in V8

V8 uses **generational GC**:

```
V8 Heap:
┌─────────────────────────────────────────────────────┐
│              Old Generation (major GC)              │
│     Objects that survived young GC (~80% of heap)   │
│     Mark-Sweep-Compact — runs less often, slower    │
├─────────────────────────────────────────────────────┤
│         Young Generation (minor GC / Scavenge)      │
│  ┌───────────────┐  ┌───────────────────────────┐   │
│  │  From Space   │→ │      To Space             │   │
│  │ (new objects) │  │ (live objects copied here)│   │
│  └───────────────┘  └───────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

- **Minor GC (Scavenge):** Runs frequently, very fast, handles short-lived objects
- **Major GC (Mark-Sweep-Compact):** Less frequent, handles long-lived objects
- **Concurrent & Incremental:** Modern V8 does GC work in background threads to minimize pauses

---

## V8 Flags for Node.js

```bash
# Show GC activity
node --trace-gc app.js

# Profile JIT compilation
node --prof app.js

# Set heap size
node --max-old-space-size=4096 app.js  # 4GB max old gen

# Allow more memory
node --max-semi-space-size=128 app.js  # larger young gen

# Print deoptimizations
node --trace-deopt app.js

# Show optimized functions
node --trace-opt app.js
```

---

## Interview Questions

**Q: What is the difference between Ignition and TurboFan in V8?**
A: Ignition is V8's interpreter that generates and executes bytecode immediately — fast startup, no warmup. TurboFan is the optimizing JIT compiler — it takes hot code paths (called many times) and compiles to native machine code for much faster execution. V8 starts with Ignition, profiles, then uses TurboFan on hot paths.

**Q: What is a hidden class in V8?**
A: V8 assigns objects an internal "hidden class" (map/shape) based on their property structure. Objects with the same properties in the same order share a hidden class, allowing V8 to use fast property lookups. Dynamically adding/deleting properties changes the hidden class, causing transitions and slower property access.

**Q: How can you write JavaScript that is more performant for V8?**
A: 1) Initialize all object properties in constructor (same order → same hidden class), 2) Don't add properties dynamically after creation, 3) Don't delete properties (set to undefined instead), 4) Use typed arrays for numeric data, 5) Keep function argument types consistent, 6) Avoid `arguments` object in hot functions.
