const API_ROOT = '/api/plugins/cross-device-access-helper-backend';
const BACKEND_REPOSITORY = 'https://github.com/adelia1017/sillytavern-cross-device-access-helper-backend';

export const BACKEND_INSTALL_COMMAND = `cd "$HOME/SillyTavern" || { echo "未找到 ~/SillyTavern"; exit 1; }
PLUGIN_DIR="$PWD/plugins/cross-device-access-helper-backend"
if [ -d "$PLUGIN_DIR/.git" ]; then
  git -C "$PLUGIN_DIR" pull --ff-only || exit 1
elif [ -e "$PLUGIN_DIR" ]; then
  echo "停止：目标位置已存在且不是 Git 仓库：$PLUGIN_DIR"
  exit 1
else
  git clone ${BACKEND_REPOSITORY}.git "$PLUGIN_DIR" || exit 1
fi
node "$PLUGIN_DIR/scripts/enable-server-plugins.mjs"`;

export class BackendApiError extends Error {
    constructor(message, { backendReached = false, code = 'UNKNOWN', status = 0 } = {}) {
        super(message);
        this.name = 'BackendApiError';
        this.backendReached = backendReached;
        this.code = code;
        this.status = status;
    }
}

async function readJson(response) {
    const value = await response.json().catch(() => null);
    if (!response.ok || !value?.ok) {
        throw new BackendApiError(value?.error?.message ?? `请求失败（HTTP ${response.status}）`, {
            backendReached: response.status !== 404 && typeof value?.error?.code === 'string',
            code: value?.error?.code ?? 'HTTP_ERROR',
            status: response.status,
        });
    }
    return value.data;
}

export async function getBackendStatus() {
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(5000) : undefined;
    try {
        const response = await fetch(`${API_ROOT}/status`, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
            signal,
        });
        return readJson(response);
    } catch (error) {
        if (error instanceof BackendApiError) throw error;
        throw new BackendApiError('未连接到后端组件。', { backendReached: false, code: 'UNREACHABLE' });
    }
}

async function getCsrfHeaders() {
    const response = await fetch('/csrf-token', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('无法取得酒馆的 CSRF 令牌，请刷新页面重试。');
    const value = await response.json();
    if (typeof value?.token !== 'string') throw new Error('酒馆返回的 CSRF 令牌无效。');
    return { 'Content-Type': 'application/json', 'X-CSRF-Token': value.token };
}

export async function previewBackendChange(deviceIp, mode) {
    return postBackend('/preview-change', { deviceIp, mode });
}

async function postBackend(endpoint, body) {
    const response = await fetch(`${API_ROOT}${endpoint}`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: await getCsrfHeaders(),
        body: JSON.stringify(body),
    });
    return readJson(response);
}

export async function applyBackendChange(deviceIp, mode) {
    return postBackend('/apply-lan-settings', { deviceIp, mode });
}

export async function restoreLatestBackendBackup() {
    return postBackend('/restore-latest-backup', {});
}

export const BACKEND_SOURCE_URL = BACKEND_REPOSITORY;
