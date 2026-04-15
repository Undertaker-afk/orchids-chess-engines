"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const matchRunner_1 = require("./matchRunner");
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), "../.env") });
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use(express_1.default.json({ limit: "1mb" }));
const publicDir = path_1.default.resolve(process.cwd(), "public");
const matches = new Map();
const runners = new Map();
function defaultConfig() {
    return {
        enginePath: path_1.default.resolve(process.cwd(), "../dist/Trinity-modular.js"),
        stockfishPath: path_1.default.resolve(process.cwd(), "../node_modules/stockfish/bin/stockfish.js"),
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
    const cfg = { ...defaultConfig(), ...(req.body || {}) };
    const runner = new matchRunner_1.MatchRunner(cfg);
    runners.set(runner.id, runner);
    matches.set(runner.id, runner.state);
    runner.on("update", (state) => {
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
    if (!state)
        return res.status(404).json({ error: "Match not found" });
    res.json(state);
});
app.use(express_1.default.static(publicDir));
app.get("*", (_req, res) => {
    res.sendFile(path_1.default.join(publicDir, "index.html"));
});
const port = Number(process.env.HARNESS_PORT || 5177);
app.listen(port, () => {
    console.log(`Coach harness running on http://localhost:${port}`);
    console.log("OPEN_CODE_KEY configured:", process.env.OPEN_CODE_KEY ? "yes" : "no");
});
