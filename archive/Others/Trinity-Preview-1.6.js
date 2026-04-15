// Trinity-Preview-1.6.js - Advanced Chess Engine with Enhanced Search and Evaluation
// Node.js Chess Engine - UCI Move Output via stdout

const readline = require('readline');

// Board representation using 0x88 coordinate system
let board = new Array(128);
let side = 0; // 0 = white, 1 = black
let castling = 0;
let ep_square = -1;
let half_moves = 0;
let full_moves = 1;
let hash_key = 0n;
let king_pos = [0, 0];

// Search parameters
const MAX_DEPTH = 8;
const INFINITY = 100000;
const MATE_VALUE = 99000;

// Zobrist hashing tables
const piece_keys = [];
const ep_keys = [];
const castle_keys = [];
let side_key = 0n;

// Move generation
const piece_vals = [0, 100, 320, 330, 500, 900, 20000];
const dir_offset = [
    [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0],
    [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0],
    [-17, -16, -15, -1, 1, 15, 16, 17], // N
    [-16, -1, 1, 16], // B
    [-16, -1, 1, 16], // R
    [-17, -16, -15, 1, 15, 16, 17], // Q
    [-17, -16, -15, -1, 1, 15, 16, 17], // K
    [-17, -16, -15, -1, 1, 15, 16, 17] // ALL
];
const knight_offset = [-33, -31, -18, -14, 14, 18, 31, 33];
const king_offset = [-17, -16, -15, -1, 1, 15, 16, 17];

// Evaluation parameters with advanced features
const positional_tables = {
    pawn: [
        0,  0,  0,  0,  0,  0,  0,  0,
        50, 50, 50, 50, 50, 50, 50, 50,
        10, 10, 20, 30, 30, 20, 10, 10,
        5,  5, 10, 25, 25, 10,  5,  5,
        0,  0,  0, 20, 20,  0,  0,  0,
        5, -5,-10,  0,  0,-10, -5,  5,
        5, 10, 10,-20,-20, 10, 10,  5,
        0,  0,  0,  0,  0,  0,  0,  0
    ],
    knight: [
        -50,-40,-30,-30,-30,-30,-40,-50,
        -40,-20,  0,  0,  0,  0,-20,-40,
        -30,  0, 10, 15, 15, 10,  0,-30,
        -30,  5, 15, 20, 20, 15,  5,-30,
        -30,  0, 15, 20, 20, 15,  0,-30,
        -30,  5, 10, 15, 15, 10,  5,-30,
        -40,-20,  0,  5,  5,  0,-20,-40,
        -50,-40,-30,-30,-30,-30,-40,-50
    ],
    bishop: [
        -20,-10,-10,-10,-10,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5, 10, 10,  5,  0,-10,
        -10,  5,  5, 10, 10,  5,  5,-10,
        -10,  0, 10, 10, 10, 10,  0,-10,
        -10, 10, 10, 10, 10, 10, 10,-10,
        -10,  5,  0,  0,  0,  0,  5,-10,
        -20,-10,-10,-10,-10,-10,-10,-20
    ],
    rook: [
        0,  0,  0,  0,  0,  0,  0,  0,
        5, 10, 10, 10, 10, 10, 10,  5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        0,  0,  0,  5,  5,  0,  0,  0
    ],
    queen: [
        -20,-10,-10, -5, -5,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5,  5,  5,  5,  0,-10,
        -5,  0,  5,  5,  5,  5,  0, -5,
        0,  0,  5,  5,  5,  5,  0, -5,
        -10,  5,  5,  5,  5,  5,  0,-10,
        -10,  0,  5,  0,  0,  0,  0,-10,
        -20,-10,-10, -5, -5,-10,-10,-20
    ],
    king: [
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -20,-30,-30,-40,-40,-30,-30,-20,
        -10,-20,-20,-20,-20,-20,-20,-10,
        20, 20,  0,  0,  0,  0, 20, 20,
        20, 30, 10,  0,  0, 10, 30, 20
    ]
};

// Pawn structure evaluation
const doubled_pawn_penalty = -10;
const isolated_pawn_penalty = -15;
const passed_pawn_bonus = 20;
const pawn_connect_bonus = 10;

// Transposition table
const TT_SIZE = 16384;
const TT_EXACT = 0;
const TT_BETA = 1;
const TT_ALPHA = 2;

let tt_table = new Array(TT_SIZE);
let tt_age = 0;

// Killer moves and history heuristics
const KILLER_SIZE = 64;
const HISTORY_SIZE = 4096;
let killers = new Array(KILLER_SIZE * 2).fill(0);
let history = new Array(HISTORY_SIZE).fill(0);

// Move counters
let nodes_searched = 0;
let pv_length = 0;
let pv_table = new Array(MAX_DEPTH * MAX_DEPTH);
let follow_pv = false;
let score_pv = false;

