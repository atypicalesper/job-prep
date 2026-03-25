# Virtual DOM and Reconciliation

## What is the Virtual DOM?

The Virtual DOM (VDOM) is a lightweight, in-memory JavaScript representation of the real DOM. Instead of manipulating the browser DOM directly (which is expensive), React:

1. Maintains a virtual copy of the UI in memory
2. When state changes, creates a **new** virtual tree
3. **Diffs** the new tree against the old tree
4. Computes the **minimal set of changes** needed
5. **Batches** those changes and applies them to the real DOM

```
State Change → New VDOM Tree → Diff with Old Tree → Patch Real DOM
```

---

## Why Not Just Update the DOM Directly?

DOM operations are slow compared to JavaScript object manipulation:

```javascript
// Slow: Direct DOM manipulation for each change
document.getElementById('name').textContent = 'Alice';
document.getElementById('age').textContent = '30';
document.getElementById('role').textContent = 'Engineer';
// Each call triggers style recalculation, layout, paint

// Fast: React batches these into a single DOM update
setState({ name: 'Alice', age: 30, role: 'Engineer' });
// React computes diff → applies ONE batch update
```

Real DOM nodes are heavyweight objects with hundreds of properties. A VDOM node is a plain JS object:

```javascript
// A VDOM node (simplified React element)
{
  type: 'div',
  props: {
    className: 'card',
    children: [
      { type: 'h1', props: { children: 'Hello' } },
      { type: 'p',  props: { children: 'World' } }
    ]
  }
}
```

---

## The Diffing Algorithm

React's diffing algorithm (also called reconciliation) is the process of comparing the new VDOM tree produced by a render against the previous one to compute the minimal set of real DOM changes. A naive tree diff of two trees takes O(n³) time — too slow for large UIs. React reduces this to O(n) by making two heuristic assumptions that hold true for almost all practical React applications: elements of different types produce completely different trees, and list items have stable identity keys. Violating these assumptions (e.g., using random keys) causes React to fall back to worst-case behavior and destroy/rebuild subtrees unnecessarily.

### Assumption 1: Different types produce different trees

```jsx
// Old tree
<div>
  <Counter />
</div>

// New tree — parent changed from div to section
<section>
  <Counter />
</section>

// React DESTROYS the entire <div> subtree (including Counter)
// and rebuilds <section> from scratch.
// Counter's state is LOST.
```

### Assumption 2: Keys identify stable elements across renders

```jsx
// Without keys — React compares by index
<ul>
  <li>Alice</li>    {/* index 0 */}
  <li>Bob</li>      {/* index 1 */}
</ul>

// Insert at beginning
<ul>
  <li>Charlie</li>  {/* index 0 — React thinks Alice → Charlie (mutate) */}
  <li>Alice</li>    {/* index 1 — React thinks Bob → Alice (mutate) */}
  <li>Bob</li>      {/* index 2 — React thinks this is new (create) */}
</ul>
// Result: React mutates ALL three items — terrible performance

// With keys — React matches by key
<ul>
  <li key="charlie">Charlie</li>  {/* new — insert */}
  <li key="alice">Alice</li>      {/* existing — keep */}
  <li key="bob">Bob</li>          {/* existing — keep */}
</ul>
// Result: React inserts ONE node — much better
```

---

## Reconciliation Process — Step by Step

```
                        setState()
                            │
                            ▼
                  ┌──────────────────┐
                  │ Create new VDOM  │
                  │ tree (render)    │
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ Diff new vs old  │
                  │ VDOM trees       │
                  └────────┬─────────┘
                           │
                  ┌────────┴─────────┐
                  │                  │
             Same type?         Different type?
                  │                  │
                  ▼                  ▼
          Compare props       Destroy old subtree
          and children        Build new subtree
                  │
                  ▼
          Update only changed
          DOM attributes
                  │
                  ▼
          Recurse on children
          (using keys if available)
```

### What gets compared:

