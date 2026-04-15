// @module state
// ==============================================================================
// BOARD STATE — Global board array, ply stack, TT, killer/history tables
// ==============================================================================

// 0x88 board: valid squares have (sq & 0x88) === 0
const board = new Int32Array(128);

// Current position state
let side     = WHITE;   // Side to move (WHITE or BLACK)
let ep       = 0;       // En-passant target square (0 = none)
let castle   = 0;       // Castle rights bitmask (bits 0-3: WK,WQ,BK,BQ)
let halfmove = 0;       // Half-move clock (for 50-move rule)
let ply      = 0;       // Current search ply depth
let eval_mg  = 0;       // Incremental middlegame material+PST score
let eval_eg  = 0;       // Incremental endgame material+PST score
let phase    = 0;       // Tapered eval phase counter (0=endgame, 24=opening)
let king_sq  = [0, 0];  // King squares: [0]=white, [1]=black

// ==============================================================================
// PLY STACK — saved state for make/unmake
// ==============================================================================
const MAX_PLY = 512;

const state_hash_lo  = new Int32Array(MAX_PLY);
const state_hash_hi  = new Int32Array(MAX_PLY);
const state_ep       = new Int32Array(MAX_PLY);
const state_castle   = new Int32Array(MAX_PLY);
const state_halfmove = new Int32Array(MAX_PLY);
const state_pawn_lo  = new Int32Array(MAX_PLY);
const state_pawn_hi  = new Int32Array(MAX_PLY);

// ==============================================================================
// TRANSPOSITION TABLE — 8M entries (~128 MB)
// Stores: key (lo+hi), best move, depth, score+flag
// ==============================================================================
const TT_SIZE = 8 * 1024 * 1024; // must be power of 2

const tt_key_lo = new Int32Array(TT_SIZE);
const tt_key_hi = new Int32Array(TT_SIZE);
const tt_data   = new Int32Array(TT_SIZE); // [flag:8][score:16] packed
const tt_move   = new Int32Array(TT_SIZE);
const tt_depth  = new Int32Array(TT_SIZE);

// TT entry flags
const TT_EXACT = 1, TT_UPPER = 2, TT_LOWER = 3;

// ==============================================================================
// PAWN HASH TABLE — 64K entries, caches pawn structure score
// ==============================================================================
const PAWN_TT_SIZE = 65536;

const pawn_tt_lo    = new Int32Array(PAWN_TT_SIZE);
const pawn_tt_hi    = new Int32Array(PAWN_TT_SIZE);
const pawn_tt_score = new Int32Array(PAWN_TT_SIZE);

// ==============================================================================
// MOVE GENERATION STACK — pre-allocated; one 256-slot layer per ply
// ==============================================================================
const move_stack  = new Int32Array(MAX_PLY * 256);
const move_scores = new Int32Array(MAX_PLY * 256);

// ==============================================================================
// SEARCH HEURISTICS
// ==============================================================================

// Killer moves: two quiet moves per ply that caused a beta-cutoff
const killers = new Int32Array(MAX_PLY * 2); // [ply*2], [ply*2+1]

// History heuristic: indexed by [from*128 + to]
const history = new Int32Array(16384);

// Countermove heuristic: response to a given move [from*128 + to] → counter move
const countermove = new Int32Array(16384);

// LMR reduction table: lmr_table[depth * 64 + move_index]
const lmr_table = new Int32Array(64 * 64);
for (let d = 0; d < 64; d++) {
    for (let m = 0; m < 64; m++) {
        lmr_table[d * 64 + m] = (d === 0 || m === 0)
            ? 0
            : Math.max(0, Math.floor(0.75 + Math.log(d) * Math.log(m) / 2.25));
    }
}

// ==============================================================================
// SEARCH TIMING
// ==============================================================================
const MOVE_TIME_MS   = cliOptions.moveTimeMs;
const TIME_CHECK_MASK = 511; // check time every 512 nodes
const now = typeof performance !== 'undefined' ? performance.now.bind(performance) : Date.now;

let nodes       = 0;
let stop_search = false;
let start_time  = 0;
let stop_time   = 0;
