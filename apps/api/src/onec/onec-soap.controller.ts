import { Controller, Get, Logger, Param, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { INTERFACE_VERSION, serviceByPath } from './services';
import { SoapError, buildFault, buildResponse, buildWsdl, parseCall } from './soap';
import { OneCExchangeService, OneCPeer } from './onec-exchange.service';

/**
 * Адрес, к которому обращается 1С компании при обмене (решение владельца
 * 22–23.10.2026).
 *
 * Компания вписывает в свою 1С адрес вида https://…/1c/<подключение>/<ключ>
 * (ключ — пароль подключения); логин и пароль в 1С можно не заполнять, но
 * если 1С их пришлёт — тоже примем. 1С сама дописывает
 * /ws/InterfaceVersion?wsdl, /ws/Exchange_3_0_1_1 и т. д. — так она ходит к
 * любой другой базе 1С.
 *
 * Входа в кабинет тут нет: 1С — не человек. Замок — ключ из адреса или
 * логин с паролем (у нас только хеш), проверяются первым делом на каждом
 * вызове обмена. Без замка — только общее для всех: описание службы и
 * список версий. Частые запросы не ограничиваем: при передаче файла
 * частями 1С делает их десятками подряд.
 */
/**
 * Ключ подключения из адреса: /1c/<подключение>/<ключ>/ws/… Ключ — тот же
 * пароль подключения. Бухгалтеру проще вставить один адрес, чем заполнять
 * логин и пароль и не забыть «Запомнить пароль»; облачная 1С при проверке
 * 23.10 их и вовсе не присылала, пока ключа в адресе не было.
 */
export function keyFromPath(path: string): string | null {
    const m = /^\/1c\/[^/]+\/([^/]+)\/ws\//i.exec(path);
    return m && /^[A-Za-z0-9]{16,64}$/.test(m[1]) ? m[1] : null;
}

@ApiExcludeController()
@SkipThrottle()
@Controller('1c')
export class OneCSoapController {
    private readonly logger = new Logger(OneCSoapController.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly exchange: OneCExchangeService,
    ) {}

    /**
     * Описание службы (WSDL) — без входа.
     *
     * Облачная 1С (1cFresh) скачивает описание без логина и на отказ не
     * повторяет запрос с паролем — настройка обрывается на первом шаге.
     * Описание общее для всех: операции обмена БСП и адрес, по которому
     * 1С и так пришла; данных компании в нём нет. Ключ подключения здесь
     * не проверяется вовсе, чтобы по ответу нельзя было подбирать адреса.
     * Каждая операция обмена (POST) по-прежнему требует логин и пароль.
     */
    @Get(':key/*')
    wsdl(@Req() req: Request, @Res() res: Response) {
        const service = this.serviceOf(req);
        if (!service) return res.status(404).type('text/plain').send('Нет такой службы');
        return res.type('text/xml; charset=utf-8').send(buildWsdl(service, this.location(req)));
    }

    /** Вызов операции. */
    @Post(':key/*')
    async call(@Param('key') key: string, @Req() req: Request, @Res() res: Response) {
        const service = this.serviceOf(req);
        if (!service) return res.status(404).type('text/plain').send('Нет такой службы');
        const body = typeof req.body === 'string' ? req.body : '';

        // «Какие версии обмена знаешь» — ответ одинаковый для всех, без данных
        // компании. Облачная 1С спрашивает его без логина, как и описание службы.
        if (service === INTERFACE_VERSION) {
            try {
                const call = parseCall(service, body);
                const { result } = this.exchange.versions(call.args);
                return res.status(200).type('text/xml; charset=utf-8').send(buildResponse(service, call.operation, result));
            } catch (e) {
                const message = e instanceof SoapError ? e.message : 'Внутренняя ошибка LogiCore при обмене с 1С';
                return res.status(500).type('text/xml; charset=utf-8').send(buildFault(message));
            }
        }

        const peer = await this.authenticate(key, req);
        if (!peer) return this.unauthorized(res);

        let operation = '';
        try {
            const call = parseCall(service, body);
            operation = call.operation.name;
            const { result, outs } = await this.exchange.handle(service, call.operation, call.args, peer);
            await this.prisma.oneCConnection.update({ where: { id: peer.id }, data: { lastSeenAt: new Date() } });
            // Nest ставит на POST 201, а клиент SOAP ждёт 200.
            return res.status(200).type('text/xml; charset=utf-8').send(buildResponse(service, call.operation, result, outs));
        } catch (e) {
            const message = e instanceof SoapError ? e.message : 'Внутренняя ошибка LogiCore при обмене с 1С';
            if (!(e instanceof SoapError)) this.logger.error(`1С ${service.name}.${operation}: ${(e as Error).stack ?? e}`);
            await this.exchange.log(peer, `${service.name}.${operation || '?'}`, false, message);
            return res.status(500).type('text/xml; charset=utf-8').send(buildFault(message));
        }
    }

    /** Служба — последний кусок пути после /ws/. */
    private serviceOf(req: Request) {
        const m = /\/ws\/([^/?]+)\/?$/i.exec(req.path);
        return m ? serviceByPath(decodeURIComponent(m[1])) : undefined;
    }

    /** Адрес, по которому 1С будет вызывать операции, — тот же, по которому спросила описание. */
    private location(req: Request) {
        const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol).split(',')[0].trim();
        const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost').split(',')[0].trim();
        return `${proto}://${host}${req.path}`;
    }

    /** Подключение по ключу из адреса или по логину и паролю из заголовка Basic. */
    private async authenticate(key: string, req: Request): Promise<OneCPeer | null> {
        let login = '';
        let password = '';
        const header = String(req.headers.authorization ?? '');
        if (header.startsWith('Basic ')) {
            const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
            const colon = decoded.indexOf(':');
            if (colon < 0) return null;
            login = decoded.slice(0, colon);
            password = decoded.slice(colon + 1);
        }
        const pathKey = keyFromPath(req.path);
        // Пустой пароль в заголовке — 1С без «Запомнить пароль»; тогда в дело идёт ключ из адреса.
        if (!password && pathKey) password = pathKey;

        const connection = await this.prisma.oneCConnection.findUnique({
            where: { id: key },
            select: {
                id: true, companyId: true, login: true, passwordHash: true, enabled: true, nodeCode: true,
                peerNodeCode: true, exchangePlanName: true, setupAt: true, company: { select: { name: true } },
            },
        });
        if (!connection || !connection.enabled) return null;
        if (login && connection.login !== login) return null;
        if (!password || !(await bcrypt.compare(password, connection.passwordHash))) {
            // Адрес верный, а пароля или ключа нет либо он неверный — скажем в журнале, что поправить в 1С.
            await this.exchange.logBadPassword(connection.id, password === '');
            return null;
        }
        return {
            id: connection.id, companyId: connection.companyId, nodeCode: connection.nodeCode,
            peerNodeCode: connection.peerNodeCode, exchangePlanName: connection.exchangePlanName,
            setupAt: connection.setupAt, companyName: connection.company.name,
        };
    }

    private unauthorized(res: Response) {
        return res.status(401).set('WWW-Authenticate', 'Basic realm="LogiCore 1C"').type('text/plain; charset=utf-8')
            .send('Неверный логин или пароль обмена с 1С');
    }
}
