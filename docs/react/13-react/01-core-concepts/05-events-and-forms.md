# React Events & Forms

## Synthetic Events

React wraps native DOM events in `SyntheticEvent` — a cross-browser wrapper with the same interface as native events.

```jsx
function Form() {
  function handleSubmit(e) {
    e.preventDefault(); // prevents full-page reload
    console.log(e.nativeEvent); // underlying DOM event
  }
  return <form onSubmit={handleSubmit}><button type="submit">Submit</button></form>;
}
```

**Key points:**
- React 17+ no longer pools events (no need to call `e.persist()`)
- `e.stopPropagation()` stops React's bubble, not capture
- `onClickCapture` uses the capture phase

---

## Controlled vs Uncontrolled

Controlled and uncontrolled describe who is the source of truth for an input's value. In a controlled input, React state is the single source of truth — every keystroke triggers an `onChange` that updates state, which flows back into the `value` prop. This gives React full visibility into the input's value at all times, enabling real-time validation and conditional UI. In an uncontrolled input, the DOM owns the state; you read the value imperatively via a ref only when you need it (e.g., on form submit). Uncontrolled inputs have less re-render overhead and are simpler for basic forms, but they cannot support real-time derived behavior like character counters or format-as-you-type.

### Controlled (React owns state)
```jsx
function ControlledInput() {
  const [value, setValue] = React.useState('');

  return (
    <input
      value={value}
      onChange={e => setValue(e.target.value)}
    />
  );
}
```

### Uncontrolled (DOM owns state)
```jsx
function UncontrolledInput() {
  const ref = React.useRef();

  function handleSubmit() {
    console.log(ref.current.value);
  }

  return <input ref={ref} defaultValue="hello" />;
}
```

**When to use uncontrolled:** file inputs (`<input type="file">`), integrations with non-React code, performance-critical inputs where you don't need to validate/transform on each keystroke.

---

## Form with Multiple Fields

Managing multiple form fields with individual `useState` calls creates boilerplate and makes reset logic verbose. The common pattern is to use a single state object and a generic `handleChange` handler that uses the input's `name` attribute as a computed property key to update the correct field. This approach scales to any number of fields without adding new state variables and integrates cleanly with HTML `name` attributes that match API field names.

```jsx
function MultiForm() {
  const [form, setForm] = React.useState({ name: '', email: '' });

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    console.log(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" value={form.name} onChange={handleChange} />
      <input name="email" value={form.email} onChange={handleChange} />
      <button type="submit">Submit</button>
    </form>
  );
}
```

---

## Select, Checkbox, Radio

Different HTML input types expose their current value through different properties: text inputs and selects use `e.target.value`, checkboxes use `e.target.checked`, and multi-selects require iterating over `e.target.selectedOptions`. React normalizes these into the same controlled pattern but the property you read from the event differs by input type. Radio groups are handled by giving each radio the same `name` and `checked` computed from the current state value.

```jsx
// Select
<select value={selected} onChange={e => setSelected(e.target.value)}>
  <option value="a">A</option>
  <option value="b">B</option>
</select>

// Checkbox
<input
  type="checkbox"
  checked={isChecked}
  onChange={e => setIsChecked(e.target.checked)}
/>

// Multi-select
<select multiple value={selected} onChange={e =>
  setSelected([...e.target.selectedOptions].map(o => o.value))
}>
```

---

## Validation Pattern

Client-side validation provides immediate feedback to users without a network round-trip. The simplest approach is to validate in the `onChange` handler and store any error message in state alongside the field value. The error is shown only when non-empty. For accessibility, associate the error message with the input via `aria-describedby` so screen readers announce it when the input is focused. More complex forms (multi-step, cross-field validation, async checks) benefit from dedicated form libraries like React Hook Form or Zod schemas.

```jsx
function ValidatedForm() {
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState('');

  function validate(val) {
    if (!val.includes('@')) return 'Invalid email';
    return '';
  }

  function handleChange(e) {
    const val = e.target.value;
    setEmail(val);
    setError(validate(val));
  }

  return (
    <>
      <input value={email} onChange={handleChange} aria-describedby="err" />
      {error && <span id="err" role="alert">{error}</span>}
    </>
  );
}
```

---

## Common Event Handlers

| Event | Use |
|---|---|
| `onClick` | Click / tap |
| `onChange` | Input value changes |
| `onSubmit` | Form submission |
| `onFocus` / `onBlur` | Focus in/out |
| `onKeyDown` / `onKeyUp` | Keyboard |
| `onMouseEnter` / `onMouseLeave` | Hover (no bubbling) |
| `onMouseOver` / `onMouseOut` | Hover (bubbles) |
| `onScroll` | Scroll |
| `onDragStart` / `onDrop` | Drag-and-drop |

---

## Custom Input Component Pattern

Building a reusable controlled input component encapsulates the label, input, and error message into a single composable unit. The component accepts `value` and `onChange` from the parent — maintaining the controlled pattern — while handling its own accessibility concerns (label association via `useId`) and error display internally. This is the pattern used by most design systems to ensure every form field in an application has consistent markup, accessibility attributes, and visual behavior.

```jsx
// Fully reusable controlled input
function TextField({ label, value, onChange, error }) {
  const id = React.useId();
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} value={value} onChange={e => onChange(e.target.value)} />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
```

---

## Debouncing Input

Debouncing defers an action until a user has stopped typing for a specified delay. Without debouncing, a search-as-you-type feature would fire an API request on every single keystroke — potentially dozens of concurrent requests for a 10-character query. The `useDebounce` hook wraps the debounce logic: it maintains a separate `debouncedValue` that only updates after the user pauses for `delay` milliseconds. The `useEffect` that fires the search API call depends on `debouncedValue`, not the raw `query`, so it only runs when the user has stopped typing.

```jsx
function SearchBox() {
  const [query, setQuery] = React.useState('');
  const debouncedQuery = useDebounce(query, 300);

  React.useEffect(() => {
    if (debouncedQuery) search(debouncedQuery);
  }, [debouncedQuery]);

  return <input value={query} onChange={e => setQuery(e.target.value)} />;
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
```

---

## Common Mistakes

1. **Forgetting `e.preventDefault()`** on form submit → page reload
2. **Mutating state directly** in onChange instead of creating a new object
3. **Missing `name` attribute** — can't use computed property pattern
4. **Using index as key in dynamic lists**
5. **Controlled + uncontrolled mixing** — setting `value` without `onChange` produces a read-only input warning
