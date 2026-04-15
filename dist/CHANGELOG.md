## 2026-04-15 - Search and Hashing Stability/Performance Pass

### Changed
- Repetition draw check now requires two prior same-side repetitions in the current search path.
- Replaced expensive full history-table decay on overflow with saturating clamp in the hot beta-cutoff path.
- Switched Zobrist random initialization from Math.random() to deterministic xorshift32 seed for reproducible hashes.

### Files
- src/11_search.js
- src/02_zobrist.js
- scripts/head_to_head_modular.py

### Validation
- node .\build.js; node --check .\dist\Trinity-modular.js
- python .\scripts\head_to_head_modular.py --games 2 --movetime 120 --timeout 4 --max-plies 100
- Result: unfixed (A) 0.5 vs fixed (B) 1.5

---

## Changelog Format

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
