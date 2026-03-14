# `this` Keyword — Tricky Interview Questions

---

## Q1: Method Extracted from Object

```javascript
const obj = {
  x: 10,
  getX() { return this.x; }
};

const getX = obj.getX;
console.log(getX()); // ?
```

**Answer (strict mode):** `TypeError: Cannot read properties of undefined`
**Answer (non-strict):** `undefined` (reads `global.x` which is undefined)

**Why:** Extracting `getX` breaks the implicit binding. Plain call → default binding (undefined in strict).

---

## Q2: this in Nested Function

```javascript
const obj = {
  val: 42,
  outer() {
    function inner() {
      return this.val;
    }
    return inner();
  }
};

console.log(obj.outer()); // ?
```

**Answer:** `undefined` (strict) or `global.val` (non-strict)

**Why:** `inner()` is called as a plain function inside `outer`. Even though `outer` has correct `this`, `inner` creates its own `this` binding via default binding.

**Fix:** Arrow function or `const self = this`:
```javascript
outer() {
  const inner = () => this.val; // inherits this from outer
  return inner();
}
```

---

## Q3: this in setTimeout

```javascript
function Counter() {
  this.count = 0;
  setTimeout(function() {
    this.count++;
    console.log(this.count);
  }, 100);
}

new Counter();
```

**Answer:** `NaN` (non-strict) — `this` inside setTimeout callback is `global`. `global.count` is `undefined`. `undefined++` is `NaN`.

**Strict mode:** `TypeError` — `this` is `undefined`.

---

## Q4: Arrow in Object Literal

```javascript
const obj = {
  name: 'obj',
  getName: () => this.name
};

console.log(obj.getName()); // ?
```

**Answer (Node.js module):** `undefined`
**Answer (browser global scope):** `''` or `window.name`

**Why:** Arrow function captures `this` from the SURROUNDING SCOPE when the object literal is evaluated. In Node.js, the top-level `this` in a module is `{}` (module.exports). In a browser, it's `window`.

---

## Q5: call + Arrow Function

```javascript
const arrow = () => this.x;
const obj = { x: 99 };

console.log(arrow.call(obj)); // ?
console.log(arrow.apply(obj)); // ?
console.log(arrow.bind(obj)()); // ?
```

**Answer:** All three log the same value — whatever `this.x` is in the enclosing lexical scope (likely `undefined`). Arrow functions IGNORE `call`/`apply`/`bind` for `this`.

---

## Q6: new + bind — Which Wins?

```javascript
function Foo() {
  this.val = 'from new';
}

const obj = { val: 'from obj' };
const BoundFoo = Foo.bind(obj);

const instance = new BoundFoo();
console.log(instance.val); // ?
console.log(obj.val);      // ?
```

**Answer:** `instance.val = 'from new'`, `obj.val = 'from obj'`

**Why:** `new` takes priority over `bind`. When used with `new`, `this` is the newly created object — the bound `this` is ignored. The new instance gets `val = 'from new'`.

---

## Q7: Method Chaining and this

```javascript
class Builder {
  constructor() {
    this.parts = [];
  }

  add(part) {
    this.parts.push(part);
    return this; // fluent interface
  }

  build() {
    return this.parts.join(', ');
  }
}

const result = new Builder()
  .add('A')
  .add('B')
  .add('C')
  .build();

console.log(result); // ?
```

**Answer:** `'A, B, C'`

**Why:** Each method returns `this` (the Builder instance), allowing chaining. `this` is correctly bound via implicit binding at each call.

---

## Q8: Event Delegation and this

```javascript
const list = document.getElementById('list');

list.addEventListener('click', function(e) {
  console.log(this);      // ?
  console.log(e.target);  // ?
  console.log(this === e.currentTarget); // ?
});
```

**Answer:**
- `this` = `list` (the element the listener is attached to)
- `e.target` = the actual clicked element (could be a child `<li>`)
- `this === e.currentTarget` → `true` (currentTarget is always where listener is attached)

---

## Q9: Prototype Method and this

```javascript
function Animal(name) {
  this.name = name;
}

Animal.prototype.speak = function() {
  return `${this.name} speaks`;
};

const cat = new Animal('Cat');
const speak = cat.speak;

speak(); // ?
cat.speak(); // ?
```

