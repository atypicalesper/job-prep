# TypeScript Configuration — tsconfig Deep Dive

## Anatomy of tsconfig.json

```json
{
  "compilerOptions": { /* how TS compiles */ },
  "include": ["src/**/*"],         // files to include
  "exclude": ["node_modules", "dist"],
  "files": ["src/main.ts"],        // specific files (overrides include)
  "extends": "./tsconfig.base.json" // inherit from another config
}
```

---

## Critical Compiler Options

### Target & Module

```json
{
  "target": "ES2022",
  // What JS version to emit. Higher = smaller output (no polyfills for newer features).
  // ES2022 supports: top-level await, class fields, error.cause, at()
  // For Node 18+: "ES2022" or "ESNext"
  // For old browsers: "ES5" or "ES2015"

  "module": "NodeNext",
  // Module system for emitted code:
  // "CommonJS"  → require/module.exports (Node.js default pre-ESM)
  // "ESNext"    → import/export (modern bundlers)
  // "NodeNext"  → respects package.json "type" field (Node.js 12+)
  // "Preserve"  → keep as-is (TS 5.4+)

  "moduleResolution": "NodeNext",
  // How TS resolves imports:
  // "Node10"    → old Node.js behavior
  // "NodeNext"  → modern Node.js with ESM support, respects exports field
  // "Bundler"   → Vite/esbuild style (no extension required)
}
```

### Strict Mode Options

```json
{
  "strict": true,
  // Shorthand for enabling ALL strict checks:

  "strictNullChecks": true,
  // null and undefined are not assignable to other types
  // let x: string = null; → ❌

  "strictFunctionTypes": true,
  // Function parameters are checked contravariantly
  // Prevents unsafe function type assignments

  "strictBindCallApply": true,
  // call/bind/apply are type-checked

  "strictPropertyInitialization": true,
  // Class properties must be initialized in constructor
  // Use ! to assert: name!: string

  "noImplicitAny": true,
  // Error on expressions inferred as any
  // function f(x) {} → x implicitly has type 'any'

  "noImplicitThis": true,
  // Error when 'this' is implicitly any

  "useUnknownInCatchVariables": true,
  // catch(e) → e is unknown, not any (TS 4.4+)
  // Forces you to type-check error before using it

  "alwaysStrict": true,
  // Emit "use strict" in all files
}
```

### Additional Checks

```json
{
  "noUnusedLocals": true,
  // Error on unused local variables

  "noUnusedParameters": true,
  // Error on unused function parameters
  // Prefix with _ to suppress: _unusedParam

  "noImplicitReturns": true,
  // All code paths in a function must return a value

  "noFallthroughCasesInSwitch": true,
  // Disallow fallthrough between switch cases

  "exactOptionalPropertyTypes": true,
  // { x?: string } means x can be absent OR string, NOT undefined
  // Prevents: obj.x = undefined when x is optional (TS 4.4+)

  "noUncheckedIndexedAccess": true,
  // arr[0] returns T | undefined, not T
  // Safer but requires more null checks

  "noPropertyAccessFromIndexSignature": true,
  // Must use bracket notation for index signature access: obj['key'] not obj.key
}
```

### Paths & Module Resolution

```json
{
  "baseUrl": ".",
  "paths": {
    "@/*": ["src/*"],
    "@components/*": ["src/components/*"],
    "@utils": ["src/utils/index.ts"]
  },
  // Note: paths only affect TS type resolution, not runtime
  // You also need tsconfig-paths or bundler path mapping

  "rootDir": "src",
  "outDir": "dist",

  "rootDirs": ["src", "generated"],
  // Treat multiple dirs as one virtual root

  "typeRoots": ["./node_modules/@types", "./types"],
  // Where to look for @types packages

  "types": ["node", "jest"],
  // Only include specific @types packages (omit others)
}
```

### Source Maps & Declarations

