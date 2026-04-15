// @module search
// ==============================================================================
// SEARCH — Quiescence, Alpha-Beta PVS, Root Search
//
// Features:
//   - Quiescence search with SEE filter and delta pruning
//   - PVS (Principal Variation Search)
//   - Check extensions
//   - Null move pruning (adaptive R)
//   - Reverse futility pruning (static null move)
//   - Razoring (depth 1 + 2)
//   - Futility pruning (depth 1-3)
//   - SEE-based bad-capture pruning in main search
//   - Late Move Reductions (log-based LMR table)
//   - Internal Iterative Deepening
//   - Killer + countermove + history heuristics
//   - Repetition detection
//   - Aspiration windows at root
// ==============================================================================

// ---------------------------------------------------------------------------
// Quiescence Search
// ---------------------------------------------------------------------------
function quiesce(alpha, beta) {
    if ((nodes++ & TIME_CHECK_MASK) === 0 && now() >= stop_time) stop_search = true;
    if (stop_search) return 0;
    if (ply >= 511) return evaluate();

    const static_eval = evaluate();
    const stand_pat = static_eval;
    if (stand_pat >= beta) return beta;
    if (alpha < stand_pat) alpha = stand_pat;
    // Adaptive delta pruning to match higher eval variance.
    const delta_margin = Math.max(950, Math.abs(static_eval) * 0.35 + 800);
    if (stand_pat < alpha - delta_margin) return alpha;

    const offset = ply * 256;
    let count = generate_moves(ply, true);

    // Filter out SEE-losing captures
    let filtered = 0;
    for (let i = 0; i < count; i++) {
        if (see(move_stack[offset + i]) >= 0)
            move_stack[offset + filtered++] = move_stack[offset + i];
    }
    count = filtered;
    sort_moves(offset, count, 0, 0);

    for (let i = 0; i < count; i++) {
        const m = move_stack[offset + i];
        if (!make_move(m)) continue;
        const score = -quiesce(-beta, -alpha);
        unmake_move(m);
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
    }
    return alpha;
}

