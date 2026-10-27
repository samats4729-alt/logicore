import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SoapError } from './soap';
import { ZipError, unzipFirst, zipOne } from './zip';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Сколько держим брошенные куски и файлы: 1С забирает их в пределах минут. */
const KEEP_MS = 24 * 3600 * 1000;

/**
 * Файлы обмена с 1С: приём частями, выдача частями.
 *
 * 1С передаёт сообщение не одним запросом, а архивом, порезанным на куски
 * по мегабайту (БСП: ПоместитьФайлВХранилищеВСервисе и
 * ПолучитьФайлИзХранилищаВСервисе):
 *   к нам  — PutFilePart × N → SaveFileFromParts → номер файла → DownloadData;
 *   от нас — UploadData → номер файла → PrepareGetFile → GetFilePart × N → ReleaseFile.
 *
 * Куски и файлы живут во временной папке сервера и нужны минуты, поэтому не
 * в базе. Папка у каждого подключения своя: номер чужого файла ничего не
 * даст — его просто не найдут.
 *
 * Если задана ONEC_ARCHIVE_DIR, копии сообщений в обе стороны складываются
 * туда — разбирать формат конкретной 1С.
 */
@Injectable()
export class OneCFileStore {
    private readonly logger = new Logger(OneCFileStore.name);
    private readonly root = path.join(os.tmpdir(), 'logicore-1c');

    private dir(connectionId: string, ...parts: string[]) {
        return path.join(this.root, connectionId, ...parts);
    }

    /** Номер сессии или файла от 1С: только УникальныйИдентификатор — иначе это путь в чужую папку. */
    static id(value: string): string {
        if (!UUID.test(value)) throw new SoapError(`Неверный идентификатор файла обмена: «${value}»`);
        return value.toLowerCase();
    }