// Initialize Zobrist keys
function init_zobrist() {
    for (let i = 0; i < 12; i++) {
        piece_keys[i] = new Array(128);
        for (let j = 0; j < 128; j++) {
            piece_keys[i][j] = BigInt(Math.floor(Math.random() * 2**48));
        }
    }
    for (let i = 0; i < 128; i++) {
        ep_keys[i] = BigInt(Math.floor(Math.random() * 2**48));
    }
    for (let i = 0; i < 16; i++) {
        castle_keys[i] = BigInt(Math.floor(Math.random() * 2**48));
    }
    side_key = BigInt(Math.floor(Math.random() * 2**48));
}

// Piece conversion
function piece_to_index(piece) {
    const p = piece.toLowerCase();
    const map = { 'p': 0, 'n': 1, 'b': 2, 'r': 3, 'q': 4, 'k': 5 };
    return map[p];
}

// Check if square is valid (0x88)
function valid_square(sq) {
    return (sq & 0x88) === 0;
}

// Convert algebraic notation to 0x88
function algebraic_to_idx(sq) {
    const file = sq.charCodeAt(0) - 97;
    const rank = parseInt(sq[1]) - 1;
    return (rank << 4) | file;
}

// Convert 0x88 to algebraic
function idx_to_algebraic(sq) {
    if (!valid_square(sq)) return "";
    const file = String.fromCharCode(97 + (sq & 7));
    const rank = ((sq >> 4) & 7) + 1;
    return file + rank;
}

// Initialize board from FEN
function set_fen(fen) {
    board.fill(0);
    hash_key = 0n;
    castling = 0;
    ep_square = -1;
    half_moves = 0;
    full_moves = 1;
    king_pos = [0, 0];
    
    const parts = fen.split(' ');
    const position = parts[0];
    const ranks = position.split('/');
    
    // Parse board position (0x88 representation)
    // Start from a8 (rank 7 in 0x88 = index 7, file 0)
    let rank = 7; // Start from rank 8 (index 7 in 0x88)
    let file = 0;
    
    for (let i = 0; i < ranks.length; i++) {
        file = 0;
        const rank_str = ranks[i];
        
        for (let j = 0; j < rank_str.length; j++) {
            const c = rank_str[j];
            
            if (c >= '1' && c <= '8') {
                file += parseInt(c);
            } else {
                const sq = (rank << 4) | file;
                const is_white = c === c.toUpperCase();
                const piece_idx = piece_to_index(c);
                board[sq] = is_white ? piece_idx + 1 : -(piece_idx + 1);
                hash_key ^= piece_keys[piece_idx][sq];
                if (Math.abs(board[sq]) === 6) {
                    king_pos[is_white ? 0 : 1] = sq;
                }
                file++;
            }
        }
        rank--;
    }
    
    side = parts[1] === 'w' ? 0 : 1;
    if (side === 1) hash_key ^= side_key;
    
    castling = 0;
    if (parts.length > 2) {
        const castling_str = parts[2];
        if (castling_str.includes('K')) castling |= 1;
        if (castling_str.includes('Q')) castling |= 2;
        if (castling_str.includes('k')) castling |= 4;
        if (castling_str.includes('q')) castling |= 8;
        hash_key ^= castle_keys[castling];
    }
    
    ep_square = parts.length > 3 && parts[3] !== '-' ? algebraic_to_idx(parts[3]) : -1;
    if (ep_square !== -1) hash_key ^= ep_keys[ep_square];
    
    half_moves = parts.length > 4 ? parseInt(parts[4]) : 0;
    full_moves = parts.length > 5 ? parseInt(parts[5]) : 1;
}

// Check if move attacks square
function square_attacked(sq, by_side) {
    // Pawns
    const pawn_dir = by_side === 0 ? -16 : 16;
    for (let i = 0; i < 2; i++) {
        const attack_sq = sq + pawn_dir + (i === 0 ? -1 : 1);
        if (valid_square(attack_sq)) {
            const p = board[attack_sq];
            if (p !== 0 && Math.abs(p) === 1 && (p > 0) === by_side) return true;
        }
    }
    
    // Knights
    for (let i = 0; i < 8; i++) {
        const attack_sq = sq + knight_offset[i];
        if (valid_square(attack_sq)) {
            const p = board[attack_sq];
            if (p !== 0 && Math.abs(p) === 2 && (p > 0) === by_side) return true;
        }
    }
    
    // King
    for (let i = 0; i < 8; i++) {
        const attack_sq = sq + king_offset[i];
        if (valid_square(attack_sq)) {
            const p = board[attack_sq];
            if (p !== 0 && Math.abs(p) === 6 && (p > 0) === by_side) return true;
        }
    }
    
    // Sliding pieces (bishop, rook, queen)
    const sliders = [[4, [1, -1, 16, -16]], [3, [1, -1]], [3, [16, -16]]];
    for (const [ptype, dirs] of sliders) {
        for (const dir of dirs) {
            let curr = sq + dir;
            while (valid_square(curr)) {
                const p = board[curr];
                if (p !== 0) {
                    if ((p > 0) === by_side && Math.abs(p) >= ptype) {
                        if (Math.abs(p) >= 4) return true; // Queen always attacks
                        if (ptype === 4 && Math.abs(p) === 3) return true; // Bishop
                        if (ptype === 3 && Math.abs(p) === 2) return true; // Rook
                    }
                    break;
                }
                curr += dir;
            }
        }
    }
    
    return false;
}

