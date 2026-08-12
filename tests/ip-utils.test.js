import test from 'node:test';
import assert from 'node:assert/strict';

import { isPrivateIpv4, parseIpv4, validateDeviceIp } from '../ip-utils.js';

test('parseIpv4 parses canonical IPv4 addresses', () => {
    assert.deepEqual(parseIpv4('192.168.123.17'), [192, 168, 123, 17]);
    assert.deepEqual(parseIpv4(' 10.2.3.4 '), [10, 2, 3, 4]);
});

test('parseIpv4 rejects malformed or ambiguous values', () => {
    for (const value of [
        '', '192.168.1', '192.168.1.2.3', '192.168.1.256',
        '192.168.01.2', '192.168.1.-1', '192.168.1.a', '0xC0.168.1.2',
    ]) {
        assert.equal(parseIpv4(value), null, value);
    }
});

test('isPrivateIpv4 accepts only RFC 1918 ranges used by version one', () => {
    for (const value of ['10.0.0.1', '10.255.255.254', '172.16.0.1', '172.31.255.254', '192.168.0.1']) {
        assert.equal(isPrivateIpv4(parseIpv4(value)), true, value);
    }

    for (const value of ['9.255.255.254', '172.15.0.1', '172.32.0.1', '192.167.1.1', '8.8.8.8', '127.0.0.1']) {
        assert.equal(isPrivateIpv4(parseIpv4(value)), false, value);
    }
});

test('validateDeviceIp returns the canonical address and its /24 subnet', () => {
    assert.deepEqual(validateDeviceIp(' 192.168.123.17 '), {
        valid: true,
        code: 'valid',
        message: '客户端 IPv4 地址有效。',
        ip: '192.168.123.17',
        subnet24: '192.168.123.0/24',
    });
});

test('validateDeviceIp rejects empty and public addresses', () => {
    assert.equal(validateDeviceIp('').code, 'empty');
    assert.equal(validateDeviceIp('8.8.8.8').code, 'not-private');
});

test('validateDeviceIp does not assume that .0 and .255 are invalid under every subnet mask', () => {
    assert.equal(validateDeviceIp('192.168.1.0').valid, true);
    assert.equal(validateDeviceIp('192.168.1.255').valid, true);
});
