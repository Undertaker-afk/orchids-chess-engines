// @module movegen
// ==============================================================================
// MOVE GENERATOR
// Generates pseudo-legal moves into move_stack[ply * 256 + ...]
// Returns move count; illegal moves are filtered by make_move's legality check.
//
// captures_only = true  → only generate captures (for quiescence search)
// captures_only = false → generate all moves
// ==============================================================================

function generate_moves(p, captures_only) {
    let offset = p * 256, count = 0;
    const us = side, them = side ^ 24;

    for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) continue;
        const pc = board[sq];
        if (!pc || (pc & us) === 0) continue;
        const type = pc & 7;

        if (type === PAWN) {
            const dir        = us === WHITE ? 16 : -16;
            const start_rank = us === WHITE ? 1  : 6;
            const prom_rank  = us === WHITE ? 6  : 1;
            const rank       = sq >> 4;

            // Diagonal captures + en-passant
            for (const cdir of (us === WHITE ? [15, 17] : [-15, -17])) {
                const csq = sq + cdir;
                if (csq & 0x88) continue;
                if (board[csq] && (board[csq] & them))
                    count = add_pawn_moves(offset, count, sq, csq, pc, board[csq], rank === prom_rank, 0);
                else if (csq === ep)
                    count = add_pawn_moves(offset, count, sq, csq, pc, PAWN | them, false, 1);
            }

            // Pawn pushes (including promotion-rank captures in captures_only mode)
            if (!captures_only || rank === prom_rank) {
                const nsq = sq + dir;
                if (!(nsq & 0x88) && board[nsq] === 0) {
                    count = add_pawn_moves(offset, count, sq, nsq, pc, 0, rank === prom_rank, 0);
                    // Double push from starting rank
                    if (!captures_only && rank === start_rank) {
                        const nsq2 = sq + dir * 2;
                        if (board[nsq2] === 0)
                            move_stack[offset + count++] = sq | (nsq2 << 7) | (pc << 14);
                    }
                }
            }
        } else {
            // Sliding and stepping pieces
            const dirs = piece_dirs[type];
            for (let i = 0; i < dirs.length; i++) {
                const step = dirs[i];
                let csq = sq;
                while (true) {
                    csq += step;
                    if (csq & 0x88) break;
                    const dpc = board[csq];
                    if (dpc === 0) {
                        if (!captures_only)
                            move_stack[offset + count++] = sq | (csq << 7) | (pc << 14);
                    } else {
                        if (dpc & them)
                            move_stack[offset + count++] = sq | (csq << 7) | (pc << 14) | (dpc << 19);
                        break;
                    }
                    if (type === KNIGHT || type === KING) break; // stepping pieces
                }
            }
        }
    }

    // Castling (always quiet, only in full-gen mode)
    if (!captures_only) {
        if (us === WHITE) {
            if ((castle & 1) && !board[5] && !board[6]
                && !is_attacked(4, them) && !is_attacked(5, them) && !is_attacked(6, them))
                move_stack[offset + count++] = 4 | (6 << 7) | ((KING|WHITE) << 14) | (2 << 29);
            if ((castle & 2) && !board[3] && !board[2] && !board[1]
                && !is_attacked(4, them) && !is_attacked(3, them) && !is_attacked(2, them))
                move_stack[offset + count++] = 4 | (2 << 7) | ((KING|WHITE) << 14) | (2 << 29);
        } else {
            if ((castle & 4) && !board[117] && !board[118]
                && !is_attacked(116, them) && !is_attacked(117, them) && !is_attacked(118, them))
                move_stack[offset + count++] = 116 | (118 << 7) | ((KING|BLACK) << 14) | (2 << 29);
            if ((castle & 8) && !board[115] && !board[114] && !board[113]
                && !is_attacked(116, them) && !is_attacked(115, them) && !is_attacked(114, them))
                move_stack[offset + count++] = 116 | (114 << 7) | ((KING|BLACK) << 14) | (2 << 29);
        }
    }

    return count;
}

/**
 * Helper: add pawn moves, expanding promotions into four separate moves.
 */
function add_pawn_moves(offset, count, sq, to, pc, cap, prom, flag) {
    if (prom) {
        const us = pc & 24;
        move_stack[offset + count++] = sq | (to << 7) | (pc << 14) | (cap << 19) | ((QUEEN  | us) << 24) | (flag << 29);
        move_stack[offset + count++] = sq | (to << 7) | (pc << 14) | (cap << 19) | ((KNIGHT | us) << 24) | (flag << 29);
        move_stack[offset + count++] = sq | (to << 7) | (pc << 14) | (cap << 19) | ((ROOK   | us) << 24) | (flag << 29);
        move_stack[offset + count++] = sq | (to << 7) | (pc << 14) | (cap << 19) | ((BISHOP | us) << 24) | (flag << 29);
    } else {
        move_stack[offset + count++] = sq | (to << 7) | (pc << 14) | (cap << 19) | (flag << 29);
    }
    return count;
}
