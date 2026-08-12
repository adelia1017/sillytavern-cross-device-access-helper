import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('frontend contains no storage, model, settings, telemetry, or external-network APIs', async () => {
    const files = ['../index.js', '../ip-utils.js', '../command-generator.js', '../backend-integration.js'];
    const source = (await Promise.all(files.map(file => readFile(new URL(file, import.meta.url), 'utf8')))).join('\n');
    const forbiddenPatterns = [
        /XMLHttpRequest/,
        /\$\.ajax/,
        /\$\.get\s*\(/,
        /WebSocket/,
        /localStorage/,
        /sessionStorage/,
        /extension_settings/,
        /saveSettings/,
        /generateQuietPrompt/,
        /getContext\s*\(/,
    ];

    for (const pattern of forbiddenPatterns) {
        assert.doesNotMatch(source, pattern);
    }
});

test('the only fetch destinations are fixed same-origin SillyTavern endpoints', async () => {
    const source = await readFile(new URL('../backend-integration.js', import.meta.url), 'utf8');
    assert.match(source, /const API_ROOT = '\/api\/plugins\/cross-device-access-helper-backend'/);
    assert.match(source, /fetch\(`\$\{API_ROOT\}\/status`/);
    assert.match(source, /fetch\(`\$\{API_ROOT\}\/preview-change`/);
    assert.match(source, /fetch\('\/csrf-token'/);
    assert.doesNotMatch(source, /fetch\(BACKEND_REPOSITORY/);
    assert.equal((source.match(/\bfetch\s*\(/g) ?? []).length, 3);
});
