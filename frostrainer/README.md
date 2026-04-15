# FrostTrainer

Portable CPU-only coaching harness for chess engines that accept a FEN on `stdin` and print a UCI move on `stdout`.

This package is meant to be shareable. It is not tied to Trinity internals, FrostD4D weight injection, or GPU forge code. It runs games, reviews losses with a stronger coach engine, and emits lesson reports in JSON and Markdown.

## What It Does

- Runs a student engine against one or more CPU opponents.
- Reviews only the student positions from lost games.
- Asks a stronger coach engine what it would have played.
- Records disagreements as coaching moments.
- Tags those moments with lightweight categories such as `material`, `king_safety`, `development`, `pawn_structure`, `tactics`, and `endgame`.

## Why It Exists Beside `coach-harness/`

`coach-harness/` in this repo is the Trinity-specific live web/API flow.

`frostrainer/` is the portable offline sibling:

- no web UI required
- no external coach API required
- works with any single-shot engine that follows the FEN/UCI contract
- produces lightweight lesson reports you can diff, share, or archive

## Engine Contract

Your engine should:

- read exactly one FEN position from `stdin`
- print exactly one legal UCI move on `stdout`
- exit cleanly

The harness will try to compile JS engines in-process for speed. If that fails, it falls back to spawning the engine as a process.

By default, `frostrainer` uses the bundled Stockfish single-shot wrapper at `engines/stockfish_single_shot.mjs` as its coach.

The default student/opponent timeout is `5000ms`, which matches the common tournament-style single-move budget better than the shorter academy defaults this started from.

## Usage

From the repo root:

```bash
npm run frostrainer -- \
  --student trinity=dist/Trinity-modular.js \
  --opponent baseline=Trinity-1.3.js \
  --coach stockfish \
  --games 4 \
  --cycles 2
```

Or call the harness directly:

```bash
node frostrainer/frostrainer.mjs \
  --student my_bot=./path/to/agent.js \
  --opponents spar1=./opp_a.js,spar2=./opp_b.js \
  --coach stockfish \
  --out-dir ./frostrainer/out
```

## Key Flags

- `--student <engine>`: required
- `--opponent <engine>`: required, repeatable
- `--opponents a,b,c`: comma-separated alternative to repeated `--opponent`
- `--coach <engine>`: coach engine; defaults to the bundled Stockfish wrapper
- `--games <n>`: games per cycle
- `--cycles <n>`: number of cycles
- `--timeout-ms <ms>`: student/opponent timeout per move, default `5000`
- `--coach-timeout-ms <ms>`: coach timeout per move
- `--out-dir <dir>`: where reports are written
- `--prefix <name>`: output filename prefix

## Output

The harness writes two files:

- `<prefix>_coach_report.json`
- `<prefix>_coach_report.md`

The report includes:

- match record
- cycle summaries
- reviewed positions from losses
- lesson breakdown by category, phase, and opponent
- top coaching disagreements

## Sharing

The folder is intentionally self-contained:

- `frostrainer.mjs`
- `src/dojo_chess.mjs`
- `src/dojo_runtime.mjs`
- `package.json`

If you want to hand this to another competitor, they mostly need this folder plus any student/opponent engines that follow the same FEN/UCI single-shot contract. In this repo, the default bundled coach path resolves to Stockfish through `engines/stockfish_single_shot.mjs`.
