// @module main
// ==============================================================================
// MAIN LOOP
// Reads one FEN per line and prints one best move (UCI) per line.
// ==============================================================================

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
