# React & Next.js Cheatsheet

## Core Hooks

```jsx
// useState
const [count, setCount] = useState(0)
const [user, setUser] = useState<User | null>(null)
setCount(c => c + 1)                          // functional update
setUser(prev => ({ ...prev, name: 'Alice' })) // partial update

// useEffect
useEffect(() => {
  const sub = subscribe(id)
  return () => sub.unsubscribe()  // cleanup
}, [id])                           // re-run when id changes

useEffect(() => { /* once on mount */ }, [])

// useRef — mutable ref, doesn't trigger re-render
const inputRef = useRef<HTMLInputElement>(null)
inputRef.current?.focus()

// useMemo — expensive computation
const sorted = useMemo(() => [...items].sort(compareFn), [items])

// useCallback — stable function reference
const handler = useCallback(() => onSubmit(id), [id, onSubmit])

// useContext
const theme = useContext(ThemeContext)

// useReducer
const [state, dispatch] = useReducer(reducer, initialState)
dispatch({ type: 'INCREMENT', payload: 1 })

// useId — stable unique id (hydration-safe)
const id = useId()

// useDeferredValue — defer expensive render
const deferred = useDeferredValue(searchQuery)

// useTransition — non-urgent state update
const [isPending, startTransition] = useTransition()
startTransition(() => setPage(next))
```

---

## Component Patterns

```jsx
// Controlled input
function Input({ value, onChange }) {
  return <input value={value} onChange={e => onChange(e.target.value)} />
}

// Compound components
function Tabs({ children }) {
  const [active, setActive] = useState(0)
  return <TabsContext.Provider value={{ active, setActive }}>{children}</TabsContext.Provider>
}
Tabs.Panel = function TabPanel({ index, children }) {
  const { active } = useContext(TabsContext)
  return active === index ? <div>{children}</div> : null
}

// Render prop
function Mouse({ render }) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  return <div onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}>{render(pos)}</div>
}

// forwardRef
const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <input ref={ref} {...props} />
))

// Custom hook
function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? '') } catch { return initial }
  })
  const set = (v: T) => { setValue(v); localStorage.setItem(key, JSON.stringify(v)) }
  return [value, set] as const
}
```

---

## Performance

```jsx
// Memo — skip re-render when props unchanged
const Card = memo(function Card({ title, body }) {
  return <div><h2>{title}</h2><p>{body}</p></div>
})

// lazy + Suspense — code split
const Chart = lazy(() => import('./Chart'))
<Suspense fallback={<Spinner />}><Chart /></Suspense>

// Key — stable keys prevent unnecessary unmount/remount
{items.map(item => <Card key={item.id} {...item} />)}

// Avoid creating objects/functions inline in JSX
// ❌ new object on every render
<Child style={{ color: 'red' }} onClick={() => doThing(id)} />

// ✅ stable references
const style = useMemo(() => ({ color: 'red' }), [])
const handleClick = useCallback(() => doThing(id), [id])
<Child style={style} onClick={handleClick} />
```

---

## Context

```tsx
interface ThemeCtx { theme: string; setTheme: (t: string) => void }
const ThemeContext = createContext<ThemeCtx | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState('light')
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider')
  return ctx
}
```

---

## Next.js App Router

```
app/
  layout.tsx           — shared UI (not re-rendered on navigation)
  page.tsx             — route UI
  loading.tsx          — Suspense boundary
  error.tsx            — error boundary
  not-found.tsx        — 404 UI
  route.ts             — API endpoint
  (group)/             — route group (no URL segment)
  [param]/             — dynamic segment
  [...slug]/           — catch-all
  [[...slug]]/         — optional catch-all
```

```tsx
// Server Component (default) — runs on server, no hooks
export default async function Page({ params, searchParams }) {
  const data = await fetch('...')     // no useEffect needed
  return <div>{data.title}</div>
}

// Client Component
'use client'
export default function Counter() {
  const [n, setN] = useState(0)
  return <button onClick={() => setN(n + 1)}>{n}</button>
}

// generateStaticParams — pre-render dynamic routes
export async function generateStaticParams() {
  return slugs.map(slug => ({ slug }))
}

// generateMetadata
export async function generateMetadata({ params }) {
  return { title: params.id, description: '...' }
}

// Route handler (API)
// app/api/users/route.ts
export async function GET(req: Request) {
  return Response.json({ users: [] })
}
export async function POST(req: Request) {
  const body = await req.json()
  return Response.json({ id: 1 }, { status: 201 })
}
```

```tsx
// Navigation
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'

// Image
import Image from 'next/image'
<Image src="/photo.jpg" alt="..." width={800} height={600} priority />

// Server Actions
async function createUser(formData: FormData) {
  'use server'
  const name = formData.get('name')
  await db.createUser({ name })
  revalidatePath('/users')
}
```

---

## TypeScript with React

```tsx
// Component props
interface ButtonProps {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
  children: React.ReactNode
  className?: string
}

// Event types
const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {}
const onChange = (e: React.ChangeEvent<HTMLInputElement>) => e.target.value
const onSubmit = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault() }
const onKeyDown = (e: React.KeyboardEvent) => {}

// Generic component
function List<T extends { id: string }>({ items, render }: {
  items: T[]
  render: (item: T) => React.ReactNode
}) {
  return <ul>{items.map(item => <li key={item.id}>{render(item)}</li>)}</ul>
}

// Hook return types
function useToggle(initial = false): [boolean, () => void] {
  const [state, setState] = useState(initial)
  return [state, () => setState(s => !s)]
}
```

---

## Common Patterns

```jsx
// Conditional rendering
{isLoading && <Spinner />}
{error ? <Error msg={error} /> : <Content />}
{items.length === 0 ? <Empty /> : items.map(/* ... */)}

// Portals — render outside parent DOM
createPortal(<Modal />, document.getElementById('modal-root'))

// Error boundary (class component still required)
class ErrorBoundary extends React.Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  componentDidCatch(e, info) { console.error(e, info) }
  render() {
    return this.state.error ? <Fallback /> : this.props.children
  }
}

// AbortController in useEffect
useEffect(() => {
  const controller = new AbortController()
  fetch(url, { signal: controller.signal })
    .then(r => r.json())
    .then(setData)
    .catch(e => { if (e.name !== 'AbortError') setError(e) })
  return () => controller.abort()
}, [url])
```
