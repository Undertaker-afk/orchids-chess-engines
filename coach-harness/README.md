# Coach Harness (TypeScript + Web UI)

Runs Trinity modular engine vs Stockfish, records all moves/events, and asks a coach model for feedback every N plies (default: 5).

## What it does

- Trinity vs Stockfish match runner
- Full move/event logging to `coach-harness/runs/<match-id>/`
- Coach feedback every `coachEveryNPlies`
- Web UI for live state, FEN, move list, and coach insights

## Coach endpoint

OpenAI-compatible endpoint:

- Default URL: `https://opencode.ai/zen/v1/chat/completions`
- Default model: `minimax-m2.5-free`
- Reads API key from `OPEN_CODE_KEY`

Environment variables:

- `OPEN_CODE_KEY` (required for coach calls)
- `OPEN_CODE_ENDPOINT` (optional override)
- `OPEN_CODE_MODEL` (optional override)
- `HARNESS_PORT` (optional, default `5177`)

## Install

```powershell
cd coach-harness
npm install
```

## Run (dev)

Backend API:

```powershell
cd coach-harness
npm run dev
```

React frontend (shadcn-style UI + real board):

```powershell
cd coach-harness\frontend
npm install
npm run dev
```

Open:

- Backend API: `http://localhost:5177`
- Frontend UI: `http://localhost:5173`

Notes:

- The frontend uses `react-chessboard` for a real board view.
- The frontend calls backend endpoints at `http://localhost:5177/api/...`.

## Build

```powershell
cd coach-harness
npm run build
```

## Output files

Per match ID under `coach-harness/runs/<match-id>/`:

- `events.ndjson` - all move events
- `coach.ndjson` - periodic coach responses
- `report.json` - final merged state/report