// Check if current side is in check
function in_check() {
    return square_attacked(king_pos[side], 1 - side);
}

// Generate pseudo-legal moves
function generate_moves(capt_only = false) {
    const moves = [];
    const us = side === 0 ? 1 : -1;
    const them = -us;
    
    for (let sq = 0; sq < 128; sq++) {
        if (!valid_square(sq)) continue;
        const p = board[sq];
        if (p === 0 || (p > 0) !== (side === 0)) continue;
        
        const ptype = Math.abs(p);
        
        // Pawn moves
        if (ptype === 1) {
            // Forward
            const forward = us === 1 ? -16 : 16;
            const to = sq + forward;
            
            if (!capt_only && valid_square(to) && board[to] === 0) {
                if ((us === 1 && (to >> 4) === 0) || (us === -1 && (to >> 4) === 7)) {
                    for (let promo = 2; promo <= 5; promo++) {
                        moves.push({ from: sq, to: to, captured: 0, promote: promo, score: 0 });
                    }
                } else {
                    moves.push({ from: sq, to: to, captured: 0, promote: 0, score: 0 });
                    // Double push
                    const double_to = to + forward;
                    const start_rank = us === 1 ? 6 : 1;
                    if ((sq >> 4) === start_rank && valid_square(double_to) && board[double_to] === 0) {
                        moves.push({ from: sq, to: double_to, captured: 0, promote: 0, score: 0, ep: true });
                    }
                }
            }
            
            // Captures
            for (const delta of [-1, 1]) {
                const cap_sq = sq + forward + delta;
                if (valid_square(cap_sq)) {
                    const target = board[cap_sq];
                    if (target !== 0 && (target > 0) !== (side === 0)) {
                        if ((us === 1 && (cap_sq >> 4) === 0) || (us === -1 && (cap_sq >> 4) === 7)) {
                            for (let promo = 2; promo <= 5; promo++) {
                                moves.push({ from: sq, to: cap_sq, captured: Math.abs(target), promote: promo, score: 0 });
                            }
                        } else {
                            moves.push({ from: sq, to: cap_sq, captured: Math.abs(target), promote: 0, score: 0 });
                        }
                    }
                    // En passant
                    if (cap_sq === ep_square) {
                        moves.push({ from: sq, to: cap_sq, captured: 1, promote: 0, score: 0, ep: true });
                    }
                }
            }
        }
        
        // Knight moves
        else if (ptype === 2) {
            for (const offset of knight_offset) {
                const to = sq + offset;
                if (valid_square(to)) {
                    const target = board[to];
                    if (capt_only) {
                        if (target !== 0 && (target > 0) !== (side === 0)) {
                            moves.push({ from: sq, to: to, captured: Math.abs(target), promote: 0, score: 0 });
                        }
                    } else if (target === 0) {
                        moves.push({ from: sq, to: to, captured: 0, promote: 0, score: 0 });
                    } else if ((target > 0) !== (side === 0)) {
                        moves.push({ from: sq, to: to, captured: Math.abs(target), promote: 0, score: 0 });
                    }
                }
            }
        }
        
        // Bishop moves (sliding)
        else if (ptype === 3) {
            for (const delta of [15, 17, -15, -17]) {
                let to = sq + delta;
                while (valid_square(to)) {
                    const target = board[to];
                    if (target === 0) {
                        if (!capt_only) moves.push({ from: sq, to: to, captured: 0, promote: 0, score: 0 });
                    } else if ((target > 0) !== (side === 0)) {
                        moves.push({ from: sq, to: to, captured: Math.abs(target), promote: 0, score: 0 });
                        break;
                    } else {
                        break;
                    }
                    to += delta;
                }
            }
        }
        
        // Rook moves (sliding)
        else if (ptype === 4) {
            for (const delta of [1, -1, 16, -16]) {
                let to = sq + delta;
                while (valid_square(to)) {
                    const target = board[to];
                    if (target === 0) {
                        if (!capt_only) moves.push({ from: sq, to: to, captured: 0, promote: 0, score: 0 });
                    } else if ((target > 0) !== (side === 0)) {
                        moves.push({ from: sq, to: to, captured: Math.abs(target), promote: 0, score: 0 });
                        break;
                    } else {
                        break;
                    }
                    to += delta;
                }
            }
        }
        
        // Queen moves (sliding)
        else if (ptype === 5) {
            for (const delta of [1, -1, 15, 17, -15, -17, 16, -16]) {
                let to = sq + delta;
                while (valid_square(to)) {
                    const target = board[to];
                    if (target === 0) {
                        if (!capt_only) moves.push({ from: sq, to: to, captured: 0, promote: 0, score: 0 });
                    } else if ((target > 0) !== (side === 0)) {
                        moves.push({ from: sq, to: to, captured: Math.abs(target), promote: 0, score: 0 });
                        break;
                    } else {
                        break;
                    }
                    to += delta;
                }
            }
        }
        
        // King moves
        else if (ptype === 6) {
            for (const offset of king_offset) {
                const to = sq + offset;
                if (valid_square(to)) {
                    const target = board[to];
                    if (capt_only) {
                        if (target !== 0 && (target > 0) !== (side === 0)) {
                            moves.push({ from: sq, to: to, captured: Math.abs(target), promote: 0, score: 0 });
                        }
                    } else if (target === 0) {
                        moves.push({ from: sq, to: to, captured: 0, promote: 0, score: 0 });
                    } else if ((target > 0) !== (side === 0)) {
                        moves.push({ from: sq, to: to, captured: Math.abs(target), promote: 0, score: 0 });
                    }
                }
            }
            
            // Castling
            if (!capt_only && !in_check()) {
                if (side === 0) {
                    if ((castling & 1) && board[5] === 0 && board[6] === 0 && 
                        !square_attacked(4, 1) && !square_attacked(5, 1) && !square_attacked(6, 1)) {
                        moves.push({ from: 4, to: 6, captured: 0, promote: 0, castle: true, score: 0 });
                    }
                    if ((castling & 2) && board[1] === 0 && board[2] === 0 && board[3] === 0 &&
                        !square_attacked(4, 1) && !square_attacked(3, 1) && !square_attacked(2, 1)) {
                        moves.push({ from: 4, to: 2, captured: 0, promote: 0, castle: true, score: 0 });
                    }
                } else {
                    if ((castling & 4) && board[117] === 0 && board[118] === 0 &&
                        !square_attacked(116, 0) && !square_attacked(117, 0) && !square_attacked(118, 0)) {
                        moves.push({ from: 116, to: 118, captured: 0, promote: 0, castle: true, score: 0 });
                    }
                    if ((castling & 8) && board[113] === 0 && board[114] === 0 && board[115] === 0 &&
                        !square_attacked(116, 0) && !square_attacked(115, 0) && !square_attacked(114, 0)) {
                        moves.push({ from: 116, to: 114, captured: 0, promote: 0, castle: true, score: 0 });
                    }
                }
            }
        }
    }
    
    return moves;
}

