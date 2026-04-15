// @module pieces
// ==============================================================================
// PIECE MANAGEMENT — Incremental eval, hash, and pawn-hash updates
// Called by make_move / unmake_move / set_fen
// ==============================================================================

function add_piece(sq, pc) {
    board[sq] = pc;
    const type = pc & 7, color = pc & 24;
    // Map 0x88 square → PST index (rank 0 = white's back rank)
    let sq64 = (7 - (sq >> 4)) * 8 + (sq & 7);
    if (color === BLACK) sq64 ^= 56; // mirror for black
    // Accumulate PST scores (white positive, black negative)
    eval_mg += (color === WHITE ? mg_pesto[type][sq64] : -mg_pesto[type][sq64]);
    eval_eg += (color === WHITE ? eg_pesto[type][sq64] : -eg_pesto[type][sq64]);
    phase   += phase_inc[type];
    // Update Zobrist hash
    const pidx = color === WHITE ? type : type + 7;
    hash_lo ^= z_lo[pidx * 128 + sq];
    hash_hi ^= z_hi[pidx * 128 + sq];
    // Update pawn hash (only for pawns)
    if (type === PAWN) {
        pawn_hash_lo ^= z_lo[pidx * 128 + sq];
        pawn_hash_hi ^= z_hi[pidx * 128 + sq];
    }
}

function remove_piece(sq, pc) {
    board[sq] = 0;
    const type = pc & 7, color = pc & 24;
    let sq64 = (7 - (sq >> 4)) * 8 + (sq & 7);
    if (color === BLACK) sq64 ^= 56;
    eval_mg -= (color === WHITE ? mg_pesto[type][sq64] : -mg_pesto[type][sq64]);
    eval_eg -= (color === WHITE ? eg_pesto[type][sq64] : -eg_pesto[type][sq64]);
    phase   -= phase_inc[type];
    const pidx = color === WHITE ? type : type + 7;
    hash_lo ^= z_lo[pidx * 128 + sq];
    hash_hi ^= z_hi[pidx * 128 + sq];
    if (type === PAWN) {
        pawn_hash_lo ^= z_lo[pidx * 128 + sq];
        pawn_hash_hi ^= z_hi[pidx * 128 + sq];
    }
}
