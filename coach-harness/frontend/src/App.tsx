import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Activity, Bot, Gauge, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type MatchConfig = {
  enginePath: string;
  stockfishPath: string;
  movetimeMs: number;
  maxPlies: number;
  coachEveryNPlies: number;
  coachEnabled: boolean;
};

type MatchState = {
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
  moves: Array<{ ply: number; engine: "Trinity" | "Stockfish"; moveUci: string; legal: boolean; timestamp: string }>;
  insights: Array<{ ply: number; timestamp: string; summary: string }>;
  error?: string;
};

const API = "http://localhost:5177";

export default function App() {
  const [cfg, setCfg] = useState<MatchConfig | null>(null);
  const [matchId, setMatchId] = useState<string>("");
  const [state, setState] = useState<MatchState | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    loadDefaults();
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  async function loadDefaults() {
    const res = await fetch(`${API}/api/defaults`);
    const data = await res.json();
    setCfg(data);
  }

  function updateCfg<K extends keyof MatchConfig>(key: K, value: MatchConfig[K]) {
    if (!cfg) return;
    setCfg({ ...cfg, [key]: value });
  }

  async function startMatch() {
    if (!cfg) return;

    const res = await fetch(`${API}/api/matches/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg)
    });

    const data = await res.json();
    setMatchId(data.id);

    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => void pollState(data.id), 700);

    await pollState(data.id);
  }

  async function pollState(id = matchId) {
    if (!id) return;
    const res = await fetch(`${API}/api/matches/${id}`);
    if (!res.ok) return;
    const data: MatchState = await res.json();
    setState(data);

    if ((data.status === "finished" || data.status === "error") && timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  const score = useMemo(() => {
    if (!state) return { trinity: 0, stockfish: 0, draws: 0 };
    let t = 0;
    let s = 0;
    for (const m of state.moves) {
      if (m.engine === "Trinity") t++;
      else s++;
    }
    return { trinity: t, stockfish: s, draws: state.result.startsWith("1/2-1/2") ? 1 : 0 };
  }, [state]);

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Trinity Coach Harness</h1>
          <p className="text-sm text-muted">React + shadcn-style UI + live chessboard + coach telemetry</p>
        </div>
        <div className="flex gap-2">
          <Badge>Backend: {state?.status || "idle"}</Badge>
          {matchId ? <Badge>Match: {matchId.slice(0, 8)}</Badge> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Run Config</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Modular Engine Path</Label>
              <Input value={cfg?.enginePath || ""} onChange={(e) => updateCfg("enginePath", e.target.value)} />
            </div>
            <div>
              <Label>Stockfish Path</Label>
              <Input value={cfg?.stockfishPath || ""} onChange={(e) => updateCfg("stockfishPath", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Move Time (ms)</Label>
                <Input type="number" value={cfg?.movetimeMs || 0} onChange={(e) => updateCfg("movetimeMs", Number(e.target.value))} />
              </div>
              <div>
                <Label>Max Plies</Label>
                <Input type="number" value={cfg?.maxPlies || 0} onChange={(e) => updateCfg("maxPlies", Number(e.target.value))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Coach Every N Plies</Label>
                <Input type="number" value={cfg?.coachEveryNPlies || 0} onChange={(e) => updateCfg("coachEveryNPlies", Number(e.target.value))} />
              </div>
              <div>
                <Label>Coach Enabled</Label>
                <select
                  className="h-10 w-full rounded-md border border-border bg-[#0c1322] px-3 text-sm"
                  value={String(cfg?.coachEnabled ?? true)}
                  onChange={(e) => updateCfg("coachEnabled", e.target.value === "true")}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </div>
            </div>
            <Button className="w-full" onClick={startMatch} disabled={!cfg || state?.status === "running"}>
              Start Match
            </Button>
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Live Board</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border border-border p-2 flex items-center gap-2"><Trophy size={16}/> Winner: <b>{state?.winner || "Unknown"}</b></div>
              <div className="rounded-lg border border-border p-2 flex items-center gap-2"><Gauge size={16}/> Result: <b>{state?.result || "*"}</b></div>
              <div className="rounded-lg border border-border p-2 flex items-center gap-2"><Bot size={16}/> Trinity Moves: <b>{state?.trinityMoves.length || 0}</b></div>
              <div className="rounded-lg border border-border p-2 flex items-center gap-2"><Activity size={16}/> Stockfish Moves: <b>{state?.stockfishMoves.length || 0}</b></div>
            </div>
            <div className="mx-auto max-w-[520px]">
              <Chessboard position={state?.fen || "start"} arePiecesDraggable={false} boardWidth={520} />
            </div>
            <div className="mt-3 text-xs text-muted break-all">{state?.fen || ""}</div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Coach Feed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[560px] overflow-auto space-y-3">
              {state?.insights?.length ? state.insights.map((i, idx) => (
                <div key={idx} className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted mb-2">Ply {i.ply} @ {new Date(i.timestamp).toLocaleTimeString()}</div>
                  <div className="text-sm whitespace-pre-wrap">{i.summary}</div>
                </div>
              )) : <div className="text-sm text-muted">No coach insights yet.</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Move Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 text-sm text-muted">
            Ply count split: Trinity {score.trinity} | Stockfish {score.stockfish} | Draw flags {score.draws}
          </div>
          <div className="max-h-[360px] overflow-auto rounded-lg border border-border p-3 font-mono text-xs">
            {state?.moves?.length
              ? state.moves.map((m) => `${String(m.ply).padStart(3)} | ${m.engine.padEnd(9)} | ${m.moveUci} | legal=${m.legal}`).join("\n")
              : "No moves yet."}
          </div>
          {state?.error ? <div className="mt-3 text-sm text-red-300">Error: {state.error}</div> : null}
        </CardContent>
      </Card>
    </main>
  );
}
