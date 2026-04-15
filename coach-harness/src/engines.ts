import { spawn } from "child_process";

export async function runTrinityMove(enginePath: string, fen: string, movetimeMs: number): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn("node", [enginePath, "--movetime", String(movetimeMs)], { stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "";
    let done = false;

    const finish = (move: string) => {
      if (done) return;
      done = true;
      try { proc.kill(); } catch {}
      resolve(move || "0000");
    };

    proc.stdout.on("data", (d) => {
      buffer += d.toString();
      const lines = buffer.split(/\r?\n/);
      while (lines.length > 1) {
        const line = (lines.shift() || "").trim();
        buffer = lines.join("\n");
        if (line) return finish(line);
      }
    });

    proc.stdin.write(fen + "\n");
    proc.stdin.end();

    setTimeout(() => finish("0000"), movetimeMs + 2500);
    proc.on("error", () => finish("0000"));
    proc.on("close", () => {
      const line = buffer.trim();
      if (!done && line) finish(line);
    });
  });
}

export class StockfishRunner {
  private proc;
  private ready = false;
  private lineBuffer = "";
  private lineWaiters: Array<(line: string) => void> = [];

  constructor(private readonly stockfishPath: string) {
    const useNode = this.stockfishPath.toLowerCase().endsWith(".js");
    this.proc = useNode
      ? spawn("node", [this.stockfishPath], { stdio: ["pipe", "pipe", "pipe"] })
      : spawn(this.stockfishPath, [], { stdio: ["pipe", "pipe", "pipe"] });

    this.proc.stdout.on("data", (d) => {
      this.lineBuffer += d.toString();
      const lines = this.lineBuffer.split(/\r?\n/);
      this.lineBuffer = lines.pop() || "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        const waiter = this.lineWaiters.shift();
        if (waiter) waiter(line);
      }
    });
  }

  private send(cmd: string): void {
    this.proc.stdin.write(cmd + "\n");
  }

  async init(): Promise<void> {
    if (this.ready) return;
    this.send("uci");
    await this.waitFor((line) => line === "uciok", 3000);
    this.send("isready");
    await this.waitFor((line) => line === "readyok", 3000);
    this.ready = true;
  }

  async move(fen: string, movetimeMs: number): Promise<string> {
    await this.init();

    return new Promise((resolve) => {
      let settled = false;

      const finish = (mv: string) => {
        if (settled) return;
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

  private waitFor(predicate: (line: string) => boolean, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      let done = false;
      const end = (ok: boolean, value?: string) => {
        if (done) return;
        done = true;
        if (ok) resolve(value || "");
        else reject(new Error("timeout"));
      };

      const timer = setTimeout(() => end(false), timeoutMs);

      const pump = () => {
        this.lineWaiters.push((line) => {
          if (predicate(line)) {
            clearTimeout(timer);
            end(true, line);
          } else {
            pump();
          }
        });
      };

      pump();

    });
  }

  stop(): void {
    try {
      this.send("quit");
      this.proc.kill();
    } catch {}
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