```jsx
// 1. Element type comparison
<div className="old" />  →  <div className="new" />
// Same type (div) → update className attribute only

<div className="old" />  →  <span className="old" />
// Different type → destroy div, create span from scratch

// 2. Component type comparison
<MyButton color="red" />  →  <MyButton color="blue" />
// Same component → re-render with new props, preserve state

<MyButton color="red" />  →  <YourButton color="red" />
// Different component → unmount MyButton, mount YourButton
// (even if they render identical JSX!)
```

---

## Fiber Architecture

React 16 introduced the **Fiber** architecture, replacing the old synchronous "stack" reconciler. The key insight: rendering can be interrupted.

Fiber is React's internal reimplementation of the reconciliation algorithm as a linked list of work units rather than a recursive call stack. The old stack reconciler had to complete an entire render synchronously in one pass — if the component tree was large, the JS thread was blocked for tens of milliseconds, causing dropped frames. Fiber makes rendering interruptible: React can pause after processing any individual fiber node, yield control to the browser for a frame, then resume. This is the foundation that makes concurrent features like `useTransition`, `Suspense`, and prioritized rendering possible.

### The Problem with Synchronous Rendering

```
Old reconciler (stack):
  render Component A
    render Component B
      render Component C
      render Component D
    render Component E
  // ALL must complete before browser can paint
  // Long component trees → dropped frames → janky UI
```

### What is a Fiber?

A Fiber is a JavaScript object representing a unit of work. Each React element gets a corresponding Fiber node:

```javascript
// Simplified Fiber node structure
{
  type: MyComponent,           // component function/class or HTML tag
  key: null,                   // reconciliation key
  stateNode: domElement,       // reference to real DOM node (or component instance)
  child: fiberNode,            // first child
  sibling: fiberNode,          // next sibling
  return: parentFiberNode,     // parent

  pendingProps: { color: 'red' },
  memoizedState: { count: 0 },

  // Work tracking
  effectTag: 'UPDATE',        // what needs to happen (PLACEMENT, UPDATE, DELETION)
  alternate: oldFiberNode,    // link to the "current" fiber (double buffering)
}
```

### Two Phases of Fiber Reconciliation

```
Phase 1: RENDER (interruptible)               Phase 2: COMMIT (synchronous)
┌────────────────────────────────┐             ┌──────────────────────────┐
│ • Build work-in-progress tree  │             │ • Apply DOM mutations    │
│ • Call render / function body  │     ──►     │ • Call useLayoutEffect   │
│ • Compute diffs                │             │ • Call useEffect (async) │
│ • CAN BE PAUSED / RESTARTED   │             │ • CANNOT be interrupted  │
└────────────────────────────────┘             └──────────────────────────┘
```

**Render phase** (also called "reconciliation"): React walks the fiber tree, calling component functions, computing diffs. This work can be split across multiple frames. React can pause to let the browser handle user input, then resume.

**Commit phase**: React applies all the computed changes to the real DOM in one synchronous pass. This cannot be interrupted — the user sees a consistent UI.

---

## Keys — Why They Matter

Keys are how React identifies which elements in a list correspond to which elements across renders. Without keys, React compares list items by their position (index), which causes incorrect state reuse and unnecessary DOM mutations when items are added, removed, or reordered. A key must be stable (not change across renders), unique among siblings, and not based on the item's index if the list order can change. Using a database-assigned ID is almost always the right choice.

### Anti-pattern: Using Array Index as Key

```jsx
function TodoList({ todos }) {
  return (
    <ul>
      {todos.map((todo, index) => (
        // BAD: index as key
        <li key={index}>
          <input type="checkbox" />
          {todo.text}
        </li>
      ))}
    </ul>
  );
}

// State: todos = ["Buy milk", "Walk dog", "Code"]
// User checks "Buy milk" checkbox
// Then deletes "Buy milk" from the array

// Before: index 0="Buy milk"✓, index 1="Walk dog", index 2="Code"
// After:  index 0="Walk dog",  index 1="Code"
// React sees: key=0 changed text (mutate), key=1 changed text (mutate), key=2 removed
// BUG: The checkbox state stays on index 0 — now "Walk dog" appears checked!
```

