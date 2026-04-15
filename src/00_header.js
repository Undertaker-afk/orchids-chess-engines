#!/usr/bin/env node
/**
 * Trinity Chess Engine — Modular Build
 *
 * Modules (in build order):
 *   00_header       — CLI args, entry banner
 *   01_constants    — Piece types, values, PST tables, directions
 *   02_zobrist      — Zobrist hash initialization
 *   03_state        — Board state, stack buffers, TT, history tables
 *   04_pieces       — add_piece / remove_piece (incremental eval + hash)
 *   05_make_unmake  — make_move, unmake_move, null move
 *   06_attacks      — is_attacked, is_piece_attacking
 *   07_see          — Static Exchange Evaluation
 *   08_movegen      — generate_moves, add_pawn_moves
 *   09_evaluate     — evaluate(), sub-evaluators
 *   10_ordering     — score_move, sort_moves
 *   11_search       — quiesce(), search(), search_root()
 *   12_fen          — set_fen(), move_to_uci()
 *   13_main         — readline loop
 *
 * Build with: node build.js
 * Output:     dist/Trinity-<version>.js
 */

// @module header

const readline = require('readline');

const DEFAULT_MOVE_TIME_MS = 4500;

function parseCliArgs(argv) {
    const options = { moveTimeMs: DEFAULT_MOVE_TIME_MS, stats: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--movetime' || arg === '--move-time' || arg === '--move-time-ms') {
            options.moveTimeMs = Number(argv[++i]);
        } else if (arg === '--stats') {
            options.stats = true;
        } else if (arg === '--help' || arg === '-h') {
            process.stdout.write('Usage: node Trinity.js [--movetime MS] [--stats]\n');
            process.exit(0);
        }
    }
    if (!Number.isFinite(options.moveTimeMs) || options.moveTimeMs <= 0) {
        throw new Error(`Invalid movetime: ${options.moveTimeMs}`);
    }
    options.moveTimeMs = Math.floor(options.moveTimeMs);
    return options;
}

let cliOptions;
try {
    cliOptions = parseCliArgs(process.argv.slice(2));
} catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
}