// Static Exchange Evaluation (SEE)
function see(move) {
    const from = move.from;
    const to = move.to;
    const us = side === 0 ? 1 : -1;
    const them = -us;
    
    let gain = [];
    let depth = 0;
    let attackers = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let n_attackers = 0;
    
    let swap = board[to] !== 0 ? piece_vals[Math.abs(board[to]) - 1] : 0;
    let next_victim = piece_vals[Math.abs(board[from]) - 1];
    
    if (move.ep) swap = 100; // Pawn capture in ep
    
    let bb = 1n << BigInt(from);
    bb |= 1n << BigInt(to);
    
    // Find all attackers
    const find_attackers = (sq, by_side) => {
        const attacks = [];
        // Pawns
        const pawn_dir = by_side === 0 ? -16 : 16;
        for (const delta of [-1, 1]) {
            const cap_sq = sq + pawn_dir + delta;
            if (valid_square(cap_sq)) {
                const p = board[cap_sq];
                if (p !== 0 && Math.abs(p) === 1 && (p > 0) === by_side) {
                    attacks.push(cap_sq);
                }
            }
        }
        // Knights
        for (const offset of knight_offset) {
            const asq = sq + offset;
            if (valid_square(asq)) {
                const p = board[asq];
                if (p !== 0 && Math.abs(p) === 2 && (p > 0) === by_side) {
                    attacks.push(asq);
                }
            }
        }
        // Kings
        for (const offset of king_offset) {
            const asq = sq + offset;
            if (valid_square(asq)) {
                const p = board[asq];
                if (p !== 0 && Math.abs(p) === 6 && (p > 0) === by_side) {
                    attacks.push(asq);
                }
            }
        }
        // Sliders
        const sliders = [[3, [15, 17, -15, -17]], [4, [1, -1, 16, -16]], [5, [1, -1, 15, 17, -15, -17, 16, -16]]];
        for (const [ptype, dirs] of sliders) {
            for (const delta of dirs) {
                let curr = sq + delta;
                while (valid_square(curr)) {
                    const p = board[curr];
                    if (p !== 0) {
                        if ((p > 0) === by_side && Math.abs(p) >= ptype) {
                            attacks.push(curr);
                        }
                        break;
                    }
                    curr += delta;
                }
            }
        }
        return attacks;
    };
    
    let current_side = them;
    while (true) {
        const new_attackers = find_attackers(to, current_side);
        let found = -1;
        for (let i = 0; i < new_attackers.length; i++) {
            const sq = new_attackers[i];
            if ((bb & (1n << BigInt(sq))) === 0n) {
                found = sq;
                break;
            }
        }
        if (found === -1) break;
        
        attackers[n_attackers++] = found;
        bb |= 1n << BigInt(found);
        gain[depth++] = swap;
        
        if (next_victim === 1) break; // Pawn is smallest piece, can't be defended by smaller
        
        current_side = current_side === 0 ? 1 : 0;
        next_victim = piece_vals[Math.abs(board[found]) - 1];
        swap = -swap + next_victim;
    }
    
    // Process captures in reverse
    while (depth > 0) {
        depth--;
        gain[depth] = -gain[depth];
        if (depth > 0) {
            gain[depth - 1] += gain[depth];
        }
    }
    
    return gain[0];
}

