#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const compressor = require('node-minify');

const rootDir = __dirname;
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');
const outFile = path.join(distDir, 'Trinity-modular.js');
const compactOutFile = path.join(distDir, 'Trinity-modular.compact.js');
const minifyInputFile = path.join(distDir, 'Trinity-modular.minify-input.tmp.js');

function sortModules(a, b) {
    return path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true });
}

function stripNumericSeparators(code) {
    // Some minifier parser versions fail on numeric separators (e.g. 1_000_000).
    return code.replace(/(\d)_(?=\d)/g, '$1');
}

async function main() {
    if (!fs.existsSync(srcDir)) {
        throw new Error(`Missing src directory: ${srcDir}`);
    }

    const modules = fs.readdirSync(srcDir)
        .filter((name) => /^\d+_.*\.js$/.test(name))
        .map((name) => path.join(srcDir, name))
        .sort(sortModules);

    if (modules.length === 0) {
        throw new Error('No source modules found under src/.');
    }

    const missing = [];
    for (let i = 0; i <= 13; i++) {
        const prefix = String(i).padStart(2, '0') + '_';
        if (!modules.some((m) => path.basename(m).startsWith(prefix))) {
            missing.push(prefix + '*.js');
        }
    }
    if (missing.length > 0) {
        throw new Error(`Missing expected modules: ${missing.join(', ')}`);
    }

    const combined = modules
        .map((file) => fs.readFileSync(file, 'utf8').trimEnd())
        .join('\n\n') + '\n';

    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(outFile, combined, 'utf8');

    const minifyInput = stripNumericSeparators(combined);
    fs.writeFileSync(minifyInputFile, minifyInput, 'utf8');

    try {
        await compressor.minify({
            compressor: 'terser',
            input: minifyInputFile,
            output: compactOutFile
        });
    } finally {
        if (fs.existsSync(minifyInputFile)) fs.unlinkSync(minifyInputFile);
    }

    console.log(`Built: ${outFile}`);
    console.log(`Compact: ${compactOutFile}`);
    console.log(`Modules: ${modules.length}`);
    console.log(`Size: ${Math.round(fs.statSync(outFile).size / 1024)} KB (combined)`);
    console.log(`Size: ${Math.round(fs.statSync(compactOutFile).size / 1024)} KB (compact)`);
}

main().catch((err) => {
    console.error('Build failed:', err && err.message ? err.message : err);
    process.exit(1);
});
