import { Controller, Get, Logger, Param, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { serviceByPath } from './services';
import { SoapError, buildFault, buildResponse, buildWsdl, parseCall } from './soap';
import { OneCExchangeService, OneCPeer } from './onec-exchange.service';

/**
 * Адрес, к которому обращается 1С компании при обмене (решение владельца
 * 22–23.10.2026).
 *
 * Компания вписывает в свою 1С адрес вида https://…/1c/<ключ>, логин и
 * пароль. 1С сама дописывает /ws/InterfaceVersion?wsdl, /ws/Exchange_3_0_1_1
 * и т. д. — так она ходит к любой другой базе 1С. Между ключом и /ws/ может
 * стоять что угодно: 1С сутки помнит описание службы по адресу, и для
 * проверок удобно давать ей свежий адрес.
 *
 * Входа в кабинет тут нет: 1С — не человек. Замок — логин и пароль
 * подключения (пароль хранится хешем), проверяются первым делом на каждом
 * запросе. Частые запросы не ограничиваем: при передаче файла частями 1С
 * делает их десятками подряд.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('1c')
export class OneCSoapController {
    private readonly logger = new Logger(OneCSoapController.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly exchange: OneCExchangeService,
    ) {}

    /** Описание службы (WSDL). */
    @Get(':key/*')
    async wsdl(@Param('key') key: string, @Req() req: Request, @Res() res: Response) {
        const service = this.serviceOf(req);
        if (!service) return res.status(404).type('text/plain').send('Нет такой службы');
        const peer = await this.authenticate(key, req);
        if (!peer) return this.unauthorized(res);
        return res.type('text/xml; charset=utf-8').send(buildWsdl(service, this.location(req)));
    }

    /** Вызов операции. */
    @Post(':key/*')
    async call(@Param('key') key: string, @Req() req: Request, @Res() res: Response) {
        const service = this.serviceOf(req);
        if (!service) return res.status(404).type('text/plain').send('Нет такой службы');
        const peer = await this.authenticate(key, req);
        if (!peer) return this.unauthorized(res);

        const body = typeof req.body === 'string' ? req.body : '';
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

    /** Логин и пароль подключения из заголовка Basic. */
    private async authenticate(key: string, req: Request): Promise<OneCPeer | null> {
        const header = String(req.headers.authorization ?? '');
        if (!header.startsWith('Basic ')) return null;
        const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
        const colon = decoded.indexOf(':');
        if (colon < 0) return null;
        const login = decoded.slice(0, colon);
        const password = decoded.slice(colon + 1);
        const connection = await this.prisma.oneCConnection.findUnique({
            where: { id: key },
            select: {
                id: true, companyId: true, login: true, passwordHash: true, enabled: true, nodeCode: true,
                peerNodeCode: true, exchangePlanName: true, setupAt: true, company: { select: { name: true } },
            },
        });
        if (!connection || !connection.enabled || connection.login !== login) return null;
        if (!(await bcrypt.compare(password, connection.passwordHash))) return null;
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
