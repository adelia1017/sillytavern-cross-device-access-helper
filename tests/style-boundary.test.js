import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('mobile buttons override theme rules that can stretch or rotate labels', async () => {
    const source = await readFile(new URL('../style.css', import.meta.url), 'utf8');
    for (const rule of [
        '.cross-device-access-helper .menu_button',
        'height: auto !important',
        'writing-mode: horizontal-tb',
        'min-height: 2.5rem',
        '#cross-device-access-generate',
        'width: 100%',
        '.cross-device-access-helper__backend-cta',
        '#cross-device-access-safe-workflow[hidden]',
    ]) {
        assert.ok(source.includes(rule), rule);
    }
});
