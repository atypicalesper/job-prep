# Implicit and Explicit Binding

## Implicit Binding

Implicit binding is JavaScript's most common `this` mechanism. It infers context from the call-site syntax: whenever you call a function as a property access (`obj.method()`), JavaScript uses the object immediately to the left of the dot as `this`. No explicit declaration is needed — hence "implicit." The binding is created fresh at each call, meaning the same function can have different `this` values depending on which object it is called on.

When a function is called as a method of an object, `this` is implicitly set to that object — the object "before the dot."

```javascript
function greet() {
  return `Hello, I'm ${this.name}`;
}

const alice = { name: 'Alice', greet };
const bob   = { name: 'Bob',   greet };

alice.greet(); // "Hello, I'm Alice" — this = alice
bob.greet();   // "Hello, I'm Bob"   — this = bob

// The SAME function — different this depending on how called
```

### Nested Object Method Calls

When you chain property accesses (`a.b.method()`), only the object immediately to the left of the final dot matters for `this` binding — the rest of the chain is just used to look up the function reference. This means `outer.inner.greet()` sets `this` to `outer.inner`, not `outer`. A common mistake is expecting `this` to refer to the outermost object in a deep method call.

Only the object **immediately before the dot** matters:

```javascript
const outer = {
  name: 'outer',
  inner: {
    name: 'inner',
    greet() {
      return `Hello from ${this.name}`;
    }
  }
};

outer.inner.greet(); // "Hello from inner" — this = outer.inner (immediate left)
```

---

## Implicit Binding Loss

The most common `this` bug. Binding is lost when you extract a method from an object:

```javascript
const obj = {
  name: 'Obj',
  greet() { return `Hi from ${this.name}`; }
};

// Direct method call — implicit binding, works
obj.greet(); // "Hi from Obj"

// Extract and call as plain function — binding LOST
const fn = obj.greet;
fn(); // "Hi from undefined" (strict) or "Hi from [global.name]"

// Common scenarios where binding is lost:

// 1. Passing as callback
setTimeout(obj.greet, 1000); // 'this' is NOT obj when called!

// 2. Destructuring
const { greet } = obj;
greet(); // binding lost

// 3. Passing to higher-order function
[1].forEach(obj.greet); // binding lost

// 4. Event listener (the listener is called without obj context)
element.addEventListener('click', obj.greet); // binding lost
```

### Fixing Implicit Binding Loss

```javascript
// Fix 1: Arrow wrapper preserves the call site
setTimeout(() => obj.greet(), 1000); // ✅ obj.greet() has implicit binding

// Fix 2: .bind()
setTimeout(obj.greet.bind(obj), 1000); // ✅ explicit, permanent

// Fix 3: Wrapper function
setTimeout(function() { obj.greet(); }, 1000); // ✅ explicit call on obj
```

---

## Explicit Binding

Explicit binding lets you call any function with a `this` value of your choosing, regardless of where the function is defined or how it would normally be called. This is the solution for method borrowing (using one object's method on another) and for fixing `this` in callbacks. All three methods (`call`, `apply`, `bind`) set `this` explicitly; they differ in how they handle arguments and whether they invoke the function immediately.

Explicit binding overrides implicit binding. Uses `call()`, `apply()`, or `bind()`.

```javascript
function introduce(lang, level) {
  return `${this.name} codes in ${lang} (${level})`;
}

const dev = { name: 'Alice' };

// call — explicit this + spread args
introduce.call(dev, 'JavaScript', 'expert'); // "Alice codes in JavaScript (expert)"

// apply — explicit this + array args
introduce.apply(dev, ['TypeScript', 'intermediate']); // "Alice codes in TypeScript (intermediate)"

// bind — returns new function with this fixed
const aliceIntro = introduce.bind(dev);
aliceIntro('Python', 'beginner'); // "Alice codes in Python (beginner)"
aliceIntro('Go', 'learning');     // "Alice codes in Go (learning)"
```

---

## Hard Binding

Hard binding is the term for the permanent `this` lock that `bind()` creates. Internally, `bind` returns a new function that always invokes the original with the bound `this`, regardless of how the bound function is subsequently called. No other `call`, `apply`, or `bind` call can override it — the binding is irrevocable. This immutability is precisely the property that makes `bind` reliable for callbacks passed to external APIs: you know the `this` will always be correct, no matter what the caller does with the function.

`bind()` creates "hard binding" — `this` cannot be changed even with another `call`/`apply`:

```javascript
function greet() { return this.name; }

const alice = { name: 'Alice' };
const bob   = { name: 'Bob' };

const aliceGreet = greet.bind(alice); // hard bound to alice

aliceGreet();               // 'Alice'
aliceGreet.call(bob);       // 'Alice' — call CANNOT override bind
aliceGreet.apply(bob);      // 'Alice' — apply CANNOT override bind
aliceGreet.bind(bob)();     // 'Alice' — second bind CANNOT override first
```

This is why `bind` is used for event handlers and callbacks — you know `this` will always be correct.

---

## Explicit Binding Priority Over Implicit

```javascript
const obj1 = { name: 'obj1', greet() { return this.name; } };
const obj2 = { name: 'obj2' };

obj1.greet();            // 'obj1' — implicit
obj1.greet.call(obj2);  // 'obj2' — explicit wins!
```

---

## Real-World Patterns

### Method Borrowing

Method borrowing is a technique where you call a method that belongs to one object, but supply a different object as `this`. It avoids duplicating method definitions across objects that share similar structure. `call` and `apply` are the classic tools for this — they let you execute any function with any `this`, acting as a lightweight form of structural subtyping.

```javascript
// Borrow a method from one object to use on another
const logger = {
  prefix: '[INFO]',
  log(msg) { console.log(`${this.prefix} ${msg}`); }
};

const errorLogger = { prefix: '[ERROR]' };

// Borrow logger.log for errorLogger:
logger.log.call(errorLogger, 'Something failed');
// [ERROR] Something failed

// Or for one-time use:
['message 1', 'message 2'].forEach(
  logger.log.bind({ prefix: '[DEBUG]' })
);
```

### Super Pattern (pre-ES6)

Before ES6 `class` and `super`, the standard way to call a parent constructor from a child constructor was `ParentConstructor.call(this, args)`. This explicitly sets `this` inside the parent constructor to be the same `this` that the child constructor is building up, so the parent can initialize its own properties on the instance being created.

```javascript
function Animal(name) {
  this.name = name;
}

function Dog(name, breed) {
  Animal.call(this, name); // call parent constructor with Dog's this
  this.breed = breed;
}
```

---

## Interview Questions

**Q: What is implicit binding loss and when does it occur?**
A: When you extract a method from an object (assign to variable, pass as callback, destructure), the link between the function and the object is broken. The function is then called as a plain function, getting default `this` (global/undefined) instead of the original object.

**Q: Can you lose the binding on a bound function?**
A: No — `bind()` creates hard binding. `call` and `apply` cannot override a bound `this`. The only ways to use a different `this` on a bound function: don't use it, create a new unbound function, or invoke with `new` (which overrides bind for construction).

**Q: Which takes priority: call or bind?**
A: `bind` (hard binding) takes priority over `call`/`apply`. If you call `boundFn.call(other)`, `this` is still the bound value, not `other`.
