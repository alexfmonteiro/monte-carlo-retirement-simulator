#!/usr/bin/env node
// Runs the tests.html suite headlessly in Node.
// Reads the <script src> tags and the inline test script from tests.html,
// evaluates them together inside a Function (like scripts/smoke.js), then
// awaits tf.runAll(). Exits 1 if any test fails.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'tests.html'), 'utf8');

const srcFiles = [...html.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g)].map(m => m[1]);
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (srcFiles.length === 0 || inline.length === 0) {
    console.error('Could not find script tags in tests.html');
    process.exit(1);
}

const src = srcFiles
    .map(f => fs.readFileSync(path.join(root, f), 'utf8'))
    .concat(inline)
    .join('\n;\n');

// The inline script only touches the DOM inside runAllTests(), which is not
// called here. The stubs just keep stray top-level references from throwing.
const stubElement = () => ({ style: {}, appendChild() {}, set innerHTML(_) {}, set textContent(_) {} });
const document = {
    querySelector: stubElement,
    getElementById: stubElement,
    createElement: stubElement,
};
const window = {};

const load = new Function('document', 'window', src + '\n;return tf;');
const tf = load(document, window);

(async () => {
    const results = await tf.runAll(() => {});
    const failures = results.filter(r => !r.passed);
    for (const f of failures) {
        console.log(`${f.suite} :: ${f.name} -- ${f.error}`);
    }
    console.log(`passed ${results.length - failures.length} failed ${failures.length}`);
    process.exit(failures.length === 0 ? 0 : 1);
})();
