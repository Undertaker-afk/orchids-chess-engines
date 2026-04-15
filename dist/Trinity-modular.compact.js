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

const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
const WHITE = 8, BLACK = 16;

const PIECE_VAL = [0, 100, 320, 330, 500, 900, 20000];

const phase_inc = [0, 0, 1, 1, 2, 4, 0];

const mg_pesto = [
    0,
    [82,82,82,82,82,82,82,82, 180,216,143,177,150,208,116,71,
     76,89,108,113,147,138,107,62,  68,95,88,103,105,94,99,59,
     55,80,77,94,99,88,92,57,       56,78,78,72,85,85,115,70,
     47,81,62,59,67,106,120,60,     82,82,82,82,82,82,82,82],
    [170,248,303,288,398,240,322,230, 264,296,409,373,360,399,344,320,
     290,397,374,402,421,466,410,381, 328,354,356,390,374,406,355,359,
     324,341,353,350,365,356,358,329, 314,328,349,347,356,354,362,321,
     308,284,325,334,336,355,323,318, 232,316,279,304,320,309,318,314],
    [336,369,283,328,340,323,372,357, 339,381,347,352,395,424,383,318,
     349,402,408,405,400,415,402,363, 361,370,384,415,402,402,372,363,
     359,378,378,391,399,377,375,369, 365,380,380,380,379,392,383,375,
     369,380,381,365,372,386,398,366, 332,362,351,344,352,353,326,344],
    [509,519,509,528,540,486,508,520, 504,509,535,539,557,544,503,521,
     472,496,503,513,494,522,538,493, 453,466,484,503,501,512,469,457,
     441,451,465,476,486,470,483,454, 432,452,461,460,480,477,472,444,
     433,461,457,468,476,488,471,406, 458,464,478,494,493,484,440,451],
    [997,1025,1054,1037,1084,1069,1068,1070, 1001,986,1020,1026,1009,1082,1053,1079,
     1012,1008,1032,1033,1054,1081,1072,1082, 998,998,1009,1009,1024,1042,1023,1026,
     1016,999,1016,1015,1023,1021,1028,1022, 1011,1027,1014,1023,1020,1027,1039,1030,
     990,1017,1036,1027,1033,1040,1022,1026, 1024,1007,1016,1035,1010,1000,994,975],
    [-65,23,16,-15,-56,-34,2,13,   29,-1,-20,-7,-8,-4,-38,-29,
      -9,24,2,-16,-20,6,22,-22,   -17,-20,-12,-27,-30,-25,-14,-36,
     -49,-1,-27,-39,-46,-44,-33,-51, -14,-14,-22,-46,-44,-30,-15,-27,
       1,7,-8,-64,-43,-16,9,8,    -15,36,12,-54,8,-28,24,14]
];

const eg_pesto = [
    0,
    [94,94,94,94,94,94,94,94, 272,267,252,228,241,226,259,281,
     188,194,179,161,150,147,176,178, 126,118,107,99,92,98,111,111,
     107,103,91,87,87,86,97,93,   98,101,88,95,94,89,93,86,
     107,102,102,104,107,94,96,87,    94,94,94,94,94,94,94,94],
    [223,243,268,253,250,254,218,182, 256,273,256,279,272,256,257,229,
     257,261,291,290,280,272,262,240, 264,284,303,303,303,292,289,263,
     263,275,297,306,297,298,285,263, 258,278,280,296,291,278,261,259,
     239,261,271,276,279,261,258,237, 252,230,258,266,259,263,231,217],
    [283,276,286,289,290,288,280,273, 289,293,304,285,294,284,293,283,
     299,289,297,296,295,303,297,301, 294,306,309,306,311,307,300,299,
     291,300,310,316,304,307,294,288, 285,294,305,307,310,300,290,282,
     283,279,290,296,301,288,282,270, 274,288,274,292,288,281,292,280],
    [525,522,530,527,524,524,520,517, 523,525,525,523,509,515,520,515,
     519,519,519,517,516,509,507,509, 516,515,525,513,514,513,511,514,
     515,517,520,516,507,506,504,501, 508,512,507,511,505,500,504,496,
     506,506,512,514,503,503,501,509, 503,514,515,511,507,499,516,492],
    [927,958,958,963,963,955,946,956, 919,956,968,977,994,961,966,936,
     916,942,945,985,983,971,955,945, 939,958,960,981,993,976,993,972,
     918,964,955,983,967,970,948,947, 920,909,951,942,945,953,946,941,
     914,913,906,920,920,913,900,904, 903,908,914,893,931,904,916,895],
    [-74,-35,-18,-18,-11,15,4,-17,  -12,17,14,17,17,38,23,11,
      10,17,23,15,20,45,44,13,     -8,22,24,27,26,33,26,3,
     -18,-4,21,24,27,23,9,-11,    -19,-3,11,21,23,16,7,-9,
     -27,-11,4,13,14,4,-5,-17,    -53,-34,-21,-11,-28,-14,-24,-43]
];

