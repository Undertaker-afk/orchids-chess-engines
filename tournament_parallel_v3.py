#!/usr/bin/env python3
"""
ULTIMATE Chess Tournament Harness
→ Only Trinity-*.py engines
→ 3 games side-by-side + live leaderboard
→ Average response time tracking
→ Saves results to tournament/gamestats.txt
→ Saves final board of every game to tournament/endgame/
"""

import os
import sys
import time
import subprocess
import threading
import queue
import random
import chess
from datetime import datetime

# ====================== CONFIG ======================
GAMES_PER_PAIR = 2
MOVE_TIMEOUT_SEC = 5.0
OPENING_MOVE_TIMEOUT_SEC = 5.0
ELO_K = 32
START_ELO = 1200
MAX_CONCURRENT_GAMES = 2
MAX_PLIES_PER_GAME = 300
LIVE_REFRESH_SEC = 0.5
# ===================================================

engines = []
lock = threading.Lock()
active_games = []
completed_games = 0
total_games = 0
recent_results = []

# Response time tracking
response_times = {}  # engine_name -> list of move times


def render_board_ascii(fen: str):
    try:
        board = chess.Board(fen)
    except Exception:
        return ["<invalid board>"]

    rows = str(board).splitlines()
    return [f"{8 - i} {row}" for i, row in enumerate(rows)] + ["  a b c d e f g h"]

def clear():
    os.system('cls' if os.name == 'nt' else 'clear')

class Engine:
    def __init__(self, name, command):
        self.name = name
        self.command = command
        self.elo = START_ELO
        self.games = 0
        self.score = 0.0
        self.total_time = 0.0
        self.move_count = 0
        self.wins = 0
        self.draws = 0
        self.losses = 0

    def avg_response_time(self):
        return self.total_time / self.move_count if self.move_count > 0 else 0.0


class EngineRunner:
    def __init__(self, engine: Engine):
        self.engine = engine
        self.proc = None

    def start(self):
        if self.proc is None:
            self.proc = subprocess.Popen(
                self.engine.command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                bufsize=1
            )

    def get_move(self, fen, timeout_sec=MOVE_TIMEOUT_SEC):
        start = time.time()
        try:
            if self.proc is None:
                return "0000"

            self.proc.stdin.write(fen + "\n")
            self.proc.stdin.flush()

            q = queue.Queue(maxsize=1)

            def _read_line():
                try:
                    q.put(self.proc.stdout.readline(), timeout=0.01)
                except Exception:
                    pass

            reader = threading.Thread(target=_read_line, daemon=True)
            reader.start()
            reader.join(timeout_sec)

            if reader.is_alive():
                move = "0000"
            else:
                try:
                    move = (q.get_nowait().strip() or "0000")
                except queue.Empty:
                    move = "0000"

            elapsed = time.time() - start

            with lock:
                self.engine.total_time += elapsed
                self.engine.move_count += 1
                if self.engine.name not in response_times:
                    response_times[self.engine.name] = []
                response_times[self.engine.name].append(elapsed)

            return move
        except:
            return "0000"

    def stop(self):
        if self.proc:
            try: self.proc.terminate()
            except: pass
            self.proc = None


def update_elo(elo_a, elo_b, score_a):
    expected = 1 / (1 + 10 ** ((elo_b - elo_a) / 400))
    return (elo_a + ELO_K * (score_a - expected),
            elo_b + ELO_K * ((1 - score_a) - (1 - expected)))


def print_leaderboard():
    with lock:
        sorted_e = sorted(engines, key=lambda e: e.elo, reverse=True)
    print("🏆 LIVE LEADERBOARD 🏆".center(100))
    print(f"{'Rank':<4} {'Engine':<20} {'Elo':<7} {'Games':<6} {'Score':<6} {'Avg Time':<9} W/D/L")
    print("─" * 100)
    for rank, e in enumerate(sorted_e, 1):
        avg_t = f"{e.avg_response_time():.3f}s"
        print(f"{rank:<4} {e.name:<20} {e.elo:7.0f} {e.games:<6} {e.score:<6.1f} {avg_t:>8} {e.wins}/{e.draws}/{e.losses}")
    print("─" * 100)


def print_live_dashboard():
    with lock:
        sorted_e = sorted(engines, key=lambda e: e.elo, reverse=True)
        snapshot_active = [dict(g) for g in active_games]
        done = completed_games
        total = total_games
        latest = list(recent_results)

    clear()
    print("♟️  LIVE TOURNAMENT DASHBOARD".center(100))
    print(f"Progress: {done}/{total} games finished | Active: {len(snapshot_active)} | Max Parallel: {MAX_CONCURRENT_GAMES}")
    print("-" * 100)

    if snapshot_active:
        print("Active Games:")
        for g in snapshot_active:
            turn = "W" if g["turn"] else "B"
            print(f"  Game {g['game_id']:>2}: {g['white']} vs {g['black']} | Ply {g['ply']:>3} | Turn {turn}")

        print("-" * 100)
        print("Live Boards:")
        for g in snapshot_active:
            print(f"\nGame {g['game_id']}: {g['white']} (White) vs {g['black']} (Black)")
            for line in render_board_ascii(g["fen"]):
                print(f"  {line}")
    else:
        print("Active Games: (none)")

    print("-" * 100)
    print(f"{'Rank':<4} {'Engine':<20} {'Elo':<7} {'Games':<6} {'Score':<6} {'Avg Time':<9} W/D/L")
    print("-" * 100)
    for rank, e in enumerate(sorted_e, 1):
        avg_t = f"{e.avg_response_time():.3f}s"
        print(f"{rank:<4} {e.name:<20} {e.elo:7.0f} {e.games:<6} {e.score:<6.1f} {avg_t:>8} {e.wins}/{e.draws}/{e.losses}")

    print("-" * 100)
    if latest:
        print("Recent Results:")
        for line in latest[-6:]:
            print(f"  {line}")


