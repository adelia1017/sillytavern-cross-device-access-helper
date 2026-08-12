import { validateDeviceIp, validateServerIp } from './ip-utils.js';
import { generateCommands } from './command-generator.js';

const EXTENSION_NAME = 'sillytavern-cross-device-access-helper';

function getSelectedMode(panel) {
    return panel.querySelector('input[name="cross-device-access-mode"]:checked')?.value ?? 'single';
}

export function detectServerIp(hostname) {
    const result = validateServerIp(hostname);
    return result.valid ? result.ip : null;
}

function updateClientValidation(panel) {
    const input = panel.querySelector('#cross-device-access-device-ip');
    const status = panel.querySelector('#cross-device-access-validation');
    const preview = panel.querySelector('#cross-device-access-scope-preview');
    const result = validateDeviceIp(input.value);

    input.setAttribute('aria-invalid', String(!result.valid && result.code !== 'empty'));
    status.classList.toggle('cross-device-access-helper__status--valid', result.valid);
    status.classList.toggle('cross-device-access-helper__status--error', !result.valid && result.code !== 'empty');
    status.textContent = result.message;

    const generateButton = panel.querySelector('#cross-device-access-generate');
    const commandSection = panel.querySelector('#cross-device-access-commands');
    if (!result.valid) {
        preview.hidden = true;
        preview.textContent = '';
        generateButton.disabled = true;
        commandSection.hidden = true;
        return;
    }

    const networkMode = getSelectedMode(panel) === 'network';
    preview.textContent = networkMode
        ? `将允许连接同一 Wi‑Fi 的设备（技术范围：${result.subnet24}）`
        : `将只允许这台设备：${result.ip}`;
    preview.hidden = false;
    generateButton.disabled = false;
    commandSection.hidden = true;
}

function updateServerAddress(panel, source = 'manual') {
    const input = panel.querySelector('#cross-device-access-server-ip');
    const status = panel.querySelector('#cross-device-access-server-validation');
    const result = validateServerIp(input.value);
    const accessBox = panel.querySelector('#cross-device-access-url-box');
    const accessUrl = panel.querySelector('#cross-device-access-url');
    const copyButton = panel.querySelector('#cross-device-access-copy-url');

    input.setAttribute('aria-invalid', String(!result.valid && result.code !== 'empty'));
    status.classList.toggle('cross-device-access-helper__status--valid', result.valid);
    status.classList.toggle('cross-device-access-helper__status--error', !result.valid && result.code !== 'empty');
    status.textContent = source === 'detected' && result.valid
        ? '已从当前页面自动识别安卓手机 IP。'
        : result.message;

    if (!result.valid) {
        accessBox.hidden = true;
        accessUrl.value = '';
        copyButton.disabled = true;
        return;
    }

    accessUrl.value = result.accessUrl;
    copyButton.disabled = false;
    accessBox.hidden = false;
}