const piece_dirs = [
    [], [],
    [-33,-31,-18,-14,14,18,31,33],   // KNIGHT
    [-17,-15,15,17],                  // BISHOP
    [-16,-1,1,16],                    // ROOK
    [-17,-16,-15,-1,1,15,16,17],     // QUEEN
    [-17,-16,-15,-1,1,15,16,17]      // KING
];

const castle_rights = new Int32Array(128);
for (let i = 0; i < 128; i++) castle_rights[i] = 15;
castle_rights[0]   &= ~2;   // a1 rook  → remove white queenside
castle_rights[4]   &= ~3;   // e1 king  → remove both white
castle_rights[7]   &= ~1;   // h1 rook  → remove white kingside
castle_rights[112] &= ~8;   // a8 rook  → remove black queenside
castle_rights[116] &= ~12;  // e8 king  → remove both black
castle_rights[119] &= ~4;   // h8 rook  → remove black kingside

const z_lo = new Int32Array(14 * 128), z_hi = new Int32Array(14 * 128);
const z_castle_lo = new Int32Array(16), z_castle_hi = new Int32Array(16);
const z_ep_lo = new Int32Array(128),    z_ep_hi = new Int32Array(128);

let z_color_lo, z_color_hi;
let hash_lo = 0, hash_hi = 0;
let pawn_hash_lo = 0, pawn_hash_hi = 0;

function rand32() { return (Math.random() * 0x100000000) | 0; }

for (let i = 0; i < 14 * 128; i++) { z_lo[i] = rand32(); z_hi[i] = rand32(); }
for (let i = 0; i < 16;  i++)      { z_castle_lo[i] = rand32(); z_castle_hi[i] = rand32(); }
for (let i = 0; i < 128; i++)      { z_ep_lo[i] = rand32(); z_ep_hi[i] = rand32(); }
z_color_lo = rand32(); z_color_hi = rand32();

const board = new Int32Array(128);

let side     = WHITE;   // Side to move (WHITE or BLACK)
let ep       = 0;       // En-passant target square (0 = none)
let castle   = 0;       // Castle rights bitmask (bits 0-3: WK,WQ,BK,BQ)
let halfmove = 0;       // Half-move clock (for 50-move rule)
let ply      = 0;       // Current search ply depth
let eval_mg  = 0;       // Incremental middlegame material+PST score
let eval_eg  = 0;       // Incremental endgame material+PST score
let phase    = 0;       // Tapered eval phase counter (0=endgame, 24=opening)
let king_sq  = [0, 0];  // King squares: [0]=white, [1]=black

const MAX_PLY = 512;

const state_hash_lo  = new Int32Array(MAX_PLY);
const state_hash_hi  = new Int32Array(MAX_PLY);
const state_ep       = new Int32Array(MAX_PLY);
const state_castle   = new Int32Array(MAX_PLY);
const state_halfmove = new Int32Array(MAX_PLY);
const state_pawn_lo  = new Int32Array(MAX_PLY);
const state_pawn_hi  = new Int32Array(MAX_PLY);

const TT_SIZE = 8 * 1024 * 1024; // must be power of 2

const tt_key_lo = new Int32Array(TT_SIZE);
const tt_key_hi = new Int32Array(TT_SIZE);
const tt_data   = new Int32Array(TT_SIZE); // [flag:8][score:16] packed
const tt_move   = new Int32Array(TT_SIZE);
const tt_depth  = new Int32Array(TT_SIZE);

const TT_EXACT = 1, TT_UPPER = 2, TT_LOWER = 3;

const PAWN_TT_SIZE = 65536;

const pawn_tt_lo    = new Int32Array(PAWN_TT_SIZE);
const pawn_tt_hi    = new Int32Array(PAWN_TT_SIZE);
const pawn_tt_score = new Int32Array(PAWN_TT_SIZE);

