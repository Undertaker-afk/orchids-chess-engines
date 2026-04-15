// @module see
// ==============================================================================
// STATIC EXCHANGE EVALUATION (SEE)
// Uses the recursive swap algorithm to determine the material outcome
// of a capture sequence on a given square.
//
// see(m)  → net material gain (positive = good capture)
// ==============================================================================

/**
 * Recursive swap: temporarily remove `from_sq`'s piece and find the cheapest
 * opponent recapture, then recurse.
 *
 * @param {number} to_sq        - Square where exchange happens
 * @param {number} target_val   - Value of piece currently being captured
 * @param {number} from_sq      - Square of our capturing piece
 * @param {number} attacker_val - Value of our capturing piece
 * @param {number} us           - Color doing this capture (WHITE or BLACK)
 * @returns {number}            - Net gain from this capture (from our POV)
 */
function see_square(to_sq, target_val, from_sq, attacker_val, us) {
    const save = board[from_sq];
    board[from_sq] = 0; // Temporarily remove our attacker

    const them = us ^ 24;
    let best_sq = -1, best_val = 999999;

    // Find cheapest opponent recapture

    // Pawns
    for (const d of (them === WHITE ? [-15, -17] : [15, 17])) {
        const sq = to_sq + d;
        if (!(sq & 0x88) && board[sq] === (PAWN | them)) {
            if (PIECE_VAL[PAWN] < best_val) { best_val = PIECE_VAL[PAWN]; best_sq = sq; }
            break;
        }
    }
    // Knights
    if (best_val > PIECE_VAL[KNIGHT]) {
        for (const d of piece_dirs[KNIGHT]) {
            const sq = to_sq + d;
            if (!(sq & 0x88) && board[sq] === (KNIGHT | them)) {
                if (PIECE_VAL[KNIGHT] < best_val) { best_val = PIECE_VAL[KNIGHT]; best_sq = sq; }
            }
        }
    }
    // Bishops / diagonal queens
    if (best_val > PIECE_VAL[BISHOP]) {
        for (const step of piece_dirs[BISHOP]) {
            let sq = to_sq + step;
            while (!(sq & 0x88)) {
                const pc = board[sq];
                if (pc) {
                    if ((pc & them) && ((pc & 7) === BISHOP || (pc & 7) === QUEEN)) {
                        if (PIECE_VAL[pc & 7] < best_val) { best_val = PIECE_VAL[pc & 7]; best_sq = sq; }
                    }
                    break;
                }
                sq += step;
            }
        }
    }
    // Rooks / straight queens
    if (best_val > PIECE_VAL[ROOK]) {
        for (const step of piece_dirs[ROOK]) {
            let sq = to_sq + step;
            while (!(sq & 0x88)) {
                const pc = board[sq];
                if (pc) {
                    if ((pc & them) && ((pc & 7) === ROOK || (pc & 7) === QUEEN)) {
                        if (PIECE_VAL[pc & 7] < best_val) { best_val = PIECE_VAL[pc & 7]; best_sq = sq; }
                    }
                    break;
                }
                sq += step;
            }
        }
    }
    // King
    if (best_val > PIECE_VAL[KING]) {
        for (const d of piece_dirs[KING]) {
            const sq = to_sq + d;
            if (!(sq & 0x88) && board[sq] === (KING | them)) {
                best_val = PIECE_VAL[KING]; best_sq = sq;
            }
        }
    }

    let result;
    if (best_sq === -1) {
        // Opponent has no recapture; we keep the full material gain
        result = target_val;
    } else {
        // Opponent recaptures; recurse to see if it's worth it
        const recapture = see_square(to_sq, attacker_val, best_sq, best_val, them);
        result = target_val - recapture; // We gain target, but lose if opponent recaptures well
        if (result < 0) result = 0;     // We can choose NOT to recapture if it loses
    }

    board[from_sq] = save; // Restore our attacker
    return result;
}

/**
 * Entry point: evaluate the material exchange started by move `m`.
 * Returns >= 0 for good/equal captures, < 0 for bad captures.
 */
function see(m) {
    const from     = m & 127;
    const to       = (m >> 7)  & 127;
    const captured = (m >> 19) & 31;
    const flag     = m >> 29;
    const piece    = (m >> 14) & 31;

    if (!captured && flag !== 1) return 0; // Not a capture

    const victim_val   = (flag === 1) ? PIECE_VAL[PAWN] : PIECE_VAL[captured & 7];
    const attacker_val = PIECE_VAL[piece & 7];

    return see_square(to, victim_val, from, attacker_val, side);
}
