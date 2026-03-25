# Node.js Filesystem — fsPromises, FileHandle, Watching

## fs Module Variants

Node.js exposes the same underlying filesystem operations through three different API styles, and choosing the wrong one is a common source of bugs and performance problems. The callback-based API (`fs.readFile(path, cb)`) is the original design and is still used internally and in older codebases. The sync API (`fs.readFileSync`) is simple but blocks the entire event loop for the duration of the I/O operation — every other request waits. The Promise-based API (`fs/promises`) is the modern correct choice: it integrates with `async`/`await`, does not block the event loop, and has identical semantics to the callback API without the pyramid nesting.

Node.js exposes three filesystem APIs:

```js
const fs = require('fs');           // callback-based (legacy)
const fsSync = require('fs');       // sync methods: fs.readFileSync
const fsp = require('fs/promises'); // promise-based (preferred)
```

Always prefer `fs/promises` in modern Node.js (v14+). Sync methods block the event loop — only acceptable during startup/config loading.

---

## 1. fsPromises Basics

`fs/promises` exposes the same filesystem operations as the callback and sync APIs but returns Promises, making them compatible with `async`/`await` and eliminates the boilerplate of nested callbacks. These are the operations you will use for the vast majority of file work: reading config files, writing output, managing directories, and checking existence. The `access` pattern for existence checks is preferred over `fs.existsSync` in async code because `existsSync` blocks the event loop and is subject to time-of-check/time-of-use (TOCTOU) race conditions where the file state can change between the check and the subsequent operation.

```js
const fsp = require('fs/promises');
const path = require('path');

// Read entire file
const content = await fsp.readFile('/data/config.json', 'utf8');
const parsed = JSON.parse(content);

// Write file (creates or overwrites)
await fsp.writeFile('/data/output.json', JSON.stringify(data, null, 2), 'utf8');

// Append
await fsp.appendFile('/data/log.txt', `${new Date().toISOString()} - event\n`);

// Copy
await fsp.copyFile('/data/original.json', '/data/backup.json');

// Rename / move
await fsp.rename('/tmp/upload.jpg', '/data/uploads/photo.jpg');

// Delete file
await fsp.unlink('/tmp/upload.jpg');

// Delete directory (recursive)
await fsp.rm('/tmp/old-dir', { recursive: true, force: true });

// Create directory (like mkdir -p)
await fsp.mkdir('/data/uploads/2024/01', { recursive: true });

// Check if path exists (preferred pattern)
try {
  await fsp.access('/data/config.json');
  // file exists
} catch {
  // file doesn't exist
}
// Note: don't use fs.existsSync in async code — TOCTOU race condition
```

---

## 2. FileHandle — Low-Level File Operations

`FileHandle` is the object returned by `fsp.open()` and represents a raw OS file descriptor wrapped in a Promise-based interface. While `fsp.readFile` / `fsp.writeFile` are convenience wrappers that open, operate, and close in a single call, `FileHandle` exposes the underlying primitives: reading or writing at specific byte offsets, querying file metadata (`stat`), flushing to disk (`sync` / `datasync`), and reading large files in fixed-size chunks without loading the entire file into memory. Use `FileHandle` when you need random-access I/O, must guarantee durability after a write, or are building a file format reader that navigates non-linearly through a binary file. Always close the handle in a `finally` block (or use the `await using` syntax in Node 22+) — a leaked file descriptor is an OS resource that causes `EMFILE` errors once the process limit is reached.

`FileHandle` gives you fine-grained control: read specific byte ranges, lock files, sync to disk.

```js
const fh = await fsp.open('/data/large-file.bin', 'r'); // 'r' = read, 'w' = write, 'a' = append
try {
  // Read specific bytes
  const buffer = Buffer.alloc(1024);
  const { bytesRead } = await fh.read(buffer, 0, 1024, 0); // read 1024 bytes at offset 0
  console.log(`Read ${bytesRead} bytes`);

  // Get file size
  const stat = await fh.stat();
  console.log(`File size: ${stat.size} bytes`);

  // Read file in chunks without loading all into memory
  const chunkSize = 64 * 1024; // 64KB
  const buf = Buffer.alloc(chunkSize);
  let offset = 0;

  while (offset < stat.size) {
    const { bytesRead } = await fh.read(buf, 0, chunkSize, offset);
    if (bytesRead === 0) break;
    processChunk(buf.subarray(0, bytesRead));
    offset += bytesRead;
  }
} finally {
  await fh.close(); // ALWAYS close, or use using (Node 22+)
}
```

### Write with FileHandle

