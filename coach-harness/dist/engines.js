"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StockfishRunner = void 0;
exports.runTrinityMove = runTrinityMove;
const child_process_1 = require("child_process");
async function runTrinityMove(enginePath, fen, movetimeMs) {
    return new Promise((resolve) => {
        const proc = (0, child_process_1.spawn)("node", [enginePath, "--movetime", String(movetimeMs)], { stdio: ["pipe", "pipe", "pipe"] });
        let buffer = "";
        let done = false;
        const finish = (move) => {
            if (done)
                return;
            done = true;
            try {
                proc.kill();
            }
            catch { }
            resolve(move || "0000");
        };
        proc.stdout.on("data", (d) => {
            buffer += d.toString();
            const lines = buffer.split(/\r?\n/);
            while (lines.length > 1) {
                const line = (lines.shift() || "").trim();
                buffer = lines.join("\n");
                if (line)
                    return finish(line);
            }
        });
        proc.stdin.write(fen + "\n");
        proc.stdin.end();
        setTimeout(() => finish("0000"), movetimeMs + 2500);
        proc.on("error", () => finish("0000"));
        proc.on("close", () => {
            const line = buffer.trim();
            if (!done && line)
                finish(line);
        });
    });
}
class StockfishRunner {
    stockfishPath;
    proc;
    ready = false;
    lineBuffer = "";
    lineWaiters = [];
    constructor(stockfishPath) {
        this.stockfishPath = stockfishPath;
        const useNode = this.stockfishPath.toLowerCase().endsWith(".js");
        this.proc = useNode
            ? (0, child_process_1.spawn)("node", [this.stockfishPath], { stdio: ["pipe", "pipe", "pipe"] })
            : (0, child_process_1.spawn)(this.stockfishPath, [], { stdio: ["pipe", "pipe", "pipe"] });
        this.proc.stdout.on("data", (d) => {
            this.lineBuffer += d.toString();
            const lines = this.lineBuffer.split(/\r?\n/);
            this.lineBuffer = lines.pop() || "";
            for (const raw of lines) {
                const line = raw.trim();
                if (!line)
                    continue;
                const waiter = this.lineWaiters.shift();
                if (waiter)
                    waiter(line);
            }
        });
    }
    send(cmd) {
        this.proc.stdin.write(cmd + "\n");
    }
    async init() {
        if (this.ready)
            return;
        this.send("uci");
        await this.waitFor((line) => line === "uciok", 3000);
        this.send("isready");
        await this.waitFor((line) => line === "readyok", 3000);
        this.ready = true;
    }
    async move(fen, movetimeMs) {
        await this.init();
        return new Promise((resolve) => {
            let settled = false;
            const finish = (mv) => {
                if (settled)
                    return;
                settled = true;
                resolve(mv || "0000");
            };
            this.send(`position fen ${fen}`);
            this.send(`go movetime ${movetimeMs}`);
            this.waitFor((line) => line.startsWith("bestmove"), movetimeMs + 3500)
                .then((line) => {
                const mv = line.split(/\s+/)[1] || "0000";
                finish(mv);
            })
                .catch(() => {
                this.send("stop");
                // Give stockfish a short grace window after stop to emit bestmove.
                this.waitFor((line) => line.startsWith("bestmove"), 600)
                    .then((line) => finish(line.split(/\s+/)[1] || "0000"))
                    .catch(() => finish("0000"));
            });
            // Flush delayed engine output lines while preserving consumers.
            this.send("isready");
            this.waitFor((line) => line === "readyok", movetimeMs + 4500)
                .catch(() => undefined);
        });
    }
    waitFor(predicate, timeoutMs) {
        return new Promise((resolve, reject) => {
            let done = false;
            const end = (ok, value) => {
                if (done)
                    return;
                done = true;
                if (ok)
                    resolve(value || "");
                else
                    reject(new Error("timeout"));
            };
            const timer = setTimeout(() => end(false), timeoutMs);
            const pump = () => {
                this.lineWaiters.push((line) => {
                    if (predicate(line)) {
                        clearTimeout(timer);
                        end(true, line);
                    }
                    else {
                        pump();
                    }
                });
            };
            pump();
        });
    }
    stop() {
        try {
            this.send("quit");
            this.proc.kill();
        }
        catch { }
    }
}
exports.StockfishRunner = StockfishRunner;
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
