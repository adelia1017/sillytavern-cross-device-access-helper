import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

test('beginner guide validates inputs, generates commands and access URL without persistence', async () => {
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
        assert.match(panel.textContent, /跟着 4 步/);
        assert.match(panel.textContent, /iPad \/ iPhone 怎么看/);
        assert.match(panel.textContent, /安卓手机 IP 怎么看/);
        assert.equal(panel.querySelector('#cross-device-access-safe-workflow').hidden, false);
        assert.equal(panel.querySelector('#cross-device-access-backend-dashboard').hidden, true);
        assert.match(panel.querySelector('#cross-device-access-mode-badge').textContent, /安全命令模式/);
        assert.match(panel.querySelector('#cross-device-access-mode-message').textContent, /无需服务器权限/);
        assert.ok(panel.querySelector('#cross-device-access-retry-backend'));
        assert.match(panel.querySelector('#cross-device-access-retry-backend').textContent, /我已安装好/);

        const backendSetup = panel.querySelector('#cross-device-access-backend-setup');
        panel.querySelector('#cross-device-access-backend-cta').click();
        assert.equal(backendSetup.hidden, false);
        assert.match(backendSetup.textContent, /没有沙箱/);
        assert.match(panel.querySelector('#cross-device-access-backend-install-command').value, /enable-server-plugins\.mjs/);

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

        const networkMode = panel.querySelector('input[name="cross-device-access-mode"][value="network"]');
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

        const serverInput = panel.querySelector('#cross-device-access-server-ip');
        const urlBox = panel.querySelector('#cross-device-access-url-box');
        assert.equal(serverInput.value, '', 'localhost 页面不应被误识别为手机局域网 IP');
        assert.equal(urlBox.hidden, true);

        serverInput.value = '192.168.123.10';
        serverInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        assert.equal(urlBox.hidden, false);
        assert.equal(panel.querySelector('#cross-device-access-url').value, 'http://192.168.123.10:8000');

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

test('a healthy backend switches the same panel from safe mode to backend mode', async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="extensions_settings"></div></body></html>', {
        url: 'http://127.0.0.1:8000/',
    });
    const previousGlobals = {
        window: globalThis.window,
        document: globalThis.document,
        navigator: globalThis.navigator,
        fetch: globalThis.fetch,
    };
    const calls = [];
    const status = {
        config: { listen: false, whitelistMode: true, whitelist: ['::1', '127.0.0.1'] },
        runtime: { listen: false, whitelistMode: true, port: 8000 },
        network: { accessUrls: ['http://192.168.1.9:8000'] },
        legacyWhitelist: { exists: false },
        supportedPlatform: true,
    };
    Object.defineProperties(globalThis, {
        window: { value: dom.window, configurable: true, writable: true },
        document: { value: dom.window.document, configurable: true, writable: true },
        navigator: { value: { clipboard: { writeText: async () => {} } }, configurable: true, writable: true },
        fetch: {
            value: async (url) => {
                calls.push(url);
                return { ok: true, json: async () => ({ ok: true, data: status }) };
            },
            configurable: true,
            writable: true,
        },
    });
    try {
        await import(`../index.js?backend-ui-test=${Date.now()}`);
        dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
        const panel = document.querySelector('.cross-device-access-helper');
        assert.deepEqual(calls, [], '页面加载时不应自动探测后端');
        panel.querySelector('#cross-device-access-retry-backend').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.deepEqual(calls, ['/api/plugins/cross-device-access-helper-backend/status']);
        assert.equal(panel.querySelector('#cross-device-access-safe-workflow').hidden, true);
        assert.equal(panel.querySelector('#cross-device-access-backend-dashboard').hidden, false);
        assert.match(panel.querySelector('#cross-device-access-mode-badge').textContent, /后端模式/);
        assert.match(panel.querySelector('#cross-device-access-backend-summary').textContent, /192\.168\.1\.9:8000/);

        panel.querySelector('#cross-device-access-use-safe-mode').click();
        assert.equal(panel.querySelector('#cross-device-access-safe-workflow').hidden, false);
        assert.equal(panel.querySelector('#cross-device-access-backend-dashboard').hidden, true);
    } finally {
        dom.window.close();
        Object.defineProperties(globalThis, {
            window: { value: previousGlobals.window, configurable: true, writable: true },
            document: { value: previousGlobals.document, configurable: true, writable: true },
            navigator: { value: previousGlobals.navigator, configurable: true, writable: true },
            fetch: { value: previousGlobals.fetch, configurable: true, writable: true },
        });
    }
});

test('a backend config error is distinguished from a missing backend', async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="extensions_settings"></div></body></html>', {
        url: 'http://127.0.0.1:8000/',
    });
    const previousGlobals = {
        window: globalThis.window,
        document: globalThis.document,
        navigator: globalThis.navigator,
        fetch: globalThis.fetch,
    };
    Object.defineProperties(globalThis, {
        window: { value: dom.window, configurable: true, writable: true },
        document: { value: dom.window.document, configurable: true, writable: true },
        navigator: { value: { clipboard: { writeText: async () => {} } }, configurable: true, writable: true },
        fetch: {
            value: async () => ({
                ok: false,
                status: 422,
                json: async () => ({ ok: false, error: { code: 'DUPLICATE_KEY', message: 'config.yaml 含有重复键。' } }),
            }),
            configurable: true,
            writable: true,
        },
    });
    try {
        await import(`../index.js?backend-error-test=${Date.now()}`);
        dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
        const panel = document.querySelector('.cross-device-access-helper');
        assert.match(panel.querySelector('#cross-device-access-mode-badge').textContent, /安全命令模式/);
        panel.querySelector('#cross-device-access-retry-backend').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.match(panel.querySelector('#cross-device-access-mode-badge').textContent, /后端检查失败/);
        assert.match(panel.querySelector('#cross-device-access-mode-message').textContent, /重复键/);
        assert.equal(panel.querySelector('#cross-device-access-backend-cta').hidden, true);
        assert.equal(panel.querySelector('#cross-device-access-safe-workflow').hidden, false);
    } finally {
        dom.window.close();
        Object.defineProperties(globalThis, {
            window: { value: previousGlobals.window, configurable: true, writable: true },
            document: { value: previousGlobals.document, configurable: true, writable: true },
            navigator: { value: previousGlobals.navigator, configurable: true, writable: true },
            fetch: { value: previousGlobals.fetch, configurable: true, writable: true },
        });
    }
});

test('guide automatically detects a private IPv4 used in the current page URL', async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="extensions_settings"></div></body></html>', {
        url: 'http://192.168.50.9:8000/',
    });
    const previousGlobals = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator };
    Object.defineProperties(globalThis, {
        window: { value: dom.window, configurable: true, writable: true },
        document: { value: dom.window.document, configurable: true, writable: true },
        navigator: { value: { clipboard: { writeText: async () => {} } }, configurable: true, writable: true },
    });
    try {
        await import(`../index.js?detect-test=${Date.now()}`);
        dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
        assert.equal(document.querySelector('#cross-device-access-server-ip').value, '192.168.50.9');
        assert.equal(document.querySelector('#cross-device-access-url').value, 'http://192.168.50.9:8000');
        assert.match(document.querySelector('#cross-device-access-server-validation').textContent, /自动识别/);
    } finally {
        dom.window.close();
        Object.defineProperties(globalThis, {
            window: { value: previousGlobals.window, configurable: true, writable: true },
            document: { value: previousGlobals.document, configurable: true, writable: true },
            navigator: { value: previousGlobals.navigator, configurable: true, writable: true },
        });
    }
});