**Answer:**
- `speak()` → `'undefined speaks'` (or error in strict)
- `cat.speak()` → `'Cat speaks'`

**Why:** Prototype methods work via implicit binding. `cat.speak()` → `this = cat`. `speak()` → default binding → `this = global`.

---

## Q10: Nested Arrow Functions

```javascript
const obj = {
  level: 'outer',
  method: function() {
    const arrow1 = () => {
      const arrow2 = () => {
        return this.level;
      };
      return arrow2();
    };
    return arrow1();
  }
};

console.log(obj.method()); // ?
```

**Answer:** `'outer'`

**Why:** `method()` is called with implicit binding (`this = obj`). `arrow1` captures `this` from `method` = `obj`. `arrow2` captures `this` from `arrow1` which is `obj`. All arrows in the chain share the same `this`.

---

## Q11: Class Static Method and this

```javascript
class MathUtil {
  static square(x) {
    return x * x;
  }

  static cube(x) {
    return this.square(x) * x; // 'this' here is?
  }
}

console.log(MathUtil.cube(3)); // ?
```

**Answer:** `27`

**Why:** Static methods are called on the CLASS itself, not instances. `MathUtil.cube(3)` → `this = MathUtil` (the class). `this.square` = `MathUtil.square`. Works correctly.

**But:**
```javascript
const { cube } = MathUtil;
cube(3); // TypeError — this is undefined (strict mode in classes)
```

---

## Q12: this in forEach vs for...of

```javascript
class Printer {
  constructor(prefix) {
    this.prefix = prefix;
  }

  printAll(items) {
    // forEach with regular function
    items.forEach(function(item) {
      console.log(this.prefix + item); // 'this' = ?
    });
  }

  printAllFixed(items) {
    items.forEach(item => {
      console.log(this.prefix + item); // 'this' = ?
    });
  }
}

const p = new Printer('>>> ');
p.printAll(['a', 'b']);       // ?
p.printAllFixed(['a', 'b']); // ?
```

**Answer:**
- `printAll`: `TypeError` or `undefined` + item — `this` inside forEach callback is `undefined` (strict) or global
- `printAllFixed`: `'>>> a'`, `'>>> b'` ✅ — arrow inherits `this` from `printAllFixed`

**Note:** `forEach` accepts a second argument as `thisArg`:
```javascript
items.forEach(function(item) {
  console.log(this.prefix + item);
}, this); // pass 'this' as context — also works!
```

---

## Q13: Getter and this

```javascript
const obj = {
  _name: 'Alice',
  get name() {
    return this._name;
  }
};

const { name } = obj; // destructure getter
console.log(name);    // ?
```

**Answer:** `undefined`

**Why:** Destructuring a getter invokes it immediately with `this = obj`, returning `'Alice'`. Wait — actually, destructuring a getter from an object calls it once with `this = obj`. Let me re-examine:

Actually `const { name } = obj` calls the getter with `this = obj`, returns `'Alice'`, and assigns that string to `name`. So `name = 'Alice'`.

**Corrected answer:** `'Alice'` — getter is called during destructuring.

---

## Q14: Tricky Class Inheritance

```javascript
class Base {
  constructor() {
    this.type = 'base';
  }
  getType() { return this.type; }
}

class Child extends Base {
  constructor() {
    super();
    this.type = 'child';
  }
}

const c = new Child();
console.log(c.getType()); // ?
console.log(c instanceof Base); // ?
```

**Answer:** `'child'`, `true`

**Why:** `c.getType()` finds `getType` on Base.prototype. Calls it with `this = c` (Child instance). `this.type` on `c` is `'child'`. `instanceof Base` = true because Child.prototype's chain includes Base.prototype.

---

## Q15: The Problematic Pattern

```javascript
const handlers = {
  count: 0,
  onClick() { this.count++; },
  onHover() { this.count++; }
};

// All these lose binding:
document.addEventListener('click',     handlers.onClick);
document.addEventListener('mouseover', handlers.onHover);

// Even if we call it later:
setTimeout(handlers.onClick, 0);

// How to fix ALL of them at once?
```

