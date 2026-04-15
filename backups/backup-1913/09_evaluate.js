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
                // Dynamic passed-pawn bonus: advancement, blockage, and enemy king proximity.
                let pp_score = 15 + rank_val * rank_val * 4;

                const block_sq = color === WHITE ? sq + 16 : sq - 16;
                if (!(block_sq & 0x88) && board[block_sq]) {
                    pp_score -= 15;
                }

                const e_ksq = king_sq[(color ^ 24) === WHITE ? 0 : 1];
                if (e_ksq) {
                    const k_dist = Math.abs((e_ksq & 7) - f) + Math.abs((e_ksq >> 4) - r);
                    // Closer enemy king makes the passer less dangerous.
                    pp_score -= Math.max(0, 6 - k_dist) * 5;
                }

                score += pp_score * sign;
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
    // In endgames, king activity is more important than king shelter.
    if (phase < 10) return 0;

    let score = 0;
    for (const color of [WHITE, BLACK]) {
        const sign = color === WHITE ? 1 : -1;
        const ksq  = king_sq[color === WHITE ? 0 : 1];
        if (!ksq) continue;
        const enemy = color ^ 24;

        // 1) Pawn shield directly in front of king.
        const shield_r = (ksq >> 4) + (color === WHITE ? 1 : -1);
        let shield_bonus = 0;
        if (shield_r >= 0 && shield_r < 8) {
            const kf = ksq & 7;
            const left = Math.max(0, kf - 1);
            const right = Math.min(7, kf + 1);
            for (let ff = left; ff <= right; ff++) {
                if (board[shield_r * 16 + ff] === (PAWN | color)) shield_bonus += 14;
            }
        }

        // 2) Fast attacker count near king zone.
        const n0 = ksq - 17, n1 = ksq - 16, n2 = ksq - 15, n3 = ksq - 1;
        const n4 = ksq + 1, n5 = ksq + 15, n6 = ksq + 16, n7 = ksq + 17;

        let attacker_score = 0;
        for (let sq = 0; sq < 128; sq++) {
            if (sq & 0x88) continue;
            const pc = board[sq];
            if (!pc || (pc & 24) !== enemy) continue;

            const type = pc & 7;
            if (type === PAWN || type === KING) continue;

            let attacks = false;
            if (type === KNIGHT) {
                const diff = sq - ksq;
                attacks = (
                    diff === 33 || diff === 31 || diff === 18 || diff === 14 ||
                    diff === -14 || diff === -18 || diff === -31 || diff === -33
                );
            } else {
                const dirs = type === BISHOP
                    ? [-17, -15, 15, 17]
                    : type === ROOK
                        ? [-16, -1, 1, 16]
                        : [-17, -16, -15, -1, 1, 15, 16, 17];

                for (let i = 0; i < dirs.length; i++) {
                    const step = dirs[i];
                    let c = sq + step;
                    while (!(c & 0x88)) {
                        if (c === ksq || c === n0 || c === n1 || c === n2 || c === n3 || c === n4 || c === n5 || c === n6 || c === n7) {
                            attacks = true;
                            break;
                        }
                        if (board[c]) break;
                        c += step;
                    }
                    if (attacks) break;
                }
            }

            if (attacks) attacker_score += ATK_WEIGHT[type];
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
            const r = sq >> 4;
            let own_pawn = false, enemy_pawn = false;
            for (let rr = 0; rr < 8; rr++) {
                const p = board[rr * 16 + f];
                if (p === (PAWN | color))        own_pawn   = true;
                if (p === (PAWN | (color ^ 24))) enemy_pawn = true;
            }
            if (!own_pawn && !enemy_pawn) score += 25 * sign; // open file
            else if (!own_pawn)           score += 12 * sign; // semi-open

            // Bonus for active rook on the 7th rank (2nd rank for black).
            const seventh_rank = color === WHITE ? 6 : 1;
            if (r === seventh_rank) score += 20 * sign;
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

        // HARD penalty for completely trapped pieces.
        if (mob <= 1) score -= 35 * sign;
        // MEDIUM penalty for restricted bishops.
        else if (type === BISHOP && mob <= 3) score -= 15 * sign;
        // Queen activity penalty in middlegames.
        else if (type === QUEEN && mob < 10 && phase > 12) score -= (10 - mob) * 5 * sign;

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
    if (phase > 8) return 0; // Only in true endgame
    if (Math.abs(eval_mg) < 200) return 0; // Only with decisive material advantage

    const winning  = eval_mg > 0 ? WHITE : BLACK;
    const losing   = winning ^ 24;
    const sign     = winning === WHITE ? 1 : -1;

    const wk_sq    = king_sq[winning === WHITE ? 0 : 1];
    const lk_sq    = king_sq[losing  === WHITE ? 0 : 1];
    if (!lk_sq || !wk_sq) return 0;

    const lk_f = lk_sq & 7, lk_r = lk_sq >> 4;
    const wk_f = wk_sq & 7, wk_r = wk_sq >> 4;

    // Push losing king to edge/corner.
    const center_dist_losing = Math.max(Math.abs(lk_f - 3.5), Math.abs(lk_r - 3.5));

    // Reward winning king for centralization.
    const dist_to_center = Math.abs(wk_f - 3.5) + Math.abs(wk_r - 3.5);
    const king_activity_bonus = Math.max(0, 10 - dist_to_center) * 6;

    // Winning king should approach losing king.
    const king_dist = Math.abs(wk_f - lk_f) + Math.abs(wk_r - lk_r);
    const chase_bonus = (14 - king_dist) * 4;

    return sign * (center_dist_losing * 12 + king_activity_bonus + chase_bonus);
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
    let king_center_bonus = 0;
    if (phase < 12) {
        const wk = king_sq[0], bk = king_sq[1];
        if (wk && bk) {
            const w_center = Math.abs((wk & 7) - 3.5) + Math.abs((wk >> 4) - 3.5);
            const b_center = Math.abs((bk & 7) - 3.5) + Math.abs((bk >> 4) - 3.5);
            king_center_bonus = (10 - w_center) * 2 - (10 - b_center) * 2;
        }
    }
    const tempo        = 10; // Bonus for side to move

    const total = piece_score + pawn_score + king_score + mob_score + piece_bonus + mopup + king_center_bonus + tempo;
    return side === WHITE ? total : -total;
}
