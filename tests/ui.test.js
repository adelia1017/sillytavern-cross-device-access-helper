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
        assert.equal(panel.querySelector('#cross-device-access-safe-section').open, true);
        assert.equal(panel.querySelector('#cross-device-access-backend-section').open, false);
        assert.equal(panel.querySelector('#cross-device-access-backend-dashboard').hidden, true);
        assert.match(panel.querySelector('#cross-device-access-backend-badge').textContent, /未检查/);
        assert.ok(panel.querySelector('#cross-device-access-check-backend'));

        const backendSetup = panel.querySelector('#cross-device-access-backend-setup');
        assert.equal(backendSetup.hidden, true);
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

test('a healthy backend appears beside the safe guide when its section is opened', async () => {
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
        network: { accessUrls: ['http://172.19.0.1:8000', 'http://192.168.1.9:8000'] },
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
        const backendSection = panel.querySelector('#cross-device-access-backend-section');
        backendSection.open = true;
        backendSection.dispatchEvent(new dom.window.Event('toggle'));
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.deepEqual(calls, ['/api/plugins/cross-device-access-helper-backend/status']);
        assert.equal(panel.querySelector('#cross-device-access-safe-section').open, true);
        assert.equal(panel.querySelector('#cross-device-access-backend-dashboard').hidden, false);
        assert.match(panel.querySelector('#cross-device-access-backend-badge').textContent, /已连接/);
        assert.match(panel.querySelector('#cross-device-access-backend-summary').textContent, /192\.168\.1\.9:8000/);

        const backendIp = panel.querySelector('#cross-device-access-backend-device-ip');
        backendIp.value = '192.168.1.17';
        backendIp.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        const recommended = panel.querySelector('.cross-device-access-helper__recommended-url input');
        assert.equal(recommended.value, 'http://192.168.1.9:8000');
        const qr = panel.querySelector('.cross-device-access-helper__qr');
        assert.match(qr.src, /^data:image\/gif;base64,/);
        assert.match(qr.alt, /192\.168\.1\.9:8000/);
        assert.match(panel.querySelector('#cross-device-access-backend-summary').textContent, /同一 Wi‑Fi 网段/);
        const detailsText = [...panel.querySelectorAll('#cross-device-access-backend-summary details')]
            .map(details => details.textContent).join(' ');
        assert.match(detailsText, /172\.19\.0\.1/);

        panel.querySelector('#cross-device-access-safe-section').open = false;
        assert.equal(panel.querySelector('#cross-device-access-safe-section').open, false);
        assert.equal(panel.querySelector('#cross-device-access-backend-dashboard').hidden, false);
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
        const backendSection = panel.querySelector('#cross-device-access-backend-section');
        assert.equal(backendSection.open, false);
        backendSection.open = true;
        backendSection.dispatchEvent(new dom.window.Event('toggle'));
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.match(panel.querySelector('#cross-device-access-backend-badge').textContent, /检查失败/);
        assert.match(panel.querySelector('#cross-device-access-backend-message').textContent, /重复键/);
        assert.equal(panel.querySelector('#cross-device-access-backend-setup').hidden, true);
        assert.equal(panel.querySelector('#cross-device-access-safe-section').open, true);
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

test('a missing backend reveals installation help without closing the safe guide', async () => {
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
            value: async () => ({ ok: false, status: 404, json: async () => ({}) }),
            configurable: true,
            writable: true,
        },
    });
    try {
        await import(`../index.js?backend-missing-test=${Date.now()}`);
        dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
        const panel = document.querySelector('.cross-device-access-helper');
        const backendSection = panel.querySelector('#cross-device-access-backend-section');
        backendSection.open = true;
        backendSection.dispatchEvent(new dom.window.Event('toggle'));
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.match(panel.querySelector('#cross-device-access-backend-badge').textContent, /未连接/);
        assert.match(panel.querySelector('#cross-device-access-backend-message').textContent, /HTTP 404/);
        assert.equal(panel.querySelector('#cross-device-access-backend-setup').hidden, false);
        assert.equal(panel.querySelector('#cross-device-access-safe-section').open, true);
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

test('backend preview requires confirmation before applying and then shows restart steps', async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="extensions_settings"></div></body></html>', {
        url: 'http://127.0.0.1:8000/',
    });
    const previousGlobals = {
        window: globalThis.window,
        document: globalThis.document,
        navigator: globalThis.navigator,
        fetch: globalThis.fetch,
    };
    const requests = [];
    let statusChecks = 0;
    const baseStatus = {
        config: { listen: false, whitelistMode: false, whitelist: ['::1', '127.0.0.1'] },
        runtime: { listen: false, whitelistMode: false, port: 8000 },
        network: { accessUrls: ['http://192.168.1.9:8000'] },
        legacyWhitelist: { exists: false },
        supportedPlatform: true,
        writeEnabled: true,
        backups: { available: false, latestName: null },
        restartRequired: false,
    };
    dom.window.confirm = () => true;
    Object.defineProperties(globalThis, {
        window: { value: dom.window, configurable: true, writable: true },
        document: { value: dom.window.document, configurable: true, writable: true },
        navigator: { value: { clipboard: { writeText: async () => {} } }, configurable: true, writable: true },
        fetch: {
            value: async (url, options = {}) => {
                requests.push({ url, options });
                if (url === '/csrf-token') return { ok: true, json: async () => ({ token: 'csrf-test' }) };
                if (url.endsWith('/status')) {
                    statusChecks++;
                    const status = statusChecks === 1 ? baseStatus : {
                        ...baseStatus,
                        config: { listen: true, whitelistMode: true, whitelist: ['::1', '127.0.0.1', '192.168.1.17'] },
                        backups: { available: true, latestName: 'config.yaml.cross-device-access-helper-backup-20260812-120000-000.bak' },
                        restartRequired: true,
                    };
                    return { ok: true, json: async () => ({ ok: true, data: status }) };
                }
                if (url.endsWith('/preview-change')) {
                    return {
                        ok: true,
                        json: async () => ({
                            ok: true,
                            data: {
                                request: { deviceIp: '192.168.1.17', mode: 'single', whitelistEntry: '192.168.1.17' },
                                changes: [
                                    { field: 'listen', before: false, after: true },
                                    { field: 'whitelistMode', before: false, after: true },
                                    { field: 'whitelist', before: ['::1', '127.0.0.1'], after: ['::1', '127.0.0.1', '192.168.1.17'] },
                                ],
                                canApply: true,
                                applyBlockedReasons: [],
                            },
                        }),
                    };
                }
                if (url.endsWith('/apply-lan-settings')) {
                    return {
                        ok: true,
                        json: async () => ({
                            ok: true,
                            data: {
                                changed: true,
                                backupName: 'config.yaml.cross-device-access-helper-backup-20260812-120000-000.bak',
                                restartRequired: true,
                            },
                        }),
                    };
                }
                throw new Error(`Unexpected URL: ${url}`);
            },
            configurable: true,
            writable: true,
        },
    });
    try {
        await import(`../index.js?backend-apply-test=${Date.now()}`);
        dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
        const panel = document.querySelector('.cross-device-access-helper');
        const backendSection = panel.querySelector('#cross-device-access-backend-section');
        backendSection.open = true;
        backendSection.dispatchEvent(new dom.window.Event('toggle'));
        await new Promise(resolve => setTimeout(resolve, 0));

        const input = panel.querySelector('#cross-device-access-backend-device-ip');
        input.value = '192.168.1.17';
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        panel.querySelector('#cross-device-access-backend-preview').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        const apply = panel.querySelector('#cross-device-access-backend-apply');
        assert.equal(apply.hidden, false);
        assert.match(panel.querySelector('#cross-device-access-backend-diff').textContent, /允许其他设备连接/);

        apply.click();
        await new Promise(resolve => setTimeout(resolve, 10));
        const applyRequest = requests.find(item => item.url.endsWith('/apply-lan-settings'));
        assert.ok(applyRequest);
        assert.deepEqual(JSON.parse(applyRequest.options.body), { deviceIp: '192.168.1.17', mode: 'single' });
        assert.equal(applyRequest.options.headers['X-CSRF-Token'], 'csrf-test');
        assert.match(panel.querySelector('#cross-device-access-backend-result').textContent, /备份文件/);
        assert.match(panel.querySelector('#cross-device-access-backend-result').textContent, /手动重启|输入 st/);
        assert.match(panel.querySelector('#cross-device-access-backend-summary').textContent, /本次运行仍在使用旧配置/);
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

test('backend restore sends an empty fixed request after a second confirmation', async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="extensions_settings"></div></body></html>', {
        url: 'http://127.0.0.1:8000/',
    });
    const previousGlobals = {
        window: globalThis.window,
        document: globalThis.document,
        navigator: globalThis.navigator,
        fetch: globalThis.fetch,
    };
    const requests = [];
    const status = {
        config: { listen: true, whitelistMode: true, whitelist: ['::1'] },
        runtime: { listen: true, whitelistMode: true, port: 8000 },
        network: { accessUrls: ['http://192.168.1.9:8000'] },
        legacyWhitelist: { exists: false },
        supportedPlatform: true,
        writeEnabled: true,
        backups: { available: true, latestName: 'config.yaml.cross-device-access-helper-backup-20260812-120000-000.bak' },
        restartRequired: false,
    };
    dom.window.confirm = () => true;
    Object.defineProperties(globalThis, {
        window: { value: dom.window, configurable: true, writable: true },
        document: { value: dom.window.document, configurable: true, writable: true },
        navigator: { value: { clipboard: { writeText: async () => {} } }, configurable: true, writable: true },
        fetch: {
            value: async (url, options = {}) => {
                requests.push({ url, options });
                if (url === '/csrf-token') return { ok: true, json: async () => ({ token: 'csrf-test' }) };
                if (url.endsWith('/status')) return { ok: true, json: async () => ({ ok: true, data: status }) };
                if (url.endsWith('/restore-latest-backup')) {
                    return {
                        ok: true,
                        json: async () => ({ ok: true, data: {
                            changed: true,
                            restoredBackupName: status.backups.latestName,
                            safetyBackupName: 'config.yaml.cross-device-access-helper-pre-restore-20260812-121000-000.bak',
                            restartRequired: true,
                        } }),
                    };
                }
                throw new Error(`Unexpected URL: ${url}`);
            },
            configurable: true,
            writable: true,
        },
    });
    try {
        await import(`../index.js?backend-restore-test=${Date.now()}`);
        dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
        const panel = document.querySelector('.cross-device-access-helper');
        const backendSection = panel.querySelector('#cross-device-access-backend-section');
        backendSection.open = true;
        backendSection.dispatchEvent(new dom.window.Event('toggle'));
        await new Promise(resolve => setTimeout(resolve, 0));
        const restore = panel.querySelector('#cross-device-access-backend-restore');
        assert.equal(restore.hidden, false);
        restore.click();
        await new Promise(resolve => setTimeout(resolve, 10));
        const request = requests.find(item => item.url.endsWith('/restore-latest-backup'));
        assert.ok(request);
        assert.deepEqual(JSON.parse(request.options.body), {});
        assert.match(panel.querySelector('#cross-device-access-backend-result').textContent, /恢复前的当前配置也已备份/);
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
