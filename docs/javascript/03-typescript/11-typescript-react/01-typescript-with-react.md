# TypeScript with React

## Component Typing

### Function Components

```tsx
import React from 'react';

// Props interface
interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  children?: React.ReactNode;
}

// FC<Props> vs explicit return type
const Button: React.FC<ButtonProps> = ({ label, onClick, disabled = false, variant = 'primary' }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant}`}
    >
      {label}
    </button>
  );
};

// Preferred: explicit return type (avoids implicit children in FC)
function Card({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return <div className="card"><h2>{title}</h2>{children}</div>;
}
```

### ReactNode vs ReactElement vs JSX.Element

```ts
// React.ReactNode — broadest: any renderable value
type ReactNode = ReactElement | string | number | boolean | null | undefined | ReactFragment;

// React.ReactElement — JSX element (result of React.createElement)
// React.JSX.Element — same as ReactElement, preferred in newer code

// Use ReactNode for children (accepts everything renderable)
interface WrapperProps { children: React.ReactNode; }

// Use ReactElement when you need to clone/manipulate the element
function enhance(child: React.ReactElement): React.ReactElement {
  return React.cloneElement(child, { className: 'enhanced' });
}
```

---

## Hooks Typing

### useState

```tsx
// TypeScript infers type from initial value
const [count, setCount] = React.useState(0);        // State<number>
const [name, setName] = React.useState('');          // State<string>

// Explicit type when initial is null/undefined
const [user, setUser] = React.useState<User | null>(null);

// Complex state
interface FormState {
  email: string;
  password: string;
  errors: Record<string, string>;
}
const [form, setForm] = React.useState<FormState>({
  email: '', password: '', errors: {},
});

// Functional update
setCount(prev => prev + 1);
setForm(prev => ({ ...prev, email: 'alice@example.com' }));
```

### useRef

```tsx
// DOM ref
const inputRef = React.useRef<HTMLInputElement>(null);
// Access: inputRef.current?.focus() — note optional chaining (could be null before mount)

// Mutable value (not DOM)
const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
const countRef = React.useRef(0); // inferred as MutableRefObject<number>

// HTMLElement refs
const divRef = React.useRef<HTMLDivElement>(null);
const formRef = React.useRef<HTMLFormElement>(null);
const buttonRef = React.useRef<HTMLButtonElement>(null);
```

### useReducer

```tsx
interface CartState {
  items: CartItem[];
  total: number;
}

type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: string }  // payload = item id
  | { type: 'CLEAR_CART' }
  | { type: 'SET_QUANTITY'; payload: { id: string; qty: number } };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM':
      return { ...state, items: [...state.items, action.payload] };
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter(i => i.id !== action.payload) };
    case 'CLEAR_CART':
      return { items: [], total: 0 };
    case 'SET_QUANTITY':
      return {
        ...state,
        items: state.items.map(i =>
          i.id === action.payload.id ? { ...i, qty: action.payload.qty } : i
        ),
      };
  }
}

const [cart, dispatch] = React.useReducer(cartReducer, { items: [], total: 0 });
dispatch({ type: 'ADD_ITEM', payload: { id: '1', name: 'Widget', qty: 1, price: 9.99 } });
```

### useContext

```tsx
interface AuthContextType {
  user: User | null;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

// Pattern: undefined default to catch missing Provider
const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

function useAuth(): AuthContextType {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const login = async (credentials: Credentials) => {
    setIsLoading(true);
    try {
      const user = await authService.login(credentials);
      setUser(user);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
```

### Custom Hook Types

```tsx
interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

function useFetch<T>(url: string): UseFetchResult<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.statusText);
      const json: T = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [url]);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// Usage — T inferred from generic
const { data: users, loading } = useFetch<User[]>('/api/users');
users?.[0].name; // TypeScript knows this is User
```

---

## Event Handling

```tsx
// Form events
function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
  console.log(e.target.value);
}

function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const data = new FormData(e.currentTarget);
}

// Mouse events
function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
  console.log(e.currentTarget.id);
}

// Keyboard events
function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') submit();
}

// Drag events
function handleDrop(e: React.DragEvent<HTMLDivElement>) {
  const files = e.dataTransfer.files;
}

// Generic handler factory
function makeChangeHandler<T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
  setter: (value: string) => void
) {
  return (e: React.ChangeEvent<T>) => setter(e.target.value);
}
```

---

## forwardRef + useImperativeHandle

```tsx
interface InputHandle {
  focus: () => void;
  clear: () => void;
  getValue: () => string;
}

