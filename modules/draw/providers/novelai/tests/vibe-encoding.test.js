import assert from 'node:assert/strict';
import test from 'node:test';
import { createVibeEncodingService } from '../vibe-encoding.js';

// Acceptance (double billing / encoding loss): reopening the UI cannot duplicate
// a paid request; completion persists without the iframe; only explicit force re-encodes.
test('host owns in-flight encoding and reuses persisted results after iframe replacement', async () => {
    let release;
    let calls = 0;
    let item = { id: 'one', image: 'image', encodings: {} };
    const service = createVibeEncodingService({
        readItem: () => item,
        encode: () => { calls++; return new Promise(resolve => { release = resolve; }); },
        save: async (_input, key, encoding) => { item.encodings[key] = encoding; return true; },
    });
    const input = { id: 'one', image: 'image', model: 'nai-diffusion-4-5-full', informationExtracted: .65 };
    const first = service.run(input);
    await Promise.resolve();
    item = structuredClone(item);
    const reopened = service.run(input);
    assert.equal(calls, 1);
    release('paid');
    assert.deepEqual(await first, await reopened);
    assert.deepEqual(service.activeIds(), []);
    assert.equal((await service.run(input)).encoding, 'paid');
    assert.equal(calls, 1);
    const forced = service.run({ ...input, force: true });
    await Promise.resolve();
    assert.equal(calls, 2);
    release('new-paid');
    assert.equal((await forced).encoding, 'new-paid');
});
test('encoding uses the host library image when the iframe snapshot is stale', async () => {
    const item = { id: 'one', image: 'host-image', encodings: {} };
    let encodedInput;
    const service = createVibeEncodingService({
        readItem: () => item,
        encode: async input => { encodedInput = input; return 'encoding'; },
        save: async () => true,
    });

    const result = await service.run({
        id: 'one', image: 'stale-iframe-image', model: 'nai-diffusion-4-5-full', informationExtracted: 0.65,
    });

    assert.equal(encodedInput.image, 'host-image');
    assert.equal(result.encoding, 'encoding');
});

test('missing Vibe item has a specific error', async () => {
    const service = createVibeEncodingService({ readItem: () => null, encode: async () => 'unused', save: async () => true });

    await assert.rejects(
        service.run({ id: 'missing', image: 'image', model: 'nai-diffusion-4-5-full' }),
        /参考素材不存在或已删除/,
    );
});

test('missing image has a specific error', async () => {
    const service = createVibeEncodingService({
        readItem: () => ({ id: 'one', image: '', encodings: {} }),
        encode: async () => 'unused', save: async () => true,
    });

    await assert.rejects(
        service.run({ id: 'one', image: 'image', model: 'nai-diffusion-4-5-full' }),
        /参考素材缺少原图/,
    );
});

test('unsupported Vibe model has a specific error', async () => {
    const service = createVibeEncodingService({
        readItem: () => ({ id: 'one', image: 'host-image', encodings: {} }),
        encode: async () => 'unused', save: async () => true,
    });

    await assert.rejects(
        service.run({ id: 'one', image: 'host-image', model: 'nai-diffusion-5-full' }),
        /当前模型不支持 Vibe 编码/,
    );
});