Writing through a `FileHandle` gives you control over precisely when data is flushed from the OS page cache to durable storage. `fh.write()` is non-blocking — it copies data into the OS buffer and returns quickly. `fh.sync()` blocks until the kernel confirms the data is physically written to the storage device, which is essential for crash-safe writes (e.g., committing a WAL entry in a custom database). `fh.datasync()` is similar but skips flushing file metadata (size, timestamps), making it slightly faster while still guaranteeing data durability.

```js
const fh = await fsp.open('/data/output.bin', 'w');
try {
  const data = Buffer.from('Hello World');
  const { bytesWritten } = await fh.write(data, 0, data.length, 0);

  // Flush OS buffer to disk (important for crash safety)
  await fh.sync(); // fdatasync equivalent — guarantees durability

  // Or just flush metadata
  await fh.datasync();
} finally {
  await fh.close();
}
```

### Using `using` keyword (Node 22+ / TypeScript 5.2+)

The `using` and `await using` keywords implement the TC39 Explicit Resource Management proposal: when a `using`-declared variable goes out of scope (including on exception), `Symbol.asyncDispose` is called automatically. For `FileHandle`, this means `fh.close()` is guaranteed to run even if an error is thrown in the middle of the block, eliminating the `try/finally` boilerplate that was previously required to prevent file descriptor leaks.

```ts
// Automatic cleanup via Symbol.asyncDispose
{
  await using fh = await fsp.open('/data/file.txt', 'r');
  const content = await fh.readFile('utf8');
  // fh.close() called automatically when block exits
}
```

---

## 3. Directory Operations

Directory listing in Node.js ranges from a flat name array to a fully typed recursive walk. The `withFileTypes: true` option returns `Dirent` objects that know whether each entry is a file, directory, or symlink, saving an extra `stat()` call per entry. Node.js v20.1+ added a `recursive` option to `readdir`, making deep tree walks a one-liner. For older Node.js versions or when you need streaming semantics (processing files as you find them rather than collecting all paths first), an async generator that yields paths one at a time is the idiomatic pattern.

```js
// List directory
const entries = await fsp.readdir('/data/uploads');
// ['file1.jpg', 'file2.png', ...]

// List with types (file vs directory)
const entries = await fsp.readdir('/data', { withFileTypes: true });
for (const entry of entries) {
  if (entry.isFile()) console.log('file:', entry.name);
  if (entry.isDirectory()) console.log('dir:', entry.name);
  if (entry.isSymbolicLink()) console.log('symlink:', entry.name);
}

// Recursive directory listing (Node 20.1+)
const allFiles = await fsp.readdir('/data', { recursive: true });
// ['uploads/photo.jpg', 'uploads/2024/img.png', ...]

// Walk directory tree (older Node)
async function* walkDir(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkDir(fullPath);
    else yield fullPath;
  }
}

for await (const file of walkDir('/data')) {
  console.log(file);
}
```

---

## 4. File Watching

### `fs.watch` — native, efficient

