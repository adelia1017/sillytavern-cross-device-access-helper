import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

test('settings UI validates input, switches scope, and generates commands without persistence', async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="extensions_settings"></div></body></html>', {
        url: 'http://localhost:8000/',
    });

    const previousGlobals = {
        window: globalThis.window,
        document: globalThis.document,
        navigator: globalThis.navigator,
    };
    const copied = [];

    Object.defineProperties(globalThis, {
        window: { value: dom.window, configurable: true, writable: true },
        document: { value: dom.window.document, configurable: true, writable: true },
        navigator: {
            value: { clipboard: { writeText: async text => copied.push(text) } },
            configurable: true,
            writable: true,
        },
    });

    try {
        await import(`../index.js?ui-test=${Date.now()}`);
        dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

        const panel = document.querySelector('.cross-device-access-helper');
        assert.ok(panel, '设置面板应挂载到扩展设置容器');

        const input = panel.querySelector('#cross-device-access-device-ip');
        const generate = panel.querySelector('#cross-device-access-generate');
        const commands = panel.querySelector('#cross-device-access-commands');
        assert.equal(generate.disabled, true);
        assert.equal(commands.hidden, true);

        input.value = '8.8.8.8';
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        assert.equal(input.getAttribute('aria-invalid'), 'true');
        assert.match(panel.querySelector('#cross-device-access-validation').textContent, /仅接受/);
        assert.equal(generate.disabled, true);

        input.value = '192.168.123.17';
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        assert.equal(input.getAttribute('aria-invalid'), 'false');
        assert.equal(generate.disabled, false);
        assert.match(panel.querySelector('#cross-device-access-scope-preview').textContent, /192\.168\.123\.17/);

        const networkMode = panel.querySelector('input[value="network"]');
        networkMode.checked = true;
        networkMode.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        assert.match(panel.querySelector('#cross-device-access-scope-preview').textContent, /192\.168\.123\.0\/24/);

        generate.click();
        assert.equal(commands.hidden, false);
        assert.match(panel.querySelector('#cross-device-access-apply-command').value, /'192\.168\.123\.0\/24'/);
        assert.match(panel.querySelector('#cross-device-access-restore-command').value, /cross-device-access-helper-backup/);

        panel.querySelector('#cross-device-access-copy-apply').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(copied.length, 1);
        assert.equal(copied[0], panel.querySelector('#cross-device-access-apply-command').value);

        assert.equal(dom.window.localStorage.length, 0);
        assert.equal(dom.window.sessionStorage.length, 0);
    } finally {
        dom.window.close();
        Object.defineProperties(globalThis, {
            window: { value: previousGlobals.window, configurable: true, writable: true },
            document: { value: previousGlobals.document, configurable: true, writable: true },
            navigator: { value: previousGlobals.navigator, configurable: true, writable: true },
        });
    }
});