```json
{
  "sourceMap": true,
  // Generate .js.map files (for debugging in original TS)

  "inlineSourceMap": false,
  // Embed source map inline in JS file (vs separate file)

  "declaration": true,
  // Generate .d.ts files (needed for libraries)

  "declarationMap": true,
  // Generate .d.ts.map for declaration files

  "declarationDir": "types",
  // Output directory for .d.ts files

  "emitDeclarationOnly": true,
  // Only emit .d.ts, not .js (when bundler handles transpilation)
}
```

### Performance & Emit

```json
{
  "incremental": true,
  // Save build info to speed up subsequent compiles
  "tsBuildInfoFile": ".tsbuildinfo",

  "skipLibCheck": true,
  // Skip type checking of .d.ts in node_modules
  // Faster but misses lib type errors — almost always true in projects

  "isolatedModules": true,
  // Each file must be independently compilable
  // Required for: Babel, esbuild, SWC transpilation
  // Effect: no const enum, no namespace merging across files

  "noEmit": true,
  // Type-check only, don't emit JS (when Vite/esbuild handles build)

  "removeComments": true,
  "importHelpers": true,
  // Use tslib helpers instead of inlining (reduces bundle size)
}
```

### ES Modules Interop

```json
{
  "esModuleInterop": true,
  // Allows: import React from 'react' (instead of import * as React)
  // Generates __importDefault and __importStar helpers

  "allowSyntheticDefaultImports": true,
  // Implied by esModuleInterop. Allows default imports from CJS modules.

  "allowImportingTsExtensions": true,
  // Allow: import './foo.ts' — needed with bundler moduleResolution (TS 5.0+)

  "resolveJsonModule": true,
  // import data from './data.json' — fully typed

  "verbatimModuleSyntax": true,
  // import type must be used for type-only imports
  // Ensures imports are stripped correctly by bundlers (TS 5.0+)
}
```

---

## Preset Configurations

### Node.js App

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "esModuleInterop": true
  }
}
```

### Next.js / React App

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "incremental": true,
    "allowJs": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "paths": { "@/*": ["./src/*"] }
  }
}
```

### Library (publishable npm package)

```json
{
  "compilerOptions": {
    "target": "ES2019",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "importHelpers": true,
    "verbatimModuleSyntax": true
  }
}
```

---

## Project References (monorepo)

```json
// packages/core/tsconfig.json
{
  "compilerOptions": {
    "composite": true,   // required for project references
    "declaration": true,
    "outDir": "dist"
  }
}

// packages/app/tsconfig.json
{
  "compilerOptions": { "outDir": "dist" },
  "references": [{ "path": "../core" }]
}
```

Build command: `tsc --build` (incremental, respects dependency order)

---

## JSX Options

```json
{
  "jsx": "react",          // classic: React.createElement (pre-17)
  "jsx": "react-jsx",      // automatic: no React import needed (React 17+)
  "jsx": "react-jsxdev",   // automatic + debug info
  "jsx": "preserve",       // keep JSX as-is (for bundler to handle)
  "jsx": "react-native"    // preserve but for RN metro bundler
}
```

---

## Common Gotchas

```ts
// 1. paths doesn't fix runtime resolution
// tsconfig paths: "@/utils" → "src/utils"
// Without bundler plugin: import '@/utils' fails at runtime

// 2. strict: true doesn't include noUnusedLocals / noPropertyAccessFromIndexSignature
// Those are separate options

// 3. isolatedModules breaks const enums
const enum Direction { Up, Down } // ❌ with isolatedModules

// 4. moduleResolution: "node" vs "node16" vs "bundler"
// node16/nodenext: requires file extensions in imports
import { foo } from './utils.js'; // note: .js even in TS files!

// 5. target affects which syntax is downleveled
// target: "ES5" → classes, arrows, spread all compiled down
// target: "ES2022" → native class fields, at(), etc.

// 6. lib is independent of target
// target: "ES5", lib: ["ES2022"] → can use ES2022 APIs but compiles to ES5 syntax
// Watch out: you still need polyfills for the runtime
```