**Fix — auto-bind all methods:**
```javascript
function autoBind(obj) {
  Object.getOwnPropertyNames(Object.getPrototypeOf(obj))
    .filter(key => typeof obj[key] === 'function' && key !== 'constructor')
    .forEach(key => { obj[key] = obj[key].bind(obj); });
  return obj;
}

// Or in constructor with class:
class Handlers {
  count = 0;
  onClick = () => { this.count++; }  // arrow class field
  onHover = () => { this.count++; }  // always bound
}
```

---

## Q16: Arrow vs Regular — Returned from Factory

```javascript
function factory() {
  this.id = 1;
  return {
    id: 2,
    arrow: () => this.id,
    regular() { return this.id; }
  };
}

const obj = new factory();
console.log(obj.arrow());   // ?
console.log(obj.regular()); // ?
```

**Answer:** `1`, `2`

**Why:** `new factory()` sets `this` to a fresh object with `id = 1`. The arrow captures that `this` lexically, so `arrow()` returns `1`. But `new` with an explicit object return uses the returned object — `obj` is `{ id: 2, arrow, regular }`. `regular()` has implicit binding to `obj`, so `this.id = 2`.

---

## Q17: call/apply/bind Chaining

```javascript
function greet() {
  return `Hello, ${this.name}`;
}

const a = { name: 'Alice' };
const b = { name: 'Bob' };
const c = { name: 'Charlie' };

const bound = greet.bind(a).bind(b);
console.log(bound());           // ?
console.log(bound.call(c));     // ?
```

**Answer:** `'Hello, Alice'`, `'Hello, Alice'`

**Why:** `bind` is permanent and cannot be overridden. The first `.bind(a)` locks `this` to `a`. A second `.bind(b)` wraps the already-bound function — `this` is still `a`. `.call(c)` on a bound function also cannot override the binding.

---

## Q18: setTimeout with Method — Three Variations

```javascript
class Timer {
  constructor() { this.seconds = 0; }

  startA() {
    setTimeout(this.tick, 100);        // variation A
  }
  startB() {
    setTimeout(() => this.tick(), 100); // variation B
  }
  startC() {
    setTimeout(this.tick.bind(this), 100); // variation C
  }

  tick() {
    this.seconds++;
    console.log(this.seconds);
  }
}

const t = new Timer();
t.startA(); // ?
t.startB(); // ?
t.startC(); // ?
```

**Answer:**
- A: `TypeError` — `this.tick` is extracted (loses binding), `this` in callback is `undefined` (strict)
- B: `1` — arrow captures `this` from `startB`, which is the Timer instance
- C: `1` (or `2` if run after B) — `bind` locks `this` to the Timer instance

---

## Q19: setInterval Accumulating Closures

```javascript
const counter = {
  count: 0,
  start() {
    setInterval(function() {
      this.count++;
      console.log(this.count);
    }, 1000);
  }
};

counter.start();
// After 3 seconds, what's logged?
```

**Answer (non-strict):** `NaN`, `NaN`, `NaN`

**Why:** The regular function callback gets `this = global`. `global.count` is `undefined`. `undefined++ = NaN`. Each tick: `NaN++ = NaN`.

---

## Q20: DOM Event Handler — Arrow vs Regular

```javascript
const button = document.querySelector('#btn');

button.addEventListener('click', function() {
  console.log('regular:', this.id); // ?
});

button.addEventListener('click', () => {
  console.log('arrow:', this.id);   // ?
});
```

**Answer:**
- Regular: `'regular: btn'` — `this` is the element the listener is on
- Arrow: `'arrow: undefined'` — `this` is lexical (module/global scope), not the element

**Why:** The DOM sets `this` to the event target for regular function handlers. Arrow functions ignore this — they use their enclosing scope's `this`.

---

## Q21: Event Handler with bind

```javascript
class App {
  constructor() {
    this.name = 'MyApp';
    const btn = document.querySelector('#btn');
    btn.addEventListener('click', this.handleClick);       // A
    btn.addEventListener('click', this.handleClick.bind(this)); // B
  }

  handleClick() {
    console.log(this.name);
  }
}

new App();
// What happens when button is clicked?
```

**Answer:**
- A: `undefined` — `this` is the button element, which has no `name` property
- B: `'MyApp'` — `bind` forces `this` to the App instance