// Move ordering
function score_moves(moves) {
    for (const move of moves) {
        if (move.captured !== 0) {
            // MVV-LVA
            move.score = piece_vals[move.captured - 1] * 10 - piece_vals[Math.abs(board[move.from]) - 1];
        } else if (move.promote !== 0) {
            move.score = piece_vals[move.promote - 1] * 10;
        } else {
            move.score = 0;
        }
        
        // Killer move bonus
        if (move.captured === 0 && move.promote === 0) {
            const idx = killers.indexOf((move.from << 7) | move.to);
            if (idx !== -1) {
                move.score += 9000;
            }
        }
        
        // History heuristic
        if (move.captured === 0 && move.promote === 0) {
            move.score += history[((move.to & 0x70) << 3) | ((move.from & 0x70) >> 4)];
        }
    }
    
    // Sort moves by score
    moves.sort((a, b) => b.score - a.score);
}

// Make move
function make_move(mv) {
    const from = mv.from;
    const to = mv.to;
    
    // Update hash key
    const piece = board[from];
    const ptype = Math.abs(piece);
    hash_key ^= piece_keys[ptype - 1][from];
    hash_key ^= piece_keys[ptype - 1][to];
    
    board[to] = mv.promote !== 0 ? (piece > 0 ? mv.promote : -mv.promote) : piece;
    board[from] = 0;
    
    // En passant capture
    if (mv.ep) {
        const ep_capture = side === 0 ? to + 16 : to - 16;
        const captured_pawn = board[ep_capture];
        hash_key ^= piece_keys[0][ep_capture];
        board[ep_capture] = 0;
    }
    
    // Castling rook move
    if (mv.castle) {
        if (side === 0) {
            if (to === 6) { // Kingside
                hash_key ^= piece_keys[3][7];
                hash_key ^= piece_keys[3][5];
                board[5] = board[7];
                board[7] = 0;
            } else { // Queenside
                hash_key ^= piece_keys[3][0];
                hash_key ^= piece_keys[3][3];
                board[3] = board[0];
                board[0] = 0;
            }
        } else {
            if (to === 118) {
                hash_key ^= piece_keys[3][119];
                hash_key ^= piece_keys[3][117];
                board[117] = board[119];
                board[119] = 0;
            } else {
                hash_key ^= piece_keys[3][112];
                hash_key ^= piece_keys[3][115];
                board[115] = board[112];
                board[112] = 0;
            }
        }
    }
    
    // Update king position
    if (ptype === 6) {
        king_pos[side] = to;
    }
    
    // Update castling rights
    const old_castling = castling;
    const rook_moves = [[0, 3, 2], [7, 5, 6], [112, 115, 114], [119, 117, 118]];
    for (const [from_r, to_r, _] of rook_moves) {
        if (from === from_r || to === from_r) castling &= ~(1 << (from_r === 0 || from_r === 7 ? (from_r === 0 ? 1 : 0) : (from_r === 112 ? 3 : 2)));
    }
    if (king_pos[0] !== 4) castling &= ~3;
    if (king_pos[1] !== 116) castling &= ~12;
    
    if (old_castling !== castling) {
        hash_key ^= castle_keys[old_castling];
        hash_key ^= castle_keys[castling];
    }
    
    // Update en passant square
    const old_ep = ep_square;
    if (mv.ep === false && ptype === 1 && Math.abs(to - from) === 32) {
        ep_square = (from + to) >> 1;
        hash_key ^= ep_keys[old_ep === -1 ? 0 : old_ep];
        hash_key ^= ep_keys[ep_square];
    } else {
        if (old_ep !== -1) hash_key ^= ep_keys[old_ep];
        ep_square = -1;
    }
    
    // Update side
    hash_key ^= side_key;
    side = 1 - side;
    
    // Update move counters
    if (ptype === 1 || mv.captured !== 0) half_moves = 0;
    else half_moves++;
    
    if (side === 0) full_moves++;
    
    return mv;
}