async function copyText(text, status, successMessage = '已复制到剪贴板。') {
    try {
        await navigator.clipboard.writeText(text);
        status.textContent = successMessage;
    } catch {
        status.textContent = '自动复制失败，请长按文本后手动复制。';
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
                <div class="cross-device-access-helper__hero">
                    <b>跟着 4 步，让 iPad 或电脑访问手机上的酒馆</b>
                    <p>不用看懂配置文件。助手不会自动执行命令，也不会保存你填写的 IP。</p>
                </div>

                <section class="cross-device-access-helper__step">
                    <h3><span>1</span> 找到访问设备的 IP</h3>
                    <p>请在<b>准备拿来访问酒馆的 iPad 或电脑</b>上查看，不是安卓手机。</p>
                    <details>
                        <summary>iPad / iPhone 怎么看？</summary>
                        <ol>
                            <li>打开“设置” → “无线局域网”。</li>
                            <li>点当前 Wi‑Fi 右侧的 ⓘ。</li>
                            <li>找到“IPv4 地址”里的“IP 地址”。</li>
                        </ol>
                    </details>
                    <details>
                        <summary>Windows 电脑怎么看？</summary>
                        <ol>
                            <li>打开“设置” → “网络和 Internet”。</li>
                            <li>进入当前连接的 Wi‑Fi（或以太网）属性。</li>
                            <li>找到“IPv4 地址”。</li>
                        </ol>
                    </details>

                    <label for="cross-device-access-device-ip"><b>把访问设备的 IPv4 地址填在这里</b></label>
                    <input id="cross-device-access-device-ip" class="text_pole" type="text" inputmode="decimal"
                        maxlength="15" placeholder="例如：192.168.123.17" autocomplete="off"
                        autocapitalize="off" spellcheck="false" aria-describedby="cross-device-access-validation">
                    <div id="cross-device-access-validation" class="cross-device-access-helper__status"
                        role="status" aria-live="polite">等待填写访问设备 IP。</div>
                </section>

                <section class="cross-device-access-helper__step">
                    <h3><span>2</span> 选择允许谁访问</h3>
                    <fieldset class="cross-device-access-helper__modes">
                        <label class="checkbox_label">
                            <input type="radio" name="cross-device-access-mode" value="single" checked>
                            <span><b>只允许上面这台设备（推荐）</b><br>更安全；设备 IP 变化后需要重新设置。</span>
                        </label>
                        <label class="checkbox_label">
                            <input type="radio" name="cross-device-access-mode" value="network">
                            <span><b>允许连接当前可信 Wi‑Fi 的设备</b><br>更方便，但同一 Wi‑Fi 内的其他设备也可能访问。</span>
                        </label>
                    </fieldset>
                    <output id="cross-device-access-scope-preview" class="cross-device-access-helper__preview" hidden></output>
                    <details>
                        <summary>查看技术说明</summary>
                        <p>第二项会添加同一 <code>/24</code> 网段。助手仍会保留本机地址和已有白名单。</p>
                    </details>
                </section>

                <section class="cross-device-access-helper__step">
                    <h3><span>3</span> 生成并应用安全配置</h3>
                    <button id="cross-device-access-generate" class="menu_button" type="button" disabled>生成下一步</button>

                    <div id="cross-device-access-commands" class="cross-device-access-helper__commands" hidden>
                        <div class="cross-device-access-helper__ready">
                            <b>配置步骤已准备好</b>
                            <ol>
                                <li>先保存正在进行的聊天。</li>
                                <li>回到 Termux，按 <code>CTRL</code> 再按 <code>C</code>，手动停止酒馆。</li>
                                <li>点击下方按钮复制，粘贴到 Termux 后按回车。</li>
                                <li>看到“配置修改成功”后，运行 <code>npm run start</code>。</li>
                            </ol>
                        </div>
                        <button id="cross-device-access-copy-apply" class="menu_button" type="button">复制配置步骤</button>
                        <details>
                            <summary>查看原始命令（通常不需要）</summary>
                            <textarea id="cross-device-access-apply-command" class="text_pole" rows="10" readonly spellcheck="false"></textarea>
                        </details>

                        <details class="cross-device-access-helper__recovery">
                            <summary>如果设置后出问题：恢复原配置</summary>
                            <p>恢复命令只选择本助手创建的最近一次备份，恢复前还会再备份当前配置。</p>
                            <button id="cross-device-access-copy-restore" class="menu_button" type="button">复制恢复步骤</button>
                            <details>
                                <summary>查看原始恢复命令</summary>
                                <textarea id="cross-device-access-restore-command" class="text_pole" rows="8" readonly spellcheck="false"></textarea>
                            </details>
                        </details>
                        <div id="cross-device-access-copy-status" class="cross-device-access-helper__copy-status"
                            role="status" aria-live="polite"></div>
                    </div>
                </section>

                <section class="cross-device-access-helper__step">
                    <h3><span>4</span> 生成其他设备要打开的网址</h3>
                    <p>这里需要的是<b>安卓手机自己的 IP</b>，它与第 1 步的访问设备 IP 不同。</p>
                    <details open>
                        <summary>安卓手机 IP 怎么看？</summary>
                        <ol>
                            <li>打开安卓“设置” → “WLAN / Wi‑Fi”。</li>
                            <li>点当前已连接的 Wi‑Fi 或“网络详情”。</li>
                            <li>找到“IP 地址”或“IPv4 地址”。不同手机名称可能略有不同。</li>
                        </ol>
                    </details>
                    <label for="cross-device-access-server-ip"><b>安卓手机的 IPv4 地址</b></label>
                    <input id="cross-device-access-server-ip" class="text_pole" type="text" inputmode="decimal"
                        maxlength="15" placeholder="例如：192.168.123.10" autocomplete="off"
                        autocapitalize="off" spellcheck="false" aria-describedby="cross-device-access-server-validation">
                    <div id="cross-device-access-server-validation" class="cross-device-access-helper__status"
                        role="status" aria-live="polite">当前页面使用本机地址，浏览器无法自动读取手机 Wi‑Fi IP，请按上方教程查看。</div>
                    <div id="cross-device-access-url-box" class="cross-device-access-helper__url-box" hidden>
                        <label for="cross-device-access-url"><b>在 iPad / 电脑浏览器打开</b></label>
                        <input id="cross-device-access-url" class="text_pole" type="text" readonly spellcheck="false">
                        <button id="cross-device-access-copy-url" class="menu_button" type="button" disabled>复制访问网址</button>
                    </div>
                    <details>
                        <summary>为什么不能总是自动检测手机 IP？</summary>
                        <p>当酒馆通过 <code>127.0.0.1</code> 打开时，网页只能看到这个本机地址。浏览器不会向普通网页公开安卓 Wi‑Fi 网卡地址。若以后通过局域网地址打开，本助手会自动识别。</p>
                    </details>
                </section>

                <p class="cross-device-access-helper__privacy">隐私：所有输入只留在当前页面；不写入设置、不联网、不上传统计信息。</p>
            </div>
        </div>`;
    return panel;
}

function mountSettingsPanel() {
    if (document.getElementById(`${EXTENSION_NAME}-settings`)) return;

    const container = document.getElementById('extensions_settings');
    if (!container) {
        console.error(`[${EXTENSION_NAME}] 找不到扩展设置容器。`);
        return;
    }

    const panel = createSettingsPanel();
    container.append(panel);

    panel.querySelector('#cross-device-access-device-ip').addEventListener('input', () => updateClientValidation(panel));
    panel.querySelectorAll('input[name="cross-device-access-mode"]').forEach((radio) => {
        radio.addEventListener('change', () => updateClientValidation(panel));
    });
    panel.querySelector('#cross-device-access-generate').addEventListener('click', () => generateCommandOutput(panel));
    panel.querySelector('#cross-device-access-copy-apply').addEventListener('click', () => {
        void copyText(panel.querySelector('#cross-device-access-apply-command').value,
            panel.querySelector('#cross-device-access-copy-status'),
            '配置步骤已复制。请先停止酒馆，再粘贴到 Termux 执行。');
    });
    panel.querySelector('#cross-device-access-copy-restore').addEventListener('click', () => {
        void copyText(panel.querySelector('#cross-device-access-restore-command').value,
            panel.querySelector('#cross-device-access-copy-status'), '恢复步骤已复制。');
    });

    const serverInput = panel.querySelector('#cross-device-access-server-ip');
    serverInput.addEventListener('input', () => updateServerAddress(panel));
    panel.querySelector('#cross-device-access-copy-url').addEventListener('click', () => {
        void copyText(panel.querySelector('#cross-device-access-url').value,
            panel.querySelector('#cross-device-access-server-validation'), '访问网址已复制。');
    });

    const detectedIp = detectServerIp(window.location.hostname);
    if (detectedIp) {
        serverInput.value = detectedIp;
        updateServerAddress(panel, 'detected');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountSettingsPanel, { once: true });
} else {
    mountSettingsPanel();
}