**Caveat:** With B, you can't `removeEventListener` easily because `bind` returns a new function reference each time.

---

## Q22: Class Method vs Plain Object Method

```javascript
// Plain object
const plain = {
  x: 1,
  getX() { return this.x; }
};

// Class instance
class MyClass {
  x = 2;
  getX() { return this.x; }
}

const inst = new MyClass();

const fn1 = plain.getX;
const fn2 = inst.getX;

console.log(fn1()); // ?
console.log(fn2()); // ?
```

**Answer (strict mode / ESM):** Both throw `TypeError` — `this` is `undefined` in strict mode when called as plain functions. Class bodies are always strict.

**Answer (non-strict for plain):** `fn1()` → `undefined` (global.x), `fn2()` → still `TypeError` (classes enforce strict mode).

---

## Q23: Class Field Arrow Method

```javascript
class Dog {
  name = 'Rex';

  bark = () => {
    return `${this.name} barks!`;
  };
}

const d = new Dog();
const bark = d.bark;
console.log(bark()); // ?

class Puppy extends Dog {
  name = 'Tiny';
}

const p = new Puppy();
console.log(p.bark()); // ?
```

**Answer:** `'Rex barks!'`, `'Tiny barks!'`

**Why:** Arrow class fields capture `this` from the constructor. `bark` is assigned in the constructor with `this` = the instance. Extracted `bark` keeps `this = d`, so `d.name = 'Rex'`. For `Puppy`, `this` is the Puppy instance, and `name` gets overwritten to `'Tiny'`.

---

## Q24: Getter/Setter with this

```javascript
const user = {
  _first: 'John',
  _last: 'Doe',

  get full() {
    return `${this._first} ${this._last}`;
  },

  set full(val) {
    [this._first, this._last] = val.split(' ');
  }
};

user.full = 'Jane Smith';
console.log(user.full);   // ?
console.log(user._first); // ?
```

**Answer:** `'Jane Smith'`, `'Jane'`

**Why:** Getter/setter `this` is the object before the dot — `user`. The setter splits and assigns to `user._first` and `user._last`. The getter reads them back.

---

## Q25: Getter Inherited via Prototype

```javascript
const base = {
  _val: 10,
  get val() { return this._val * 2; }
};

const child = Object.create(base);
child._val = 50;

console.log(child.val);  // ?
console.log(base.val);   // ?
```

**Answer:** `100`, `20`

**Why:** `child.val` triggers the inherited getter, but `this` is `child` (the receiver), so `this._val = 50 → 100`. `base.val` triggers the getter with `this = base`, so `this._val = 10 → 20`.

---

## Q26: Destructured Method Loses this

```javascript
class API {
  baseUrl = 'https://api.example.com';

  fetch(path) {
    return `${this.baseUrl}${path}`;
  }
}

const api = new API();
const { fetch } = api;

console.log(api.fetch('/users'));  // ?
console.log(fetch('/users'));      // ?
```

**Answer:**
- `api.fetch('/users')` → `'https://api.example.com/users'`
- `fetch('/users')` → `TypeError` — `this` is `undefined` (strict mode in class), `this.baseUrl` throws

**Why:** Destructuring extracts the function reference. It's now a standalone function with no implicit binding.

---

## Q27: Destructured with Default and this

```javascript
const config = {
  debug: true,
  getMode() { return this.debug ? 'DEBUG' : 'PROD'; }
};

function init({ getMode } = config) {
  console.log(getMode()); // ?
}

init(config);
init();
```

**Answer:** Both calls → `TypeError` (strict) or unpredictable (non-strict)

**Why:** In both cases, `getMode` is destructured out of the object — it's a bare function reference. `this` is not `config`.

---

## Q28: Promise Callback this

```javascript
const service = {
  data: [1, 2, 3],

  load() {
    return Promise.resolve().then(function() {
      return this.data;
    });
  },

  loadArrow() {
    return Promise.resolve().then(() => {
      return this.data;
    });
  }
};

service.load().then(console.log);      // ?
service.loadArrow().then(console.log); // ?
```

**Answer:**
- `load()` → `TypeError` or `undefined` — regular function in `.then()` has default binding
- `loadArrow()` → `[1, 2, 3]` — arrow captures `this` from `loadArrow`, which is `service`

