#!/usr/bin/env python3
"""
Head-to-head match runner for Node-based Trinity engine builds.

Runs two engine files against each other by sending FEN and reading one UCI move.
Each move is done in a fresh process, matching the engine's CLI behavior.
"""

import argparse
import subprocess
import time
import chess


def get_move(engine_path: str, fen: str, timeout_sec: float, movetime_ms: int) -> str:
    try:
        proc = subprocess.run(
            ["node", engine_path, "--movetime", str(movetime_ms)],
            input=fen + "\n",
            text=True,
            capture_output=True,
            timeout=timeout_sec,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return "0000"
    except Exception:
        return "0000"

    out = (proc.stdout or "").strip().splitlines()
    if not out:
        return "0000"
    move = out[0].strip()
    return move if move else "0000"


def play_game(game_no: int, white_engine: str, black_engine: str, timeout_sec: float, movetime_ms: int, max_plies: int):
    board = chess.Board()

    for _ in range(max_plies):
        engine = white_engine if board.turn else black_engine
        move_uci = get_move(engine, board.fen(), timeout_sec, movetime_ms)

        if not move_uci or move_uci == "0000":
            return ("0-1" if board.turn else "1-0", f"forfeit:{'white' if board.turn else 'black'}:timeout_or_empty", board.ply())

        try:
            move_obj = chess.Move.from_uci(move_uci)
        except Exception:
            return ("0-1" if board.turn else "1-0", f"forfeit:{'white' if board.turn else 'black'}:bad_uci:{move_uci}", board.ply())

        if move_obj not in board.legal_moves:
            return ("0-1" if board.turn else "1-0", f"forfeit:{'white' if board.turn else 'black'}:illegal:{move_uci}", board.ply())

        board.push(move_obj)
        if board.is_game_over():
            return (board.result(), "normal", board.ply())

    return ("1/2-1/2", "max_plies", board.ply())


def main():
    parser = argparse.ArgumentParser(description="Run fixed vs unfixed Trinity modular head-to-head")
    parser.add_argument("--engine-a", default="dist/Trinity-modular.unfixed.js", help="Path to engine A JS file")
    parser.add_argument("--engine-b", default="dist/Trinity-modular.js", help="Path to engine B JS file")
    parser.add_argument("--games", type=int, default=8, help="Total games")
    parser.add_argument("--timeout", type=float, default=8.0, help="Per-move process timeout (sec)")
    parser.add_argument("--movetime", type=int, default=1500, help="--movetime passed to engine (ms)")
    parser.add_argument("--max-plies", type=int, default=220, help="Ply cap per game")
    args = parser.parse_args()

    score_a = 0.0
    score_b = 0.0

    print(f"Match: A={args.engine_a} vs B={args.engine_b}")
    print(f"Settings: games={args.games} movetime={args.movetime}ms timeout={args.timeout}s max_plies={args.max_plies}\n")

    start = time.time()
    for g in range(1, args.games + 1):
        if g % 2 == 1:
            white, black = args.engine_a, args.engine_b
            white_is_a = True
        else:
            white, black = args.engine_b, args.engine_a
            white_is_a = False

        result, reason, plies = play_game(g, white, black, args.timeout, args.movetime, args.max_plies)

        if result == "1-0":
            if white_is_a:
                score_a += 1.0
            else:
                score_b += 1.0
        elif result == "0-1":
            if white_is_a:
                score_b += 1.0
            else:
                score_a += 1.0
        else:
            score_a += 0.5
            score_b += 0.5

        print(f"Game {g:>2}: {result:<7} reason={reason:<36} plies={plies:>3} | score A-B = {score_a:.1f}-{score_b:.1f}")

    elapsed = time.time() - start
    print("\nFinal:")
    print(f"A ({args.engine_a}): {score_a:.1f}")
    print(f"B ({args.engine_b}): {score_b:.1f}")
    print(f"Elapsed: {elapsed:.2f}s")


if __name__ == "__main__":
    main()
