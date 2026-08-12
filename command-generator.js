const APPLY_SCRIPT = String.raw`import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { isMap, parseDocument } from 'yaml';

const target = process.argv[2];
const configPath = path.resolve('config.yaml');
const stamp = new Date().toISOString().replace(/[-:TZ]/g, '').replace('.', '-');
const backupPath = path.resolve('config.yaml.cross-device-access-helper-backup-' + stamp + '.bak');
const tempPath = path.resolve('.config.yaml.cross-device-access-helper-' + process.pid + '-' + stamp + '.tmp');
const allowedKeys = new Set(['listen', 'whitelistMode', 'whitelist']);

function fail(message) {
    throw new Error(message);
}

function validateTarget(value) {
    const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(\/24)?$/.exec(value ?? '');
    if (!match) return false;

    const octets = match.slice(1, 5).map(Number);
    if (octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;

    const isPrivate = octets[0] === 10
        || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
        || (octets[0] === 192 && octets[1] === 168);
    if (!isPrivate) return false;

    return match[5] === '/24' ? octets[3] === 0 : true;
}

function parseSafely(source, label) {
    const doc = parseDocument(source, { uniqueKeys: true, prettyErrors: true });
    if (doc.errors.length > 0) {
        fail(label + ' YAML 无法安全解析：\n' + doc.errors.map(error => '- ' + error.message).join('\n'));
    }
    if (!isMap(doc.contents)) {
        fail(label + ' YAML 根节点不是映射对象。');
    }
    return doc;
}

function withoutAllowedKeys(value) {
    const copy = structuredClone(value);
    for (const key of allowedKeys) delete copy[key];
    return copy;
}

let tempCreated = false;
try {
    if (!validateTarget(target)) {
        fail('内部目标地址校验失败，未修改任何文件。');
    }

    const fileInfo = fs.lstatSync(configPath);
    if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) {
        fail('config.yaml 必须是普通文件，且不能是符号链接。');
    }

    const originalSource = fs.readFileSync(configPath, 'utf8');
    const doc = parseSafely(originalSource, '原始 config.yaml');
    const originalValue = doc.toJS({ maxAliasCount: 100 });

    if (typeof originalValue !== 'object' || originalValue === null || Array.isArray(originalValue)) {
        fail('config.yaml 根节点必须是对象。');
    }
    if ('listen' in originalValue && typeof originalValue.listen !== 'boolean') {
        fail('listen 当前不是布尔值，拒绝自动修改。');
    }
    if ('whitelistMode' in originalValue && typeof originalValue.whitelistMode !== 'boolean') {
        fail('whitelistMode 当前不是布尔值，拒绝自动修改。');
    }
    if ('whitelist' in originalValue && !Array.isArray(originalValue.whitelist)) {
        fail('whitelist 当前不是列表，拒绝自动修改。');
    }

    const existing = originalValue.whitelist ?? [];
    if (!existing.every(item => typeof item === 'string')) {
        fail('whitelist 包含非文本项目，拒绝自动修改。');
    }

    const whitelist = [...new Set(['::1', '127.0.0.1', ...existing, target])];
    doc.set('listen', true);
    doc.set('whitelistMode', true);
    doc.set('whitelist', whitelist);

    const nextSource = String(doc);
    fs.writeFileSync(tempPath, nextSource, { encoding: 'utf8', flag: 'wx', mode: fileInfo.mode });
    tempCreated = true;

    const tempHandle = fs.openSync(tempPath, 'r');
    try {
        fs.fsyncSync(tempHandle);
    } finally {
        fs.closeSync(tempHandle);
    }

    const verifiedDoc = parseSafely(fs.readFileSync(tempPath, 'utf8'), '临时配置');
    const verifiedValue = verifiedDoc.toJS({ maxAliasCount: 100 });
    if (verifiedValue.listen !== true || verifiedValue.whitelistMode !== true) {
        fail('临时配置中的安全开关验证失败。');
    }
    if (!Array.isArray(verifiedValue.whitelist) || !['::1', '127.0.0.1', target].every(item => verifiedValue.whitelist.includes(item))) {
        fail('临时配置中的白名单验证失败。');
    }
    if (!isDeepStrictEqual(withoutAllowedKeys(originalValue), withoutAllowedKeys(verifiedValue))) {
        fail('检测到允许范围之外的配置变化，拒绝替换。');
    }

    fs.copyFileSync(configPath, backupPath, fs.constants.COPYFILE_EXCL);
    if (!fs.readFileSync(backupPath).equals(Buffer.from(originalSource, 'utf8'))) {
        fail('备份内容校验失败，拒绝替换原配置。');
    }
    const backupHandle = fs.openSync(backupPath, 'r');
    try {
        fs.fsyncSync(backupHandle);
    } finally {
        fs.closeSync(backupHandle);
    }
    fs.renameSync(tempPath, configPath);
    tempCreated = false;

    console.log('配置修改成功。');
    console.log('备份文件：' + backupPath);
    console.log('请手动重启 SillyTavern；本命令不会自动重启。');
} catch (error) {
    if (tempCreated) {
        try { fs.unlinkSync(tempPath); } catch {}
    }
    console.error('操作失败：' + error.message);
    console.error('原 config.yaml 未被覆盖。');
    process.exitCode = 1;
}`;

