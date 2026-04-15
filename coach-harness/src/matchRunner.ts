import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { Chess } from "chess.js";
import { v4 as uuidv4 } from "uuid";
import { requestCoachInsight } from "./coachClient";
import { runTrinityMove, StockfishRunner } from "./engines";
import { MatchConfig, MatchState, MoveEvent } from "./types";

export class MatchRunner extends EventEmitter {
  readonly id = uuidv4();
  readonly state: MatchState;
  private readonly outDir: string;

  constructor(private readonly config: MatchConfig) {
    super();
    this.outDir = path.resolve(process.cwd(), "runs", this.id);
    fs.mkdirSync(this.outDir, { recursive: true });

    this.state = {
      id: this.id,
      status: "idle",
      fen: new Chess().fen(),
      ply: 0,
      result: "*",
      winner: "Unknown",
      trinityMoves: [],
      stockfishMoves: [],
      moves: [],
      insights: []
    };
  }

  async run(): Promise<void> {
    const board = new Chess();
    const stockfish = new StockfishRunner(this.config.stockfishPath);

    this.state.status = "running";
    this.state.startedAt = new Date().toISOString();
    this.emitUpdate();

    try {
      for (let ply = 1; ply <= this.config.maxPlies; ply++) {
        const fenBefore = board.fen();
        const trinityTurn = board.turn() === (this.config.modularPlaysWhite ? "w" : "b");
        const engine = trinityTurn ? "Trinity" : "Stockfish";

        const moveUci = trinityTurn
          ? await runTrinityMove(this.config.enginePath, fenBefore, this.config.movetimeMs)
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

        const ev: MoveEvent = {
          ply,
          fenBefore,
          fenAfter: board.fen(),
          moveUci,
          engine,
          legal,
          timestamp: new Date().toISOString()
        };

        this.state.moves.push(ev);
        if (engine === "Trinity") this.state.trinityMoves.push(moveUci);
        else this.state.stockfishMoves.push(moveUci);

        this.state.ply = ply;
        this.state.fen = board.fen();
        this.persistArtifacts();

        if (this.config.coachEnabled && ply % this.config.coachEveryNPlies === 0) {
          const insight = await requestCoachInsight({
            config: this.config,
            moves: this.state.moves,
            fen: this.state.fen,
            ply
          });
          this.state.insights.push(insight);
          this.persistArtifacts();
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
      this.persistArtifacts();
    } catch (err: any) {
      this.state.status = "error";
      this.state.error = err?.message || String(err);
      this.state.endedAt = new Date().toISOString();
      this.emitUpdate();
      this.persistArtifacts();
    } finally {
      stockfish.stop();
    }
  }

  private persistArtifacts(): void {
    fs.writeFileSync(path.join(this.outDir, "events.json"), JSON.stringify(this.state.moves, null, 2), "utf8");
    fs.writeFileSync(path.join(this.outDir, "coach.json"), JSON.stringify(this.state.insights, null, 2), "utf8");
    fs.writeFileSync(path.join(this.outDir, "report.json"), JSON.stringify(this.state, null, 2), "utf8");
  }

  private emitUpdate(): void {
    this.emit("update", this.state);
  }
}

function inferResult(board: Chess, mover: "Trinity" | "Stockfish"): string {
  if (board.isCheckmate()) {
    return mover === "Trinity" ? "1-0" : "0-1";
  }
  if (board.isDraw() || board.isStalemate() || board.isInsufficientMaterial() || board.isThreefoldRepetition()) {
    return "1/2-1/2";
  }
  return "*";
}

function inferWinner(result: string): "Trinity" | "Stockfish" | "Draw" | "Unknown" {
  if (result.startsWith("1-0")) return "Trinity";
  if (result.startsWith("0-1")) return "Stockfish";
  if (result.startsWith("1/2-1/2")) return "Draw";
  return "Unknown";
}
