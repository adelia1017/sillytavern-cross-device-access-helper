import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('frontend entry point contains no network, storage, model, or settings APIs', async () => {
    const files = ['../index.js', '../ip-utils.js', '../command-generator.js'];
    const source = (await Promise.all(files.map(file => readFile(new URL(file, import.meta.url), 'utf8')))).join('\n');
    const forbiddenPatterns = [
        /\bfetch\s*\(/,
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
