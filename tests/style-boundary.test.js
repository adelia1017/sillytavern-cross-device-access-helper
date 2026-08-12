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
        '.cross-device-access-helper__main-section',
        '.cross-device-access-helper__retry-backend',
        "[data-state='connected']",
        "content: '点击展开  ▼'",
        "content: '点击收起  ▲'",
        '#cross-device-access-safe-section > summary',
        '#cross-device-access-backend-section > summary',
        'summary:focus-visible',
    ]) {
        assert.ok(source.includes(rule), rule);
    }
});