const move_stack  = new Int32Array(MAX_PLY * 256);
const move_scores = new Int32Array(MAX_PLY * 256);

const killers = Array.from({ length: MAX_PLY }, () => new Int32Array(2));

const history = new Int32Array(16384);

const countermove = new Int32Array(16384);

const lmr_table = Array.from({ length: 64 }, (_, d) =>
    Array.from({ length: 64 }, (_, m) => {
        if (d === 0 || m === 0) return 0;
        return Math.max(0, Math.floor(0.75 + Math.log(d) * Math.log(m) / 2.25));
    })
);

const MOVE_TIME_MS   = cliOptions.moveTimeMs;
const TIME_CHECK_MASK = 511; // check time every 512 nodes

let nodes       = 0;
let stop_search = false;
let start_time  = 0;
let stop_time   = 0;

function add_piece(sq, pc) {
    board[sq] = pc;
    const type = pc & 7, color = pc & 24;
    let sq64 = (7 - (sq >> 4)) * 8 + (sq & 7);
    if (color === BLACK) sq64 ^= 56; // mirror for black
    eval_mg += (color === WHITE ? mg_pesto[type][sq64] : -mg_pesto[type][sq64]);
    eval_eg += (color === WHITE ? eg_pesto[type][sq64] : -eg_pesto[type][sq64]);
    phase   += phase_inc[type];
    const pidx = color === WHITE ? type : type + 7;
    hash_lo ^= z_lo[pidx * 128 + sq];
    hash_hi ^= z_hi[pidx * 128 + sq];
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

function make_move(m) {
    const from     = m & 127;
    const to       = (m >> 7)  & 127;
    const piece    = (m >> 14) & 31;
    const captured = (m >> 19) & 31;
    const prom     = (m >> 24) & 31;
    const flag     = m >> 29;

    state_hash_lo[ply]  = hash_lo;  state_hash_hi[ply]  = hash_hi;
    state_ep[ply]       = ep;       state_castle[ply]   = castle;
    state_halfmove[ply] = halfmove;
    state_pawn_lo[ply]  = pawn_hash_lo; state_pawn_hi[ply] = pawn_hash_hi;

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

    add_piece(to, prom ? prom : piece);

    hash_lo ^= z_castle_lo[castle]; hash_hi ^= z_castle_hi[castle];
    castle  &= castle_rights[from];
    castle  &= castle_rights[to];
    hash_lo ^= z_castle_lo[castle]; hash_hi ^= z_castle_hi[castle];

    if (flag === 2) {
        if      (to === 6)   { remove_piece(7,   ROOK|WHITE); add_piece(5,   ROOK|WHITE); }
        else if (to === 2)   { remove_piece(0,   ROOK|WHITE); add_piece(3,   ROOK|WHITE); }
        else if (to === 118) { remove_piece(119, ROOK|BLACK); add_piece(117, ROOK|BLACK); }
        else if (to === 114) { remove_piece(112, ROOK|BLACK); add_piece(115, ROOK|BLACK); }
    }

    if ((piece & 7) === PAWN && Math.abs(from - to) === 32) {
        ep = (from + to) >> 1;
        hash_lo ^= z_ep_lo[ep]; hash_hi ^= z_ep_hi[ep];
    }

    if ((piece & 7) === KING) king_sq[side === WHITE ? 0 : 1] = to;
    side ^= 24;
    ply++;

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

    if (flag === 2) {
        if      (to === 6)   { remove_piece(5,   ROOK|WHITE); add_piece(7,   ROOK|WHITE); }
        else if (to === 2)   { remove_piece(3,   ROOK|WHITE); add_piece(0,   ROOK|WHITE); }
        else if (to === 118) { remove_piece(117, ROOK|BLACK); add_piece(119, ROOK|BLACK); }
        else if (to === 114) { remove_piece(115, ROOK|BLACK); add_piece(112, ROOK|BLACK); }
    }

    if ((piece & 7) === KING) king_sq[side === WHITE ? 0 : 1] = from;

    hash_lo      = state_hash_lo[ply];  hash_hi      = state_hash_hi[ply];
    ep           = state_ep[ply];       castle       = state_castle[ply];
    halfmove     = state_halfmove[ply];
    pawn_hash_lo = state_pawn_lo[ply];  pawn_hash_hi = state_pawn_hi[ply];
}

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

function is_attacked(sq, them) {
    const psq1 = sq + (them === WHITE ? -15 : 15);
    if (!(psq1 & 0x88) && board[psq1] === (PAWN | them)) return true;
    const psq2 = sq + (them === WHITE ? -17 : 17);
    if (!(psq2 & 0x88) && board[psq2] === (PAWN | them)) return true;

    for (let i = 0; i < 8; i++) {
        const csq = sq + piece_dirs[KNIGHT][i];
        if (!(csq & 0x88) && board[csq] === (KNIGHT | them)) return true;
    }

    for (let i = 0; i < 8; i++) {
        const csq = sq + piece_dirs[KING][i];
        if (!(csq & 0x88) && board[csq] === (KING | them)) return true;
    }

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

/**
 * Recursive swap: temporarily remove `from_sq`'s piece and find the cheapest
 * opponent recapture, then recurse.
 *
 * @param {number} to_sq        - Square where exchange happens
 * @param {number} target_val   - Value of piece currently being captured
 * @param {number} from_sq      - Square of our capturing piece
 * @param {number} attacker_val - Value of our capturing piece
 * @param {number} us           - Color doing this capture (WHITE or BLACK)
 * @returns {number}            - Net gain from this capture (from our POV)
 */
function see_square(to_sq, target_val, from_sq, attacker_val, us) {
    const save = board[from_sq];
    board[from_sq] = 0; // Temporarily remove our attacker

    const them = us ^ 24;
    let best_sq = -1, best_val = 999999;

    for (const d of (them === WHITE ? [-15, -17] : [15, 17])) {
        const sq = to_sq + d;
        if (!(sq & 0x88) && board[sq] === (PAWN | them)) {
            if (PIECE_VAL[PAWN] < best_val) { best_val = PIECE_VAL[PAWN]; best_sq = sq; }
            break;
        }
    }
    if (best_val > PIECE_VAL[KNIGHT]) {
        for (const d of piece_dirs[KNIGHT]) {
            const sq = to_sq + d;
            if (!(sq & 0x88) && board[sq] === (KNIGHT | them)) {
                if (PIECE_VAL[KNIGHT] < best_val) { best_val = PIECE_VAL[KNIGHT]; best_sq = sq; }
            }
        }
    }
    if (best_val > PIECE_VAL[BISHOP]) {
        for (const step of piece_dirs[BISHOP]) {
            let sq = to_sq + step;
            while (!(sq & 0x88)) {
                const pc = board[sq];
                if (pc) {
                    if ((pc & them) && ((pc & 7) === BISHOP || (pc & 7) === QUEEN)) {
                        if (PIECE_VAL[pc & 7] < best_val) { best_val = PIECE_VAL[pc & 7]; best_sq = sq; }
                    }
                    break;
                }
                sq += step;
            }
        }
    }
    if (best_val > PIECE_VAL[ROOK]) {
        for (const step of piece_dirs[ROOK]) {
            let sq = to_sq + step;
            while (!(sq & 0x88)) {
                const pc = board[sq];
                if (pc) {
                    if ((pc & them) && ((pc & 7) === ROOK || (pc & 7) === QUEEN)) {
                        if (PIECE_VAL[pc & 7] < best_val) { best_val = PIECE_VAL[pc & 7]; best_sq = sq; }
                    }
                    break;
                }
                sq += step;
            }
        }
    }
    if (best_val > PIECE_VAL[KING]) {
        for (const d of piece_dirs[KING]) {
            const sq = to_sq + d;
            if (!(sq & 0x88) && board[sq] === (KING | them)) {
                best_val = PIECE_VAL[KING]; best_sq = sq;
            }
        }
    }

    let result;
    if (best_sq === -1) {
        result = target_val;
    } else {
        const recapture = see_square(to_sq, attacker_val, best_sq, best_val, them);
        result = target_val - recapture; // We gain target, but lose if opponent recaptures well
        if (result < 0) result = 0;     // We can choose NOT to recapture if it loses
    }

    board[from_sq] = save; // Restore our attacker
    return result;
}

/**
 * Entry point: evaluate the material exchange started by move `m`.
 * Returns >= 0 for good/equal captures, < 0 for bad captures.
 */
function see(m) {
    const from     = m & 127;
    const to       = (m >> 7)  & 127;
    const captured = (m >> 19) & 31;
    const flag     = m >> 29;
    const piece    = (m >> 14) & 31;

    if (!captured && flag !== 1) return 0; // Not a capture

    const victim_val   = (flag === 1) ? PIECE_VAL[PAWN] : PIECE_VAL[captured & 7];
    const attacker_val = PIECE_VAL[piece & 7];

    return see_square(to, victim_val, from, attacker_val, side);
}

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

            for (const cdir of (us === WHITE ? [15, 17] : [-15, -17])) {
                const csq = sq + cdir;
                if (csq & 0x88) continue;
                if (board[csq] && (board[csq] & them))
                    count = add_pawn_moves(offset, count, sq, csq, pc, board[csq], rank === prom_rank, 0);
                else if (csq === ep)
                    count = add_pawn_moves(offset, count, sq, csq, pc, PAWN | them, false, 1);
            }

            if (!captures_only || rank === prom_rank) {
                const nsq = sq + dir;
                if (!(nsq & 0x88) && board[nsq] === 0) {
                    count = add_pawn_moves(offset, count, sq, nsq, pc, 0, rank === prom_rank, 0);
                    if (!captures_only && rank === start_rank) {
                        const nsq2 = sq + dir * 2;
                        if (board[nsq2] === 0)
                            move_stack[offset + count++] = sq | (nsq2 << 7) | (pc << 14);
                    }
                }
            }
        } else {
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

function eval_pawns_raw() {
    let score = 0;
    for (const color of [WHITE, BLACK]) {
        const sign       = color === WHITE ? 1 : -1;
        const pawn       = PAWN | color;
        const enemy_pawn = PAWN | (color ^ 24);

        const files = [0, 0, 0, 0, 0, 0, 0, 0];
        for (let sq = 0; sq < 128; sq++) {
            if (!(sq & 0x88) && board[sq] === pawn) files[sq & 7]++;
        }

        for (let sq = 0; sq < 128; sq++) {
            if ((sq & 0x88) || board[sq] !== pawn) continue;
            const f = sq & 7, r = sq >> 4;

            if (files[f] > 1) score -= 12 * sign;

            const neighbors = (f > 0 ? files[f - 1] : 0) + (f < 7 ? files[f + 1] : 0);
            if (neighbors === 0) score -= 18 * sign;

            if (neighbors > 0) score += 6 * sign;

            let passed = true;
            const step_r = color === WHITE ? 1 : -1;
            const end_r  = color === WHITE ? 7 : 0;
            outer: for (let rr = r + step_r; color === WHITE ? rr <= end_r : rr >= end_r; rr += step_r) {
                for (let ff = f - 1; ff <= f + 1; ff++) {
                    if (ff >= 0 && ff <= 7 && board[rr * 16 + ff] === enemy_pawn) {
                        passed = false; break outer;
                    }
                }
            }
            if (passed) {
                const rank_val = color === WHITE ? r : (7 - r);
                score += (10 + rank_val * rank_val * 3) * sign;
            }
        }
    }
    return score;
}

function eval_pawns_cached() {
    const idx = pawn_hash_lo & (PAWN_TT_SIZE - 1);
    if (pawn_tt_lo[idx] === pawn_hash_lo && pawn_tt_hi[idx] === pawn_hash_hi) {
        return pawn_tt_score[idx];
    }
    const s = eval_pawns_raw();
    pawn_tt_lo[idx]    = pawn_hash_lo;
    pawn_tt_hi[idx]    = pawn_hash_hi;
    pawn_tt_score[idx] = s;
    return s;
}

const ATK_WEIGHT = [0, 0, 2, 2, 3, 5, 0]; // index = piece type

function eval_king_safety() {
    let score = 0;
    for (const color of [WHITE, BLACK]) {
        const sign  = color === WHITE ? 1 : -1;
        const ksq   = king_sq[color === WHITE ? 0 : 1];
        if (!ksq) continue;
        const f = ksq & 7, r = ksq >> 4;
        const enemy = color ^ 24;

        const shield_r = r + (color === WHITE ? 1 : -1);
        let shield_bonus = 0;
        if (shield_r >= 0 && shield_r < 8) {
            for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
                if (board[shield_r * 16 + ff] === (PAWN | color)) shield_bonus += 14;
            }
        }

        let attacker_score = 0;
        for (let sq = 0; sq < 128; sq++) {
            if (sq & 0x88) continue;
            const pc = board[sq];
            if (!pc || (pc & 24) !== enemy) continue;
            const type = pc & 7;
            if (type === PAWN || type === KING) continue;
            for (const d of piece_dirs[KING]) {
                const asq = ksq + d;
                if (asq & 0x88) continue;
                if (is_piece_attacking(sq, asq, type, enemy)) {
                    attacker_score += ATK_WEIGHT[type];
                    break;
                }
            }
        }

        score += (shield_bonus - attacker_score * 8) * sign;
    }
    return score;
}

function eval_pieces() {
    let score = 0;
    let white_bishops = 0, black_bishops = 0;

    for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) continue;
        const pc = board[sq];
        if (!pc) continue;
        const type  = pc & 7;
        const color = pc & 24;
        const sign  = color === WHITE ? 1 : -1;

        if (type === BISHOP) {
            if (color === WHITE) white_bishops++; else black_bishops++;
        }

        if (type === ROOK) {
            const f = sq & 7;
            let own_pawn = false, enemy_pawn = false;
            for (let r = 0; r < 8; r++) {
                const p = board[r * 16 + f];
                if (p === (PAWN | color))        own_pawn   = true;
                if (p === (PAWN | (color ^ 24))) enemy_pawn = true;
            }
            if (!own_pawn && !enemy_pawn) score += 20 * sign; // open file
            else if (!own_pawn)           score += 10 * sign; // semi-open
        }
    }

    if (white_bishops >= 2) score += 30;
    if (black_bishops >= 2) score -= 30;

    return score;
}