    /** Кусок файла от 1С. */
    async putPart(connectionId: string, transferId: string, partNumber: number, data: Buffer) {
        if (!Number.isInteger(partNumber) || partNumber < 1) throw new SoapError(`Неверный номер части файла: ${partNumber}`);
        const dir = this.dir(connectionId, 'in', OneCFileStore.id(transferId));
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, String(partNumber)), data);
    }

    /** Склеить куски, распаковать и сохранить сообщение. Возвращает номер файла. */
    async assemble(connectionId: string, transferId: string, partQuantity: number): Promise<string> {
        const dir = this.dir(connectionId, 'in', OneCFileStore.id(transferId));
        const parts: Buffer[] = [];
        for (let n = 1; n <= partQuantity; n++) {
            try {
                parts.push(await fs.readFile(path.join(dir, String(n))));
            } catch {
                throw new SoapError(`Не найдена часть ${n} из ${partQuantity} файла обмена — повторите синхронизацию`);
            }
        }
        await fs.rm(dir, { recursive: true, force: true });

        let message: { name: string; data: Buffer };
        try {
            message = unzipFirst(Buffer.concat(parts));
        } catch (e) {
            throw new SoapError(e instanceof ZipError ? e.message : 'Не удалось распаковать файл от 1С');
        }
        const fileId = randomUUID();
        await fs.mkdir(this.dir(connectionId, 'files'), { recursive: true });
        await fs.writeFile(this.dir(connectionId, 'files', `${fileId}.xml`), message.data);
        await this.archive(connectionId, 'из-1С', message.data);
        void this.sweep(connectionId);
        return fileId;
    }

    /** Забрать полученное сообщение: прочитать и удалить. */
    async takeIncoming(connectionId: string, fileId: string): Promise<Buffer> {
        const file = this.dir(connectionId, 'files', `${OneCFileStore.id(fileId)}.xml`);
        let data: Buffer;
        try {
            data = await fs.readFile(file);
        } catch {
            throw new SoapError('Файл обмена не найден — повторите синхронизацию');
        }
        await fs.rm(file, { force: true });
        return data;
    }

    /** Положить сообщение для 1С: упаковать и сохранить. Возвращает номер файла. */
    async storeOutgoing(connectionId: string, name: string, data: Buffer): Promise<string> {
        const fileId = randomUUID();
        await fs.mkdir(this.dir(connectionId, 'files'), { recursive: true });
        await fs.writeFile(this.dir(connectionId, 'files', `${fileId}.zip`), zipOne(name, data));
        await this.archive(connectionId, 'в-1С', data);
        void this.sweep(connectionId);
        return fileId;
    }

    /** Приготовить файл к выдаче кусками; размер куска — в килобайтах, 0 — целиком. */
    async prepareGet(connectionId: string, fileId: string, blockSizeKb: number): Promise<{ transferId: string; parts: number }> {
        const source = this.dir(connectionId, 'files', `${OneCFileStore.id(fileId)}.zip`);
        const transferId = randomUUID();
        const dir = this.dir(connectionId, 'out', transferId);
        await fs.mkdir(dir, { recursive: true });
        try {
            await fs.rename(source, path.join(dir, 'data.zip'));
        } catch {
            await fs.rm(dir, { recursive: true, force: true });
            throw new SoapError('Файл обмена не найден — повторите синхронизацию');
        }
        const block = blockSizeKb > 0 ? Math.floor(blockSizeKb * 1024) : 0;
        await fs.writeFile(path.join(dir, 'block'), String(block));
        const { size } = await fs.stat(path.join(dir, 'data.zip'));
        return { transferId, parts: block > 0 ? Math.max(1, Math.ceil(size / block)) : 1 };
    }

    /** Кусок файла для 1С, номера с единицы. */
    async getPart(connectionId: string, transferId: string, partNumber: number): Promise<Buffer> {
        const dir = this.dir(connectionId, 'out', OneCFileStore.id(transferId));
        let data: Buffer;
        let block: number;
        try {
            data = await fs.readFile(path.join(dir, 'data.zip'));
            block = Number(await fs.readFile(path.join(dir, 'block'), 'utf8'));
        } catch {
            throw new SoapError(`Не найдена сессия передачи ${transferId} — повторите синхронизацию`);
        }
        if (!block) {
            if (partNumber !== 1) throw new SoapError(`Не найден фрагмент ${partNumber} сессии передачи ${transferId}`);
            return data;
        }
        const start = (partNumber - 1) * block;
        if (!Number.isInteger(partNumber) || partNumber < 1 || start >= Math.max(data.length, 1)) {
            throw new SoapError(`Не найден фрагмент ${partNumber} сессии передачи ${transferId}`);
        }
        return data.subarray(start, start + block);
    }

    async release(connectionId: string, transferId: string) {
        await fs.rm(this.dir(connectionId, 'out', OneCFileStore.id(transferId)), { recursive: true, force: true });
    }

    /** Копия сообщения для разбора формата — только если задана папка. */
    private async archive(connectionId: string, direction: string, data: Buffer) {
        const target = process.env.ONEC_ARCHIVE_DIR;
        if (!target) return;
        try {
            await fs.mkdir(target, { recursive: true });
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            await fs.writeFile(path.join(target, `${stamp}_${connectionId}_${direction}.xml`), data);
        } catch (e) {
            this.logger.warn(`Копия сообщения 1С не сохранена: ${(e as Error).message}`);
        }
    }

    /** Убрать брошенное: куски и файлы старше суток. */
    private async sweep(connectionId: string) {
        const now = Date.now();
        for (const sub of ['in', 'out', 'files']) {
            const dir = this.dir(connectionId, sub);
            let names: string[];
            try {
                names = await fs.readdir(dir);
            } catch {
                continue;
            }
            for (const name of names) {
                try {
                    const st = await fs.stat(path.join(dir, name));
                    if (now - st.mtimeMs > KEEP_MS) await fs.rm(path.join(dir, name), { recursive: true, force: true });
                } catch {
                    // Удалил параллельный запрос — не страшно.
                }
            }
        }
    }
}