// Unmake move
function unmake_move(mv) {
    const from = mv.from;
    const to = mv.to;
    
    side = 1 - side;
    
    // Get piece that was moved
    const piece = board[to];
    const ptype = Math.abs(piece);
    
    // Restore hash key
    hash_key ^= side_key;
    hash_key ^= piece_keys[ptype - 1][from];
    hash_key ^= piece_keys[ptype - 1][to];
    
    // Restore piece to original square
    board[from] = piece;
    
    // Handle captures
    if (mv.captured !== 0) {
        const captured_piece = side === 0 ? -mv.captured : mv.captured;
        board[to] = captured_piece;
        hash_key ^= piece_keys[mv.captured - 1][to];
    } else {
        board[to] = 0;
    }
    
    // En passant capture restoration
    if (mv.ep) {
        const ep_capture = side === 0 ? to + 16 : to - 16;
        const captured_pawn = side === 0 ? -1 : 1;
        board[ep_capture] = captured_pawn;
        hash_key ^= piece_keys[0][ep_capture];
    }
    
    // Castling rook restoration
    if (mv.castle) {
        if (side === 0) {
            if (to === 6) {
                board[7] = board[5];
                board[5] = 0;
            } else {
                board[0] = board[3];
                board[3] = 0;
            }
        } else {
            if (to === 118) {
                board[119] = board[117];
                board[117] = 0;
            } else {
                board[112] = board[115];
                board[115] = 0;
            }
        }
    }
    
    // Restore king position
    if (ptype === 6) {
        king_pos[side] = from;
    }
    
    // Restore en passant square
    if (ep_square !== -1) {
        hash_key ^= ep_keys[ep_square];
    }
    
    // Restore castling rights (this is simplified)
    // In a full implementation, we'd need to track and restore castling state
}

// Evaluation function
function evaluate() {
    let score = 0;
    let material = 0;
    let pawn_structure = 0;
    
    // Material and positional evaluation
    for (let sq = 0; sq < 128; sq++) {
        if (!valid_square(sq)) continue;
        const p = board[sq];
        if (p === 0) continue;
        
        const ptype = Math.abs(p);
        const is_white = p > 0;
        const sign = is_white ? 1 : -1;
        const file = sq & 7;
        const rank = (sq >> 4) & 7;
        
        // Material value
        material += sign * piece_vals[ptype - 1];
        
        // Positional value
        const pos_idx = is_white ? (rank * 8 + file) : ((7 - rank) * 8 + file);
        if (ptype === 1) {
            score += sign * positional_tables.pawn[pos_idx];
            pawn_structure += sign * evaluate_pawn(sq, is_white);
        } else if (ptype === 2) {
            score += sign * positional_tables.knight[pos_idx];
        } else if (ptype === 3) {
            score += sign * positional_tables.bishop[pos_idx];
        } else if (ptype === 4) {
            score += sign * positional_tables.rook[pos_idx];
        } else if (ptype === 5) {
            score += sign * positional_tables.queen[pos_idx];
        } else if (ptype === 6) {
            score += sign * positional_tables.king[pos_idx];
        }
    }
    
    // King safety
    score += evaluate_king_safety();
    
    // Mobility bonus
    const our_moves = generate_moves().length;
    const saved_side = side;
    side = 1 - side;
    const their_moves = generate_moves().length;
    side = saved_side;
    score += (our_moves - their_moves) * 3;
    
    // Pawn structure bonus
    score += pawn_structure;
    
    return side === 0 ? material + score : material - score;
}

// Pawn structure evaluation
function evaluate_pawn(sq, is_white) {
    let score = 0;
    const file = sq & 7;
    const rank = (sq >> 4) & 7;
    
    // Doubled pawn penalty
    const forward = is_white ? -16 : 16;
    let behind_sq = sq + forward;
    let has_support = false;
    
    while (valid_square(behind_sq)) {
        const behind = board[behind_sq];
        if (behind !== 0 && Math.abs(behind) === 1 && (behind > 0) === is_white) {
            score += doubled_pawn_penalty;
            break;
        }
        behind_sq += forward;
    }
    
    // Check for adjacent pawns (connected pawns)
    for (const delta of [-1, 1]) {
        const adj_sq = sq + delta;
        if (valid_square(adj_sq)) {
            const adj = board[adj_sq];
            if (adj !== 0 && Math.abs(adj) === 1 && (adj > 0) === is_white) {
                score += pawn_connect_bonus;
                has_support = true;
            }
        }
    }
    
    // Isolated pawn penalty
    let has_adjacent = false;
    for (const delta of [-1, 1]) {
        const adj_file = file + delta;
        if (adj_file >= 0 && adj_file <= 7) {
            let found = false;
            for (let r = 0; r < 8; r++) {
                const check_sq = (r << 4) | adj_file;
                const check_p = board[check_sq];
                if (check_p !== 0 && Math.abs(check_p) === 1 && (check_p > 0) === is_white) {
                    found = true;
                    break;
                }
            }
            if (found) has_adjacent = true;
        }
    }
    if (!has_adjacent) {
        score += isolated_pawn_penalty;
    }
    
    // Passed pawn bonus
    let passed = true;
    const dir = is_white ? -1 : 1;
    for (let f = file - 1; f <= file + 1; f++) {
        if (f < 0 || f > 7) continue;
        for (let r = rank + dir; r >= 0 && r <= 7; r += dir) {
            const check_sq = (r << 4) | f;
            const check_p = board[check_sq];
            if (check_p !== 0 && Math.abs(check_p) === 1 && (check_p > 0) !== is_white) {
                passed = false;
                break;
            }
        }
        if (!passed) break;
    }
    if (passed) {
        score += passed_pawn_bonus * (is_white ? (6 - rank) : (rank + 1));
    }
    
    return score;
}