const RESTORE_SCRIPT = String.raw`import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { isMap, parseDocument } from 'yaml';

const directory = process.cwd();
const configPath = path.resolve('config.yaml');
const backupPattern = /^config\.yaml\.cross-device-access-helper-backup-(\d{8}\d{6}-\d{3})\.bak$/;
const stamp = new Date().toISOString().replace(/[-:TZ]/g, '').replace('.', '-');
const safetyPath = path.resolve('config.yaml.cross-device-access-helper-pre-restore-' + stamp + '.bak');
const tempPath = path.resolve('.config.yaml.cross-device-access-helper-restore-' + process.pid + '-' + stamp + '.tmp');

function fail(message) {
    throw new Error(message);
}

function validateYaml(source, label) {
    const doc = parseDocument(source, { uniqueKeys: true, prettyErrors: true });
    if (doc.errors.length > 0) {
        fail(label + ' YAML 无法安全解析：\n' + doc.errors.map(error => '- ' + error.message).join('\n'));
    }
    if (!isMap(doc.contents)) fail(label + ' YAML 根节点不是映射对象。');
}

let tempCreated = false;
try {
    const configInfo = fs.lstatSync(configPath);
    if (!configInfo.isFile() || configInfo.isSymbolicLink()) {
        fail('config.yaml 必须是普通文件，且不能是符号链接。');
    }

    const candidates = fs.readdirSync(directory)
        .filter(name => backupPattern.test(name))
        .sort()
        .reverse();
    if (candidates.length === 0) fail('没有找到本助手创建的配置备份。');

    const backupPath = path.resolve(candidates[0]);
    const backupInfo = fs.lstatSync(backupPath);
    if (!backupInfo.isFile() || backupInfo.isSymbolicLink()) {
        fail('最近的备份不是普通文件，拒绝恢复。');
    }

    const backupSource = fs.readFileSync(backupPath, 'utf8');
    validateYaml(backupSource, '备份');
    fs.writeFileSync(tempPath, backupSource, { encoding: 'utf8', flag: 'wx', mode: configInfo.mode });
    tempCreated = true;
    validateYaml(fs.readFileSync(tempPath, 'utf8'), '恢复临时文件');

    const tempHandle = fs.openSync(tempPath, 'r');
    try {
        fs.fsyncSync(tempHandle);
    } finally {
        fs.closeSync(tempHandle);
    }

    fs.copyFileSync(configPath, safetyPath, fs.constants.COPYFILE_EXCL);
    if (!fs.readFileSync(safetyPath).equals(fs.readFileSync(configPath))) {
        fail('恢复前安全备份校验失败，拒绝替换当前配置。');
    }
    const safetyHandle = fs.openSync(safetyPath, 'r');
    try {
        fs.fsyncSync(safetyHandle);
    } finally {
        fs.closeSync(safetyHandle);
    }
    fs.renameSync(tempPath, configPath);
    tempCreated = false;

    console.log('已恢复备份：' + backupPath);
    console.log('恢复前的配置另存为：' + safetyPath);
    console.log('请手动重启 SillyTavern；本命令不会自动重启。');
} catch (error) {
    if (tempCreated) {
        try { fs.unlinkSync(tempPath); } catch {}
    }
    console.error('恢复失败：' + error.message);
    console.error('当前 config.yaml 未被覆盖。');
    process.exitCode = 1;
}`;

function wrapTermuxCommand(script, args = []) {
    const serializedArgs = args.map(value => `'${value}'`).join(' ');
    const argSuffix = serializedArgs ? ` ${serializedArgs}` : '';
    return `cd -- "$HOME/SillyTavern" || exit 1\nnode --input-type=module -${argSuffix} <<'ST_CROSS_DEVICE_HELPER'\n${script}\nST_CROSS_DEVICE_HELPER`;
}

export function generateCommands(validation, mode) {
    if (!validation?.valid) {
        throw new TypeError('必须先提供经过验证的客户端 IPv4 地址。');
    }
    if (mode !== 'single' && mode !== 'network') {
        throw new TypeError('模式只能是 single 或 network。');
    }

    const target = mode === 'network' ? validation.subnet24 : validation.ip;
    return Object.freeze({
        target,
        apply: wrapTermuxCommand(APPLY_SCRIPT, [target]),
        restore: wrapTermuxCommand(RESTORE_SCRIPT),
    });
}
