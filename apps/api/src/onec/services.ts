/**
 * Веб-сервисы 1С, которые LogiCore изображает для обмена.
 *
 * Списки операций и параметров — точная копия того, что объявлено в
 * конфигурациях на БСП (выгрузка учебной «Бухгалтерии предприятия» 3.0.111,
 * WebServices/InterfaceVersion и WebServices/Exchange_3_0_1_1). 1С строит по
 * описанию (WSDL) свой прокси и вызывает операции по этим именам; лишняя
 * или переименованная операция для неё — другая служба.
 */

export type ParamDirection = 'In' | 'Out' | 'InOut';

export interface OpParam {
    name: string;
    /** «xs:string», «v8:Structure» и т. п. */
    type: string;
    nillable?: boolean;
    dir: ParamDirection;
}

export interface OpSpec {
    name: string;
    returns: string;
    returnNillable?: boolean;
    params: OpParam[];
}

export interface ServiceSpec {
    name: string;
    namespace: string;
    operations: OpSpec[];
}

const p = (name: string, type: string, dir: ParamDirection = 'In', nillable = false): OpParam => ({ name, type, dir, nillable });

/** Версии программных интерфейсов: 1С сначала спрашивает, какие версии обмена мы знаем. */
export const INTERFACE_VERSION: ServiceSpec = {
    name: 'InterfaceVersion',
    namespace: 'http://www.1c.ru/SaaS/1.0/WS',
    operations: [
        { name: 'GetVersions', returns: 'v8:Array', returnNillable: true, params: [p('InterfaceName', 'xs:string')] },
    ],
};

/** Обмен данными, версия 3.0.1.1 — её требует настройка «Другая программа». */
export const EXCHANGE_3_0_1_1: ServiceSpec = {
    name: 'Exchange_3_0_1_1',
    namespace: 'http://www.1c.ru/SSL/Exchange_3_0_1_1',
    operations: [
        { name: 'Ping', returns: 'xs:string', returnNillable: true, params: [] },
        {
            name: 'TestConnection', returns: 'xs:boolean',
            params: [p('ExchangePlanName', 'xs:string'), p('NodeCode', 'xs:string'), p('Result', 'xs:string', 'Out', true)],
        },
        {
            name: 'Upload', returns: 'xs:string', returnNillable: true,
            params: [p('ExchangePlanName', 'xs:string'), p('NodeCode', 'xs:string'), p('Data', 'v8:ValueStorage', 'Out', true)],
        },
        {
            name: 'Download', returns: 'xs:string', returnNillable: true,
            params: [p('ExchangePlanName', 'xs:string'), p('NodeCode', 'xs:string'), p('Data', 'v8:ValueStorage')],
        },
        {
            name: 'UploadData', returns: 'xs:string', returnNillable: true,
            params: [
                p('ExchangePlanName', 'xs:string'), p('NodeCode', 'xs:string'), p('FileID', 'xs:string', 'InOut', true),
                p('ContinuousOperation', 'xs:boolean', 'InOut', true), p('Operation', 'xs:string', 'InOut', true),
                p('ContinuousOperationAllowed', 'xs:boolean'),
            ],
        },
        {
            name: 'DownloadData', returns: 'xs:string', returnNillable: true,
            params: [
                p('ExchangePlanName', 'xs:string'), p('NodeCode', 'xs:string'), p('FileID', 'xs:string'),
                p('ContinuousOperation', 'xs:boolean', 'InOut', true), p('Operation', 'xs:string', 'InOut', true),
                p('ContinuousOperationAllowed', 'xs:boolean'),
            ],
        },
        {
            name: 'GetIBParameters', returns: 'v8:Structure', returnNillable: true,
            params: [p('ExchangePlanName', 'xs:string'), p('NodeCode', 'xs:string', 'In', true), p('ResultMessage', 'xs:string', 'InOut', true)],
        },
        {
            name: 'GetContinuousOperationStatus', returns: 'xs:string', returnNillable: true,
            params: [p('Operation', 'xs:string'), p('ResultMessage', 'xs:string', 'Out', true)],
        },
        {
            name: 'PrepareGetFile', returns: 'xs:string', returnNillable: true,
            params: [p('FileId', 'v8:UUID'), p('BlockSize', 'xs:decimal'), p('TransferId', 'v8:UUID', 'Out'), p('PartQuantity', 'xs:int', 'Out')],
        },
        {
            name: 'GetFilePart', returns: 'xs:string', returnNillable: true,
            params: [p('TransferId', 'v8:UUID'), p('PartNumber', 'xs:int'), p('PartData', 'xs:base64Binary', 'Out', true)],
        },
        { name: 'ReleaseFile', returns: 'xs:string', returnNillable: true, params: [p('TransferId', 'v8:UUID')] },
        {
            name: 'PutFilePart', returns: 'xs:string', returnNillable: true,
            params: [p('TransferId', 'v8:UUID'), p('PartNumber', 'xs:int', 'In', true), p('PartData', 'xs:base64Binary')],
        },
        {
            name: 'SaveFileFromParts', returns: 'xs:string', returnNillable: true,
            params: [p('TransferId', 'v8:UUID'), p('PartQuantity', 'xs:int'), p('FileId', 'v8:UUID', 'Out')],
        },
        { name: 'CreateExchangeNode', returns: 'v8:Structure', returnNillable: true, params: [p('Parameters', 'v8:Structure')] },
        {
            name: 'RemoveExchangeNode', returns: 'v8:Structure', returnNillable: true,
            params: [p('ExchangePlanName', 'xs:string'), p('NodeId', 'xs:string')],
        },
        {
            name: 'PutMessageForDataMatching', returns: 'xs:string', returnNillable: true,
            params: [p('ExchangePlanName', 'xs:string'), p('NodeId', 'xs:string'), p('FileId', 'xs:string')],
        },
    ],
};

export const SERVICES: Record<string, ServiceSpec> = {
    [INTERFACE_VERSION.name.toLowerCase()]: INTERFACE_VERSION,
    [EXCHANGE_3_0_1_1.name.toLowerCase()]: EXCHANGE_3_0_1_1,
};

/** Служба по имени из адреса: «/ws/Exchange_3_0_1_1» и «/ws/exchange_3_0_1_1.1cws». */
export function serviceByPath(segment: string): ServiceSpec | undefined {
    return SERVICES[segment.toLowerCase().replace(/\.1cws$/, '')];
}
