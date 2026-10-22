import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OpSpec, ServiceSpec } from './services';
import { SoapError } from './soap';
import { V8Value } from './xdto';

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

const xml = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: true });

/** Значение поля из строки настроек 1С: элемент может прийти с типом, тогда текст в #text. */
const textOf = (v: unknown): string | null => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'object') return '#text' in (v as object) ? String((v as { '#text': unknown })['#text']) : null;
    return String(v);
};

/**
 * Ответы LogiCore на вызовы 1С — этап 1: подключение и настройка.
 *
 * LogiCore для 1С — ещё одна база на том же плане обмена. На проверку связи
 * отвечает «план есть», на создание настройки — запоминает, с каким узлом 1С
 * говорит. Передача самих данных — следующие этапы; пока на неё 1С получает
 * понятный отказ, а не молчание.
 */
@Injectable()
export class OneCExchangeService {
    private readonly logger = new Logger(OneCExchangeService.name);

    constructor(private readonly prisma: PrismaService) {}

    async log(peer: OneCPeer, operation: string, ok: boolean, message?: string | null, details?: Record<string, unknown>) {
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

    async handle(service: ServiceSpec, op: OpSpec, args: Record<string, V8Value>, peer: OneCPeer): Promise<OperationResult> {
        if (service.name === 'InterfaceVersion') return this.getVersions(args);
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
            default:
                throw new SoapError(
                    'LogiCore пока принимает только настройку обмена: передача данных включится следующим обновлением. '
                    + 'Настройка сохранена, ничего делать не нужно.',
                );
        }
    }

    /** «Какие версии интерфейса знаешь»: для обмена — только 3.0.1.1, её требует «Другая программа». */
    private getVersions(args: Record<string, V8Value>): OperationResult {
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
