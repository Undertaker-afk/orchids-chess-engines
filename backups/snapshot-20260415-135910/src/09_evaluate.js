// @module evaluate
// ==============================================================================
// EVALUATION FUNCTIONS
//
// evaluate()           — main tapered eval, side-relative score
// eval_pawns_cached()  — pawn structure via pawn hash table
// eval_king_safety()   — pawn shield + weighted attacker penalty
// eval_pieces()        — bishop pair, rook on open/semi-open file
// eval_mobility()      — per-piece mobility bonus
// eval_mopup()         — endgame king centralization mop-up
// ==============================================================================

// ---------------------------------------------------------------------------
// Pawn Structure (with hash cache)
// ---------------------------------------------------------------------------
function eval_pawns_raw() {
    let score = 0;
    for (const color of [WHITE, BLACK]) {
        const sign       = color === WHITE ? 1 : -1;
        const pawn       = PAWN | color;
        const enemy_pawn = PAWN | (color ^ 24);

        // Count pawns per file for doubled/isolated detection
        const files = [0, 0, 0, 0, 0, 0, 0, 0];
        for (let sq = 0; sq < 128; sq++) {
            if (!(sq & 0x88) && board[sq] === pawn) files[sq & 7]++;
        }

        for (let sq = 0; sq < 128; sq++) {
            if ((sq & 0x88) || board[sq] !== pawn) continue;
            const f = sq & 7, r = sq >> 4;

            // Doubled pawn penalty
            if (files[f] > 1) score -= 12 * sign;

            // Isolated pawn penalty
            const neighbors = (f > 0 ? files[f - 1] : 0) + (f < 7 ? files[f + 1] : 0);
            if (neighbors === 0) score -= 18 * sign;

            // Connected pawn bonus
            if (neighbors > 0) score += 6 * sign;

            // Passed pawn bonus — bigger toward promotion
            let passed = true;
            const step_r = color === WHITE ? 1 : -1;
            const end_r  = color === WHITE ? 7 : 0;
            outer: for (let rr = r + step_r; color === WHITE ? rr <= end_r : rr >= end_r; rr += step_r) {
                for (let ff = f - 1; ff <= f + 1; ff++) {
                    if (ff >= 0 && ff <= 7 && board[rr * 16 + ff] === enemy_pawn) {
                        passed = false; break outer;
                    }
                }
            }
            if (passed) {
                const rank_val = color === WHITE ? r : (7 - r);
                score += (10 + rank_val * rank_val * 3) * sign;
            }
        }
    }
    return score;
}

function eval_pawns_cached() {
    const idx = pawn_hash_lo & (PAWN_TT_SIZE - 1);
    if (pawn_tt_lo[idx] === pawn_hash_lo && pawn_tt_hi[idx] === pawn_hash_hi) {
        return pawn_tt_score[idx];
    }
    const s = eval_pawns_raw();
    pawn_tt_lo[idx]    = pawn_hash_lo;
    pawn_tt_hi[idx]    = pawn_hash_hi;
    pawn_tt_score[idx] = s;
    return s;
}

// ---------------------------------------------------------------------------
// King Safety
// ---------------------------------------------------------------------------
// Piece attack weights for king safety scoring
const ATK_WEIGHT = [0, 0, 2, 2, 3, 5, 0]; // index = piece type

function eval_king_safety() {
    let score = 0;
    for (const color of [WHITE, BLACK]) {
        const sign  = color === WHITE ? 1 : -1;
        const ksq   = king_sq[color === WHITE ? 0 : 1];
        if (!ksq) continue;
        const f = ksq & 7, r = ksq >> 4;
        const enemy = color ^ 24;

        // Pawn shield: pawns directly in front of king (+2 files)
        const shield_r = r + (color === WHITE ? 1 : -1);
        let shield_bonus = 0;
        if (shield_r >= 0 && shield_r < 8) {
            for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
                if (board[shield_r * 16 + ff] === (PAWN | color)) shield_bonus += 14;
            }
        }

        // Enemy attacker penalty: scan all enemy pieces that cover a square
        // adjacent to our king
        let attacker_score = 0;
        for (let sq = 0; sq < 128; sq++) {
            if (sq & 0x88) continue;
            const pc = board[sq];
            if (!pc || (pc & 24) !== enemy) continue;
            const type = pc & 7;
            if (type === PAWN || type === KING) continue;
            for (const d of piece_dirs[KING]) {
                const asq = ksq + d;
                if (asq & 0x88) continue;
                if (is_piece_attacking(sq, asq, type, enemy)) {
                    attacker_score += ATK_WEIGHT[type];
                    break;
                }
            }
        }

        score += (shield_bonus - attacker_score * 8) * sign;
    }
    return score;
}

