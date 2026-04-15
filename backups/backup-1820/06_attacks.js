// @module attacks
// ==============================================================================
// ATTACK DETECTION
// is_attacked(sq, them) — true if `sq` is attacked by any piece of color `them`
// is_piece_attacking(from, to, type, color) — for king safety check
// ==============================================================================

function is_attacked(sq, them) {
    // Pawn attacks (pawn attacks diagonally from its own rank toward enemy)
    const psq1 = sq + (them === WHITE ? -15 : 15);
    if (!(psq1 & 0x88) && board[psq1] === (PAWN | them)) return true;
    const psq2 = sq + (them === WHITE ? -17 : 17);
    if (!(psq2 & 0x88) && board[psq2] === (PAWN | them)) return true;

    // Knight
    for (let i = 0; i < 8; i++) {
        const csq = sq + piece_dirs[KNIGHT][i];
        if (!(csq & 0x88) && board[csq] === (KNIGHT | them)) return true;
    }

    // King (adjacent squares)
    for (let i = 0; i < 8; i++) {
        const csq = sq + piece_dirs[KING][i];
        if (!(csq & 0x88) && board[csq] === (KING | them)) return true;
    }

    // Rook / Queen (straight lines)
    for (let i = 0; i < 4; i++) {
        let step = piece_dirs[ROOK][i], csq = sq;
        while (true) {
            csq += step;
            if (csq & 0x88) break;
            const pc = board[csq];
            if (pc) {
                if (pc === (ROOK | them) || pc === (QUEEN | them)) return true;
                break;
            }
        }
    }

    // Bishop / Queen (diagonal lines)
    for (let i = 0; i < 4; i++) {
        let step = piece_dirs[BISHOP][i], csq = sq;
        while (true) {
            csq += step;
            if (csq & 0x88) break;
            const pc = board[csq];
            if (pc) {
                if (pc === (BISHOP | them) || pc === (QUEEN | them)) return true;
                break;
            }
        }
    }

    return false;
}

/**
 * Returns true if piece of given type/color at `from` can attack `to`.
 * Used by king safety to check piece influence near king.
 */
function is_piece_attacking(from, to, type, color) {
    if (type === KNIGHT) {
        const diff = from - to;
        for (const d of piece_dirs[KNIGHT]) if (d === diff) return true;
        return false;
    }
    if (type === KING) {
        return Math.abs((from >> 4) - (to >> 4)) <= 1
            && Math.abs((from & 7)  - (to & 7))  <= 1;
    }
    // Sliding piece: walk ray from `from` in each direction
    const dirs = piece_dirs[type];
    for (const step of dirs) {
        let sq = from + step;
        while (!(sq & 0x88)) {
            if (sq === to) return true;
            if (board[sq]) break;
            sq += step;
        }
    }
    return false;
}