---

## Q29: Promise.prototype.then Does Not Bind this

```javascript
class DataStore {
  items = [];

  addItem(item) {
    this.items.push(item);
    return this;
  }

  fetchAndAdd() {
    return fetch('/api/item')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        this.addItem(data); // ?
      });
  }
}
```

**Answer:** `TypeError: this.addItem is not a function`

**Why:** `.then()` invokes its callback as a plain function. `this` is `undefined` (strict) or `global` (non-strict). Neither has `addItem`.

**Fix:** Use arrow: `.then((data) => { this.addItem(data); })`

---

## Q30: async/await Method Extraction

```javascript
class UserService {
  name = 'UserService';

  async getUser(id) {
    // simulate async
    return { id, from: this.name };
  }
}

const svc = new UserService();
const getUser = svc.getUser;

const r1 = await svc.getUser(1);
const r2 = await getUser(2);

console.log(r1); // ?
console.log(r2); // ?
```

**Answer:**
- `r1` → `{ id: 1, from: 'UserService' }`
- `r2` → `TypeError` — `this` is `undefined` in strict mode, `this.name` throws

**Why:** `async` methods are still regular methods. Extracting them loses `this` just like any other method.

---

## Q31: async/await this Across await Boundaries

```javascript
const obj = {
  val: 'original',

  async run() {
    console.log(this.val);      // ?
    await new Promise(r => setTimeout(r, 100));
    console.log(this.val);      // ?
  }
};

obj.val = 'modified';
await obj.run();
```

**Answer:** `'modified'`, `'modified'`

**Why:** `this` is captured once at call time via implicit binding (`obj`). After `await` resumes, `this` is still `obj`. And `obj.val` was set to `'modified'` before `run()` was called.

---

## Q32: forEach thisArg Parameter

```javascript
class Transformer {
  multiplier = 3;

  transform(arr) {
    return arr.map(function(x) {
      return x * this.multiplier;
    }, this); // <-- second argument
  }
}

const t = new Transformer();
console.log(t.transform([1, 2, 3])); // ?
```

**Answer:** `[3, 6, 9]`

**Why:** `Array.prototype.map` accepts an optional `thisArg` as its second parameter. Passing `this` sets the callback's `this` to the Transformer instance. Works for `forEach`, `filter`, `find`, `every`, `some` too — but NOT for `reduce`.

---

## Q33: map with Method Reference

```javascript
const obj = {
  factor: 10,
  multiply(x) { return x * this.factor; }
};

const result = [1, 2, 3].map(obj.multiply);
console.log(result); // ?
```

**Answer:** `[NaN, NaN, NaN]` (non-strict) or `TypeError` (strict)

**Why:** `obj.multiply` is extracted as a bare function. `map` calls it with default binding. `this.factor` is `undefined`, so `x * undefined = NaN`.

**Fix:** `.map(x => obj.multiply(x))` or `.map(obj.multiply, obj)` or `.map(obj.multiply.bind(obj))`

---

## Q34: Generator Function and this

```javascript
const obj = {
  items: ['a', 'b', 'c'],

  *iterate() {
    for (const item of this.items) {
      yield `${this.prefix}-${item}`;
    }
  },

  prefix: 'X'
};

const gen = obj.iterate();
console.log(gen.next().value); // ?
console.log(gen.next().value); // ?
```

**Answer:** `'X-a'`, `'X-b'`

**Why:** Generator methods bind `this` via implicit binding at call time (`obj.iterate()`). Once bound, `this` stays as `obj` across all `.next()` calls — the generator resumes in the same scope.

---

## Q35: Generator Extracted Loses this

```javascript
const obj = {
  data: [10, 20],
  *gen() {
    yield* this.data;
  }
};

const g1 = obj.gen();
console.log([...g1]); // ?

const genFn = obj.gen;
const g2 = genFn();
console.log([...g2]); // ?
```

**Answer:**
- `[...g1]` → `[10, 20]`
- `[...g2]` → `TypeError` — `this` is `undefined` (strict), `this.data` throws

---

## Q36: Proxy and this — The Trap

