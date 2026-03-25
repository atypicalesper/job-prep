# call, apply, and bind

## call(thisArg, ...args)

`call` is the most direct way to invoke a function with a specific `this` and a list of arguments spread out individually. It is synchronous and returns the function's return value immediately. When you pass `null` or `undefined` as `thisArg` in non-strict mode, the engine substitutes the global object; in strict mode, `this` is set to exactly `null` or `undefined` as passed.

Calls a function with an explicitly set `this` and individual arguments:

```javascript
function greet(greeting, punctuation) {
  return `${greeting}, ${this.name}${punctuation}`;
}

const alice = { name: 'Alice' };
const bob   = { name: 'Bob' };

greet.call(alice, 'Hello', '!');  // "Hello, Alice!"
greet.call(bob, 'Hi', '.');       // "Hi, Bob."

// Passing null/undefined as thisArg:
greet.call(null, 'Hey', '!');   // In strict: this=null, 'Hey, undefined!'
                                 // Non-strict: this=global, 'Hey, [global.name]!'
```

---

## apply(thisArg, [argsArray])

`apply` is identical to `call` except that arguments are passed as an array instead of individually. It was the pre-ES6 mechanism for spreading an array as positional arguments to a function. In modern code, the spread operator (`fn.call(ctx, ...arr)`) is preferred, making `apply` mostly useful when you already have an array reference and no desire to spread it explicitly.

Same as `call` but arguments passed as an array:

```javascript
greet.apply(alice, ['Hello', '!']); // "Hello, Alice!"

// Practical use: spread array as args
const numbers = [3, 1, 4, 1, 5, 9, 2, 6];

Math.max(...numbers);             // 9 — modern spread
Math.max.apply(null, numbers);   // 9 — pre-ES6 equivalent

// Finding min/max in old codebases:
const max = Math.max.apply(null, numbers);
const min = Math.min.apply(null, numbers);
```

---

## bind(thisArg, ...partialArgs)

`bind` is fundamentally different from `call` and `apply`: it does not invoke the function. Instead, it returns a new function object that, when called, always runs the original function with the specified `this` and any pre-applied arguments. The `this` binding is irrevocable — no subsequent `call`, `apply`, or `bind` can change it. This permanence makes `bind` the right tool for creating stable callback references (e.g., passing a class method to an event listener without losing `this`).

Returns a **new function** with `this` permanently bound. Does NOT call the function.

```javascript
function multiply(a, b) {
  return a * b;
}

const double = multiply.bind(null, 2);  // 'a' partially applied as 2
double(5);  // 10 — b = 5
double(10); // 20 — b = 10

// Fixing this in callbacks:
class Button {
  constructor(label) {
    this.label = label;
    this.handleClick = this.handleClick.bind(this); // bind in constructor
  }

  handleClick() {
    console.log(`${this.label} clicked`);
  }
}

const btn = new Button('Submit');
// Safe to pass as callback — this is always the Button instance:
document.addEventListener('click', btn.handleClick);
```

---

## Key Differences

| | call | apply | bind |
|--|------|-------|------|
| Invokes? | Yes | Yes | No — returns new fn |
| Args format | Spread: `fn(a, b)` | Array: `fn([a,b])` | Partial: `fn(a)` returns `(b) => ...` |
| Use case | Borrow method | Array args | Fix `this`, partial application |

---

## Polyfill Implementations

Implementing `call`, `apply`, and `bind` from scratch is a classic interview challenge. The key insight for implementing `call` and `apply` is that you can temporarily attach the function as a method on the `context` object and then invoke it — this establishes implicit binding, making `this` equal to `context`. A unique Symbol key prevents collisions with existing properties. The `bind` polyfill must correctly handle partial application and must check whether it is being called with `new` (which overrides the bound `this` for construction).

### Implement Function.prototype.call

```javascript
Function.prototype.myCall = function(context, ...args) {
  context = context ?? globalThis; // handle null/undefined
  const key = Symbol(); // unique key to avoid conflicts
  context[key] = this;  // add function as method on context
  const result = context[key](...args); // call it (this = context)
  delete context[key];  // clean up
  return result;
};

function sayHi() { return `Hi from ${this.name}`; }
sayHi.myCall({ name: 'Alice' }); // "Hi from Alice"
```

### Implement Function.prototype.bind

