import { validateDeviceIp, validateServerIp } from './ip-utils.js';
import { generateCommands } from './command-generator.js';
import qrcode from './vendor/qrcode.mjs';
import {
    BACKEND_INSTALL_COMMAND,
    BACKEND_SOURCE_URL,
    BackendApiError,
    applyBackendChange,
    getBackendStatus,
    previewBackendChange,
    restoreLatestBackendBackup,
} from './backend-integration.js';

const EXTENSION_NAME = 'sillytavern-cross-device-access-helper';
const DEFAULT_START_COMMAND = 'cd "$HOME/SillyTavern" && bash start.sh';

function getBackendMode(panel) {
    return panel.querySelector('input[name="cross-device-backend-mode"]:checked')?.value ?? 'single';
}

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
        ? '已从当前页面自动识别服务器设备 IP。'
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

function setBackendStatus(panel, state, label, message) {
    const badge = panel.querySelector('#cross-device-access-backend-badge');
    badge.dataset.state = state;
    badge.textContent = label;
    panel.querySelector('#cross-device-access-backend-message').textContent = message;
}

function appendStatusLine(container, label, value) {
    const line = document.createElement('p');
    const strong = document.createElement('b');
    strong.textContent = `${label}：`;
    line.append(strong, document.createTextNode(value));
    container.append(line);
}

export function selectRecommendedAccessUrl(accessUrls, deviceIp) {
    const device = validateDeviceIp(deviceIp);
    if (!device.valid) return null;
    const devicePrefix = device.ip.split('.').slice(0, 3).join('.');

    return accessUrls.find((accessUrl) => {
        try {
            const hostname = new URL(accessUrl).hostname;
            return hostname.split('.').slice(0, 3).join('.') === devicePrefix;
        } catch {
            return false;
        }
    }) ?? null;
}

function renderBackendNetworkAddress(panel, container, status) {
    const accessUrls = Array.isArray(status.network?.accessUrls) ? status.network.accessUrls : [];
    const deviceIp = panel.querySelector('#cross-device-access-backend-device-ip').value;
    const recommended = selectRecommendedAccessUrl(accessUrls, deviceIp);
    const box = document.createElement('div');
    box.className = 'cross-device-access-helper__recommended-url';

    if (recommended) {
        const label = document.createElement('b');
        label.textContent = '请在访问设备打开这个网址';
        const input = document.createElement('input');
        input.className = 'text_pole';
        input.readOnly = true;
        input.value = recommended;
        const button = document.createElement('button');
        button.className = 'menu_button';
        button.type = 'button';
        button.textContent = '复制这个网址';
        const copyStatus = document.createElement('small');
        copyStatus.textContent = '已根据访问设备 IP 选择同一 Wi‑Fi 网段。';
        button.addEventListener('click', () => void copyText(recommended, copyStatus, '网址已复制。'));
        const qrDetails = document.createElement('details');
        const qrSummary = document.createElement('summary');
        qrSummary.textContent = '显示二维码（可选）';
        const qrMessage = document.createElement('p');
        qrMessage.textContent = '二维码只在当前浏览器本地生成，不会上传网址。';
        const qr = qrcode(0, 'M');
        qr.addData(recommended);
        qr.make();
        const qrImage = document.createElement('img');
        qrImage.className = 'cross-device-access-helper__qr';
        qrImage.src = qr.createDataURL(6, 12);
        qrImage.alt = `打开 ${recommended} 的二维码`;
        qrDetails.append(qrSummary, qrMessage, qrImage);
        box.append(label, input, button, copyStatus, qrDetails);
    } else if (accessUrls.length > 0) {
        const message = document.createElement('p');
        message.textContent = '先在下方填写访问设备的 IPv4 地址，助手会自动选出应该打开的网址。';
        box.append(message);
    } else {
        const message = document.createElement('p');
        message.textContent = '没有检测到服务器设备的私有局域网地址。请确认服务器设备已连接 Wi‑Fi。';
        box.append(message);
    }
    container.append(box);

    if (accessUrls.length > 0) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = '其他检测到的地址（通常不用）';
        const list = document.createElement('ul');
        for (const accessUrl of accessUrls.filter(url => url !== recommended)) {
            const item = document.createElement('li');
            item.textContent = accessUrl;
            list.append(item);
        }
        if (list.childElementCount > 0) {
            details.append(summary, list);
            container.append(details);
        }
    }
}