// King safety evaluation
function evaluate_king_safety() {
    let score = 0;
    
    for (let side_idx = 0; side_idx < 2; side_idx++) {
        const king_sq = king_pos[side_idx];
        const is_white = side_idx === 0;
        const sign = is_white ? -1 : 1;
        
        // Penalize if king is in check
        if (square_attacked(king_sq, 1 - side_idx)) {
            score -= sign * 25;
        }
        
        // Open file penalty for king
        const file = king_sq & 7;
        let open_file = true;
        for (let r = 0; r < 8; r++) {
            const sq = (r << 4) | file;
            const p = board[sq];
            if (p !== 0 && Math.abs(p) === 1) {
                open_file = false;
                break;
            }
        }
        if (open_file) {
            score -= sign * 15;
        }
        
        // Semi-open file penalty
        let semi_open = true;
        for (let r = 0; r < 8; r++) {
            const sq = (r << 4) | file;
            const p = board[sq];
            if (p !== 0 && Math.abs(p) === 1 && (p > 0) === is_white) {
                semi_open = false;
                break;
            }
        }
        if (semi_open && open_file) {
            score -= sign * 10;
        }
    }
    
    return score;
}

// Alpha-beta search with PVS and LMR
function search(depth, alpha, beta, do_null = true) {
    if (half_moves >= 100) return 0;
    
    nodes_searched++;
    
    // Check transposition table
    const tt_index = Number(hash_key & BigInt(TT_SIZE - 1));
    let tt_move = 0;
    let tt_score = 0;
    let tt_flag = TT_EXACT;
    
    if (tt_table[tt_index] && tt_table[tt_index].key === hash_key) {
        tt_score = tt_table[tt_index].score;
        tt_move = tt_table[tt_index].move;
        if (tt_score >= MATE_VALUE - MAX_DEPTH) tt_score -= MAX_DEPTH;
        if (tt_score <= -MATE_VALUE + MAX_DEPTH) tt_score += MAX_DEPTH;
        
        if (tt_table[tt_index].depth >= depth) {
            if (tt_flag === TT_EXACT) return tt_score;
            if (tt_flag === TT_BETA && tt_score >= beta) return tt_score;
            if (tt_flag === TT_ALPHA && tt_score <= alpha) return alpha;
        }
    }
    
    // Calculate material for null move pruning
    let material = 0;
    for (let sq = 0; sq < 128; sq++) {
        if (valid_square(sq) && board[sq] !== 0) {
            material += board[sq] > 0 ? piece_vals[Math.abs(board[sq]) - 1] : -piece_vals[Math.abs(board[sq]) - 1];
        }
    }
    
    // Null move pruning (not in check, not at root, depth > 2)
    if (do_null && depth >= 3 && !in_check() && (side === 0 ? material > 3000 : material < -3000)) {
        // Make null move
        const old_side = side;
        const old_hash = hash_key;
        const old_ep = ep_square;
        hash_key ^= side_key;
        side = 1 - side;
        if (ep_square !== -1) {
            hash_key ^= ep_keys[ep_square];
            ep_square = -1;
        }
        
        const R = depth > 6 ? 4 : 3;
        const null_score = -search(depth - R - 1, -beta, -beta + 1, false);
        
        // Unmake null move
        side = old_side;
        hash_key = old_hash;
        ep_square = old_ep;
        
        if (null_score >= beta) {
            return beta;
        }
    }
    
    // Quiescence search at horizon
    if (depth <= 0) {
        return quiescence(alpha, beta);
    }
    
    const pv_node = beta - alpha > 1;
    let best_score = -INFINITY;
    let best_move = 0;
    let legal_moves = 0;
    
    const moves = generate_moves();
    score_moves(moves);
    
    for (const move of moves) {
        // Make move
        make_move(move);
        
        // Check legality
        if (square_attacked(king_pos[1 - side], side)) {
            unmake_move(move);
            continue;
        }
        
        legal_moves++;
        
        let score;
        let do_full_search = true;
        
        // Late Move Reductions
        if (legal_moves > 4 && depth >= 3 && move.captured === 0 && move.promote === 0) {
            const reduction = depth > 6 ? 3 : 2;
            do_full_search = false;
            
            if (pv_node) {
                // PVS
                if (legal_moves === 1) {
                    score = -search(depth - 1, -beta, -alpha);
                } else {
                    score = -search(depth - 1, -alpha - 1, -alpha);
                    if (score > alpha && score < beta) {
                        score = -search(depth - 1, -beta, -alpha);
                    }
                }
            } else {
                score = -search(depth - reduction - 1, -beta, -alpha);
            }
            
            if (score > alpha) {
                do_full_search = true;
            }
        }
        
        if (do_full_search) {
            if (pv_node && legal_moves === 1) {
                score = -search(depth - 1, -beta, -alpha);
            } else {
                score = -search(depth - 1, -alpha - 1, -alpha);
                if (score > alpha && score < beta && legal_moves > 1) {
                    score = -search(depth - 1, -beta, -alpha);
                }
            }
        }
        
        // Unmake move
        unmake_move(move);
        
        if (score > best_score) {
            best_score = score;
            best_move = (move.from << 7) | move.to;
        }
        
        if (score > alpha) {
            alpha = score;
            if (score >= beta) {
                // Store killer move
                if (move.captured === 0 && move.promote === 0) {
                    killers[depth] = killers[depth + 1];
                    killers[depth + 1] = (move.from << 7) | move.to;
                    
                    // Update history
                    history[((move.to & 0x70) << 3) | ((move.from & 0x70) >> 4)] += depth * depth;
                }
                
                // Store transposition table entry
                tt_table[tt_index] = {
                    key: hash_key,
                    move: (move.from << 7) | move.to,
                    score: beta,
                    depth: depth,
                    flag: TT_BETA
                };
                
                return beta;
            }
        }
    }
    
    // Check for checkmate or stalemate
    if (legal_moves === 0) {
        if (in_check()) {
            return -MATE_VALUE + (MAX_DEPTH - depth);
        }
        return 0;
    }
    
    // Store transposition table entry
    const flag = best_score >= beta ? TT_BETA : TT_ALPHA;
    tt_table[tt_index] = {
        key: hash_key,
        move: best_move,
        score: best_score,
        depth: depth,
        flag: flag
    };
    
    return alpha;
}

