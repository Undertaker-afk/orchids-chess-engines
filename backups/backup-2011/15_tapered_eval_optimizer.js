// @module tapered_eval_optimizer
// ==============================================================================
// TAPERED EVAL OPTIMIZER (SCaffold)
// This module intentionally has no runtime effect on search speed.
// It provides feature extraction hooks for offline regression/tuning.
// ==============================================================================

function extract_eval_features() {
    let white_material = 0;
    let black_material = 0;
    let white_minors = 0;
    let black_minors = 0;
    let white_majors = 0;
    let black_majors = 0;

    for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) continue;
        const pc = board[sq];
        if (!pc) continue;

        const side_pc = pc & 24;
        const pt = pc & 7;

        if (side_pc === WHITE) white_material += PIECE_VAL[pt];
        else black_material += PIECE_VAL[pt];

        if (pt === KNIGHT || pt === BISHOP) {
            if (side_pc === WHITE) white_minors++;
            else black_minors++;
        } else if (pt === ROOK || pt === QUEEN) {
            if (side_pc === WHITE) white_majors++;
            else black_majors++;
        }
    }

    return {
        phase,
        halfmove,
        fullmove,
        material_diff: white_material - black_material,
        minor_diff: white_minors - black_minors,
        major_diff: white_majors - black_majors,
        mg_eval: eval_mg,
        eg_eval: eval_eg
    };
}
