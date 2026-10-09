/** Base64 в байты — без `atob`: он есть не во всех сборках движка. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = (() => {
    const table = new Uint8Array(256);
    for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
    return table;
})();

export function base64ToBytes(base64: string): Uint8Array {
    const clean = base64.replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/]/g, '');
    const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
    let o = 0;
    for (let i = 0; i + 1 < clean.length; i += 4) {
        const a = LOOKUP[clean.charCodeAt(i)];
        const b = LOOKUP[clean.charCodeAt(i + 1)];
        const c = i + 2 < clean.length ? LOOKUP[clean.charCodeAt(i + 2)] : 0;
        const d = i + 3 < clean.length ? LOOKUP[clean.charCodeAt(i + 3)] : 0;
        out[o++] = (a << 2) | (b >> 4);
        if (i + 2 < clean.length) out[o++] = ((b & 15) << 4) | (c >> 2);
        if (i + 3 < clean.length) out[o++] = ((c & 3) << 6) | d;
    }
    return out.subarray(0, o);
}