// Quiescence search
function quiescence(alpha, beta) {
    nodes_searched++;
    
    if (half_moves >= 100) return 0;
    
    const stand_pat = evaluate();
    
    if (stand_pat >= beta) return beta;
    if (stand_pat > alpha) alpha = stand_pat;
    
    const moves = generate_moves(true);
    score_moves(moves);
    
    for (const move of moves) {
        // SEE pruning
        if (see(move) < 0) continue;
        
        make_move(move);
        
        if (square_attacked(king_pos[1 - side], side)) {
            unmake_move(move);
            continue;
        }
        
        const score = -quiescence(-beta, -alpha);
        
        unmake_move(move);
        
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
    }
    
    return alpha;
}

// Root search with iterative deepening
function search_root() {
    nodes_searched = 0;
    tt_age++;
    
    let best_move = 0;
    let best_score = -INFINITY;
    let alpha = -INFINITY;
    const beta = INFINITY;
    
    console.error("Starting search...");
    
    const moves = generate_moves();
    score_moves(moves);
    console.error("Generated", moves.length, "moves");
    
    for (let depth = 1; depth <= MAX_DEPTH; depth++) {
        const time_start = Date.now();
        
        let score = -INFINITY;
        let first = true;
        let last_move = 0;
        
        for (const move of moves) {
            make_move(move);
            
            if (square_attacked(king_pos[1 - side], side)) {
                unmake_move(move);
                continue;
            }
            
            let move_score;
            
            if (first) {
                move_score = -search(depth - 1, -beta, -alpha);
                first = false;
            } else {
                move_score = -search(depth - 1, -alpha - 1, -alpha);
                if (move_score > alpha && move_score < beta) {
                    move_score = -search(depth - 1, -beta, -alpha);
                }
            }
            
            unmake_move(move);
            last_move = (move.from << 7) | move.to;
            
            if (move_score > score) {
                score = move_score;
                if (score > alpha) {
                    alpha = score;
                    best_move = last_move;
                }
            }
            
            // Time management
            if (Date.now() - time_start > 4000) break;
        }
        
        if (score > best_score) {
            best_score = score;
            best_move = last_move;
        }
        
        // Time management
        if (Date.now() - time_start > 4500) break;
    }
    
    console.error("Search complete. Best move:", best_move);
    return best_move;
}

// Convert move to UCI format
function move_to_uci(move) {
    const from = (move >> 7) & 0x7F;
    const to = move & 0x7F;
    
    let uci = idx_to_algebraic(from) + idx_to_algebraic(to);
    
    const promo = (move >> 14) & 0x7;
    if (promo === 2) uci += 'n';
    else if (promo === 3) uci += 'b';
    else if (promo === 4) uci += 'r';
    else if (promo === 5) uci += 'q';
    
    return uci;
}

// Main readline handler
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

// Initialize Zobrist tables
init_zobrist();

rl.on('line', (line) => {
    const fen = line.trim();
    if (!fen) return;
    
    try {
        set_fen(fen);
        const best = search_root();
        
        if (best) {
            const uci = move_to_uci(best);
            process.stdout.write(uci + '\n');
        } else {
            process.stdout.write('0000\n');
        }
    } catch (e) {
        console.error('Error:', e.message);
        console.error(e.stack);
        process.stdout.write('e2e4\n');
    }
});

// Prevent exit
process.stdin.resume();
