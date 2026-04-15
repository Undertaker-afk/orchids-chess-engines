import express from "express";
import path from "path";
import dotenv from "dotenv";
import { MatchRunner } from "./matchRunner";
import { MatchConfig, MatchState } from "./types";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (_req.method === "OPTIONS") return res.status(204).end();
  next();
});

const publicDir = path.resolve(process.cwd(), "public");
const matches = new Map<string, MatchState>();
const runners = new Map<string, MatchRunner>();

function defaultConfig(): MatchConfig {
  return {
    enginePath: path.resolve(process.cwd(), "../dist/Trinity-modular.js"),
    stockfishPath: path.resolve(process.cwd(), "../node_modules/stockfish/bin/stockfish.js"),
    movetimeMs: 1200,
    maxPlies: 180,
    modularPlaysWhite: true,
    coachEveryNPlies: 5,
    coachEnabled: true
  };
}

app.get("/api/defaults", (_req, res) => {
  res.json(defaultConfig());
});

app.post("/api/matches/start", async (req, res) => {
  const cfg: MatchConfig = { ...defaultConfig(), ...(req.body || {}) };

  const runner = new MatchRunner(cfg);
  runners.set(runner.id, runner);
  matches.set(runner.id, runner.state);

  runner.on("update", (state: MatchState) => {
    matches.set(state.id, { ...state });
  });

  runner.run().catch((err) => {
    const st = matches.get(runner.id);
    if (st) {
      st.status = "error";
      st.error = err?.message || String(err);
      matches.set(runner.id, st);
    }
  });

  res.json({ id: runner.id });
});

app.get("/api/matches/:id", (req, res) => {
  const state = matches.get(req.params.id);
  if (!state) return res.status(404).json({ error: "Match not found" });
  res.json(state);
});

app.use(express.static(publicDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const port = Number(process.env.HARNESS_PORT || 5177);
app.listen(port, () => {
  console.log(`Coach harness running on http://localhost:${port}`);
  console.log("OPEN_CODE_KEY configured:", process.env.OPEN_CODE_KEY ? "yes" : "no");
});