interface InputProps {
  placeholder?: string;
  defaultValue?: string;
}

const FancyInput = React.forwardRef<InputHandle, InputProps>(
  ({ placeholder, defaultValue }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [value, setValue] = React.useState(defaultValue ?? '');

    React.useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      clear: () => setValue(''),
      getValue: () => value,
    }));

    return (
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={placeholder}
        className="fancy-input"
      />
    );
  }
);
FancyInput.displayName = 'FancyInput';

// Usage
function Form() {
  const inputRef = React.useRef<InputHandle>(null);
  return (
    <>
      <FancyInput ref={inputRef} placeholder="Type here..." />
      <button onClick={() => inputRef.current?.focus()}>Focus</button>
      <button onClick={() => inputRef.current?.clear()}>Clear</button>
    </>
  );
}
```

---

## Generic Components

```tsx
// Generic list component
interface ListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T) => string | number;
  emptyComponent?: React.ReactNode;
}

function List<T>({ items, renderItem, keyExtractor, emptyComponent }: ListProps<T>) {
  if (items.length === 0) return <>{emptyComponent ?? <p>No items</p>}</>;
  return (
    <ul>
      {items.map((item, i) => (
        <li key={keyExtractor(item)}>{renderItem(item, i)}</li>
      ))}
    </ul>
  );
}

// Usage — T inferred from items
<List
  items={users}
  keyExtractor={u => u.id}
  renderItem={u => <UserCard user={u} />}
/>

// Generic select
interface SelectProps<T extends string | number> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

function Select<T extends string | number>({ options, value, onChange }: SelectProps<T>) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as T)}>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
```

---

## Discriminated Union Props

```tsx
// Component that behaves differently based on a discriminant
type ButtonProps =
  | { variant: 'link'; href: string; target?: '_blank' | '_self' }
  | { variant: 'button'; onClick: () => void; disabled?: boolean }
  | { variant: 'submit'; form?: string };

function SmartButton(props: ButtonProps) {
  if (props.variant === 'link') {
    return <a href={props.href} target={props.target}>{/* ... */}</a>;
  }
  if (props.variant === 'submit') {
    return <button type="submit" form={props.form}>{/* ... */}</button>;
  }
  return <button onClick={props.onClick} disabled={props.disabled}>{/* ... */}</button>;
}

// TypeScript narrows correctly in each branch
```

---

## Polymorphic Components (as prop)

```tsx
type AsProp<C extends React.ElementType> = { as?: C };

type PropsToOmit<C extends React.ElementType, P> = keyof (AsProp<C> & P);

type PolymorphicComponentProp<C extends React.ElementType, Props = object> =
  React.PropsWithChildren<Props & AsProp<C>> &
  Omit<React.ComponentPropsWithoutRef<C>, PropsToOmit<C, Props>>;

interface TextOwnProps { size?: 'sm' | 'md' | 'lg'; color?: string; }

type TextProps<C extends React.ElementType> = PolymorphicComponentProp<C, TextOwnProps>;

function Text<C extends React.ElementType = 'span'>({
  as,
  size = 'md',
  color,
  children,
  ...rest
}: TextProps<C>) {
  const Component = as ?? 'span';
  return (
    <Component className={`text-${size}`} style={{ color }} {...rest}>
      {children}
    </Component>
  );
}

// Usage — as prop changes the underlying element and available props
<Text as="h1" size="lg">Heading</Text>
<Text as="a" href="/about">Link</Text>  // href is available because as="a"
<Text as="button" onClick={fn}>Button</Text>
```

---

## Common Type Utilities in React

```ts
// ComponentProps — extract props from any component
type ButtonProps = React.ComponentProps<'button'>;
type MyCompProps = React.ComponentProps<typeof MyComponent>;

// ComponentPropsWithRef / ComponentPropsWithoutRef
type DivPropsWithRef = React.ComponentPropsWithRef<'div'>;

// ElementRef — get ref type from a component
type InputRef = React.ElementRef<'input'>; // HTMLInputElement
type MyRef = React.ElementRef<typeof FancyInput>; // InputHandle

// CSSProperties — for inline style objects
const style: React.CSSProperties = {
  backgroundColor: 'red',
  fontSize: '16px',
};

// PropsWithChildren — add children to props
type MyProps = React.PropsWithChildren<{ title: string }>;

// Dispatch — type for useReducer dispatch
type CartDispatch = React.Dispatch<CartAction>;
```