```javascript
const target = {
  name: 'target',
  greet() {
    return `Hello from ${this.name}`;
  }
};

const proxy = new Proxy(target, {
  get(obj, prop, receiver) {
    return Reflect.get(obj, prop, receiver);
  }
});

console.log(proxy.greet()); // ?
console.log(proxy.name);    // ?
```

**Answer:** `'Hello from target'`, `'target'`

**Why:** `proxy.greet()` — the `get` trap returns the function. When called as `proxy.greet()`, `this` inside `greet` is the proxy. But since `proxy.name` also goes through the get trap and returns `'target'`, the result is correct. The proxy is transparent here.

---

## Q37: Proxy this Leak with Private-like Pattern

```javascript
const _secret = new WeakMap();

class Vault {
  constructor(secret) {
    _secret.set(this, secret);
  }

  getSecret() {
    return _secret.get(this);
  }
}

const vault = new Vault('password123');
const proxy = new Proxy(vault, {});

console.log(vault.getSecret()); // ?
console.log(proxy.getSecret()); // ?
```

**Answer:** `'password123'`, `undefined`

**Why:** `proxy.getSecret()` calls `getSecret` with `this = proxy`. But `_secret.set(this, ...)` was called with `this = vault` (the real object). `_secret.get(proxy)` returns `undefined` — the proxy is a different object than the target.

---

## Q38: eval and this

```javascript
'use strict';
const obj = {
  x: 42,
  test() {
    return eval('this.x');
  }
};

console.log(obj.test()); // ?
console.log(eval('this')); // ? (module scope)
```

**Answer:**
- `obj.test()` → `42` — `eval` inside a method shares the same `this` as the method
- Top-level `eval('this')` → `undefined` (strict mode) or `global` (non-strict) or `module.exports` (Node CJS)

**Why:** Direct `eval` inherits the enclosing scope's `this`. It does NOT create its own `this` binding.

---

## Q39: Indirect eval and this

```javascript
const obj = {
  x: 99,
  test() {
    const indirectEval = eval;
    return indirectEval('this.x');
  }
};

console.log(obj.test()); // ?
```

**Answer:** `undefined` (strict) or global's `x` (non-strict)

**Why:** Indirect eval (`(0, eval)(...)` or assigning eval to a variable) runs in the global scope, not the enclosing scope. `this` becomes the global object, not `obj`.

---

## Q40: IIFE and this

```javascript
const obj = {
  val: 'hello',

  init() {
    (function() {
      console.log(this.val); // ?
    })();

    (() => {
      console.log(this.val); // ?
    })();
  }
};

obj.init();
```

**Answer:**
- Regular IIFE: `undefined` (strict) or global's `val` (non-strict) — plain function call
- Arrow IIFE: `'hello'` — arrow captures `this` from `init`, which is `obj`

---

## Q41: Module Scope this (ESM vs CJS)

```javascript
// In ES Module (.mjs or "type": "module")
console.log(this); // ?

// In CommonJS (.cjs or default Node)
console.log(this); // ?

// In browser <script>
console.log(this); // ?

// In browser <script type="module">
console.log(this); // ?
```

**Answer:**
- ESM: `undefined` — ES modules have strict mode, top-level `this` is `undefined`
- CJS: `{}` — top-level `this` is `module.exports` (initially `{}`)
- Browser `<script>`: `Window` — global scope `this` is `window`
- Browser `<script type="module">`: `undefined` — module scope, strict mode

---

## Q42: Constructor Without new

```javascript
function Person(name) {
  this.name = name;
  return this;
}

const p1 = new Person('Alice');
const p2 = Person('Bob');

console.log(p1.name);          // ?
console.log(p2.name);          // ?
console.log(p1 instanceof Person); // ?
console.log(p2 instanceof Person); // ?
```

**Answer (non-strict):**
- `p1.name` → `'Alice'`
- `p2.name` → `'Bob'`
- `p1 instanceof Person` → `true`
- `p2 instanceof Person` → `false`

**Why:** Without `new`, `this = global`. `Person('Bob')` sets `global.name = 'Bob'` and returns `global`. `p2` is the global object, not a Person instance.

**Strict mode:** `Person('Bob')` → `TypeError` because `this` is `undefined`.

**Safe constructor pattern:**
```javascript
function Person(name) {
  if (!(this instanceof Person)) return new Person(name);
  this.name = name;
}
```

