# Child Processes in Node.js

---

## Four Methods

```javascript
const { exec, execFile, spawn, fork } = require('child_process');

// exec  — runs command in shell, buffers output (for small output)
// execFile — runs file directly (no shell), buffers output
// spawn — runs command, streaming I/O (for large output)
// fork  — special spawn for Node.js scripts, has IPC channel
```

---

## exec — Shell Commands

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
