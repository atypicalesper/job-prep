# Child Processes in Node.js

---

## Four Methods

Child processes exist because Node.js is single-threaded — CPU-intensive work or shell commands block the event loop for all in-flight requests. Spawning a child process offloads that work to a separate OS process with its own memory space and CPU time. The four `child_process` methods differ in how they launch the process, how they handle I/O, and whether they add an IPC channel. Choosing the wrong one leads to either shell injection vulnerabilities (`exec` with user input), running out of memory (`exec` on large output), or unnecessary overhead (`fork` when `spawn` suffices). The general rule: prefer `execFile`/`spawn` for external binaries and `fork` for Node.js worker scripts.

```javascript
const { exec, execFile, spawn, fork } = require('child_process');

// exec  — runs command in shell, buffers output (for small output)
// execFile — runs file directly (no shell), buffers output
// spawn — runs command, streaming I/O (for large output)
// fork  — special spawn for Node.js scripts, has IPC channel
```

---

## exec — Shell Commands

`exec` launches a command string through the system shell (`/bin/sh` on Unix, `cmd.exe` on Windows), which means you get shell features like pipes, glob expansion, and `&&` chaining. The entire stdout and stderr are buffered in memory and delivered in one callback. Because it uses a shell, any user-controlled content interpolated into the command string becomes a shell injection vector — an attacker can append `; rm -rf /` or similar. Limit `exec` to trusted, hardcoded commands with small output. For anything involving user input, switch to `execFile` or `spawn` which pass arguments as an array, bypassing the shell entirely.

```javascript
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Simple exec:
exec('ls -la', (err, stdout, stderr) => {
  if (err) {
    console.error('Error code:', err.code);
    console.error('stderr:', stderr);
    return;
  }
  console.log('Output:', stdout);
});

// Promisified:
try {
  const { stdout, stderr } = await execAsync('git log --oneline -10');
  console.log(stdout);
} catch (err) {
  console.error(err.message);
}

// ⚠️ NEVER pass user input directly — shell injection!
// ❌ DANGEROUS:
exec(`find ${req.query.path} -name "*.txt"`); // path = "; rm -rf /"

// ✅ SAFE: use execFile with separate arguments
execFile('find', [req.query.path, '-name', '*.txt'], callback);
// Or sanitize the input strictly
```

---

## spawn — Streaming, Large Output

`spawn` launches a binary directly (no shell) and exposes its stdin, stdout, and stderr as Node.js streams. Because it streams rather than buffers, it is safe for commands that produce large output — video encoding, log tailing, database dumps — where buffering everything in memory would cause an OOM crash. The absence of a shell also eliminates injection risk when you pass arguments as an array. Use `spawn` as the default choice for running external binaries; switch to `exec` only when you specifically need shell features and trust the input completely.

```javascript
const { spawn } = require('child_process');

// Stream output of long-running command:
const ffmpeg = spawn('ffmpeg', [
  '-i', 'input.mp4',
  '-vf', 'scale=1280:720',
  '-c:v', 'libx264',
  'output.mp4'
]);

ffmpeg.stdout.on('data', (data) => process.stdout.write(data));
ffmpeg.stderr.on('data', (data) => process.stderr.write(data));

ffmpeg.on('close', (code) => {
  console.log(`ffmpeg exited with code ${code}`);
});

ffmpeg.on('error', (err) => {
  console.error('Failed to start ffmpeg:', err.message);
  // err.code === 'ENOENT' means ffmpeg not installed
});

// Pipe stdin to child process:
const grep = spawn('grep', ['error']);
fs.createReadStream('app.log').pipe(grep.stdin);
grep.stdout.pipe(process.stdout);

// promisify spawn:
function spawnAsync(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string; code: number }>(
    (resolve, reject) => {
      const child = spawn(command, args);
      const stdout: string[] = [];
      const stderr: string[] = [];

      child.stdout.on('data', d => stdout.push(d.toString()));
      child.stderr.on('data', d => stderr.push(d.toString()));
      child.on('error', reject);
      child.on('close', code => resolve({
        stdout: stdout.join(''),
        stderr: stderr.join(''),
        code: code ?? 0
      }));
    }
  );
}
```

---

## fork — Node.js to Node.js with IPC

`fork` is a specialised form of `spawn` that always runs a Node.js script and automatically creates an IPC (Inter-Process Communication) channel between parent and child. This channel enables structured message passing via `child.send()` / `process.on('message')` without serializing to shell arguments or pipes. The child runs in a completely separate V8 instance with its own heap, so a crash or memory leak in the child cannot corrupt the parent. IPC messages are serialized with `JSON.stringify`, so only JSON-safe values can be passed. Use `fork` when you need reliable two-way communication between Node.js processes; for one-shot computation with a result, a Worker Thread is lighter-weight.

