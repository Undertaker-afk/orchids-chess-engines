// @module fen
// ==============================================================================
// FEN PARSING & UCI MOVE ENCODING
// ==============================================================================

/**
 * Parse a FEN string and set up the board state.
 * Example: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
 */
function set_fen(fen) {
    // Clear board and all incremental state
    for (let i = 0; i < 128; i++) board[i] = 0;
    eval_mg = 0; eval_eg = 0; phase = 0;
    hash_lo = 0; hash_hi = 0;
    pawn_hash_lo = 0; pawn_hash_hi = 0;
    ep = 0; castle = 0; halfmove = 0; fullmove = 1; ply = 0;
    king_sq[0] = 0; king_sq[1] = 0;

    const parts = fen.trim().split(/\s+/);
    const rows  = parts[0].split('/');

    // Place pieces: FEN rank 0 = rank 8 (row index 0 in string), rank 7 = rank 1
    let rank = 7;
    for (let i = 0; i < 8; i++) {
        let file = 0;
        for (let j = 0; j < rows[i].length; j++) {
            const c = rows[i][j];
            if (c >= '1' && c <= '8') {
                file += parseInt(c);
            } else {
                const color = (c === c.toUpperCase()) ? WHITE : BLACK;
                const l     = c.toLowerCase();
                let type = 0;
                if      (l === 'p') type = PAWN;
                else if (l === 'n') type = KNIGHT;
                else if (l === 'b') type = BISHOP;
                else if (l === 'r') type = ROOK;
                else if (l === 'q') type = QUEEN;
                else if (l === 'k') type = KING;
                const sq = (rank << 4) | file;
                add_piece(sq, type | color);
                if (type === KING) king_sq[color === WHITE ? 0 : 1] = sq;
                file++;
            }
        }
        rank--;
    }

    // Side to move
    side = (parts[1] === 'b') ? BLACK : WHITE;
    if (side === BLACK) { hash_lo ^= z_color_lo; hash_hi ^= z_color_hi; }

    // Castling rights
    if (parts[2] && parts[2] !== '-') {
        if (parts[2].includes('K')) castle |= 1;
        if (parts[2].includes('Q')) castle |= 2;
        if (parts[2].includes('k')) castle |= 4;
        if (parts[2].includes('q')) castle |= 8;
    }
    hash_lo ^= z_castle_lo[castle]; hash_hi ^= z_castle_hi[castle];

    // En-passant square
    if (parts[3] && parts[3] !== '-') {
        const f = parts[3].charCodeAt(0) - 97;
        const r = parseInt(parts[3][1]) - 1;
        ep = (r << 4) | f;
        hash_lo ^= z_ep_lo[ep]; hash_hi ^= z_ep_hi[ep];
    }

    // Half-move clock
    if (parts[4]) halfmove = parseInt(parts[4]) || 0;

    // Full-move number
    if (parts[5]) fullmove = Math.max(1, parseInt(parts[5]) || 1);
}

// ---------------------------------------------------------------------------
// UCI move encoding helpers
// ---------------------------------------------------------------------------

/** Convert a 0x88 square index to algebraic notation ("a1" … "h8") */
function sq_to_str(sq) {
    return String.fromCharCode(97 + (sq & 7)) + ((sq >> 4) + 1);
}

/** Convert an internal move integer to a UCI string (e.g. "e2e4", "e7e8q") */
function move_to_uci(m) {
    const from = m & 127;
    const to   = (m >> 7) & 127;
    const prom = (m >> 24) & 31;
    let s = sq_to_str(from) + sq_to_str(to);
    if (prom) {
        const t = prom & 7;
        s += (t === QUEEN) ? 'q' : (t === ROOK) ? 'r' : (t === BISHOP) ? 'b' : 'n';
    }
    return s;
}