// ---------------------------------------------------------------------------
// Main Alpha-Beta Search (PVS)
// ---------------------------------------------------------------------------
function search(depth, alpha, beta, is_pv, prev_move) {
    if ((nodes++ & TIME_CHECK_MASK) === 0 && now() >= stop_time) stop_search = true;
    if (stop_search) return 0;
    if (ply >= 511) return evaluate();

    // Repetition / 50-move draw
    if (ply > 0 && halfmove >= 100) return 0;
    const rep_limit = Math.max(0, ply - halfmove);
    let rep_count = 0;
    for (let i = ply - 2; i >= rep_limit; i -= 2) {
        if (state_hash_lo[i] === hash_lo && state_hash_hi[i] === hash_hi) {
            rep_count++;
            if (rep_count >= 2) return 0;
        }
    }

    const in_check = is_attacked(king_sq[side === WHITE ? 0 : 1], side ^ 24);
    if (in_check) depth++; // Check extension
    if (depth <= 0) return quiesce(alpha, beta);

    // --- Transposition Table ---
    const tt_idx = hash_lo & (TT_SIZE - 1);
    let hash_move = 0;
    if (tt_key_lo[tt_idx] === hash_lo && tt_key_hi[tt_idx] === hash_hi) {
        hash_move = tt_move[tt_idx];
        const data    = tt_data[tt_idx];
        const td      = tt_depth[tt_idx];
        const tt_flag = (data >> 8) & 0xFF;
        const tt_score = data >> 16;
        if (td >= depth && !is_pv) {
            if (tt_flag === TT_EXACT)                       return tt_score;
            if (tt_flag === TT_UPPER && tt_score <= alpha)  return alpha;
            if (tt_flag === TT_LOWER && tt_score >= beta)   return beta;
        }
    }

    const static_eval = evaluate();

    // --- Reverse Futility Pruning (Static Null Move) ---
    if (!is_pv && !in_check && depth <= 6) {
        const rfp_margin = 120 * depth;
        if (static_eval - rfp_margin >= beta) return static_eval - rfp_margin;
    }

    // --- Null Move Pruning ---
    if (!is_pv && !in_check && depth >= 3 && phase > 2) {
        const R = depth >= 6 ? 3 : 2;
        make_null_move();
        const null_score = -search(depth - R - 1, -beta, -beta + 1, false, 0);
        unmake_null_move();
        if (stop_search) return 0;
        if (null_score >= beta) return beta;
    }

    // --- Razoring ---
    if (!is_pv && !in_check) {
        if (depth === 1 && static_eval + 300 < alpha) return quiesce(alpha, beta);
        if (depth === 2 && static_eval + 600 < alpha) {
            const v = quiesce(alpha - 600, alpha - 599);
            if (v + 600 <= alpha) return v;
        }
    }

    // --- Internal Iterative Deepening ---
    if (depth >= 4 && !hash_move) {
        search(depth - 2, alpha, beta, is_pv, prev_move);
        if (tt_key_lo[tt_idx] === hash_lo && tt_key_hi[tt_idx] === hash_hi)
            hash_move = tt_move[tt_idx];
    }

    const offset = ply * 256;
    const count  = generate_moves(ply, false);
    sort_moves(offset, count, hash_move, prev_move);

    let best_score = -50000, best_move = 0, legal = 0;
    const alpha_orig = alpha;

    for (let i = 0; i < count; i++) {
        const m          = move_stack[offset + i];
        const captured   = (m >> 19) & 31;
        const prom       = (m >> 24) & 31;
        const is_capture = !!captured || (m >> 29) === 1;
        const is_quiet   = !is_capture && !prom;

        // SEE-based bad capture pruning in main search
        if (!is_pv && is_capture && depth <= 4 && see(m) < -50 * depth) continue;

        // Reduce futility pruning to preserve initiative in middlegames.
        if (is_quiet && !is_pv && !in_check && depth <= 2 && phase > 10) {
            const futility_margins = [0, 100, 180];
            if (static_eval + futility_margins[depth] < alpha) continue;
        }

        if (!make_move(m)) continue;

        // Late Move Pruning: cut low-priority quiet moves at shallow depth.
        if (is_quiet && !is_pv && !in_check && depth <= 3) {
            if (legal > 3 + depth * depth) {
                unmake_move(m);
                continue;
            }
        }

        legal++;
        let score;

        if (legal === 1) {
            // First move: full-window PVS
            score = -search(depth - 1, -beta, -alpha, is_pv, m);
        } else {
            // Late Move Reductions
            let reduction = 0;
            if (depth >= 2 && !in_check && is_quiet && legal > 3) {
                const d_idx = Math.min(depth, 63);
                const m_idx = Math.min(legal, 63);
                reduction   = lmr_table[d_idx * 64 + m_idx];
                if (is_pv) reduction = Math.max(0, reduction - 1);
            }

            // Null-window search with reduction
            score = -search(depth - 1 - reduction, -alpha - 1, -alpha, false, m);
            // Re-search at full depth if LMR failed high
            if (reduction > 0 && score > alpha)
                score = -search(depth - 1, -alpha - 1, -alpha, false, m);
            // Full PV re-search if inside PV window
            if (is_pv && score > alpha && score < beta)
                score = -search(depth - 1, -beta, -alpha, true, m);
        }

        unmake_move(m);
        if (stop_search) return 0;

        if (score > best_score) { best_score = score; best_move = m; }
        if (score > alpha) {
            alpha = score;
            if (score >= beta) {
                // Beta-cutoff: update move ordering heuristics
                if (is_quiet) {
                    const kidx = ply * 2;
                    killers[kidx + 1] = killers[kidx];
                    killers[kidx] = m;
                    const hkey = ((m & 127) << 7) | ((m >> 7) & 127);
                    history[hkey] += depth * depth;
                    if (history[hkey] > 1000000) {
                        for (let k = 0; k < 16384; k++) history[k] >>= 2;
                    }
                    if (prev_move) {
                        const cm_key = ((prev_move & 127) << 7) | ((prev_move >> 7) & 127);
                        countermove[cm_key] = m;
                    }
                }
                break;
            }
        }
    }

    // Checkmate or stalemate
    if (legal === 0) return in_check ? -30000 + ply : 0;

    // Contempt factor: reduce drawish tendencies in quiet non-PV nodes.
    if (!in_check && !is_pv && Math.abs(best_score) < 2000) {
        best_score -= 15;
    }

    // Store in TT
    let flag = TT_EXACT;
    if (best_score <= alpha_orig) flag = TT_UPPER;
    else if (best_score >= beta)  flag = TT_LOWER;

    if (best_score > -20000 && best_score < 20000) {
        tt_key_lo[tt_idx] = hash_lo; tt_key_hi[tt_idx] = hash_hi;
        tt_move[tt_idx]   = best_move;
        tt_depth[tt_idx]  = depth;
        tt_data[tt_idx]   = (flag << 8) | ((best_score & 0xFFFF) << 16);
    }
    return best_score;
}