// ---------------------------------------------------------------------------
// Piece-specific bonuses
// ---------------------------------------------------------------------------
function eval_pieces() {
    let score = 0;
    let white_bishops = 0, black_bishops = 0;

    for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) continue;
        const pc = board[sq];
        if (!pc) continue;
        const type  = pc & 7;
        const color = pc & 24;
        const sign  = color === WHITE ? 1 : -1;

        if (type === BISHOP) {
            if (color === WHITE) white_bishops++; else black_bishops++;
        }

        if (type === ROOK) {
            const f = sq & 7;
            let own_pawn = false, enemy_pawn = false;
            for (let r = 0; r < 8; r++) {
                const p = board[r * 16 + f];
                if (p === (PAWN | color))        own_pawn   = true;
                if (p === (PAWN | (color ^ 24))) enemy_pawn = true;
            }
            if (!own_pawn && !enemy_pawn) score += 20 * sign; // open file
            else if (!own_pawn)           score += 10 * sign; // semi-open
        }
    }

    // Bishop pair bonus
    if (white_bishops >= 2) score += 30;
    if (black_bishops >= 2) score -= 30;

    return score;
}

// ---------------------------------------------------------------------------
// Mobility
// ---------------------------------------------------------------------------
function eval_mobility() {
    let score = 0;
    for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) continue;
        const pc = board[sq];
        if (!pc) continue;
        const type  = pc & 7;
        const color = pc & 24;
        if (type === PAWN || type === KING) continue;
        const sign = color === WHITE ? 1 : -1;

        let mob = 0;
        for (const step of piece_dirs[type]) {
            let csq = sq + step;
            while (!(csq & 0x88)) {
                if (!(board[csq] & color)) mob++;
                if (board[csq]) break;
                if (type === KNIGHT) break;
                csq += step;
            }
        }

        // Mobility bonuses relative to expected value (normalise around typical counts)
        if      (type === KNIGHT) score += (mob - 4) * 4 * sign;
        else if (type === BISHOP) score += (mob - 7) * 3 * sign;
        else if (type === ROOK)   score += (mob - 7) * 2 * sign;
        else if (type === QUEEN)  score += (mob - 14) * 1 * sign;
    }
    return score;
}

// ---------------------------------------------------------------------------
// Endgame Mop-up (push losing king to corner)
// ---------------------------------------------------------------------------
function eval_mopup() {
    if (phase > 6) return 0; // Only in true endgame
    if (Math.abs(eval_mg) < 200) return 0; // Only with decisive material advantage

    const winning  = eval_mg > 0 ? WHITE : BLACK;
    const losing   = winning ^ 24;
    const sign     = winning === WHITE ? 1 : -1;

    const lk_sq    = king_sq[losing  === WHITE ? 0 : 1];
    const wk_sq    = king_sq[winning === WHITE ? 0 : 1];
    if (!lk_sq || !wk_sq) return 0;

    const lk_f = lk_sq & 7, lk_r = lk_sq >> 4;
    const wk_f = wk_sq & 7, wk_r = wk_sq >> 4;

    // Push losing king to edge/corner
    const center_dist = Math.max(Math.abs(lk_f - 3), Math.abs(lk_r - 3));
    // Winning king should approach losing king
    const king_dist = Math.abs(wk_f - lk_f) + Math.abs(wk_r - lk_r);

    return sign * (center_dist * 10 + (14 - king_dist) * 4);
}

// ---------------------------------------------------------------------------
// Main evaluation entry point (side-relative)
// ---------------------------------------------------------------------------
function evaluate() {
    let p = phase; if (p > 24) p = 24;
    // Tapered: blend MG and EG PST scores by phase
    const piece_score  = (eval_mg * p + eval_eg * (24 - p)) / 24 | 0;
    const pawn_score   = eval_pawns_cached();
    const king_score   = eval_king_safety();
    const mob_score    = eval_mobility();
    const piece_bonus  = eval_pieces();
    const mopup        = eval_mopup();
    const tempo        = 10; // Bonus for side to move

    const total = piece_score + pawn_score + king_score + mob_score + piece_bonus + mopup + tempo;
    return side === WHITE ? total : -total;
}