function renderBackendSummary(panel, status) {
    const summary = panel.querySelector('#cross-device-access-backend-summary');
    summary.replaceChildren();
    const enabled = value => value === true ? '已开启' : value === false ? '未开启' : '未知';
    appendStatusLine(summary, '配置文件', `局域网连接${enabled(status.config.listen)}；白名单保护${enabled(status.config.whitelistMode)}`);
    appendStatusLine(summary, '本次运行', `局域网连接${enabled(status.runtime.listen)}；白名单保护${enabled(status.runtime.whitelistMode)}`);
    const whitelistDetails = document.createElement('details');
    whitelistDetails.className = 'cross-device-access-helper__whitelist';
    const whitelistSummary = document.createElement('summary');
    const whitelist = Array.isArray(status.config.whitelist) ? status.config.whitelist : [];
    whitelistSummary.textContent = `查看当前白名单（${whitelist.length} 项）`;
    const whitelistList = document.createElement('ul');
    for (const entry of whitelist) {
        const item = document.createElement('li');
        item.textContent = entry === '::1' || entry === '127.0.0.1'
            ? `${entry}（服务器设备本机）`
            : entry;
        whitelistList.append(item);
    }
    if (whitelist.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = '当前白名单为空。';
        whitelistDetails.append(whitelistSummary, empty);
    } else {
        whitelistDetails.append(whitelistSummary, whitelistList);
    }
    summary.append(whitelistDetails);
    renderBackendNetworkAddress(panel, summary, status);
    if (status.legacyWhitelist.exists) {
        appendStatusLine(summary, '需要处理', '检测到 whitelist.txt，自动写入保持禁用');
    }
    if (!status.supportedPlatform) {
        appendStatusLine(summary, '支持范围', '第一版只在 Android Termux 开放自动写入');
    }
    if (status.restartRequired) {
        const notice = document.createElement('div');
        notice.className = 'cross-device-access-helper__restart-notice';
        notice.innerHTML = '<b>配置文件已经改变，但酒馆本次运行仍在使用旧配置。</b><br>请按下方说明手动重启一次。';
        summary.append(notice);
    }
}

function updateBackendRecovery(panel, status) {
    const recovery = panel.querySelector('#cross-device-access-backend-recovery');
    const button = panel.querySelector('#cross-device-access-backend-restore');
    const description = panel.querySelector('#cross-device-access-backend-backup-status');
    const available = Boolean(status.backups?.available);
    recovery.hidden = false;
    button.hidden = !available;
    button.disabled = !available;
    description.textContent = available
        ? `最近一次可恢复备份：${status.backups.latestName}`
        : '还没有本助手创建的配置备份。首次成功修改后，这里会出现恢复按钮。';
}

function showBackendMode(panel, status) {
    panel.querySelector('#cross-device-access-backend-setup').hidden = true;
    panel.querySelector('#cross-device-access-backend-dashboard').hidden = false;
    setBackendStatus(panel, 'connected', '已连接', '后端组件连接正常。安全配置向导仍保留在下方。');

    panel.backendStatus = status;
    renderBackendSummary(panel, status);
    updateBackendRecovery(panel, status);
}

function showBackendProblem(panel, error) {
    panel.querySelector('#cross-device-access-backend-setup').hidden = true;
    panel.querySelector('#cross-device-access-backend-dashboard').hidden = true;
    setBackendStatus(panel, 'error', '检查失败', `后端已连接，但配置检查失败：${error.message}`);
}

function showBackendUnavailable(panel, error) {
    panel.querySelector('#cross-device-access-backend-setup').hidden = false;
    panel.querySelector('#cross-device-access-backend-dashboard').hidden = true;
    const reason = error?.status
        ? `后端接口返回 HTTP ${error.status}`
        : '浏览器没有收到后端接口响应';
    setBackendStatus(panel, 'missing', '未连接', `${reason}。可以按下方教程检查安装，也可以忽略并继续使用安全配置向导。`);
}