function eval_mobility() {
    let score = 0;
    for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) continue;
        const pc = board[sq];
        if (!pc) continue;
        const type  = pc & 7;
        const color = pc & 24;
        if (type === PAWN || type === KING) continue;
        const sign = color === WHITE ? 1 : -1;

        let mob = 0;
        for (const step of piece_dirs[type]) {
            let csq = sq + step;
            while (!(csq & 0x88)) {
                if (!(board[csq] & color)) mob++;
                if (board[csq]) break;
                if (type === KNIGHT) break;
                csq += step;
            }
        }

        if      (type === KNIGHT) score += (mob - 4) * 4 * sign;
        else if (type === BISHOP) score += (mob - 7) * 3 * sign;
        else if (type === ROOK)   score += (mob - 7) * 2 * sign;
        else if (type === QUEEN)  score += (mob - 14) * 1 * sign;
    }
    return score;
}

function eval_mopup() {
    if (phase > 6) return 0; // Only in true endgame
    if (Math.abs(eval_mg) < 200) return 0; // Only with decisive material advantage

    const winning  = eval_mg > 0 ? WHITE : BLACK;
    const losing   = winning ^ 24;
    const sign     = winning === WHITE ? 1 : -1;

    const lk_sq    = king_sq[losing  === WHITE ? 0 : 1];
    const wk_sq    = king_sq[winning === WHITE ? 0 : 1];
    if (!lk_sq || !wk_sq) return 0;

    const lk_f = lk_sq & 7, lk_r = lk_sq >> 4;
    const wk_f = wk_sq & 7, wk_r = wk_sq >> 4;

    const center_dist = Math.max(Math.abs(lk_f - 3), Math.abs(lk_r - 3));
    const king_dist = Math.abs(wk_f - lk_f) + Math.abs(wk_r - lk_r);

    return sign * (center_dist * 10 + (14 - king_dist) * 4);
}