### Correct: Stable Unique IDs

```jsx
function TodoList({ todos }) {
  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>
          <input type="checkbox" />
          {todo.text}
        </li>
      ))}
    </ul>
  );
}
// React correctly matches by ID, removes the right element,
// checkbox state stays with "Buy milk" which is now gone
```

---

## Re-render Behavior — Code Examples

Understanding what triggers a re-render — and what it costs — is the foundation of React performance work. A re-render means calling the component function and diffing the returned VDOM; it does not necessarily mean updating the real DOM. Most re-renders are fast and harmless. The problem arises when expensive computations run on every render or when many components re-render due to a single state change far up the tree. The tools to address this — `React.memo`, `useMemo`, `useCallback`, and structural patterns like moving state down — are only worth reaching for after you have measured an actual problem with React DevTools Profiler.

### When Does a Component Re-render?

```jsx
function Parent() {
  const [count, setCount] = useState(0);

  console.log('Parent renders');

  return (
    <div>
      <button onClick={() => setCount(c => c + 1)}>
        Count: {count}
      </button>
      <Child name="Alice" />
    </div>
  );
}

function Child({ name }) {
  console.log('Child renders');
  return <p>Hello {name}</p>;
}

// Click button:
// Output:
//   "Parent renders"
//   "Child renders"     ← Child re-renders even though props didn't change!
```

**Rule: When a parent re-renders, ALL children re-render by default.** This is because React doesn't know if the child's output depends on something that changed. The re-render itself is cheap (it's just calling the function and diffing VDOM). The expensive part is DOM mutations, which only happen if the diff finds changes.

### Preventing Unnecessary Re-renders

```jsx
const Child = React.memo(function Child({ name }) {
  console.log('Child renders');
  return <p>Hello {name}</p>;
});

// Now clicking the parent button:
// Output:
//   "Parent renders"
//   (Child does NOT re-render — props unchanged, memo kicks in)
```

### Gotcha: Object/Function Props Break React.memo

```jsx
function Parent() {
  const [count, setCount] = useState(0);

  // This creates a NEW object every render — breaks memo
  const style = { color: 'red' };

  // This creates a NEW function every render — breaks memo
  const handleClick = () => console.log('clicked');

  return (
    <div>
      <button onClick={() => setCount(c => c + 1)}>+</button>
      <MemoChild style={style} onClick={handleClick} />
    </div>
  );
}

const MemoChild = React.memo(function MemoChild({ style, onClick }) {
  console.log('MemoChild renders');
  return <p style={style} onClick={onClick}>Hello</p>;
});

// MemoChild re-renders EVERY TIME because style and onClick are new references
// Fix: useMemo for objects, useCallback for functions
```

---

## Interview Quick Hits

**Q: Is the Virtual DOM faster than the real DOM?**
No. The Virtual DOM adds overhead (maintaining two trees + diffing). It's faster than *naive* DOM manipulation (updating everything). A hand-optimized vanilla JS app can be faster. The VDOM trades peak performance for developer ergonomics.

**Q: Can React skip the VDOM diff?**
Yes — `React.memo` skips the diff if props haven't changed. `useMemo` can memoize expensive computations. And the compiler (React Compiler / React Forget) aims to do this automatically.

**Q: What happens if you use `Math.random()` as a key?**
Every render generates new keys → React destroys and rebuilds every element from scratch. All component state is lost. Extremely bad for performance.

**Q: What is double buffering in Fiber?**
React maintains two fiber trees: "current" (what's on screen) and "work-in-progress" (being built). When the WIP tree is complete, React swaps them atomically. The old current becomes the WIP for the next update.

**Q: Does React always re-render children when parent renders?**
Yes, by default. `React.memo` opts out. The upcoming React Compiler aims to memoize automatically.
