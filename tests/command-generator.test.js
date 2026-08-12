import test from 'node:test';
import assert from 'node:assert/strict';

import { generateCommands } from '../command-generator.js';
import { validateDeviceIp } from '../ip-utils.js';

test('single-device mode embeds only the canonical validated device IP', () => {
    const commands = generateCommands(validateDeviceIp('192.168.123.17'), 'single');
    assert.equal(commands.target, '192.168.123.17');
    assert.match(commands.apply, /'192\.168\.123\.17'/);
});

test('network mode embeds the calculated /24 target', () => {
    const commands = generateCommands(validateDeviceIp('172.16.7.42'), 'network');
    assert.equal(commands.target, '172.16.7.0/24');
    assert.match(commands.apply, /'172\.16\.7\.0\/24'/);
});

test('generator rejects invalid input and arbitrary modes', () => {
    assert.throws(() => generateCommands(validateDeviceIp('8.8.8.8'), 'single'));
    assert.throws(() => generateCommands(validateDeviceIp('192.168.1.2'), 'anything'));
});

test('generated apply command has required safety operations', () => {
    const { apply } = generateCommands(validateDeviceIp('10.1.2.3'), 'single');
    for (const required of [
        'parseDocument', 'uniqueKeys: true', 'doc.errors', 'lstatSync', 'isSymbolicLink',
        'writeFileSync(tempPath', "flag: 'wx'", 'fsyncSync', 'copyFileSync',
        'COPYFILE_EXCL', 'renameSync', "doc.set('listen', true)",
        "doc.set('whitelistMode', true)", "doc.set('whitelist', whitelist)",
        "'::1'", "'127.0.0.1'", 'isDeepStrictEqual',
        'function validateTarget', 'octet > 255', "match[5] === '/24'",
        "readFileSync(backupPath).equals", "fs.openSync(backupPath, 'r')",
    ]) {
        assert.ok(apply.includes(required), required);
    }
});

test('generated commands avoid fragile editors, downloads, installs, and restarts', () => {
    const commands = generateCommands(validateDeviceIp('10.1.2.3'), 'single');
    const forbidden = [
        /\bsed\b/i, /\bgrep\b/i, /\bcurl\b/i, /\bwget\b/i,
        /npm\s+install/i, /pkg\s+install/i, /apt\s+install/i,
        /process\.kill/i, /\bpkill\b/i, /\bkillall\b/i,
    ];
    for (const command of [commands.apply, commands.restore]) {
        for (const pattern of forbidden) assert.doesNotMatch(command, pattern);
    }
});

test('restore command selects only helper backups and validates before replacement', () => {
    const { restore } = generateCommands(validateDeviceIp('10.1.2.3'), 'single');
    assert.match(restore, /cross-device-access-helper-backup/);
    assert.match(restore, /validateYaml\(backupSource/);
    assert.match(restore, /cross-device-access-helper-pre-restore/);
    assert.match(restore, /renameSync\(tempPath, configPath\)/);
});
