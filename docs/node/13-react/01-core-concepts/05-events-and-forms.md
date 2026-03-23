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