---

## Q43: new.target Detection

```javascript
function Widget(name) {
  if (!new.target) {
    throw new Error('Must use new');
  }
  this.name = name;
}

Widget('test');      // ?
new Widget('test');  // ?
```

**Answer:**
- `Widget('test')` → throws `Error: Must use new`
- `new Widget('test')` → `{ name: 'test' }` — `new.target` is `Widget`

---

## Q44: Symbol.toPrimitive and this

```javascript
const magic = {
  name: 'magic',
  [Symbol.toPrimitive](hint) {
    console.log('hint:', hint, 'this:', this.name);
    if (hint === 'number') return 42;
    if (hint === 'string') return this.name;
    return true;
  }
};

console.log(+magic);       // ?
console.log(`${magic}`);   // ?
console.log(magic + '');   // ?
```

**Answer:**
```
hint: number this: magic
42
hint: string this: magic
magic
hint: default this: magic
true
```

**Why:** `Symbol.toPrimitive` is called as a method on the object, so `this` is the object (`magic`). The `hint` tells you what type JS wants.

---

## Q45: Symbol.toPrimitive Extracted

```javascript
const obj = {
  val: 100,
  [Symbol.toPrimitive]() {
    return this.val;
  }
};

const convert = obj[Symbol.toPrimitive];
console.log(+obj);          // ?
console.log(convert());     // ? (strict mode)
```

**Answer:**
- `+obj` → `100` — called as method on `obj`, `this = obj`
- `convert()` → `TypeError` — extracted function, `this` is `undefined` in strict mode

---

## Q46: Getter/Setter with Inheritance Chain

```javascript
class Base {
  _value = 1;

  get value() {
    return this._value;
  }

  set value(v) {
    this._value = v * 2;
  }
}

class Derived extends Base {
  setVal(v) {
    this.value = v;
  }
}

const d = new Derived();
d.setVal(5);
console.log(d.value);    // ?
console.log(d._value);   // ?
```

**Answer:** `10`, `10`

**Why:** `d.setVal(5)` → `this.value = 5` → triggers inherited setter with `this = d` → `this._value = 5 * 2 = 10`. The getter returns `this._value = 10`.

---

## Q47: Overriding Getter in Subclass

```javascript
class Animal {
  get type() { return 'animal'; }
  describe() { return `I am a ${this.type}`; }
}

class Cat extends Animal {
  get type() { return 'cat'; }
}

console.log(new Cat().describe()); // ?
console.log(new Animal().describe()); // ?
```

**Answer:** `'I am a cat'`, `'I am a animal'`

**Why:** `describe()` uses `this.type`. On a Cat instance, the prototype chain finds Cat's `type` getter first. `this` is the Cat instance, so the overridden getter runs.

---

## Q48: Binding Priority Rules

```javascript
function identify() {
  return this.name;
}

const a = { name: 'A', identify };
const b = { name: 'B' };

// Priority test:
console.log(identify());              // ? (1. default)
console.log(a.identify());            // ? (2. implicit)
console.log(identify.call(b));        // ? (3. explicit)
console.log(new identify());          // ? (4. new)
console.log(a.identify.call(b));      // ? (explicit > implicit)
console.log(identify.bind(a).call(b)); // ? (bind > call)
```

**Answer (non-strict):**
- Default: `undefined` (global.name) or `''` in browser
- Implicit: `'A'`
- Explicit: `'B'`
- new: `identify {}` (new object, name is undefined on it)
- Explicit > implicit: `'B'` — `call(b)` overrides `a.identify`
- Bind > call: `'A'` — `bind` cannot be overridden by `call`

**Priority order:** `new` > `bind` > `call/apply` > implicit > default

---

## Q49: globalThis vs this

```javascript
// Works everywhere (Node, browser, workers):
console.log(globalThis === global); // ? (Node.js)
console.log(globalThis === window); // ? (browser)

function test() {
  'use strict';
  console.log(this === globalThis);      // ?
  console.log(globalThis === globalThis); // ?
}

test();
```

**Answer:**
- Node: `true` — `globalThis` is `global`
- Browser: `true` — `globalThis` is `window`
- `this === globalThis` → `false` — strict mode, `this` is `undefined`
- `globalThis === globalThis` → `true` — always

