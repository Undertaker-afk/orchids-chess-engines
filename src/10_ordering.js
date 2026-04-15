// @module ordering
// ==============================================================================
// MOVE ORDERING
// Good ordering dramatically improves alpha-beta pruning efficiency.
//
// Priority (highest to lowest):
//   1. Hash move (TT best move from previous iteration)
//   2. Winning captures by MVV-LVA (victim*100 - attacker)
//   3. Promotions
//   4. Killer moves [0] and [1]
//   5. Countermove (response to the last move played)
//   6. History heuristic score
// ==============================================================================

/**
 * Assign a priority score to a move for sorting.
 * Higher = try earlier in the move loop.
 */
function score_move(m, hash_move, prev_move) {
    if (m === hash_move) return 10_000_000;

    const captured = (m >> 19) & 31;
    const prom     = (m >> 24) & 31;

    // Captures: MVV-LVA (Most Valuable Victim, Least Valuable Attacker)
    if (captured) {
        const victim_type   = captured & 7;
        const attacker_type = (m >> 14) & 7;
        return 1_000_000 + victim_type * 100 - attacker_type;
    }

    // Promotions
    if (prom) return 900_000 + PIECE_VAL[prom & 7];

    // Killer moves (quiet moves that previously caused beta-cutoffs at this ply)
    if (m === killers[ply][0]) return 800_000;
    if (m === killers[ply][1]) return 700_000;

    // Countermove (quiet move that responds well to the previous opponent move)
    if (prev_move) {
        const cm_key = ((prev_move & 127) << 7) | ((prev_move >> 7) & 127);
        if (m === countermove[cm_key]) return 600_000;
    }

    // History score (accumulated from beta-cutoffs during search)
    return history[((m & 127) << 7) | ((m >> 7) & 127)];
}

/**
 * Sort moves in move_stack[offset .. offset+count-1] by descending score.
 * Uses insertion sort — optimal for arrays of ≤ 50 moves.
 */
function sort_moves(offset, count, hash_move, prev_move) {
    for (let i = 0; i < count; i++) {
        move_scores[offset + i] = score_move(move_stack[offset + i], hash_move, prev_move);
    }
    for (let i = 1; i < count; i++) {
        const key_m = move_stack[offset + i];
        const key_s = move_scores[offset + i];
        let j = i - 1;
        while (j >= 0 && move_scores[offset + j] < key_s) {
            move_stack[offset + j + 1]  = move_stack[offset + j];
            move_scores[offset + j + 1] = move_scores[offset + j];
            j--;
        }
        move_stack[offset + j + 1]  = key_m;
        move_scores[offset + j + 1] = key_s;
    }
}
