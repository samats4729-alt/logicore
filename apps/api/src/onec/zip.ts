import { deflateRawSync, inflateRawSync } from 'zlib';

/**
 * Архив zip из одного файла — так 1С упаковывает сообщение обмена перед
 * передачей частями («data.zip», БСП: ПоместитьФайлВХранилищеВСервисе).
 *
 * Полноценная библиотека не нужна: 1С кладёт в архив один файл и читает
 * из нашего только первый. Здесь — запись одного файла со сжатием и чтение
 * первого файла через оглавление архива (размеры у 1С могут стоять только
 * там, а не в заголовке перед данными).
 */

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(data: Buffer): number {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

/** Время и дата в формате MS-DOS — так их хранит zip. */
function dosDateTime(d: Date) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
/** Имя файла в UTF-8. */
const FLAG_UTF8 = 0x0800;

/** Архив с одним файлом, сжатие deflate. */
export function zipOne(name: string, data: Buffer, now = new Date()): Buffer {
    const fileName = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const { time, date } = dosDateTime(now);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    // Дополнительные поля, комментарий, диск, атрибуты, смещение — нули.

    const centralOffset = local.length + fileName.length + packed.length;
    const centralSize = central.length + fileName.length;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(SIG_END, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(centralOffset, 16);

    return Buffer.concat([local, fileName, packed, central, fileName, end]);
}

export class ZipError extends Error {}

/** Первый файл архива: имя и содержимое. */
export function unzipFirst(zip: Buffer): { name: string; data: Buffer } {
    // Конец оглавления — в последних 22 байтах плюс возможный комментарий.
    let end = -1;
    for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
        if (zip.readUInt32LE(i) === SIG_END) { end = i; break; }
    }
    if (end < 0) throw new ZipError('Файл от 1С — не архив zip');
    const entries = zip.readUInt16LE(end + 10);
    if (entries === 0) throw new ZipError('Архив от 1С пустой');

    const central = zip.readUInt32LE(end + 16);
    if (central + 46 > zip.length || zip.readUInt32LE(central) !== SIG_CENTRAL) throw new ZipError('Оглавление архива от 1С повреждено');
    const flags = zip.readUInt16LE(central + 8);
    const method = zip.readUInt16LE(central + 10);
    const crc = zip.readUInt32LE(central + 16);
    const packedSize = zip.readUInt32LE(central + 20);
    const size = zip.readUInt32LE(central + 24);
    const nameLength = zip.readUInt16LE(central + 28);
    const localOffset = zip.readUInt32LE(central + 42);
    if (packedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) {
        throw new ZipError('Архив от 1С больше 4 ГБ — такой объём за раз не принимаем');
    }
    const name = zip.subarray(central + 46, central + 46 + nameLength).toString(flags & FLAG_UTF8 ? 'utf8' : 'latin1');

    if (zip.readUInt32LE(localOffset) !== SIG_LOCAL) throw new ZipError('Архив от 1С повреждён');
    const start = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const packed = zip.subarray(start, start + packedSize);

    let data: Buffer;
    if (method === 0) data = Buffer.from(packed);
    else if (method === 8) data = inflateRawSync(packed);
    else throw new ZipError(`Архив от 1С сжат неизвестным способом (${method})`);
    if (data.length !== size || crc32(data) !== crc) throw new ZipError('Архив от 1С пришёл с ошибками — повторите синхронизацию');
    return { name, data };
}
