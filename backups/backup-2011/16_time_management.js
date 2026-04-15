// @module time_management
// ==============================================================================
// ADVANCED TIME MANAGEMENT
// Overrides baseline timing helpers with fuller context:
// - estimated moves remaining
// - root instability support fields
// - critical moment boosts (in-check / balanced sharp positions)
// ==============================================================================

function clamp(x, lo, hi) {
    return x < lo ? lo : (x > hi ? hi : x);
}

function estimate_moves_remaining(phase_value, fullmove_number) {
    // Crude but stable estimate for sudden-death controls.
    let est = 32;
    if (phase_value >= 18) est += 6;
    else if (phase_value <= 8) est -= 8;

    if (fullmove_number <= 12) est += 6;
    else if (fullmove_number >= 40) est -= 4;

    return clamp(est, 12, 44);
}

function get_time_limits_ms(base_ms, phase_value = 24, fullmove_number = 1) {
    const base = Math.max(1, base_ms | 0);
    const remaining = estimate_moves_remaining(phase_value, fullmove_number);

    // Keep hard bounds around expected spend-per-move.
    const min = Math.max(40, Math.floor(base * 0.40));
    const max = Math.max(120, Math.floor(base * (remaining <= 18 ? 2.20 : 1.90)));

    return {
        min,
        max,
        instability_bonus: Math.max(20, Math.floor(base * 0.10)),
        swing_bonus: Math.max(15, Math.floor(base * 0.07))
    };
}

function compute_search_time_budget_ms(
    base_ms,
    phase_value,
    halfmove_clock,
    fullmove_number = 1,
    in_check_root = false,
    root_eval_cp = 0
) {
    const limits = get_time_limits_ms(base_ms, phase_value, fullmove_number);

    let scale = 1.0;

    // Opening and endgame handling.
    if (phase_value >= 18) scale -= 0.10;
    if (phase_value <= 8) scale += 0.22;

    // Early critical development decisions.
    if (halfmove_clock <= 10) scale += 0.05;

    // Critical moments.
    if (in_check_root) scale += 0.12;

    // Keep extra time in close positions where small eval swings matter.
    if (Math.abs(root_eval_cp) <= 60) scale += 0.05;

    return clamp(Math.floor(base_ms * scale), limits.min, limits.max);
}