```javascript
// parent.js:
const { fork } = require('child_process');
const path = require('path');

const child = fork(path.join(__dirname, 'worker.js'), [], {
  // Pass environment variables:
  env: { ...process.env, WORKER_ID: '1' },
  // Silence child output (pipe to parent's streams):
  silent: false
});

// Send message to child:
child.send({ type: 'COMPUTE', data: [1, 2, 3, 4, 5] });

// Receive message from child:
child.on('message', (message) => {
  console.log('Result from child:', message.result);
});

child.on('exit', (code, signal) => {
  console.log(`Child exited: code=${code} signal=${signal}`);
});

child.on('error', (err) => {
  console.error('Child error:', err);
});

// Kill child:
child.kill('SIGTERM');
child.kill(); // defaults to SIGTERM

// ---

// worker.js (child process):
process.on('message', async ({ type, data }) => {
  if (type === 'COMPUTE') {
    const result = data.reduce((a, b) => a + b, 0);

    // Send result back:
    process.send({ type: 'RESULT', result });
  }
});

// Handle graceful shutdown:
process.on('SIGTERM', () => {
  // cleanup
  process.exit(0);
});
```

---

## fork for CPU-Intensive Work

The single-threaded event loop means that a long synchronous computation (prime factorisation, image manipulation, ML inference) stalls every other request for its entire duration. Forking a child process for that computation moves it off the main thread so the event loop remains responsive. The pattern is: receive an HTTP request, fork a worker, send the input via IPC, receive the result via IPC, respond to the client. Note that forking per request is expensive — for sustained CPU work, maintain a pool of pre-forked workers and queue tasks to them rather than spawning fresh processes on every request.

```javascript
// Offload heavy computation without blocking event loop:

// heavy-compute.js:
const { parentPort } = require('worker_threads');
// (or for fork: process.on / process.send)

process.on('message', ({ task, data }) => {
  if (task === 'factor') {
    const factors = primeFactors(data.n); // expensive
    process.send({ factors });
  }
});

function primeFactors(n) {
  const factors = [];
  for (let i = 2; i * i <= n; i++) {
    while (n % i === 0) { factors.push(i); n /= i; }
  }
  if (n > 1) factors.push(n);
  return factors;
}

// ---

// In Express handler — don't block the event loop:
app.get('/factor/:n', (req, res) => {
  const child = fork('./heavy-compute.js');

  child.send({ task: 'factor', data: { n: parseInt(req.params.n) } });

  child.once('message', ({ factors }) => {
    res.json({ factors });
    child.kill();
  });

  child.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });

  // Timeout:
  setTimeout(() => {
    child.kill();
    res.status(408).json({ error: 'Computation timeout' });
  }, 10_000);
});
```

---

## detached — Background Processes

By default, a Node.js process stays alive as long as any of its child processes are still running. The `detached` option breaks this relationship: the child becomes the leader of a new process group and is no longer tracked by the parent. Combined with `stdio: 'ignore'` (so the child has no inherited file descriptors) and `child.unref()` (so the parent's event loop stops waiting), the child becomes a true background daemon that survives the parent exiting. This pattern is used to launch long-running background jobs, log tailers, or daemon processes from a short-lived script.

```javascript
// Start a process that survives parent exit:
const { spawn } = require('child_process');

const child = spawn('node', ['background-job.js'], {
  detached: true,
  stdio: 'ignore'  // must ignore stdio for proper detachment
});

child.unref(); // allow parent to exit without waiting for child

console.log(`Background job started, PID: ${child.pid}`);
process.exit(0); // parent can exit — child continues running
```

---

## exec vs execFile vs spawn vs fork

```
                 exec     execFile  spawn    fork
Shell            Yes      No        No       No
Buffers output   Yes      Yes       No*      No*
IPC channel      No       No        No       Yes
Use for          Shell cmds  Binaries  Streaming  Node.js workers

*spawn/fork stream via events, no buffering = suitable for large output
exec/execFile buffer entire output in memory = only for small output
```

---

## Interview Questions

**Q: What is the difference between `exec` and `spawn`?**
A: `exec` runs in a shell (so you can use `&&`, pipes, glob expansion), buffers all stdout/stderr in memory, and calls back with the complete output. Good for simple commands with small output. `spawn` runs the binary directly (no shell), streams I/O via events, and doesn't buffer — suitable for long-running processes or large output. `spawn` is more efficient; `exec` is more convenient.

**Q: When would you use `fork` instead of Worker Threads?**
A: `fork` for: (1) running existing Node.js scripts as separate processes (more isolation — crash doesn't affect parent), (2) when you need to run legacy code or code that modifies global state, (3) when you want separate memory space. Worker Threads for: (1) shared memory via `SharedArrayBuffer`, (2) lower overhead (same process), (3) new code you write specifically as a worker.

**Q: Why is `exec` vulnerable to shell injection and how do you prevent it?**
A: `exec` passes the command string to the shell. Unsanitized user input like `"; rm -rf /"` gets executed by the shell. Prevention: (1) use `execFile` or `spawn` with separate arguments array — the user input is passed as a literal argument, not parsed by shell. (2) Validate/whitelist user input before using. (3) Never concatenate user input into shell command strings.

**Q: What does `child.unref()` do?**
A: Tells the Node.js event loop not to wait for this child process to exit before exiting itself. Normally, if a child is running, the parent's event loop keeps running (waiting). After `unref()`, the parent can exit even while the child is running. Combine with `detached: true` and `stdio: 'ignore'` for a true background daemon process.