**Key insight:** `globalThis` is always the global object regardless of strict mode. `this` depends on how the function is called.

---

## Q50: globalThis in Arrow at Top Level

```javascript
// Node.js CJS module
const arrow = () => this;
function regular() { return this; }

console.log(arrow() === module.exports);  // ?
console.log(arrow() === globalThis);      // ?
console.log(regular() === globalThis);    // ? (non-strict)
```

**Answer:**
- `arrow() === module.exports` → `true` — arrow captures top-level `this` which is `module.exports` in CJS
- `arrow() === globalThis` → `false` — `module.exports !== global`
- `regular() === globalThis` → `true` (non-strict) — default binding → `global`

---

## Q51: Tagged Template Literal and this

```javascript
const obj = {
  name: 'world',
  tag(strings, ...vals) {
    return `${strings[0]}${this.name}${strings[1]}`;
  }
};

console.log(obj.tag`Hello, ${'ignored'}!`); // ?

const tag = obj.tag;
console.log(tag`Hello, ${'ignored'}!`); // ? (strict)
```

**Answer:**
- `obj.tag\`...\`` → `'Hello, world!'` — tagged template uses implicit binding, `this = obj`
- `tag\`...\`` → `TypeError` — extracted method, `this` is `undefined` in strict mode

**Why:** Tagged template literals invoke the function the same way as a regular call. `obj.tag\`...\`` is like `obj.tag(strings, ...vals)` — implicit binding applies.

---

## Q52: Static Method this and Inheritance

```javascript
class Parent {
  static create() {
    return new this(); // 'this' in static = ?
  }

  static className() {
    return this.name;
  }
}

class Child extends Parent {}

const p = Parent.create();
const c = Child.create();

console.log(p instanceof Parent); // ?
console.log(c instanceof Child);  // ?
console.log(Parent.className());  // ?
console.log(Child.className());   // ?
```

**Answer:** `true`, `true`, `'Parent'`, `'Child'`

**Why:** In static methods, `this` is the class the method is called on. `Child.create()` → `this = Child` → `new Child()`. `Child.className()` → `this.name = 'Child'` (the class's name). Static methods are inherited and `this` reflects the actual caller.

---

## Q53: Static Method Extracted

```javascript
class Logger {
  static prefix = '[LOG]';

  static log(msg) {
    return `${this.prefix} ${msg}`;
  }
}

console.log(Logger.log('hello'));    // ?

const { log } = Logger;
console.log(log('hello'));           // ? (strict)
```

**Answer:**
- `Logger.log('hello')` → `'[LOG] hello'`
- `log('hello')` → `TypeError` — `this` is `undefined`, `this.prefix` throws

---

## Q54: Object Spread Loses Methods' this Context

```javascript
class Config {
  env = 'prod';
  getEnv() { return this.env; }
}

const original = new Config();
const spread = { ...original };

console.log(original.getEnv()); // ?
console.log(spread.getEnv());   // ?
```

**Answer:**
- `original.getEnv()` → `'prod'`
- `spread.getEnv` → `TypeError: spread.getEnv is not a function`

**Why:** Object spread only copies own enumerable properties. `getEnv` is on the prototype (`Config.prototype`), not on the instance. So `spread` gets `{ env: 'prod' }` only — no `getEnv`.

---

## Q55: Object Spread with Own Method

```javascript
const obj = {
  val: 42,
  getVal() { return this.val; }
};

const copy = { ...obj, val: 100 };

console.log(obj.getVal());  // ?
console.log(copy.getVal()); // ?
```

**Answer:** `42`, `100`

**Why:** Unlike class instances, `getVal` is an own property of `obj`, so spread copies it. When called as `copy.getVal()`, `this` is `copy` via implicit binding. `copy.val` is `100` (overridden by the spread).

---

## Quick Reference

```
Rule          | Trigger                    | this =
------------- | -------------------------- | ----------------
new binding   | new Fn()                   | new object
explicit      | fn.call/apply/bind(ctx)    | ctx
implicit      | obj.fn()                   | obj
default       | fn()                       | global / undefined
arrow         | () => {}                   | lexical outer this
```