async function detectBackend(panel) {
    if (panel.dataset.backendCheckRunning === 'true') return false;
    panel.dataset.backendCheckRunning = 'true';
    const retryButton = panel.querySelector('#cross-device-access-check-backend');
    retryButton.disabled = true;
    retryButton.textContent = '正在检查后端……';
    setBackendStatus(panel, 'checking', '检查中', '正在连接当前酒馆的后端组件……');
    try {
        showBackendMode(panel, await getBackendStatus());
        return true;
    } catch (error) {
        if (error instanceof BackendApiError && error.backendReached) {
            showBackendProblem(panel, error);
        } else {
            showBackendUnavailable(panel, error);
        }
        return false;
    } finally {
        panel.dataset.backendCheckRunning = 'false';
        retryButton.disabled = false;
        retryButton.textContent = '重新检查后端';
    }
}

async function showBackendPreview(panel) {
    const output = panel.querySelector('#cross-device-access-backend-diff');
    const applyButton = panel.querySelector('#cross-device-access-backend-apply');
    const resultBox = panel.querySelector('#cross-device-access-backend-result');
    panel.backendPreview = null;
    applyButton.hidden = true;
    resultBox.hidden = true;
    output.hidden = false;
    output.textContent = '正在生成预览……';
    try {
        const deviceIp = panel.querySelector('#cross-device-access-backend-device-ip').value;
        const mode = getBackendMode(panel);
        const preview = await previewBackendChange(deviceIp, mode);
        panel.backendPreview = { data: preview, deviceIp: preview.request.deviceIp, mode };
        const fieldLabels = {
            listen: '允许其他设备连接（listen）',
            whitelistMode: '启用白名单保护（whitelistMode）',
            whitelist: '允许访问的地址（whitelist）',
        };
        const displayValue = value => typeof value === 'boolean'
            ? (value ? '开启' : '关闭')
            : Array.isArray(value) ? value.join('、') : String(value);
        output.textContent = preview.changes.length
            ? preview.changes.map(change => `${fieldLabels[change.field] ?? change.field}\n当前：${displayValue(change.before)}\n修改后：${displayValue(change.after)}`).join('\n\n')
            : '无需修改：目标配置已经存在。';
        if (preview.applyBlockedReasons?.length) {
            output.textContent += `\n\n暂时不能自动应用：\n${preview.applyBlockedReasons.join('\n')}`;
        }
        applyButton.hidden = !preview.canApply;
        applyButton.disabled = !preview.canApply;
    } catch (error) {
        output.textContent = error.message;
    }
}

function invalidateBackendPreview(panel) {
    panel.backendPreview = null;
    panel.querySelector('#cross-device-access-backend-diff').hidden = true;
    panel.querySelector('#cross-device-access-backend-apply').hidden = true;
    panel.querySelector('#cross-device-access-backend-result').hidden = true;
}

function renderRestartSteps(container, heading) {
    container.replaceChildren();
    const title = document.createElement('b');
    title.textContent = heading;
    const list = document.createElement('ol');
    for (const text of [
        '保存正在进行的聊天，回到服务器设备上运行酒馆的 Termux。',
        '点底部 CTRL，再按键盘 C；看到 ~/SillyTavern $ 后继续。',
        '复制下方官方通用启动命令，粘贴到 Termux 后回车。',
        '酒馆重新打开后，回到这里点击“重新检查后端”。',
    ]) {
        const item = document.createElement('li');
        item.textContent = text;
        list.append(item);
    }
    const commandBox = document.createElement('input');
    commandBox.className = 'text_pole';
    commandBox.readOnly = true;
    commandBox.value = DEFAULT_START_COMMAND;
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'menu_button cross-device-access-helper__copy-start';
    copyButton.textContent = '复制启动命令';
    const copyStatus = document.createElement('small');
    copyButton.addEventListener('click', () => void copyText(DEFAULT_START_COMMAND, copyStatus, '启动命令已复制。'));
    container.append(title, list, commandBox, copyButton, copyStatus);
    container.hidden = false;
}

