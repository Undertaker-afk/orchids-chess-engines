# Module Integration Guide for AI Agents

This file describes how to add/update Trinity modules safely.

## Current Module Order

The build expects ordered modules in `src/`:

1. `00_header.js`
2. `01_constants.js`
3. `02_zobrist.js`
4. `03_state.js`
5. `04_pieces.js`
6. `05_make_unmake.js`
7. `06_attacks.js`
8. `07_see.js`
9. `08_movegen.js`
10. `09_evaluate.js`
11. `10_ordering.js`
12. `11_search.js`
13. `12_fen.js`
14. `13_main.js`

## How to Update Existing Modules

- Keep public cross-module globals stable unless intentionally refactoring all references.
- Keep move encoding/decoding consistent across:
  - `08_movegen.js`
  - `05_make_unmake.js`
  - `10_ordering.js`
  - `11_search.js`
- For search changes, verify no heavy O(N) work is added in hot move loops.
- For eval changes, keep sign conventions and side-to-move assumptions consistent.

## How to Add a New Module

If adding a new numbered module (example: `10b_new_feature.js` is not recommended), prefer sequential naming like `14_new_feature.js` and then:

1. Ensure order is intentional for dependencies.
2. Update `build.js` expected-module check range (currently `00`..`13`).
3. Re-run build and syntax check.
4. Validate behavior with head-to-head tests.

Note: Numbered ordering controls initialization and symbol availability after concatenation.

## Tournament Compatibility Rules

Any logic that may reach final single-file tournament submission must comply with:

- stdin FEN input, stdout single UCI move output
- legal move only
- <= 5 seconds per move
- no forbidden APIs (`fs`, `child_process`, network)

## Performance Guardrails

- Prefer typed arrays for dense tables.
- Minimize allocations in `search` and `quiesce`.
- Keep time checks cheap and periodic.
- Use pruning heuristics conservatively and validate with matches.

## Validation Commands

```powershell
node .\build.js
node --check .\dist\Trinity-modular.js
python .\scripts\head_to_head_modular.py --games 8 --movetime 1200 --timeout 8 --max-plies 220
```

## Documentation Requirement

For each meaningful engine change:

1. Add an entry to `dist/CHANGELOG.md`
2. Include changed files and validation commands
3. Keep newest entry at top