def live_monitor(stop_event: threading.Event):
    while not stop_event.is_set():
        print_live_dashboard()
        time.sleep(LIVE_REFRESH_SEC)

    # Ensure one final fresh paint before returning control.
    print_live_dashboard()


def save_tournament_results():
    os.makedirs("tournament", exist_ok=True)

    with open("tournament/gamestats.txt", "w", encoding="utf-8") as f:
        f.write(f"Tournament finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write("FINAL LEADERBOARD\n")
        f.write("─" * 100 + "\n")
        sorted_e = sorted(engines, key=lambda e: e.elo, reverse=True)
        f.write(f"{'Rank':<4} {'Engine':<20} {'Elo':<7} {'Games':<6} {'Score':<6} {'Avg Time':<9} W/D/L\n")
        for rank, e in enumerate(sorted_e, 1):
            avg_t = f"{e.avg_response_time():.3f}s"
            f.write(f"{rank:<4} {e.name:<20} {e.elo:7.0f} {e.games:<6} {e.score:<6.1f} {avg_t:>8} {e.wins}/{e.draws}/{e.losses}\n")


def build_match_schedule(engine_list):
    pairs = []
    for i, e1 in enumerate(engine_list):
        for j, e2 in enumerate(engine_list):
            if i >= j:
                continue
            pairs.append((e1, e2))

    matches = []
    game_id = 1

    for round_idx in range(GAMES_PER_PAIR):
        for e1, e2 in pairs:
            white, black = (e1, e2) if round_idx % 2 == 0 else (e2, e1)
            matches.append((white, black, game_id))
            game_id += 1

    return matches


def play_game(white: Engine, black: Engine, game_id: int):
    global completed_games

    white_runner = EngineRunner(white)
    black_runner = EngineRunner(black)
    white_runner.start()
    black_runner.start()

    board = chess.Board()
    result = "1/2-1/2"

    with lock:
        active_games.append({
            "game_id": game_id,
            "white": white.name,
            "black": black.name,
            "ply": 0,
            "turn": board.turn,
            "fen": board.fen(),
        })

    try:
        while not board.is_game_over():
            if board.ply() >= MAX_PLIES_PER_GAME:
                result = "1/2-1/2"
                break

            current = white if board.turn else black
            runner = white_runner if board.turn else black_runner
            timeout_sec = OPENING_MOVE_TIMEOUT_SEC if board.fullmove_number == 1 else MOVE_TIMEOUT_SEC
            uci = runner.get_move(board.fen(), timeout_sec=timeout_sec)

            if not uci or uci == "0000":
                result = "0-1" if board.turn else "1-0"
                break

            try:
                board.push_uci(uci)
            except:
                result = "0-1" if board.turn else "1-0"
                break

            with lock:
                for g in active_games:
                    if g["game_id"] == game_id:
                        g["ply"] = board.ply()
                        g["turn"] = board.turn
                        g["fen"] = board.fen()
                        break

        if board.is_game_over():
            result = board.result()
    finally:
        white_runner.stop()
        black_runner.stop()

        with lock:
            if result == "1-0":
                white.score += 1
                white.wins += 1
                black.losses += 1
                white.elo, black.elo = update_elo(white.elo, black.elo, 1.0)
            elif result == "0-1":
                black.score += 1
                black.wins += 1
                white.losses += 1
                black.elo, white.elo = update_elo(black.elo, white.elo, 1.0)
            else:
                white.score += 0.5
                black.score += 0.5
                white.draws += 1
                black.draws += 1
                white.elo, black.elo = update_elo(white.elo, black.elo, 0.5)

            white.games += 1
            black.games += 1

            completed_games += 1
            active_games[:] = [g for g in active_games if g["game_id"] != game_id]
            recent_results.append(f"Game {game_id}: {white.name} vs {black.name} -> {result}")
            if len(recent_results) > 30:
                del recent_results[:-30]

    return result


def main():
    global engines, total_games
    
    engines = [
        Engine("Trinity-Modular", ["node", "dist/Trinity-modular.js"]),
        Engine("Trinity-Alpha-0.1", ["node", "Trinity-Alpha-0.1.js"]),
        Engine("Trinity-1.3", ["node", "Trinity-1.3.js"]),
        Engine("Trinity-1.2", ["node", "Trinity-1.2.js"])
    ]

    print(f"Found {len(engines)} engines: {[e.name for e in engines]}\n")
    
    matches = build_match_schedule(engines)
    total_games = len(matches)

    monitor_stop = threading.Event()
    monitor = threading.Thread(target=live_monitor, args=(monitor_stop,), daemon=True)
    monitor.start()

    threads = []
    
    for white, black, gid in matches:
        t = threading.Thread(target=play_game, args=(white, black, gid), daemon=True)
        t.start()
        threads.append(t)

        while sum(1 for t in threads if t.is_alive()) >= MAX_CONCURRENT_GAMES:
            time.sleep(0.1)

    for t in threads:
        t.join()

    monitor_stop.set()
    monitor.join(timeout=1.0)

    save_tournament_results()
    clear()
    print_leaderboard()
    print("\n🎉 TOURNAMENT COMPLETE! Results saved to tournament/ folder.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nTournament stopped.")