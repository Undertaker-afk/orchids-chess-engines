// @module time
// ==============================================================================
// DYNAMIC TIME MANAGEMENT
// Adapts root search time around configured MOVE_TIME_MS based on position phase
// and root instability (best move changes between iterations).
// ==============================================================================

function clamp(x, lo, hi) {
    return x < lo ? lo : (x > hi ? hi : x);
}

function get_time_limits_ms(base_ms) {
    const base = Math.max(1, base_ms | 0);
    return {
        min: Math.max(50, Math.floor(base * 0.45)),
        max: Math.max(100, Math.floor(base * 1.75)),
        instability_bonus: Math.max(20, Math.floor(base * 0.10))
    };
}

function compute_search_time_budget_ms(base_ms, phase_value, halfmove_clock) {
    const limits = get_time_limits_ms(base_ms);

    // More time in endgames (phase low), less in quiet opening book-like positions.
    let scale = 1.0;
    if (phase_value >= 18) scale -= 0.12;
    if (phase_value <= 8) scale += 0.18;

    // Slight boost in very early moves where opening choice matters.
    if (halfmove_clock <= 8) scale += 0.06;

    return clamp(Math.floor(base_ms * scale), limits.min, limits.max);
}
