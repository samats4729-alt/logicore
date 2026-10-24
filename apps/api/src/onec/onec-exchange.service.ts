import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OpSpec, ServiceSpec } from './services';
import { SoapError } from './soap';
import { V8Raw, V8Uuid, V8Value } from './xdto';
import { OneCFileStore } from './onec-files';
import { ObjectType, buildMessage, countObjects, readMessage } from './message';
import { OneCImportService, describeImport } from './onec-import.service';
import { OneCExportService, SALES, SERVICE } from './onec-export.service';

/** Подключение, от имени которого 1С сейчас спрашивает. */
export interface OneCPeer {
    id: string;
    companyId: string;
    nodeCode: string;
    peerNodeCode: string | null;
    exchangePlanName: string | null;
    setupAt: Date | null;
    companyName: string;
}

export interface OperationResult {
    result: V8Value;
    outs?: Record<string, V8Value>;
}

/** Формат универсального обмена 1С. */
export const ENTERPRISE_DATA = 'http://v8.1c.ru/edi/edi_stnd/EnterpriseData';
/**
 * Версии формата, которые LogiCore объявляет 1С. 1С выбирает наибольшую
 * общую; какую выбрала — приходит при создании узла и запоминается.
 */
export const FORMAT_VERSIONS = ['1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.10'];
/** План обмена по умолчанию, если 1С назвала формат вместо плана. */
const DEFAULT_PLAN = 'СинхронизацияДанныхЧерезУниверсальныйФормат';
/** Запись журнала о неверном пароле 1С. */
const BAD_PASSWORD = 'Вход';
/** Префикс LogiCore в номерах объектов 1С. */
const PREFIX = 'LC';

/**
 * Что LogiCore объявляет 1С в каждом сообщении. 1С отправляет только то,
 * что другая сторона умеет принимать, — без этого списка она считает, что
 * мы принимаем всё, и выгружает всю базу.
 *
 * Принимаем: свою организацию, контрагентов с договорами и счетами и оплаты
 * от них. Отправляем: акты выполненных работ (реализация услуг) и сами
 * услуги — без них 1С завела бы услугу товаром.
 */
export const OBJECT_TYPES: ObjectType[] = [
    { name: 'Справочник.Организации', receiving: true },
    { name: 'Справочник.Контрагенты', receiving: true },
    { name: 'Справочник.Договоры', receiving: true },
    { name: 'Справочник.БанковскиеСчета', receiving: true },
    { name: SERVICE, sending: true },
    { name: SALES, sending: true },
    { name: 'Документ.ПБДСРасчетыСКонтрагентами', receiving: true },
    { name: 'Документ.ПКОРасчетыСКонтрагентами', receiving: true },
];

/** УникальныйИдентификатор из параметра: 1С шлёт его то типом, то строкой. */
const uuidOf = (v: V8Value): string => OneCFileStore.id(v instanceof V8Uuid ? v.value : String(v ?? ''));
/** ДвоичныеДанные из параметра. */
const binaryOf = (v: V8Value): Buffer => {
    if (Buffer.isBuffer(v)) return v;
    if (typeof v === 'string') return Buffer.from(v.replace(/\s+/g, ''), 'base64');
    if (v instanceof V8Raw) return Buffer.from(v.text.replace(/\s+/g, ''), 'base64');
    throw new SoapError('В части файла нет данных');
};

const xml = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: true });

/** Значение поля из строки настроек 1С: элемент может прийти с типом, тогда текст в #text. */
const textOf = (v: unknown): string | null => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'object') return '#text' in (v as object) ? String((v as { '#text': unknown })['#text']) : null;
    return String(v);
};

/**
 * Ответы LogiCore на вызовы 1С.
 *
 * LogiCore для 1С — ещё одна база на том же плане обмена. На проверку связи
 * отвечает «план есть», на создание настройки — запоминает, с каким узлом 1С
 * говорит. При синхронизации 1С сначала забирает наше сообщение
 * (UploadData), потом отдаёт своё (DownloadData) — оба файлом по частям.
 *
 * Сообщения ходят в обе стороны, номера подтверждений ведутся. Что пришло
 * из 1С, разносит OneCImportService (контрагенты по БИН, их банковские
 * реквизиты, своя организация). Отправка счетов и актов в 1С — следующий
 * этап; до тех пор наше сообщение без объектов.
 */
@Injectable()
export class OneCExchangeService {
    private readonly logger = new Logger(OneCExchangeService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly files: OneCFileStore,
        private readonly importer: OneCImportService,
        private readonly exporter: OneCExportService,
    ) {}

