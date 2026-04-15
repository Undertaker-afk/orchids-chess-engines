## Project: Trinity Chess Engines

This repository contains the Trinity chess engine family.
The active modular engine is built from ordered source modules in src/ into dist/Trinity-modular.js.

## Modular Engine Development Workflow

### 1) Install dependencies

Run once (or after dependency changes):

```powershell
npm install
```

### 2) Edit modular source

Main modular files:

- src/00_header.js
- src/01_constants.js
- src/02_zobrist.js
- src/03_state.js
- src/04_pieces.js
- src/05_make_unmake.js
- src/06_attacks.js
- src/07_see.js
- src/08_movegen.js
- src/09_evaluate.js
- src/10_ordering.js
- src/11_search.js
- src/12_fen.js
- src/13_main.js

### 3) Build and syntax-check

```powershell
node .\build.js
node --check .\dist\Trinity-modular.js
```

## Backup Workflow (Unfixed Baseline)

Before applying risky search/eval changes, create an unfixed snapshot.

```powershell
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'; \
$backupDir = Join-Path 'backups' ("unfixed-" + $ts); \
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null; \
node .\build.js; \
Copy-Item .\src\11_search.js (Join-Path $backupDir '11_search.js'); \
Copy-Item .\src\02_zobrist.js (Join-Path $backupDir '02_zobrist.js'); \
Copy-Item .\dist\Trinity-modular.js (Join-Path $backupDir 'Trinity-modular.unfixed.js'); \
Copy-Item .\dist\Trinity-modular.js .\dist\Trinity-modular.unfixed.js -Force; \
Write-Output ("BACKUP_DIR=" + $backupDir)
```

Result:

- Timestamped source snapshot in backups/unfixed-YYYYMMDD-HHMMSS/
- Frozen unfixed artifact at dist/Trinity-modular.unfixed.js

## A/B Testing: Backup vs New Build

After implementing changes, rebuild and run head-to-head:

```powershell
node .\build.js; \
node --check .\dist\Trinity-modular.js; \
python .\scripts\head_to_head_modular.py --games 8 --movetime 1200 --timeout 8 --max-plies 220
```

The default test pairing is:

- Engine A: dist/Trinity-modular.unfixed.js
- Engine B: dist/Trinity-modular.js

Quick smoke run:

```powershell
python .\scripts\head_to_head_modular.py --games 2 --movetime 120 --timeout 4 --max-plies 100
```

## Changelog Process

After each notable engine change:

1. Update dist/CHANGELOG.md
2. Add a new top entry with date, summary, modified modules, and test command/results
3. Keep newest entry first

Suggested entry format:

```markdown
## YYYY-MM-DD - Short title

### Changed
- Item
- Item

### Files
- src/..file..
- src/..file..

### Validation
- Command used
- Result summary
```

## NPM Scripts

- npm run build:engine
- npm run test:api