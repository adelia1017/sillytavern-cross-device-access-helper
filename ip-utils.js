const PRIVATE_IPV4_RANGES = Object.freeze([
    Object.freeze({ first: 10, secondMin: 0, secondMax: 255 }),
    Object.freeze({ first: 172, secondMin: 16, secondMax: 31 }),
    Object.freeze({ first: 192, secondMin: 168, secondMax: 168 }),
]);

export function parseIpv4(value) {
    const normalized = String(value ?? '').trim();
    const parts = normalized.split('.');

    if (parts.length !== 4) {
        return null;
    }

    const octets = [];
    for (const part of parts) {
        if (!/^(0|[1-9]\d{0,2})$/.test(part)) {
            return null;
        }

        const octet = Number(part);
        if (!Number.isInteger(octet) || octet > 255) {
            return null;
        }

        octets.push(octet);
    }

    return octets;
}

export function isPrivateIpv4(octets) {
    if (!Array.isArray(octets) || octets.length !== 4) {
        return false;
    }

    return PRIVATE_IPV4_RANGES.some((range) => (
        octets[0] === range.first
        && octets[1] >= range.secondMin
        && octets[1] <= range.secondMax
    ));
}

export function validateDeviceIp(value) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
        return Object.freeze({ valid: false, code: 'empty', message: '请输入客户端的 IPv4 地址。' });
    }

    const octets = parseIpv4(normalized);
    if (!octets) {
        return Object.freeze({ valid: false, code: 'format', message: 'IPv4 格式不正确，例如：192.168.123.17。' });
    }

    if (!isPrivateIpv4(octets)) {
        return Object.freeze({
            valid: false,
            code: 'not-private',
            message: '第一版仅接受 10.x、172.16–31.x 或 192.168.x 的私有局域网地址。',
        });
    }

    const ip = octets.join('.');
    return Object.freeze({
        valid: true,
        code: 'valid',
        message: '客户端 IPv4 地址有效。',
        ip,
        subnet24: `${octets[0]}.${octets[1]}.${octets[2]}.0/24`,
    });
}
