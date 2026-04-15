// @module make_unmake
// ==============================================================================
// MAKE / UNMAKE MOVE — Zero-allocation move execution with full state save/restore
//
// Move encoding (packed into one Int32):
//   bits  0-6   : from square
//   bits  7-13  : to square
//   bits 14-18  : moving piece (type | color)
//   bits 19-23  : captured piece (0 = none)
//   bits 24-28  : promotion piece (0 = none)
//   bits 29-31  : flag  (0=normal, 1=en-passant, 2=castle)
// ==============================================================================

function make_move(m) {
    const from     = m & 127;
    const to       = (m >> 7)  & 127;
    const piece    = (m >> 14) & 31;
    const captured = (m >> 19) & 31;
    const prom     = (m >> 24) & 31;
    const flag     = m >> 29;

    // Save state
    state_hash_lo[ply]  = hash_lo;  state_hash_hi[ply]  = hash_hi;
    state_ep[ply]       = ep;       state_castle[ply]   = castle;
    state_halfmove[ply] = halfmove;
    state_pawn_lo[ply]  = pawn_hash_lo; state_pawn_hi[ply] = pawn_hash_hi;

    // Flip side in hash; clear old ep key
    hash_lo ^= z_color_lo; hash_hi ^= z_color_hi;
    if (ep) { hash_lo ^= z_ep_lo[ep]; hash_hi ^= z_ep_hi[ep]; ep = 0; }

    remove_piece(from, piece);

    if (captured) {
        const cap_sq = (flag === 1)
            ? (side === WHITE ? to - 16 : to + 16)  // en-passant capture square
            : to;
        remove_piece(cap_sq, captured);
        halfmove = 0;
    } else if ((piece & 7) === PAWN) {
        halfmove = 0;
    } else {
        halfmove++;
    }

    // Place piece (or promotion piece) on destination
    add_piece(to, prom ? prom : piece);

    // Update castle rights keys
    hash_lo ^= z_castle_lo[castle]; hash_hi ^= z_castle_hi[castle];
    castle  &= castle_rights[from];
    castle  &= castle_rights[to];
    hash_lo ^= z_castle_lo[castle]; hash_hi ^= z_castle_hi[castle];

    // Move rook on castle
    if (flag === 2) {
        if      (to === 6)   { remove_piece(7,   ROOK|WHITE); add_piece(5,   ROOK|WHITE); }
        else if (to === 2)   { remove_piece(0,   ROOK|WHITE); add_piece(3,   ROOK|WHITE); }
        else if (to === 118) { remove_piece(119, ROOK|BLACK); add_piece(117, ROOK|BLACK); }
        else if (to === 114) { remove_piece(112, ROOK|BLACK); add_piece(115, ROOK|BLACK); }
    }

    // Set en-passant square on double pawn push
    if ((piece & 7) === PAWN && Math.abs(from - to) === 32) {
        ep = (from + to) >> 1;
        hash_lo ^= z_ep_lo[ep]; hash_hi ^= z_ep_hi[ep];
    }

    if ((piece & 7) === KING) king_sq[side === WHITE ? 0 : 1] = to;
    side ^= 24;
    ply++;

    // Legality check: was our king left in check?
    if (is_attacked(king_sq[(side ^ 24) === WHITE ? 0 : 1], side)) {
        unmake_move(m);
        return false;
    }
    return true;
}

function unmake_move(m) {
    ply--; side ^= 24;
    const from     = m & 127;
    const to       = (m >> 7)  & 127;
    const piece    = (m >> 14) & 31;
    const captured = (m >> 19) & 31;
    const prom     = (m >> 24) & 31;
    const flag     = m >> 29;

    remove_piece(to, prom ? prom : piece);

    if (captured) {
        const cap_sq = (flag === 1)
            ? (side === WHITE ? to - 16 : to + 16)
            : to;
        add_piece(cap_sq, captured);
    }
    add_piece(from, piece);

    // Restore rook on castle undo
    if (flag === 2) {
        if      (to === 6)   { remove_piece(5,   ROOK|WHITE); add_piece(7,   ROOK|WHITE); }
        else if (to === 2)   { remove_piece(3,   ROOK|WHITE); add_piece(0,   ROOK|WHITE); }
        else if (to === 118) { remove_piece(117, ROOK|BLACK); add_piece(119, ROOK|BLACK); }
        else if (to === 114) { remove_piece(115, ROOK|BLACK); add_piece(112, ROOK|BLACK); }
    }

    if ((piece & 7) === KING) king_sq[side === WHITE ? 0 : 1] = from;

    // Restore full state
    hash_lo      = state_hash_lo[ply];  hash_hi      = state_hash_hi[ply];
    ep           = state_ep[ply];       castle       = state_castle[ply];
    halfmove     = state_halfmove[ply];
    pawn_hash_lo = state_pawn_lo[ply];  pawn_hash_hi = state_pawn_hi[ply];
}

// ==============================================================================
// NULL MOVE — Skip a turn (used in null-move pruning)
// ==============================================================================
function make_null_move() {
    state_hash_lo[ply]  = hash_lo; state_hash_hi[ply]  = hash_hi;
    state_ep[ply]       = ep;      state_castle[ply]   = castle;
    state_halfmove[ply] = halfmove;
    state_pawn_lo[ply]  = pawn_hash_lo; state_pawn_hi[ply] = pawn_hash_hi;
    hash_lo ^= z_color_lo; hash_hi ^= z_color_hi;
    if (ep) { hash_lo ^= z_ep_lo[ep]; hash_hi ^= z_ep_hi[ep]; ep = 0; }
    halfmove++; ply++; side ^= 24;
}

function unmake_null_move() {
    ply--; side ^= 24;
    hash_lo      = state_hash_lo[ply]; hash_hi      = state_hash_hi[ply];
    ep           = state_ep[ply];      castle       = state_castle[ply];
    halfmove     = state_halfmove[ply];
    pawn_hash_lo = state_pawn_lo[ply]; pawn_hash_hi = state_pawn_hi[ply];
}
