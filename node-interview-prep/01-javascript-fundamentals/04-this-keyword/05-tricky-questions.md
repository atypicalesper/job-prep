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