async function applyBackendPreview(panel) {
    const previewState = panel.backendPreview;
    const currentIp = panel.querySelector('#cross-device-access-backend-device-ip').value.trim();
    const currentMode = getBackendMode(panel);
    if (!previewState || previewState.deviceIp !== currentIp || previewState.mode !== currentMode) {
        await showBackendPreview(panel);
        return;
    }
    const confirmed = window.confirm(
        '即将只修改 listen、whitelistMode 和 whitelist。\n\n'
        + '操作会先创建配置备份，不会修改端口、认证或其他字段，也不会自动重启酒馆。\n\n确认应用这次预览吗？',
    );
    if (!confirmed) return;

    const button = panel.querySelector('#cross-device-access-backend-apply');
    const result = panel.querySelector('#cross-device-access-backend-result');
    button.disabled = true;
    button.textContent = '正在安全写入…';
    try {
        const applied = await applyBackendChange(previewState.deviceIp, previewState.mode);
        if (applied.changed) {
            renderRestartSteps(result, `配置已安全保存；备份文件：${applied.backupName}`);
        } else {
            result.textContent = '无需修改：当前配置已经符合目标。';
            result.hidden = false;
        }
        panel.backendPreview = null;
        button.hidden = true;
        await detectBackend(panel);
    } catch (error) {
        result.textContent = `没有覆盖原配置：${error.message}`;
        result.hidden = false;
        button.disabled = false;
    } finally {
        button.textContent = '确认并安全应用';
    }
}

