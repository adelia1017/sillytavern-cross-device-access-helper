import { validateDeviceIp } from './ip-utils.js';
import { generateCommands } from './command-generator.js';

const EXTENSION_NAME = 'sillytavern-cross-device-access-helper';

function getSelectedMode(panel) {
    return panel.querySelector('input[name="cross-device-access-mode"]:checked')?.value ?? 'single';
}

function updateValidation(panel) {
    const input = panel.querySelector('#cross-device-access-device-ip');
    const status = panel.querySelector('#cross-device-access-validation');
    const preview = panel.querySelector('#cross-device-access-scope-preview');
    const result = validateDeviceIp(input.value);

    input.setAttribute('aria-invalid', String(!result.valid && result.code !== 'empty'));
    status.classList.toggle('cross-device-access-helper__status--valid', result.valid);
    status.classList.toggle('cross-device-access-helper__status--error', !result.valid && result.code !== 'empty');
    status.textContent = result.message;

    if (!result.valid) {
        preview.hidden = true;
        preview.textContent = '';
        panel.querySelector('#cross-device-access-generate').disabled = true;
        panel.querySelector('#cross-device-access-commands').hidden = true;
        return;
    }

    const mode = getSelectedMode(panel);
    const target = mode === 'network' ? result.subnet24 : result.ip;
    const label = mode === 'network' ? '将允许的可信网段' : '将允许的客户端';
    preview.textContent = `${label}：${target}`;
    preview.hidden = false;
    panel.querySelector('#cross-device-access-generate').disabled = false;
    panel.querySelector('#cross-device-access-commands').hidden = true;
}

async function copyText(text, status) {
    try {
        await navigator.clipboard.writeText(text);
        status.textContent = '已复制到剪贴板。';
    } catch {
        status.textContent = '自动复制失败，请长按命令文本后手动复制。';
    }
}

function generateCommandOutput(panel) {
    const result = validateDeviceIp(panel.querySelector('#cross-device-access-device-ip').value);
    if (!result.valid) return;

    const commands = generateCommands(result, getSelectedMode(panel));
    panel.querySelector('#cross-device-access-apply-command').value = commands.apply;
    panel.querySelector('#cross-device-access-restore-command').value = commands.restore;
    panel.querySelector('#cross-device-access-copy-status').textContent = '';
    panel.querySelector('#cross-device-access-commands').hidden = false;
}

function createSettingsPanel() {
    const panel = document.createElement('div');
    panel.id = `${EXTENSION_NAME}-settings`;
    panel.className = 'cross-device-access-helper';
    panel.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>跨设备访问助手</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <p class="cross-device-access-helper__notice">
                    仅生成 Android Termux 配置命令，不会自动修改配置或执行命令。
                </p>

                <div class="cross-device-access-helper__explanation">
                    <p><b>客户端 IP</b>：iPad、电脑等访问设备的地址，填写在下方并加入白名单。</p>
                    <p><b>安卓手机 IP</b>：运行 SillyTavern 的手机地址，用来打开 <code>http://手机IP:8000</code>，不要填在下方。</p>
                </div>

                <label for="cross-device-access-device-ip"><b>客户端 IPv4 地址</b></label>
                <input
                    id="cross-device-access-device-ip"
                    class="text_pole"
                    type="text"
                    inputmode="decimal"
                    maxlength="15"
                    placeholder="例如：192.168.123.17"
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck="false"
                    aria-describedby="cross-device-access-validation"
                >
                <div
                    id="cross-device-access-validation"
                    class="cross-device-access-helper__status"
                    role="status"
                    aria-live="polite"
                >请输入客户端的 IPv4 地址。</div>

                <fieldset class="cross-device-access-helper__modes">
                    <legend><b>允许范围</b></legend>
                    <label class="checkbox_label">
                        <input type="radio" name="cross-device-access-mode" value="single" checked>
                        <span>
                            <b>仅允许单个设备（推荐）</b><br>
                            只把上方填写的客户端 IP 加入白名单。
                        </span>
                    </label>
                    <label class="checkbox_label">
                        <input type="radio" name="cross-device-access-mode" value="network">
                        <span>
                            <b>允许当前可信局域网</b><br>
                            允许同一 /24 网段；仅适合完全信任该局域网内设备时使用。
                        </span>
                    </label>
                </fieldset>

                <output id="cross-device-access-scope-preview" class="cross-device-access-helper__preview" hidden></output>

                <button id="cross-device-access-generate" class="menu_button" type="button" disabled>
                    生成安全命令
                </button>

                <section id="cross-device-access-commands" class="cross-device-access-helper__commands" hidden>
                    <p><b>1. 修改命令</b></p>
                    <p>整段复制到 Termux 执行。执行前会验证配置，成功后只提示手动重启。</p>
                    <textarea id="cross-device-access-apply-command" class="text_pole" rows="10" readonly spellcheck="false"></textarea>
                    <button id="cross-device-access-copy-apply" class="menu_button" type="button">复制修改命令</button>

                    <p><b>2. 恢复命令</b></p>
                    <p>需要撤销时，整段复制到 Termux；它会恢复本助手创建的最近一次备份。</p>
                    <textarea id="cross-device-access-restore-command" class="text_pole" rows="8" readonly spellcheck="false"></textarea>
                    <button id="cross-device-access-copy-restore" class="menu_button" type="button">复制恢复命令</button>
                    <div id="cross-device-access-copy-status" class="cross-device-access-helper__copy-status" role="status" aria-live="polite"></div>
                </section>

                <p class="cross-device-access-helper__privacy">
                    隐私提示：输入内容只保留在当前输入框中，不写入 SillyTavern 设置或浏览器存储。
                </p>
            </div>
        </div>
    `;

    return panel;
}

function mountSettingsPanel() {
    if (document.getElementById(`${EXTENSION_NAME}-settings`)) {
        return;
    }

    const container = document.getElementById('extensions_settings');
    if (!container) {
        console.error(`[${EXTENSION_NAME}] 找不到扩展设置容器。`);
        return;
    }

    const panel = createSettingsPanel();
    container.append(panel);

    panel.querySelector('#cross-device-access-device-ip').addEventListener('input', () => updateValidation(panel));
    panel.querySelectorAll('input[name="cross-device-access-mode"]').forEach((radio) => {
        radio.addEventListener('change', () => updateValidation(panel));
    });
    panel.querySelector('#cross-device-access-generate').addEventListener('click', () => generateCommandOutput(panel));
    panel.querySelector('#cross-device-access-copy-apply').addEventListener('click', () => {
        void copyText(
            panel.querySelector('#cross-device-access-apply-command').value,
            panel.querySelector('#cross-device-access-copy-status'),
        );
    });
    panel.querySelector('#cross-device-access-copy-restore').addEventListener('click', () => {
        void copyText(
            panel.querySelector('#cross-device-access-restore-command').value,
            panel.querySelector('#cross-device-access-copy-status'),
        );
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountSettingsPanel, { once: true });
} else {
    mountSettingsPanel();
}