// ---------------------------------------------------------------------------
// Root Search — Iterative Deepening + Aspiration Windows
// ---------------------------------------------------------------------------
function search_root() {
    nodes = 0; stop_search = false;
    const in_check_root = is_attacked(king_sq[side === WHITE ? 0 : 1], side ^ 24);
    const time_limits = get_time_limits_ms(MOVE_TIME_MS);
    const initial_budget_ms = compute_search_time_budget_ms(MOVE_TIME_MS, phase, halfmove, fullmove, in_check_root, 0);
    start_time = now(); stop_time = start_time + initial_budget_ms;

    // Reset per-search heuristics
    killers.fill(0);
    for (let i = 0; i < 16384; i++)   { history[i] >>= 2; }

    const count        = generate_moves(0, false);
    let best_move_root = 0;
    let prev_score     = 0;
    let previous_iteration_best = 0;

    for (let d = 1; d <= 64; d++) {
        // Set up aspiration window
        let alpha, beta, delta = 40;
        if (d >= 4 && Math.abs(prev_score) < 20000) {
            alpha = prev_score - delta;
            beta  = prev_score + delta;
        } else {
            alpha = -50000; beta = 50000;
        }

        let iter_best_score = -50000;
        let iter_best_move  = 0;

        // Aspiration re-search loop
        while (true) {
            iter_best_score = -50000;
            iter_best_move  = 0;
            let legal = 0;
            sort_moves(0, count, best_move_root, 0);

            for (let i = 0; i < count; i++) {
                const m = move_stack[i];
                if (!make_move(m)) continue;
                legal++;
                let score;
                if (legal === 1) {
                    score = -search(d - 1, -beta, -alpha, true, m);
                } else {
                    score = -search(d - 1, -alpha - 1, -alpha, false, m);
                    if (score > alpha && score < beta)
                        score = -search(d - 1, -beta, -alpha, true, m);
                }
                unmake_move(m);
                if (stop_search) break;
                if (score > iter_best_score) { iter_best_score = score; iter_best_move = m; }
                if (score > alpha) alpha = score;
            }

            if (stop_search) break;

            // Widen aspiration window on failure
            if (iter_best_score <= alpha - delta && alpha > -50000) {
                alpha  = Math.max(-50000, iter_best_score - delta);
                delta *= 2;
            } else if (iter_best_score >= beta + delta && beta < 50000) {
                beta   = Math.min(50000, iter_best_score + delta);
                delta *= 2;
            } else {
                break; // Search completed within window
            }

            // Give up on aspiration if window is huge
            if (delta > 3000) { alpha = -50000; beta = 50000; }
        }

        if (stop_search) break;
        if (iter_best_move) {
            if (previous_iteration_best && iter_best_move !== previous_iteration_best) {
                stop_time = Math.min(start_time + time_limits.max, stop_time + (time_limits.instability_bonus || 0));
            }
            const score_swing = Math.abs(iter_best_score - prev_score);
            if (score_swing >= 80) {
                stop_time = Math.min(start_time + time_limits.max, stop_time + (time_limits.swing_bonus || 0));
            }
            best_move_root = iter_best_move;
            prev_score = iter_best_score;
            previous_iteration_best = iter_best_move;
        }
        // Early exit on forced mate/loss
        if (prev_score > 20000 || prev_score < -20000) break;
    }

    // Fallback: pick any legal move if we somehow have none
    if (!best_move_root) {
        for (let i = 0; i < count; i++) {
            if (make_move(move_stack[i])) {
                best_move_root = move_stack[i];
                unmake_move(move_stack[i]);
                break;
            }
        }
    }
    return best_move_root;
}
