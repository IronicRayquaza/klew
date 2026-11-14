#!/usr/bin/env node
// Klew launcher: runs the Python package (PyPI "klew") with uvx, so `npx -y klew mcp` works anywhere.
// The same file is the entry point of the Claude Desktop extension (.mcpb).
'use strict'
const { spawn } = require('node:child_process')
const path = require('node:path')

const pkg = require(path.join(__dirname, '..', 'package.json'))
const spec = process.env.KLEW_PY_SPEC || `klew==${pkg.version}`   // override for local testing
const args = process.argv.slice(2)

const fs = require('node:fs')
const os = require('node:os')

// GUI apps (e.g. Claude Desktop on macOS) start with a minimal PATH, so also look where uv/pipx usually live.
const home = os.homedir()
const EXTRA_DIRS = process.platform === 'win32'
  ? [path.join(home, '.local', 'bin'), path.join(home, '.cargo', 'bin'), path.join(home, 'AppData', 'Roaming', 'Python', 'Scripts')]
  : [path.join(home, '.local', 'bin'), path.join(home, '.cargo', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']

function resolve(cmd) {
  const exe = process.platform === 'win32' ? [cmd + '.exe', cmd + '.cmd', cmd] : [cmd]
  const dirs = [...(process.env.PATH || '').split(path.delimiter), ...EXTRA_DIRS].filter(Boolean)
  for (const dir of dirs) {
    for (const name of exe) {
      const full = path.join(dir, name)
      try { fs.accessSync(full, fs.constants.X_OK); return full } catch { /* keep looking */ }
    }
  }
  return null
}

const candidates = [
  ['uvx', ['--from', spec, 'klew', ...args]],
  ['pipx', ['run', '--spec', spec, 'klew', ...args]],
  ['klew', args],
]
const found = candidates.map(([cmd, a]) => [resolve(cmd), a]).find(([full]) => full)
if (!found) {
  process.stderr.write(
    'klew: needs Python tooling to run. Install uv (https://docs.astral.sh/uv/), e.g.\n' +
    '  macOS/Linux: curl -LsSf https://astral.sh/uv/install.sh | sh\n' +
    '  Windows:     powershell -c "irm https://astral.sh/uv/install.ps1 | iex"\n' +
    'or install the Python package directly: pip install klew\n')
  process.exit(127)
}

const [cmd, cmdArgs] = found
const child = spawn(cmd, cmdArgs, { stdio: 'inherit', env: process.env })
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig))
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)))
child.on('error', (err) => { process.stderr.write(`klew: failed to start ${cmd}: ${err.message}\n`); process.exit(1) })