```javascript
Function.prototype.myBind = function(context, ...presetArgs) {
  const fn = this; // the original function

  return function bound(...laterArgs) {
    // If called with new, this overrides the bound context
    if (this instanceof bound) {
      return new fn(...presetArgs, ...laterArgs);
    }
    return fn.call(context, ...presetArgs, ...laterArgs);
  };
};

function add(a, b) { return a + b; }
const add5 = add.myBind(null, 5);
add5(3); // 8
```

---

## Practical Patterns

### Borrowing Methods

Array-like objects (the `arguments` object, DOM `NodeList`, `HTMLCollection`) have numeric indices and a `length` property but do not inherit from `Array.prototype`. Before `Array.from` was widely available, `Array.prototype.slice.call(arrayLike)` was the standard way to convert them to real arrays. The same technique lets you use any `Array.prototype` method on any array-like object by supplying it as `this`.

```javascript
// Array methods on array-like objects
function sum() {
  // 'arguments' is array-like but not an Array
  return Array.prototype.reduce.call(arguments, (acc, n) => acc + n, 0);
}

sum(1, 2, 3, 4); // 10

// Or with NodeLists (browser):
const divs = document.querySelectorAll('div');
const arr = Array.prototype.slice.call(divs); // convert to array
// Modern: Array.from(divs)
```

### Safe hasOwnProperty

Objects can override `hasOwnProperty` as an own property — if they do, `obj.hasOwnProperty(key)` calls the overridden version, which may return incorrect results. By borrowing it from `Object.prototype` via `.call`, you bypass any override and call the original implementation directly. This is a classic defensive programming pattern for code that must work correctly on arbitrary objects.

```javascript
// An object might override hasOwnProperty:
const obj = { hasOwnProperty: () => false };
obj.hasOwnProperty('key'); // always false!

// Borrow from Object.prototype:
Object.prototype.hasOwnProperty.call(obj, 'key'); // correct!
```

### Partial Application Pattern

`bind` doubles as a partial application tool: any arguments you pass after `thisArg` are pre-applied to the bound function and prepended to any arguments provided at call time. This lets you derive specific, named functions from general ones — `get` and `post` from a generic `request` — reducing repetition and making call sites more readable. Use `null` as the `thisArg` when `this` is not relevant (e.g., utility functions that don't use it).

```javascript
function request(method, url, data) {
  return fetch(url, { method, body: JSON.stringify(data) });
}

const get  = request.bind(null, 'GET');
const post = request.bind(null, 'POST');

get('/api/users');
post('/api/users', { name: 'Alice' });
```

---

## bind vs Arrow Function

```javascript
class Timer {
  constructor() {
    this.count = 0;
  }

  // Option 1: bind in constructor
  constructor() {
    this.count = 0;
    this.tick = this.tick.bind(this);
  }
  tick() { this.count++; }

  // Option 2: class field arrow function (same effect)
  tick = () => { this.count++; } // arrow captures 'this' at definition
}

// Both allow:
const t = new Timer();
setInterval(t.tick, 1000); // this is always the Timer instance
```

| | bind | Arrow class field |
|--|------|------------------|
| When set | Manually in constructor | Automatically at instance creation |
| Prototype | Method on prototype | Own property per instance |
| Memory | Shared function, bound wrapper per instance | New function per instance |

---

## Interview Questions

**Q: What is the difference between call and apply?**
A: Both call a function with an explicit `this`, but `call` takes individual arguments (`fn.call(ctx, a, b)`) while `apply` takes an array (`fn.apply(ctx, [a, b])`). Functionally equivalent — `apply` was useful pre-spread syntax for passing arrays as arguments.

**Q: Can you call bind multiple times?**
A: The first `bind` permanently fixes `this`. Calling `bind` again on a bound function returns a new function with the same `this` (the second `bind` cannot override the first's `this`). However, additional partial arguments from the second `bind` ARE added.

**Q: Implement bind from scratch.**
A: (See polyfill above.) Key points: return a new function, use `apply` to call original with bound `this` and merged args, handle `new` invocation correctly.

**Q: What is the difference between bind and arrow functions for fixing this?**
A: Arrow functions fix `this` lexically (at definition time in the enclosing scope). `bind` explicitly fixes `this` to a specific value. Arrow class fields create a new function per instance (more memory), while `bind` wraps the shared prototype method.