async function restoreBackendBackup(panel) {
    const name = panel.backendStatus?.backups?.latestName ?? '最近一次备份';
    const confirmed = window.confirm(
        `将恢复：${name}\n\n恢复前还会先备份当前配置。恢复后通常需要手动重启；如果旧配置没有开放局域网，重启后其他设备可能无法继续访问。\n\n确认恢复吗？`,
    );
    if (!confirmed) return;
    const button = panel.querySelector('#cross-device-access-backend-restore');
    const result = panel.querySelector('#cross-device-access-backend-result');
    button.disabled = true;
    button.textContent = '正在安全恢复…';
    try {
        const restored = await restoreLatestBackendBackup();
        if (restored.changed) {
            renderRestartSteps(result, `已恢复 ${restored.restoredBackupName}；恢复前的当前配置也已备份。`);
        } else {
            result.textContent = '当前配置与最近备份相同，无需恢复。';
            result.hidden = false;
        }
        await detectBackend(panel);
    } catch (error) {
        result.textContent = `没有覆盖原配置：${error.message}`;
        result.hidden = false;
    } finally {
        button.disabled = false;
        button.textContent = '恢复最近一次备份';
    }
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
                    <b>先分清两台设备</b>
                    <div class="cross-device-access-helper__terms">
                        <p><b>服务器设备：</b>安装了 Termux、正在运行 SillyTavern 的这台设备。</p>
                        <p><b>访问设备：</b>你想用来打开酒馆网页的另一台设备。</p>
                    </div>
                    <p><b>目标：</b>让访问设备通过局域网打开服务器设备上的酒馆。</p>
                    <p>安全向导和可选后端并存。按需要展开其中一项，不会互相切换或隐藏。</p>
                </div>

                <details id="cross-device-access-backend-section" class="cross-device-access-helper__main-section">
                    <summary>
                        <span><b>可选：后端功能</b><small>安装后可读取当前状态并预览修改</small></span>
                        <span id="cross-device-access-backend-badge" class="cross-device-access-helper__badge" data-state="unchecked">未检查</span>
                    </summary>
                    <div class="cross-device-access-helper__backend-content cross-device-access-helper__section-content">
                    <p id="cross-device-access-backend-message">展开后会检查一次后端状态；不会后台轮询。</p>
                    <button id="cross-device-access-check-backend" class="menu_button cross-device-access-helper__retry-backend" type="button">
                        重新检查后端
                    </button>
                    <div id="cross-device-access-backend-setup" class="cross-device-access-helper__backend-setup" hidden>
                        <h3>安装可选后端组件</h3>
                        <p><b>为什么要安装：</b>后端可以读取当前配置和服务器设备局域网 IP；在你查看预览并二次确认后，自动备份、修改或恢复配置。</p>
                        <p class="cross-device-access-helper__risk"><b>权限风险：</b>所有 SillyTavern 服务器插件都没有沙箱，会继承酒馆 Node 进程的文件与网络权限。你可以继续使用下方安全向导，不安装也不影响基本功能。</p>
                        <ol>
                            <li>保存聊天，回到服务器设备上运行酒馆的 Termux。</li>
                            <li>点底部 <b>CTRL</b>，再按键盘 <b>C</b>。看到 <code>~/SillyTavern $</code> 后继续。</li>
                            <li>复制并粘贴下面整段命令。成功后复制下方官方通用启动命令，粘贴并回车。</li>
                        </ol>
                        <textarea id="cross-device-access-backend-install-command" class="text_pole" rows="11" readonly spellcheck="false"></textarea>
                        <button id="cross-device-access-copy-backend-install" class="menu_button" type="button">复制后端安装命令</button>
                        <div id="cross-device-access-backend-copy-status" class="cross-device-access-helper__copy-status" role="status"></div>
                        <input id="cross-device-access-backend-start-command" class="text_pole" type="text" readonly spellcheck="false">
                        <button id="cross-device-access-copy-backend-start" class="menu_button" type="button">复制官方通用启动命令</button>
                        <div id="cross-device-access-backend-start-status" class="cross-device-access-helper__copy-status" role="status"></div>
                        <p><a href="${BACKEND_SOURCE_URL}" target="_blank" rel="noopener noreferrer">查看后端开源代码和权限说明</a></p>
                    </div>

                    <section id="cross-device-access-backend-dashboard" class="cross-device-access-helper__backend-dashboard" hidden>
                    <h3>后端配置面板</h3>
                    <div id="cross-device-access-backend-summary"></div>
                    <details class="cross-device-access-helper__device-ip-help">
                        <summary>如何找到访问设备的 IPv4？</summary>
                        <p>请在<b>访问设备</b>上查看，不是在服务器设备上查看。</p>
                        <details>
                            <summary>服务器设备使用流量并开启热点</summary>
                            <p>让访问设备连接服务器设备开启的热点，然后在访问设备的 Wi‑Fi 详情中查看：</p>
                            <ul>
                                <li><b>“IP 地址”</b>是访问设备 IP，填写到下方白名单输入框。</li>
                                <li><b>“路由器”或“IPv4 默认网关”</b>是服务器设备的热点 IP，用来打开 <code>http://这个地址:8000</code>。</li>
                            </ul>
                            <p>不要使用手机设置里显示的流量 IP，也不要用网页查询到的公网 IP；本助手只处理热点形成的本地局域网。</p>
                        </details>
                        <details>
                            <summary>访问设备是 iPad / iPhone</summary>
                            <ol>
                                <li>打开“设置” → “无线局域网”。</li>
                                <li>点当前 Wi‑Fi 右侧的 ⓘ。</li>
                                <li>找到“IPv4 地址”里的“IP 地址”。</li>
                            </ol>
                        </details>
                        <details>
                            <summary>访问设备是 Windows 电脑</summary>
                            <ol>
                                <li>打开“设置” → “网络和 Internet”。</li>
                                <li>进入当前连接的 Wi‑Fi 或以太网属性。</li>
                                <li>找到“IPv4 地址”。</li>
                            </ol>
                        </details>
                    </details>
                    <label for="cross-device-access-backend-device-ip"><b>访问设备 IPv4</b></label>
                    <input id="cross-device-access-backend-device-ip" class="text_pole" type="text" inputmode="decimal"
                        maxlength="15" placeholder="例如：192.168.123.17" autocomplete="off" spellcheck="false">
                    <fieldset class="cross-device-access-helper__modes">
                        <label class="checkbox_label"><input type="radio" name="cross-device-backend-mode" value="single" checked><span>仅允许这一台设备（推荐）</span></label>
                        <label class="checkbox_label"><input type="radio" name="cross-device-backend-mode" value="network"><span>允许当前 /24 可信局域网</span></label>
                    </fieldset>
                    <button id="cross-device-access-backend-preview" class="menu_button" type="button">查看修改预览</button>
                    <pre id="cross-device-access-backend-diff" hidden></pre>
                    <button id="cross-device-access-backend-apply" class="menu_button cross-device-access-helper__apply" type="button" hidden>确认并安全应用</button>
                    <p class="cross-device-access-helper__write-boundary">自动操作严格限制为 <code>listen</code>、<code>whitelistMode</code> 和 <code>whitelist</code>；先备份、再验证临时文件，成功后才替换原配置。</p>
                    <section id="cross-device-access-backend-recovery" class="cross-device-access-helper__backend-recovery" hidden>
                        <h4>恢复配置</h4>
                        <p id="cross-device-access-backend-backup-status"></p>
                        <button id="cross-device-access-backend-restore" class="menu_button" type="button" hidden>恢复最近一次备份</button>
                    </section>
                    <div id="cross-device-access-backend-result" class="cross-device-access-helper__operation-result" role="status" hidden></div>
                    </section>
                    </div>
                </details>

                <details id="cross-device-access-safe-section" class="cross-device-access-helper__main-section" open>
                <summary>
                    <span><b>安全配置向导</b><small>无需后端，只生成由你手动执行的安全命令</small></span>
                    <span class="cross-device-access-helper__badge cross-device-access-helper__badge--safe">默认推荐</span>
                </summary>
                <div id="cross-device-access-safe-workflow" class="cross-device-access-helper__section-content">
                <p class="cross-device-access-helper__safe-intro">下面四步始终可用。收起本区不会清空已经填写的内容。</p>

                <section class="cross-device-access-helper__step">
                    <h3><span>1</span> 找到访问设备的 IP</h3>
                    <p>请在<b>访问设备</b>上查看，不是在服务器设备上查看。</p>
                    <details>
                        <summary>服务器设备使用流量并开启热点时怎么看？</summary>
                        <p>让访问设备连接服务器设备开启的热点，然后在访问设备的 Wi‑Fi 详情中查看：</p>
                        <ul>
                            <li><b>“IP 地址”</b>是访问设备 IP，填写到下方白名单输入框。</li>
                            <li><b>“路由器”或“IPv4 默认网关”</b>是服务器设备的热点 IP，第 4 步会用它生成酒馆网址。</li>
                        </ul>
                        <p>不要使用手机设置里显示的流量 IP，也不要用网页查询到的公网 IP；本助手只处理热点形成的本地局域网。</p>
                    </details>
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
                                <li>看到“配置修改成功”后，复制下方官方通用启动命令，粘贴并回车。</li>
                            </ol>
                        </div>
                        <button id="cross-device-access-copy-apply" class="menu_button" type="button">复制配置步骤</button>
                        <input id="cross-device-access-safe-start-command" class="text_pole" type="text" readonly spellcheck="false">
                        <button id="cross-device-access-copy-safe-start" class="menu_button" type="button">复制官方通用启动命令</button>
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
                    <h3><span>4</span> 生成访问设备要打开的网址</h3>
                    <p>这里需要的是<b>服务器设备自己的 IP</b>，它与第 1 步的访问设备 IP 不同。</p>
                    <details open>
                        <summary>服务器设备 IP 怎么看？</summary>
                        <ol>
                            <li>打开服务器设备的“设置” → “WLAN / Wi‑Fi”。</li>
                            <li>点当前已连接的 Wi‑Fi 或“网络详情”。</li>
                            <li>找到“IP 地址”或“IPv4 地址”。不同服务器设备的设置名称可能略有不同。</li>
                        </ol>
                    </details>
                    <details>
                        <summary>服务器设备正在使用流量并开启热点</summary>
                        <p>请在已连接该热点的<b>访问设备</b>上打开 Wi‑Fi 详情，找到“路由器”或“IPv4 默认网关”。这个地址就是此处要填写的服务器设备热点 IP。</p>
                        <p>例如访问设备显示 IP 地址 <code>192.168.43.26</code>、路由器 <code>192.168.43.1</code>：白名单填写前者，此处填写后者，最终访问 <code>http://192.168.43.1:8000</code>。</p>
                    </details>
                    <label for="cross-device-access-server-ip"><b>服务器设备的 IPv4 地址</b></label>
                    <input id="cross-device-access-server-ip" class="text_pole" type="text" inputmode="decimal"
                        maxlength="15" placeholder="例如：192.168.123.10" autocomplete="off"
                        autocapitalize="off" spellcheck="false" aria-describedby="cross-device-access-server-validation">
                    <div id="cross-device-access-server-validation" class="cross-device-access-helper__status"
                        role="status" aria-live="polite">当前页面使用本机地址，浏览器无法自动读取服务器设备的 Wi‑Fi IP，请按上方教程查看。</div>
                    <div id="cross-device-access-url-box" class="cross-device-access-helper__url-box" hidden>
                        <label for="cross-device-access-url"><b>在访问设备的浏览器打开</b></label>
                        <input id="cross-device-access-url" class="text_pole" type="text" readonly spellcheck="false">
                        <button id="cross-device-access-copy-url" class="menu_button" type="button" disabled>复制访问网址</button>
                    </div>
                    <details>
                        <summary>为什么不能总是自动检测服务器设备 IP？</summary>
                        <p>当酒馆通过 <code>127.0.0.1</code> 打开时，网页只能看到这个本机地址。浏览器不会向普通网页公开服务器设备的 Wi‑Fi 网卡地址。若以后通过局域网地址打开，本助手会自动识别。</p>
                    </details>
                </section>

                </div>
                </details>

                <p class="cross-device-access-helper__privacy">隐私：不保存输入、不调用模型、无遥测。仅为检测可选后端而请求当前酒馆的固定同源接口，不连接外部服务。</p>
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

    panel.querySelector('#cross-device-access-backend-install-command').value = BACKEND_INSTALL_COMMAND;
    panel.querySelector('#cross-device-access-backend-start-command').value = DEFAULT_START_COMMAND;
    panel.querySelector('#cross-device-access-copy-backend-install').addEventListener('click', () => {
        void copyText(BACKEND_INSTALL_COMMAND,
            panel.querySelector('#cross-device-access-backend-copy-status'),
            '后端安装命令已复制。请先停止酒馆，再粘贴到 Termux。');
    });
    panel.querySelector('#cross-device-access-copy-backend-start').addEventListener('click', () => {
        void copyText(DEFAULT_START_COMMAND,
            panel.querySelector('#cross-device-access-backend-start-status'),
            '官方通用启动命令已复制。粘贴到 Termux 后按回车。');
    });
    panel.querySelector('#cross-device-access-backend-preview').addEventListener('click', () => {
        void showBackendPreview(panel);
    });
    panel.querySelector('#cross-device-access-backend-apply').addEventListener('click', () => {
        void applyBackendPreview(panel);
    });
    panel.querySelector('#cross-device-access-backend-restore').addEventListener('click', () => {
        void restoreBackendBackup(panel);
    });
    panel.querySelector('#cross-device-access-backend-device-ip').addEventListener('input', () => {
        invalidateBackendPreview(panel);
        if (panel.backendStatus) renderBackendSummary(panel, panel.backendStatus);
    });
    panel.querySelectorAll('input[name="cross-device-backend-mode"]').forEach((radio) => {
        radio.addEventListener('change', () => invalidateBackendPreview(panel));
    });
    panel.querySelector('#cross-device-access-check-backend').addEventListener('click', () => {
        void detectBackend(panel);
    });
    panel.querySelector('#cross-device-access-backend-section').addEventListener('toggle', (event) => {
        if (event.currentTarget.open && event.currentTarget.dataset.checked !== 'true') {
            event.currentTarget.dataset.checked = 'true';
            void detectBackend(panel);
        }
    });

    panel.querySelector('#cross-device-access-device-ip').addEventListener('input', () => updateClientValidation(panel));
    panel.querySelector('#cross-device-access-safe-start-command').value = DEFAULT_START_COMMAND;
    panel.querySelectorAll('input[name="cross-device-access-mode"]').forEach((radio) => {
        radio.addEventListener('change', () => updateClientValidation(panel));
    });
    panel.querySelector('#cross-device-access-generate').addEventListener('click', () => generateCommandOutput(panel));
    panel.querySelector('#cross-device-access-copy-apply').addEventListener('click', () => {
        void copyText(panel.querySelector('#cross-device-access-apply-command').value,
            panel.querySelector('#cross-device-access-copy-status'),
            '配置步骤已复制。请先停止酒馆，再粘贴到 Termux 执行。');
    });
    panel.querySelector('#cross-device-access-copy-safe-start').addEventListener('click', () => {
        void copyText(DEFAULT_START_COMMAND,
            panel.querySelector('#cross-device-access-copy-status'),
            '官方通用启动命令已复制。粘贴到 Termux 后按回车。');
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
