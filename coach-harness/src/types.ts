export type EngineName = "Trinity" | "Stockfish";

export interface MatchConfig {
  enginePath: string;
  stockfishPath: string;
  movetimeMs: number;
  maxPlies: number;
  modularPlaysWhite: boolean;
  coachEveryNPlies: number;
  coachEnabled: boolean;
}

export interface MoveEvent {
  ply: number;
  fenBefore: string;
  fenAfter: string;
  moveUci: string;
  engine: EngineName;
  legal: boolean;
  timestamp: string;
}

export interface CoachInsight {
  ply: number;
  timestamp: string;
  summary: string;
}

export interface MatchState {
  id: string;
  status: "idle" | "running" | "finished" | "error";
  startedAt?: string;
  endedAt?: string;
  fen: string;
  ply: number;
  result: string;
  winner: "Trinity" | "Stockfish" | "Draw" | "Unknown";
  trinityMoves: string[];
  stockfishMoves: string[];
  moves: MoveEvent[];
  insights: CoachInsight[];
  error?: string;
}
