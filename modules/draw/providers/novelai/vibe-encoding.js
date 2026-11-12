import { clampVibeInfoExtracted, getVibeModelKey, vibeEncodingKey } from './vibe.js';

// One host session owns paid encoding work, not a settings iframe. No running
// flag is persisted; the saved library owns completed encodings.
export function createVibeEncodingService({ readItem, encode, save }) {
    const pending = new Map();
    return {
        activeIds: () => [...pending.keys()],
        async run(input) {
            const item = readItem(input.id);
            if (!item) throw new Error('参考素材不存在或已删除，请刷新后重试');
            if (typeof item.image !== 'string' || !item.image) throw new Error('参考素材缺少原图，请重新添加参考图');
            const modelKey = getVibeModelKey(input.model);
            if (!modelKey) throw new Error('当前模型不支持 Vibe 编码，请切换到 V4 或 V4.5');
            const informationExtracted = clampVibeInfoExtracted(input.informationExtracted);
            const key = vibeEncodingKey(modelKey, informationExtracted);
            const active = pending.get(item.id);
            if (active) {
                if (active.key !== key) throw new Error('此参考图正在编码，请等待完成');
                return active.promise;
            }
            if (!input.force && item.encodings?.[key]) return { id: item.id, key, encoding: item.encodings[key], saved: true };
            const snapshot = { ...input, image: item.image, informationExtracted };
            const promise = Promise.resolve().then(async () => {
                const encoding = await encode(snapshot);
                const saved = await save(snapshot, key, encoding);
                return { id: item.id, key, encoding, saved };
            }).finally(() => pending.delete(item.id));
            pending.set(item.id, { key, promise });
            return promise;
        },
    };
}
