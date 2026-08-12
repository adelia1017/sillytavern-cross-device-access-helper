import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseDocument } from 'yaml';

import { generateCommands } from '../command-generator.js';
import { validateDeviceIp } from '../ip-utils.js';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const testRoot = fs.mkdtempSync(path.join(projectRoot, '.integration-test-'));
const originalCwd = process.cwd();
const originalArg = process.argv[2];
const originalExitCode = process.exitCode;
let importCounter = 0;

function extractScript(command, fsyncBehavior = 'real') {
    const marker = "<<'ST_CROSS_DEVICE_HELPER'\n";
    const start = command.indexOf(marker);
    const end = command.lastIndexOf('\nST_CROSS_DEVICE_HELPER');
    assert.notEqual(start, -1, '找不到命令脚本开头');
    assert.notEqual(end, -1, '找不到命令脚本结尾');
    const script = command.slice(start + marker.length, end);
    if (fsyncBehavior === 'simulate-success') {
        return script.replaceAll(/fs\.fsyncSync\((?:tempHandle|backupHandle|safetyHandle)\);/g, '/* integration test: simulate successful fsync */');
    }
    if (fsyncBehavior === 'simulate-failure') {
        return script.replace(
            'fs.fsyncSync(tempHandle);',
            "throw Object.assign(new Error('injected fsync failure'), { code: 'EIO' });",
        );
    }
    return script;
}

async function executeGenerated(command, directory, target, fsyncBehavior = 'real') {
    const scriptPath = path.join(testRoot, `generated-${importCounter++}.mjs`);
    fs.writeFileSync(scriptPath, extractScript(command, fsyncBehavior), 'utf8');
    process.chdir(directory);
    if (target === undefined) delete process.argv[2];
    else process.argv[2] = target;
    process.exitCode = 0;
    await import(`${pathToFileURL(scriptPath).href}?run=${importCounter}`);
    return process.exitCode ?? 0;
}

function readConfig(directory) {
    const source = fs.readFileSync(path.join(directory, 'config.yaml'), 'utf8');
    const doc = parseDocument(source, { uniqueKeys: true });
    assert.equal(doc.errors.length, 0);
    return { source, value: doc.toJS() };
}

try {
    const original = [
        '# integration fixture',
        'listen: false',
        'whitelistMode: true',
        'whitelist:',
        '  - 127.0.0.1',
        '  - 192.168.50.8',
        'port: 8123',
        'nested:',
        '  keep: unchanged',
        '',
    ].join('\n');

    const successDir = path.join(testRoot, 'success');
    fs.mkdirSync(successDir);
    fs.writeFileSync(path.join(successDir, 'config.yaml'), original, 'utf8');

    const validation = validateDeviceIp('192.168.123.17');
    const commands = generateCommands(validation, 'single');
    assert.equal(await executeGenerated(commands.apply, successDir, commands.target, 'simulate-success'), 0);

    const changed = readConfig(successDir);
    assert.equal(changed.value.listen, true);
    assert.equal(changed.value.whitelistMode, true);
    assert.deepEqual(changed.value.whitelist, ['::1', '127.0.0.1', '192.168.50.8', '192.168.123.17']);
    assert.equal(changed.value.port, 8123);
    assert.deepEqual(changed.value.nested, { keep: 'unchanged' });

    const backups = fs.readdirSync(successDir).filter(name => name.includes('cross-device-access-helper-backup'));
    assert.equal(backups.length, 1);
    assert.equal(fs.readFileSync(path.join(successDir, backups[0]), 'utf8'), original);

    assert.equal(await executeGenerated(commands.restore, successDir, undefined, 'simulate-success'), 0);
    assert.equal(fs.readFileSync(path.join(successDir, 'config.yaml'), 'utf8'), original);
    assert.equal(fs.readdirSync(successDir).filter(name => name.includes('pre-restore')).length, 1);

    const duplicateDir = path.join(testRoot, 'duplicate');
    fs.mkdirSync(duplicateDir);
    const duplicateSource = 'listen: false\nlisten: true\nwhitelistMode: true\nwhitelist:\n  - 127.0.0.1\n';
    fs.writeFileSync(path.join(duplicateDir, 'config.yaml'), duplicateSource, 'utf8');

    assert.equal(await executeGenerated(commands.apply, duplicateDir, commands.target, 'simulate-success'), 1);
    process.exitCode = 0;
    assert.equal(fs.readFileSync(path.join(duplicateDir, 'config.yaml'), 'utf8'), duplicateSource);
    assert.equal(fs.readdirSync(duplicateDir).filter(name => name.includes('backup')).length, 0);
    assert.equal(fs.readdirSync(duplicateDir).filter(name => name.endsWith('.tmp')).length, 0);

    const failureDir = path.join(testRoot, 'injected-failure');
    fs.mkdirSync(failureDir);
    fs.writeFileSync(path.join(failureDir, 'config.yaml'), original, 'utf8');
    assert.equal(await executeGenerated(commands.apply, failureDir, commands.target, 'simulate-failure'), 1);
    process.exitCode = 0;
    assert.equal(fs.readFileSync(path.join(failureDir, 'config.yaml'), 'utf8'), original);
    assert.equal(fs.readdirSync(failureDir).filter(name => name.includes('backup')).length, 0);
    assert.equal(fs.readdirSync(failureDir).filter(name => name.endsWith('.tmp')).length, 0);

    console.log('✔ 隔离集成测试：安全修改、字段保留、重复键拒绝、失败保护、备份恢复全部通过');
} finally {
    process.chdir(originalCwd);
    if (originalArg === undefined) delete process.argv[2];
    else process.argv[2] = originalArg;
    process.exitCode = originalExitCode;

    const resolvedTestRoot = path.resolve(testRoot);
    assert.equal(path.dirname(resolvedTestRoot), projectRoot);
    assert.match(path.basename(resolvedTestRoot), /^\.integration-test-/);
    fs.rmSync(resolvedTestRoot, { recursive: true, force: true });
}