function evaluate() {
    let p = phase; if (p > 24) p = 24;
    const piece_score  = (eval_mg * p + eval_eg * (24 - p)) / 24 | 0;
    const pawn_score   = eval_pawns_cached();
    const king_score   = eval_king_safety();
    const mob_score    = eval_mobility();
    const piece_bonus  = eval_pieces();
    const mopup        = eval_mopup();
    const tempo        = 10; // Bonus for side to move

    const total = piece_score + pawn_score + king_score + mob_score + piece_bonus + mopup + tempo;
    return side === WHITE ? total : -total;
}

/**
 * Assign a priority score to a move for sorting.
 * Higher = try earlier in the move loop.
 */
function score_move(m, hash_move, prev_move) {
    if (m === hash_move) return 10_000_000;

    const captured = (m >> 19) & 31;
    const prom     = (m >> 24) & 31;

    if (captured) {
        const victim_type   = captured & 7;
        const attacker_type = (m >> 14) & 7;
        return 1_000_000 + victim_type * 100 - attacker_type;
    }

    if (prom) return 900_000 + PIECE_VAL[prom & 7];

    if (m === killers[ply][0]) return 800_000;
    if (m === killers[ply][1]) return 700_000;

    if (prev_move) {
        const cm_key = ((prev_move & 127) << 7) | ((prev_move >> 7) & 127);
        if (m === countermove[cm_key]) return 600_000;
    }

    return history[((m & 127) << 7) | ((m >> 7) & 127)];
}

