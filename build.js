#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');
const outFile = path.join(distDir, 'Trinity-modular.js');
const compactOutFile = path.join(distDir, 'Trinity-modular.compact.js');

function sortModules(a, b) {
    return path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true });
}

function compactSource(code) {
    const lines = code
        .split('\n')
        .filter((line, idx) => {
            if (idx === 0 && line.startsWith('#!')) return true;
            return !/^\s*\/\/.*$/.test(line);
        })
        .map((line) => line.replace(/[\t ]+$/g, ''));

    const compacted = [];
    let previousBlank = false;
    for (const line of lines) {
        const isBlank = line.trim() === '';
        if (isBlank && previousBlank) continue;
        compacted.push(line);
        previousBlank = isBlank;
    }

    return compacted.join('\n').trimEnd() + '\n';
}

function main() {
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

    const compacted = compactSource(combined);
    fs.writeFileSync(compactOutFile, compacted, 'utf8');

    console.log(`Built: ${outFile}`);
    console.log(`Compact: ${compactOutFile}`);
    console.log(`Modules: ${modules.length}`);
    console.log(`Size: ${Math.round(fs.statSync(outFile).size / 1024)} KB (combined)`);
    console.log(`Size: ${Math.round(fs.statSync(compactOutFile).size / 1024)} KB (compact)`);
}

main();
