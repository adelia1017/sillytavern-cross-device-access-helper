import { copyFile, mkdir } from 'node:fs/promises';

await mkdir(new URL('../vendor/', import.meta.url), { recursive: true });
await copyFile(
    new URL('../node_modules/qrcode-generator/dist/qrcode.mjs', import.meta.url),
    new URL('../vendor/qrcode.mjs', import.meta.url),
);