/**
 * Sort moves in move_stack[offset .. offset+count-1] by descending score.
 * Uses insertion sort — optimal for arrays of ≤ 50 moves.
 */
function sort_moves(offset, count, hash_move, prev_move) {
    for (let i = 0; i < count; i++) {
        move_scores[offset + i] = score_move(move_stack[offset + i], hash_move, prev_move);
    }
    for (let i = 1; i < count; i++) {
        const key_m = move_stack[offset + i];
        const key_s = move_scores[offset + i];
        let j = i - 1;
        while (j >= 0 && move_scores[offset + j] < key_s) {
            move_stack[offset + j + 1]  = move_stack[offset + j];
            move_scores[offset + j + 1] = move_scores[offset + j];
            j--;
        }
        move_stack[offset + j + 1]  = key_m;
        move_scores[offset + j + 1] = key_s;
    }
}

function quiesce(alpha, beta) {
    if ((nodes++ & TIME_CHECK_MASK) === 0 && Date.now() >= stop_time) stop_search = true;
    if (stop_search) return 0;
    if (ply >= 511) return evaluate();

    const stand_pat = evaluate();
    if (stand_pat >= beta) return beta;
    if (alpha < stand_pat) alpha = stand_pat;
    if (stand_pat < alpha - 1075) return alpha;

    const offset = ply * 256;
    let count = generate_moves(ply, true);

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

function search(depth, alpha, beta, is_pv, prev_move) {
    if ((nodes++ & TIME_CHECK_MASK) === 0 && Date.now() >= stop_time) stop_search = true;
    if (stop_search) return 0;
    if (ply >= 511) return evaluate();

    if (ply > 0 && halfmove >= 100) return 0;
    const rep_limit = Math.max(0, ply - halfmove);
    for (let i = ply - 2; i >= rep_limit; i -= 2) {
        if (state_hash_lo[i] === hash_lo && state_hash_hi[i] === hash_hi) return 0;
    }

    const in_check = is_attacked(king_sq[side === WHITE ? 0 : 1], side ^ 24);
    if (in_check) depth++; // Check extension
    if (depth <= 0) return quiesce(alpha, beta);

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

    if (!is_pv && !in_check && depth <= 6) {
        const rfp_margin = 120 * depth;
        if (static_eval - rfp_margin >= beta) return static_eval - rfp_margin;
    }

    if (!is_pv && !in_check && depth >= 2 && phase > 1) {
        const R = depth >= 6 ? 3 : 2;
        make_null_move();
        const null_score = -search(depth - R - 1, -beta, -beta + 1, false, 0);
        unmake_null_move();
        if (stop_search) return 0;
        if (null_score >= beta) return beta;
    }

    if (!is_pv && !in_check) {
        if (depth === 1 && static_eval + 300 < alpha) return quiesce(alpha, beta);
        if (depth === 2 && static_eval + 600 < alpha) {
            const v = quiesce(alpha - 600, alpha - 599);
            if (v + 600 <= alpha) return v;
        }
    }

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

        if (!is_pv && is_capture && depth <= 4 && see(m) < -50 * depth) continue;

        if (is_quiet && !is_pv && !in_check && depth <= 3) {
            const futility_margins = [0, 150, 300, 500];
            if (static_eval + futility_margins[depth] < alpha) continue;
        }

        if (!make_move(m)) continue;
        legal++;
        let score;

        if (legal === 1) {
            score = -search(depth - 1, -beta, -alpha, is_pv, m);
        } else {
            let reduction = 0;
            if (depth >= 2 && !in_check && is_quiet && legal > 3) {
                const d_idx = Math.min(depth, 63);
                const m_idx = Math.min(legal, 63);
                reduction   = lmr_table[d_idx][m_idx];
                if (is_pv) reduction = Math.max(0, reduction - 1);
            }

            score = -search(depth - 1 - reduction, -alpha - 1, -alpha, false, m);
            if (reduction > 0 && score > alpha)
                score = -search(depth - 1, -alpha - 1, -alpha, false, m);
            if (is_pv && score > alpha && score < beta)
                score = -search(depth - 1, -beta, -alpha, true, m);
        }

        unmake_move(m);
        if (stop_search) return 0;

        if (score > best_score) { best_score = score; best_move = m; }
        if (score > alpha) {
            alpha = score;
            if (score >= beta) {
                if (is_quiet) {
                    killers[ply][1] = killers[ply][0];
                    killers[ply][0] = m;
                    const hkey = ((m & 127) << 7) | ((m >> 7) & 127);
                    history[hkey] += depth * depth;
                    if (history[hkey] > 1_000_000) {
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

    if (legal === 0) return in_check ? -30000 + ply : 0;

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

function search_root() {
    nodes = 0; stop_search = false;
    start_time = Date.now(); stop_time = start_time + MOVE_TIME_MS;

    for (let i = 0; i < MAX_PLY; i++) { killers[i][0] = 0; killers[i][1] = 0; }
    for (let i = 0; i < 16384; i++)   { history[i] >>= 2; }

    const count        = generate_moves(0, false);
    let best_move_root = 0;
    let prev_score     = 0;

    for (let d = 1; d <= 64; d++) {
        let alpha, beta, delta = 40;
        if (d >= 4 && Math.abs(prev_score) < 20000) {
            alpha = prev_score - delta;
            beta  = prev_score + delta;
        } else {
            alpha = -50000; beta = 50000;
        }

        let iter_best_score = -50000;
        let iter_best_move  = 0;

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

            if (iter_best_score <= alpha - delta && alpha > -50000) {
                alpha  = Math.max(-50000, iter_best_score - delta);
                delta *= 2;
            } else if (iter_best_score >= beta + delta && beta < 50000) {
                beta   = Math.min(50000, iter_best_score + delta);
                delta *= 2;
            } else {
                break; // Search completed within window
            }

            if (delta > 3000) { alpha = -50000; beta = 50000; }
        }

        if (stop_search) break;
        if (iter_best_move) { best_move_root = iter_best_move; prev_score = iter_best_score; }
        if (prev_score > 20000 || prev_score < -20000) break;
    }

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

/**
 * Parse a FEN string and set up the board state.
 * Example: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
 */
function set_fen(fen) {
    for (let i = 0; i < 128; i++) board[i] = 0;
    eval_mg = 0; eval_eg = 0; phase = 0;
    hash_lo = 0; hash_hi = 0;
    pawn_hash_lo = 0; pawn_hash_hi = 0;
    ep = 0; castle = 0; halfmove = 0; ply = 0;
    king_sq[0] = 0; king_sq[1] = 0;

    const parts = fen.trim().split(/\s+/);
    const rows  = parts[0].split('/');

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

    side = (parts[1] === 'b') ? BLACK : WHITE;
    if (side === BLACK) { hash_lo ^= z_color_lo; hash_hi ^= z_color_hi; }

    if (parts[2] && parts[2] !== '-') {
        if (parts[2].includes('K')) castle |= 1;
        if (parts[2].includes('Q')) castle |= 2;
        if (parts[2].includes('k')) castle |= 4;
        if (parts[2].includes('q')) castle |= 8;
    }
    hash_lo ^= z_castle_lo[castle]; hash_hi ^= z_castle_hi[castle];

    if (parts[3] && parts[3] !== '-') {
        const f = parts[3].charCodeAt(0) - 97;
        const r = parseInt(parts[3][1]) - 1;
        ep = (r << 4) | f;
        hash_lo ^= z_ep_lo[ep]; hash_hi ^= z_ep_hi[ep];
    }

    if (parts[4]) halfmove = parseInt(parts[4]) || 0;
}

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

const engineReadline = (typeof readline !== 'undefined') ? readline : require('readline');
const rl = engineReadline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
    line = line.trim();
    if (!line) return;

    try {
        set_fen(line);
        const best = search_root();
        process.stdout.write(best ? `${move_to_uci(best)}\n` : '0000\n');

        if (cliOptions.stats) {
            const ms = Math.max(1, Date.now() - start_time);
            process.stderr.write(`stats nodes=${nodes} nps=${Math.round(nodes * 1000 / ms)} time=${ms}\n`);
        }
    } catch (error) {
        process.stderr.write(`error: ${error.message}\n`);
        process.stdout.write('0000\n');
    }
});