    async log(peer: Pick<OneCPeer, 'id'>, operation: string, ok: boolean, message?: string | null, details?: Record<string, unknown>) {
        try {
            await this.prisma.oneCExchangeLog.create({
                data: {
                    connectionId: peer.id, operation, ok, message: message ?? null,
                    details: details ? (details as Prisma.InputJsonValue) : undefined,
                },
            });
        } catch (e) {
            this.logger.warn(`Журнал обмена 1С не записан: ${(e as Error).message}`);
        }
    }

    /**
     * 1С пришла по верному адресу, но без пароля или с неверным. Сама 1С
     * покажет человеку невнятное «аутентификация не выполнена», поэтому
     * причину пишем в журнал обмена — не чаще раза в десять минут, 1С
     * повторяет попытки.
     */
    async logBadPassword(connectionId: string, empty: boolean) {
        const recent = await this.prisma.oneCExchangeLog.findFirst({
            where: { connectionId, operation: BAD_PASSWORD, createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) } },
            select: { id: true },
        });
        if (recent) return;
        await this.log({ id: connectionId }, BAD_PASSWORD, false, empty
            ? '1С обратилась без пароля. Нажмите здесь «Новый адрес» и вставьте его в 1С: '
                + 'настройка синхронизации → «Настроить параметры подключения». С ним пароль в 1С не нужен.'
            : '1С обратилась со старым или неверным паролем. Нажмите здесь «Новый адрес» и вставьте его в 1С: '
                + 'настройка синхронизации → «Настроить параметры подключения».');
    }

    async handle(service: ServiceSpec, op: OpSpec, args: Record<string, V8Value>, peer: OneCPeer): Promise<OperationResult> {
        if (service.name === 'InterfaceVersion') return this.versions(args);
        switch (op.name) {
            case 'Ping':
                return { result: '' };
            case 'TestConnection':
                return this.testConnection(args, peer);
            case 'GetIBParameters':
                return { result: this.ibParameters(args, peer), outs: { ResultMessage: '' } };
            case 'CreateExchangeNode':
                return this.createNode(args, peer);
            case 'RemoveExchangeNode':
                return this.removeNode(peer);
            case 'UploadData':
                return this.uploadData(args, peer);
            case 'DownloadData':
                return this.downloadData(args, peer);
            case 'PutFilePart':
                await this.files.putPart(peer.id, uuidOf(args.TransferId), Number(args.PartNumber ?? 1), binaryOf(args.PartData));
                return { result: '' };
            case 'SaveFileFromParts': {
                const fileId = await this.files.assemble(peer.id, uuidOf(args.TransferId), Number(args.PartQuantity));
                return { result: '', outs: { FileId: new V8Uuid(fileId) } };
            }
            case 'PrepareGetFile': {
                const { transferId, parts } = await this.files.prepareGet(peer.id, uuidOf(args.FileId), Number(args.BlockSize ?? 0));
                return { result: '', outs: { TransferId: new V8Uuid(transferId), PartQuantity: parts } };
            }
            case 'GetFilePart':
                return { result: '', outs: { PartData: await this.files.getPart(peer.id, uuidOf(args.TransferId), Number(args.PartNumber)) } };
            case 'ReleaseFile':
                await this.files.release(peer.id, uuidOf(args.TransferId));
                return { result: '' };
            case 'GetContinuousOperationStatus':
                // Долгих операций не заводим: всё делается внутри самого вызова.
                return { result: 'Completed', outs: { ResultMessage: '' } };
            default:
                // Upload/Download без файлов 1С для «Другой программы» не зовёт; сопоставление мы не объявляем.
                throw new SoapError(`LogiCore не поддерживает операцию ${op.name}. Обновите настройку синхронизации в 1С.`);
        }
    }

    /** «Какие версии интерфейса знаешь»: для обмена — только 3.0.1.1, её требует «Другая программа». */
    versions(args: Record<string, V8Value>): OperationResult {
        return { result: args.InterfaceName === 'ОбменДанными' ? ['3.0.1.1'] : [] };
    }

    /** Есть ли у LogiCore настройка с этим узлом 1С. */
    private testConnection(args: Record<string, V8Value>, peer: OneCPeer): OperationResult {
        const code = String(args.NodeCode ?? '');
        if (peer.peerNodeCode && peer.peerNodeCode === code) return { result: true, outs: { Result: '' } };
        return {
            result: false,
            outs: { Result: `В LogiCore («${peer.companyName}») не найдена настройка синхронизации данных с идентификатором «${code}».` },
        };
    }

    /**
     * Параметры «информационной базы» LogiCore — те же поля, что отдаёт сама
     * 1С (ОбменДаннымиСервер.ПараметрыИнформационнойБазы, БСП 3.0).
     */
    ibParameters(args: Record<string, V8Value>, peer: OneCPeer): Record<string, V8Value> {
        const asked = String(args.ExchangePlanName ?? '') || DEFAULT_PLAN;
        const plan = asked === ENTERPRISE_DATA ? DEFAULT_PLAN : asked;
        const code = args.NodeCode ? String(args.NodeCode) : '';
        const nodeExists = !!code && peer.peerNodeCode === code;
        return {
            ПланОбменаСуществует: true,
            ПрефиксИнформационнойБазы: 'LC',
            ПрефиксИнформационнойБазыПоУмолчанию: 'LC',
            НаименованиеИнформационнойБазы: `LogiCore — ${peer.companyName}`,
            НаименованиеИнформационнойБазыПоУмолчанию: 'LogiCore',
            НастройкиПараметровУчетаЗаданы: nodeExists,
            КодЭтогоУзла: peer.nodeCode,
            ВерсияКонфигурации: '3.0.0.1',
            УзелСуществует: nodeExists,
            ВерсияФорматаНастроекОбменаДанными: '1.2',
            ИспользоватьПрефиксыДляНастройкиОбмена: false,
            ФорматОбмена: ENTERPRISE_DATA,
            ИмяПланаОбмена: plan,
            ВерсииФорматаОбмена: FORMAT_VERSIONS,
            ПоддерживаемыеОбъектыФормата: null,
            НастройкаСинхронизацииДанныхЗавершена: nodeExists && !!peer.setupAt,
            ПолученоСообщениеДляСопоставленияДанных: false,
            ПоддерживаетсяСопоставлениеДанных: false,
        };
    }

    /**
     * 1С создала у себя настройку и просит создать её у нас: запоминаем, как
     * её узел называется у нас, имя плана и выбранную версию формата.
     */
    private async createNode(args: Record<string, V8Value>, peer: OneCPeer): Promise<OperationResult> {
        const params = (args.Parameters ?? {}) as Record<string, V8Value>;
        const settings = (params.НастройкиПодключения ?? {}) as Record<string, V8Value>;
        const settingsXml = typeof params.СтрокаПараметровXML === 'string' ? params.СтрокаПараметровXML : '';

        let peerNodeCode: string | null = null;
        let peerName: string | null = null;
        let plan: string | null = typeof settings.ИмяПланаОбмена === 'string' ? settings.ИмяПланаОбмена : null;
        if (settingsXml) {
            const parsed = xml.parse(settingsXml);
            const main = parsed?.ПараметрыНастройки?.ОсновныеПараметрыОбмена ?? {};
            peerNodeCode = textOf(main.КодНовогоУзлаВторойБазы);
            peerName = textOf(main.НаименованиеВторойБазы);
            plan = plan ?? textOf(main.ИмяПланаОбмена);
        }
        if (!peerNodeCode) throw new SoapError('В настройках из 1С нет кода узла — повторите настройку синхронизации');

        const formatVersion = typeof settings.ВерсияФорматаОбмена === 'string' ? settings.ВерсияФорматаОбмена : null;
        await this.prisma.oneCConnection.update({
            where: { id: peer.id },
            data: {
                peerNodeCode, peerName, exchangePlanName: plan ?? DEFAULT_PLAN, formatVersion,
                settingsXml, setupAt: new Date(), sentNo: 0, receivedNo: 0,
            },
        });
        await this.log(peer, 'CreateExchangeNode', true, `1С «${peerName ?? '—'}» настроила обмен`, { peerNodeCode, formatVersion, plan });
        return { result: {} };
    }

    /** Синхронизация идёт по той настройке, что создана у нас: код узла 1С должен совпасть. */
    private assertNode(args: Record<string, V8Value>, peer: OneCPeer) {
        if (!peer.peerNodeCode) {
            throw new SoapError('Обмен с LogiCore ещё не настроен: создайте настройку синхронизации в 1С заново.');
        }
        const code = String(args.NodeCode ?? '');
        if (code && code !== peer.peerNodeCode) {
            throw new SoapError(`В LogiCore («${peer.companyName}») не найдена настройка синхронизации данных с идентификатором «${code}».`);
        }
    }

    /**
     * 1С забирает наше сообщение. Номер сообщения растёт с каждым разом, номер
     * принятого — последний, что мы приняли от неё: по нему 1С перестаёт
     * пересылать то, что уже дошло.
     */
    private async uploadData(args: Record<string, V8Value>, peer: OneCPeer): Promise<OperationResult> {
        this.assertNode(args, peer);
        const conn = await this.prisma.oneCConnection.findUniqueOrThrow({
            where: { id: peer.id },
            select: { sentNo: true, receivedNo: true, formatVersion: true, exchangePlanName: true },
        });
        const messageNo = conn.sentNo + 1;
        const version = conn.formatVersion ?? FORMAT_VERSIONS[FORMAT_VERSIONS.length - 1];
        const exported = await this.exporter.build(peer.id);
        const xmlText = buildMessage({
            format: `${ENTERPRISE_DATA}/${version}`,
            exchangePlan: conn.exchangePlanName ?? DEFAULT_PLAN,
            to: peer.peerNodeCode!,
            from: peer.nodeCode,
            messageNo,
            receivedNo: conn.receivedNo,
            versions: FORMAT_VERSIONS,
            objectTypes: OBJECT_TYPES,
            prefix: PREFIX,
        }, exported.body);
        const fileId = await this.files.storeOutgoing(peer.id, `Message_${PREFIX}_${messageNo}.xml`, Buffer.from(xmlText, 'utf8'));
        await this.prisma.oneCConnection.update({ where: { id: peer.id }, data: { sentNo: messageNo } });
        await exported.commit(messageNo);
        const sent = [
            exported.sales && `актов — ${exported.sales}`,
            exported.deletions && `отменённых актов (удаление) — ${exported.deletions}`,
        ].filter(Boolean).join(', ');
        await this.log(
            peer, 'UploadData', exported.skipped.length === 0,
            [sent ? `1С забрала из LogiCore: ${sent}` : '1С забрала данные из LogiCore: нового для неё нет', ...exported.skipped].join('. '),
            { messageNo, receivedNo: conn.receivedNo, sales: exported.sales, deletions: exported.deletions, skipped: exported.skipped },
        );
        return { result: '', outs: { FileID: fileId, ContinuousOperation: false, Operation: '' } };
    }

    /** 1С прислала своё сообщение: проверяем, от неё ли оно, и пишем в журнал, что пришло. */
    private async downloadData(args: Record<string, V8Value>, peer: OneCPeer): Promise<OperationResult> {
        this.assertNode(args, peer);
        const done: OperationResult = { result: '', outs: { ContinuousOperation: false, Operation: '' } };
        const data = await this.files.takeIncoming(peer.id, String(args.FileID ?? ''));
        const msg = readMessage(data.toString('utf8'));

        if (msg.from && msg.from !== peer.peerNodeCode) {
            throw new SoapError(`Сообщение пришло от другой настройки синхронизации («${msg.from}»). Создайте настройку в 1С заново.`);
        }
        if (msg.to && msg.to !== peer.nodeCode) {
            throw new SoapError('Сообщение адресовано не этой компании в LogiCore. Проверьте адрес программы в настройке 1С.');
        }
        // До какого нашего сообщения 1С всё получила: отправленное позже уйдёт ещё раз.
        if (msg.receivedNo !== null) {
            await this.prisma.oneCConnection.update({ where: { id: peer.id }, data: { peerReceivedNo: msg.receivedNo } });
        }
        if (!msg.hasBody) {
            await this.log(peer, 'DownloadData', true, '1С прислала свои настройки обмена', { versions: msg.versions });
            return done;
        }

        const conn = await this.prisma.oneCConnection.findUniqueOrThrow({ where: { id: peer.id }, select: { receivedNo: true, createdById: true } });
        if (msg.messageNo !== null && msg.messageNo <= conn.receivedNo) {
            await this.log(peer, 'DownloadData', true, '1С повторно прислала уже принятые данные — пропущено');
            return done;
        }

        // Разносим до подтверждения: если разнесение упадёт целиком, номер
        // принятого не сдвинется и 1С пришлёт то же сообщение ещё раз.
        const counts = countObjects(msg.objects);
        const imported = await this.importer.import(peer.id, peer.companyId, msg.objects, conn.createdById ?? await this.companyAdmin(peer.companyId));
        await this.prisma.oneCConnection.update({
            where: { id: peer.id },
            data: {
                ...(msg.messageNo !== null ? { receivedNo: msg.messageNo } : {}),
                ...(msg.version ? { formatVersion: msg.version } : {}),
            },
        });
        await this.log(
            peer, 'DownloadData', imported.errors.length === 0, describeImport(imported, counts),
            { messageNo: msg.messageNo, peerReceivedNo: msg.receivedNo, version: msg.version, objects: counts, imported },
        );
        return done;
    }

    /** От чьего имени заводить платежи, если подключавший 1С уже удалён: руководитель компании. */
    private async companyAdmin(companyId: string): Promise<string | null> {
        const admin = await this.prisma.user.findFirst({
            where: { companyId, role: 'COMPANY_ADMIN' },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
        });
        return admin?.id ?? null;
    }

    /** 1С удалила настройку у себя — забываем и мы. */
    private async removeNode(peer: OneCPeer): Promise<OperationResult> {
        await this.prisma.oneCConnection.update({
            where: { id: peer.id },
            data: { peerNodeCode: null, setupAt: null, settingsXml: null, sentNo: 0, receivedNo: 0 },
        });
        await this.log(peer, 'RemoveExchangeNode', true, '1С удалила настройку обмена');
        return { result: {} };
    }
}