`fs.watch` uses native OS file-system event APIs (inotify on Linux, kqueue on macOS, FSEvents on macOS, ReadDirectoryChangesW on Windows) to deliver change notifications without polling. It is efficient and low-latency. However, the raw API has known cross-platform inconsistencies: Linux does not support `recursive` without additional setup, events can fire multiple times for a single logical change (an editor's atomic save triggers rename + change), and the `filename` argument can be `null` on some platforms. In production, use `chokidar` which normalises all of this.

```js
const fs = require('fs');

const watcher = fs.watch('/data/config.json', { encoding: 'utf8' }, (eventType, filename) => {
  // eventType: 'rename' (create/delete/rename) or 'change' (content change)
  console.log(`${eventType}: ${filename}`);
});

// Watch a directory (recursive on macOS/Windows, Linux needs recursive: true workaround)
const dirWatcher = fs.watch('/data', { recursive: true }, (eventType, filename) => {
  console.log(`${eventType}: ${filename}`);
});

// Cleanup
watcher.close();
```

**Caveats of `fs.watch`:**
- On Linux, `recursive` is not supported natively — use `chokidar`
- Events can fire multiple times for a single change (debounce needed)
- `filename` can be `null` on some platforms

### `fs.watchFile` — polling based

`fs.watchFile` checks file metadata at a fixed polling interval rather than using OS events. This makes it reliable on network file systems (NFS, CIFS) and virtual file systems where OS events are not delivered, but wastes CPU on stat calls even when nothing changes. Prefer `fs.watch` or `chokidar` for local files.

```js
fs.watchFile('/data/config.json', { interval: 1000 }, (curr, prev) => {
  if (curr.mtime > prev.mtime) {
    console.log('File was modified at', curr.mtime);
  }
});
fs.unwatchFile('/data/config.json');
```

Use `watchFile` only when you need reliable file modification detection on network drives or where `fs.watch` is unreliable.

### Chokidar (production file watching)

```bash
npm install chokidar
```

```js
const chokidar = require('chokidar');

const watcher = chokidar.watch('/data/uploads', {
  ignored: /(^|[\/\\])\../, // ignore dotfiles
  persistent: true,
  ignoreInitial: true,       // don't fire 'add' for existing files
  awaitWriteFinish: {        // wait until file is fully written
    stabilityThreshold: 200,
    pollInterval: 100,
  },
});

watcher
  .on('add', (path) => console.log(`File added: ${path}`))
  .on('change', (path) => console.log(`File changed: ${path}`))
  .on('unlink', (path) => console.log(`File removed: ${path}`))
  .on('error', (error) => console.error('Watcher error:', error));

// Hot-reload config
watcher.on('change', async (filePath) => {
  if (filePath.endsWith('config.json')) {
    const fresh = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    Object.assign(config, fresh);
    console.log('Config reloaded');
  }
});

await watcher.close();
```

---

## 5. Streams for Large Files

`fsp.readFile` loads the entire file into a single Buffer in memory before returning. For files that fit comfortably in RAM (a few MB) this is fine, but for log files, video files, or large datasets the memory spike can crash the process or trigger excessive garbage collection. The stream-based alternative reads and processes data incrementally: `createReadStream` emits fixed-size chunks as they arrive from the OS, and `pipeline` connects the readable to writable stages with automatic backpressure. The `readline.Interface` wrapping a `createReadStream` is the standard pattern for line-by-line processing of text files (CSV, NDJSON) — it handles both `\n` and `\r\n` line endings and processes one line at a time without buffering the entire file.

For large files, avoid `readFile` (loads entire file into memory). Use streams:

```js
const { createReadStream, createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const { createGzip } = require('zlib');

// Compress a file with streams (no memory spike)
await pipeline(
  createReadStream('/data/large-file.log'),
  createGzip(),
  createWriteStream('/data/large-file.log.gz')
);

// Parse CSV line by line
const { createInterface } = require('readline');

const rl = createInterface({
  input: createReadStream('/data/records.csv'),
  crlfDelay: Infinity, // handle Windows line endings
});

let lineNum = 0;
for await (const line of rl) {
  if (lineNum++ === 0) continue; // skip header
  const [id, name, email] = line.split(',');
  await db.upsert({ id, name, email });
}
```

---

## 6. Temporary Files

Temporary files are needed when you must materialise data on disk for a subprocess (e.g., passing a large image to ffmpeg), process data too large for a single buffer, or atomically replace a file (write temp → rename). The `'wx'` flag creates the file exclusively — it fails if the file already exists, preventing a race condition where two processes try to use the same temp name. Always clean up in a `finally` block; the `.catch(() => {})` on `unlink` handles the case where the file was already cleaned up or never fully created.

```js
const os = require('os');
const crypto = require('crypto');

async function createTempFile(prefix = 'tmp') {
  const name = `${prefix}-${crypto.randomBytes(8).toString('hex')}`;
  const filePath = path.join(os.tmpdir(), name);
  const fh = await fsp.open(filePath, 'wx'); // 'wx' = exclusive create (fail if exists)
  return { filePath, fileHandle: fh };
}

// Usage
const { filePath, fileHandle } = await createTempFile('upload');
try {
  await fileHandle.writeFile(uploadedData);
  await fileHandle.close();
  await processFile(filePath);
} finally {
  await fsp.unlink(filePath).catch(() => {}); // cleanup, ignore if already gone
}
```

---

## Interview Q&A

**Q: What's the difference between `fs.writeFile` and opening a FileHandle and writing?**

`writeFile` is a high-level convenience that opens, writes, and closes in one call. FileHandle gives you: partial reads/writes, specific byte offsets, explicit `sync()`/`datasync()` for durability, and fine control over file flags. Use FileHandle when you need random access, need to verify durability, or are building a database/WAL.

---

**Q: What does `fs.sync()` do and when do you need it?**

`sync()` flushes the OS buffer cache to physical disk. Without it, the OS may hold the write in memory. After a crash, un-synced writes are lost. Databases call `fsync` after WAL entries to guarantee crash consistency. In application code, call it when you can't afford to lose the write (e.g., writing a commit record).

---

**Q: Why might `fs.watch` fire multiple events for a single file change?**

Editors like vim use atomic saves — they write to a temp file, then rename it. This triggers `rename` events. Also, OS buffering can batch or duplicate events. Production code debounces watch events and uses `chokidar`'s `awaitWriteFinish` to handle this.

---

**Q: When should you NOT use `fs.readFileSync`?**

In any hot path — it blocks the entire event loop, preventing other requests from being handled. Acceptable uses: module initialization (`require`-time config loading), CLI tools, startup scripts where nothing else is running concurrently.
