// @module zobrist
// ==============================================================================
// ZOBRIST HASHING — Pseudo-random keys for position identification
// Uses two 32-bit halves (lo/hi) to approximate 64-bit keys in JS
// ==============================================================================

const z_lo = new Int32Array(14 * 128), z_hi = new Int32Array(14 * 128);
const z_castle_lo = new Int32Array(16), z_castle_hi = new Int32Array(16);
const z_ep_lo = new Int32Array(128),    z_ep_hi = new Int32Array(128);

let z_color_lo, z_color_hi;
// Running board hash (updated incrementally in add_piece / remove_piece)
let hash_lo = 0, hash_hi = 0;
// Pawn-only hash for the pawn structure cache
let pawn_hash_lo = 0, pawn_hash_hi = 0;

let zobrist_seed = 0x6b8b4567;

function rand32() {
	zobrist_seed ^= zobrist_seed << 13;
	zobrist_seed ^= zobrist_seed >>> 17;
	zobrist_seed ^= zobrist_seed << 5;
	return zobrist_seed | 0;
}

for (let i = 0; i < 14 * 128; i++) { z_lo[i] = rand32(); z_hi[i] = rand32(); }
for (let i = 0; i < 16;  i++)      { z_castle_lo[i] = rand32(); z_castle_hi[i] = rand32(); }
for (let i = 0; i < 128; i++)      { z_ep_lo[i] = rand32(); z_ep_hi[i] = rand32(); }
z_color_lo = rand32(); z_color_hi = rand32();
