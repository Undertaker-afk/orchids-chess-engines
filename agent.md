# Trinity Engine Agent Instructions

This file defines how an AI coding agent should work in this repository.

## Goal

Maintain and improve the modular Trinity engine while preserving compatibility with the online tournament runner.

## Hard Platform Requirements

The final tournament submission must be a single file (`.js` for Node.js or `.py` for Python 3) that:

- Reads one FEN string from stdin (one line)
- Outputs exactly one legal UCI move to stdout
- Uses at most 5 seconds per move, 256MB memory, 1 CPU core
- Uses only allowed standard libraries
- Does not use forbidden APIs/modules (`fs`, `child_process`, network access)

Important runtime note:

- The platform may reuse the same process for multiple moves.
- Engine I/O must support repeated lines on stdin.
- Do not exit after first move unless required by the host.

## Node.js I/O Contract (Required Pattern)

Use `readline` input loop and write one move per line:

```js
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (fen) => {
  const move = pickMoveFromFen(fen); // must be legal
  process.stdout.write(move + '\n');
});
```

## Repository Architecture

- Source modules live in `src/` as numbered files (`00_...js` through `13_...js`).
- `build.js` concatenates them into:
  - `dist/Trinity-modular.js`
  - `dist/Trinity-modular.compact.js`
- The runtime entry behavior is in `src/13_main.js`.

## Development Rules

1. Keep logic changes in `src/` modules, not directly in generated `dist/` files.
2. Preserve deterministic behavior where possible (important for debugging and A/B tests).
3. Keep per-node work small in hot paths (`search`, `ordering`, `movegen`).
4. Avoid allocations in deep search loops where possible.
5. Never introduce forbidden modules in tournament-target engine code.

## Change Workflow

1. Edit relevant modules in `src/`.
2. Build and syntax-check:

```powershell
node .\build.js
node --check .\dist\Trinity-modular.js
```

3. Create backup baseline before risky changes (recommended):

```powershell
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'; \
$backupDir = Join-Path 'backups' ("unfixed-" + $ts); \
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null; \
node .\build.js; \
Copy-Item .\dist\Trinity-modular.js (Join-Path $backupDir 'Trinity-modular.unfixed.js'); \
Copy-Item .\dist\Trinity-modular.js .\dist\Trinity-modular.unfixed.js -Force
```

4. Run A/B validation:

```powershell
python .\scripts\head_to_head_modular.py --games 8 --movetime 1200 --timeout 8 --max-plies 220
```

5. Record the change in `dist/CHANGELOG.md`.

## Safety Checklist Before Finalizing

- Build succeeds
- `node --check` passes
- Engine returns legal UCI moves under timeout
- No `fs`, `child_process`, or network usage in tournament-target single-file build
- `dist/CHANGELOG.md` updated with what changed and how it was tested
