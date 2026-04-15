"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchRunner = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const events_1 = require("events");
const chess_js_1 = require("chess.js");
const uuid_1 = require("uuid");
const coachClient_1 = require("./coachClient");
const engines_1 = require("./engines");
class MatchRunner extends events_1.EventEmitter {
    config;
    id = (0, uuid_1.v4)();
    state;
    outDir;
    constructor(config) {
        super();
        this.config = config;
        this.outDir = path_1.default.resolve(process.cwd(), "runs", this.id);
        fs_1.default.mkdirSync(this.outDir, { recursive: true });
        this.state = {
            id: this.id,
            status: "idle",
            fen: new chess_js_1.Chess().fen(),
            ply: 0,
            result: "*",
            winner: "Unknown",
            trinityMoves: [],
            stockfishMoves: [],
            moves: [],
            insights: []
        };
    }
    async run() {
        const board = new chess_js_1.Chess();
        const stockfish = new engines_1.StockfishRunner(this.config.stockfishPath);
        this.state.status = "running";
        this.state.startedAt = new Date().toISOString();
        this.emitUpdate();
        try {
            for (let ply = 1; ply <= this.config.maxPlies; ply++) {
                const fenBefore = board.fen();
                const trinityTurn = board.turn() === (this.config.modularPlaysWhite ? "w" : "b");
                const engine = trinityTurn ? "Trinity" : "Stockfish";
                const moveUci = trinityTurn
                    ? await (0, engines_1.runTrinityMove)(this.config.enginePath, fenBefore, this.config.movetimeMs)
                    : await stockfish.move(fenBefore, this.config.movetimeMs);
                const legal = board.moves({ verbose: true }).some((m) => m.from + m.to + (m.promotion || "") === moveUci);
                if (!legal) {
                    this.state.result = trinityTurn ? "0-1 (Trinity Illegal/Timeout)" : "1-0 (Stockfish Illegal/Timeout)";
                    this.state.winner = trinityTurn ? "Stockfish" : "Trinity";
                    this.state.status = "finished";
                    this.state.error = `Illegal or missing move from ${engine}: ${moveUci}`;
                    break;
                }
                board.move(moveUci);
                const ev = {
                    ply,
                    fenBefore,
                    fenAfter: board.fen(),
                    moveUci,
                    engine,
                    legal,
                    timestamp: new Date().toISOString()
                };
                this.state.moves.push(ev);
                if (engine === "Trinity")
                    this.state.trinityMoves.push(moveUci);
                else
                    this.state.stockfishMoves.push(moveUci);
                this.state.ply = ply;
                this.state.fen = board.fen();
                fs_1.default.appendFileSync(path_1.default.join(this.outDir, "events.ndjson"), JSON.stringify(ev) + "\n", "utf8");
                if (this.config.coachEnabled && ply % this.config.coachEveryNPlies === 0) {
                    const insight = await (0, coachClient_1.requestCoachInsight)({
                        config: this.config,
                        moves: this.state.moves,
                        fen: this.state.fen,
                        ply
                    });
                    this.state.insights.push(insight);
                    fs_1.default.appendFileSync(path_1.default.join(this.outDir, "coach.ndjson"), JSON.stringify(insight) + "\n", "utf8");
                }
                if (board.isGameOver()) {
                    this.state.result = inferResult(board, engine);
                    this.state.winner = inferWinner(this.state.result);
                    this.state.status = "finished";
                    break;
                }
                this.emitUpdate();
            }
            if (this.state.status !== "finished") {
                this.state.status = "finished";
                this.state.result = "1/2-1/2 (Max plies)";
                this.state.winner = "Draw";
            }
            this.state.endedAt = new Date().toISOString();
            this.emitUpdate();
            fs_1.default.writeFileSync(path_1.default.join(this.outDir, "report.json"), JSON.stringify(this.state, null, 2), "utf8");
        }
        catch (err) {
            this.state.status = "error";
            this.state.error = err?.message || String(err);
            this.state.endedAt = new Date().toISOString();
            this.emitUpdate();
            fs_1.default.writeFileSync(path_1.default.join(this.outDir, "report.json"), JSON.stringify(this.state, null, 2), "utf8");
        }
        finally {
            stockfish.stop();
        }
    }
    emitUpdate() {
        this.emit("update", this.state);
    }
}
exports.MatchRunner = MatchRunner;
function inferResult(board, mover) {
    if (board.isCheckmate()) {
        return mover === "Trinity" ? "1-0" : "0-1";
    }
    if (board.isDraw() || board.isStalemate() || board.isInsufficientMaterial() || board.isThreefoldRepetition()) {
        return "1/2-1/2";
    }
    return "*";
}
function inferWinner(result) {
    if (result.startsWith("1-0"))
        return "Trinity";
    if (result.startsWith("0-1"))
        return "Stockfish";
    if (result.startsWith("1/2-1/2"))
        return "Draw";
    return "Unknown";
}
