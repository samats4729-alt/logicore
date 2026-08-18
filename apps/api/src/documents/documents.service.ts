import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentType } from '@prisma/client';
import { S3Service } from '../s3/s3.service';
import * as path from 'path';
import * as fs from 'fs';
import { assertAllowedUpload } from './allowed-files';

@Injectable()
export class DocumentsService {
    constructor(private prisma: PrismaService, private s3Service: S3Service) { }

    /**
     * Сохранение информации о загруженном документе
     */
    async create(data: {
        type: DocumentType;
        fileName: string;
        fileUrl: string;
        fileSize: number;
        mimeType: string;
        orderId?: string;
        uploadedById: string;
    }, user?: { sub: string; role: string; companyId?: string }) {
        // Проверка: если документ привязан к заявке, компания должна быть участником
        if (data.orderId && user && user.role !== 'ADMIN') {
            await this.checkOrderAccess(data.orderId, user.companyId, user);
        }
        return this.prisma.document.create({ data });
    }

    /** Проверка, что компания — участник заявки */
    /**
     * Водителю — документы только его рейсов.
     *
     * Он состоит в компании, и проверка «рейс нашей фирмы» открывала ему
     * весь её архив: договоры, счета, акты и накладные по всем заявкам, с
     * возможностью скачать любой файл. То же самое, что было в карточке
     * рейса, только здесь утекают уже подписанные документы.
     */
    private isDriver(role?: string): boolean {
        return role === 'DRIVER';
    }

    private async checkOrderAccess(
        orderId: string,
        companyId?: string,
        user?: { sub: string; role: string },
    ) {
        if (this.isDriver(user?.role)) {
            const own = await this.prisma.order.findFirst({
                where: { id: orderId, driverId: user!.sub },
                select: { id: true },
            });
            if (!own) throw new ForbiddenException('Этот рейс назначен не вам');
            return;
        }

        if (!companyId) throw new ForbiddenException('Нет доступа к заявке');
        const order = await this.prisma.order.findFirst({
            where: {
                id: orderId,
                OR: [
                    { customerCompanyId: companyId },
                    { forwarderId: companyId },
                    { partnerId: companyId },
                    { responsibleManager: { companyId } },
                ],
            },
            select: { id: true },
        });
        if (!order) {
            throw new ForbiddenException('Нет доступа к заявке');
        }
    }

    /**
     * Загрузка файла документа
     */
    async uploadFile(orderId: string, userId: string, type: DocumentType, file: Express.Multer.File, user?: { sub: string; role: string; companyId?: string }) {
        if (!file) throw new NotFoundException('Файл не найден');

        // Сначала право, потом сам файл: разбирать вложение того, кому сюда
        // нельзя, незачем.
        if (user && user.role !== 'ADMIN') {
            await this.checkOrderAccess(orderId, user.companyId, user);
        }
        assertAllowedUpload(file);
        
        const ext = path.extname(file.originalname);
        const filename = `doc_${orderId}_${Date.now()}${ext}`;
        const relativePath = `uploads/documents/${filename}`;

        if (this.s3Service.isS3Enabled()) {
            await this.s3Service.uploadFile(relativePath, file.buffer, file.mimetype);
        } else {
            const uploadsDir = path.join(process.cwd(), 'uploads', 'documents');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const filepath = path.join(uploadsDir, filename);
            fs.writeFileSync(filepath, file.buffer);
        }

        return this.prisma.document.create({
            data: {
                type,
                fileName: file.originalname,
                fileUrl: relativePath,
                fileSize: file.size,
                mimeType: file.mimetype,
                orderId,
                uploadedById: userId,
            }
        });
    }

    /**
     * Журнал вложенных файлов компании: накладные, акты, счета и прочее,
     * что прикрепили к рейсам.
     *
     * Раньше такой список существовал только внутри карточки рейса, поэтому
     * бухгалтеру приходилось знать номер заявки и спрашивать логиста —
     * а накладную ищут не по номеру заявки, а по «Магнум, прошлая неделя».
     *
     * Круг документов тот же, что и в `findById`, иначе список показывал бы
     * то, что потом не открывается: файлы рейсов, где наша компания —
     * сторона, плюс файлы без рейса, вложенные нашими же сотрудниками.
     */
    async listForCompany(
        companyId: string | undefined,
        query: { type?: DocumentType; from?: string; to?: string; search?: string } = {},
        // Платформенный администратор смотрит журнал по всем компаниям: своей
        // у него нет, и отбор по компании оборачивался для него отказом —
        // раздел «Документы» в админке всегда показывал «Нет документов».
        // Флаг ставится только из маршрута под `@Roles(ADMIN)`.
        options: { allCompanies?: boolean; user?: { sub: string; role: string } } = {},
    ) {
        if (!companyId && !options.allCompanies) throw new ForbiddenException('Нет доступа к документам');

        // Журнал водителя — его собственные рейсы. Иначе он листает весь
        // архив компании: договоры, счета, акты по всем заявкам подряд.
        const driverScope = this.isDriver(options.user?.role)
            ? [{ order: { driverId: options.user!.sub } }]
            : null;

        const search = (query.search || '').trim();
        const like = { contains: search, mode: 'insensitive' as const };
        // Условия складываются через AND намеренно: доступ и поиск — разные
        // ограничения, и два ключа `OR` в одном объекте затёрли бы друг друга.
        // Затёрся бы именно доступ, то есть человек увидел бы чужие файлы.
        const access = {
            OR: [
                {
                    order: {
                        OR: [
                            { customerCompanyId: companyId },
                            { forwarderId: companyId },
                            { partnerId: companyId },
                            { responsibleManager: { companyId } },
                        ],
                    },
                },
                { orderId: null, uploadedBy: { companyId } },
            ],
        };
        // Для администратора платформы ограничения по компании нет.
        const scope = driverScope ?? (options.allCompanies ? [] : [access]);
        // Ищем по тому, что человек помнит: номер рейса, имя файла, город,
        // водитель, заказчик.
        const matches = {
            OR: [
                { fileName: like },
                { order: { orderNumber: like } },
                { order: { assignedDriverName: like } },
                { order: { assignedDriverPlate: like } },
                { order: { customerCompany: { name: like } } },
                { order: { routePoints: { some: { location: { city: like } } } } },
            ],
        };

        const documents = await this.prisma.document.findMany({
            where: {
                ...(query.type ? { type: query.type } : {}),
                ...(query.from || query.to
                    ? {
                        createdAt: {
                            gte: query.from ? new Date(query.from) : undefined,
                            lte: query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined,
                        },
                    }
                    : {}),
                AND: search ? [...scope, matches] : scope,
            },
            orderBy: { createdAt: 'desc' },
            // Тот же потолок, что и в журнале доверенностей: список читают
            // глазами, а не выгружают целиком.
            take: 300,
            select: {
                id: true,
                type: true,
                fileName: true,
                fileSize: true,
                mimeType: true,
                createdAt: true,
                orderId: true,
                uploadedBy: { select: { firstName: true, lastName: true } },
                uploadedByCounterparty: { select: { name: true } },
                order: {
                    select: {
                        orderNumber: true,
                        status: true,
                        assignedDriverName: true,
                        assignedDriverPlate: true,
                        customerCompany: { select: { name: true } },
                        routePoints: {
                            select: { pointType: true, location: { select: { city: true, address: true } } },
                            orderBy: { sequence: 'asc' },
                        },
                    },
                },
            },
        });

        return documents.map((document) => {
            const points = document.order?.routePoints || [];
            const from = points.find((p) => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP')?.location;
            const to = points.find((p) => p.pointType === 'DELIVERY')?.location;
            const city = (l?: { city: string | null; address: string | null } | null) => l?.city || l?.address || '';
            return {
                id: document.id,
                type: document.type,
                fileName: document.fileName,
                fileSize: document.fileSize,
                mimeType: document.mimeType,
                createdAt: document.createdAt,
                orderId: document.orderId,
                orderNumber: document.order?.orderNumber ?? null,
                orderStatus: document.order?.status ?? null,
                route: city(from) && city(to) ? `${city(from)} → ${city(to)}` : null,
                driverName: document.order?.assignedDriverName ?? null,
                driverPlate: document.order?.assignedDriverPlate ?? null,
                customer: document.order?.customerCompany?.name ?? null,
                uploadedBy: document.uploadedBy,
                uploadedByCounterparty: document.uploadedByCounterparty,
            };
        });
    }

    /**
     * Получение документов заявки
     */
    async findByOrder(orderId: string, user?: { sub: string; role: string; companyId?: string }) {
        // Проверка доступа к заявке
        if (user && user.role !== 'ADMIN') {
            await this.checkOrderAccess(orderId, user.companyId, user);
        }
        return this.prisma.document.findMany({
            where: { orderId },
            include: {
                uploadedBy: { select: { id: true, firstName: true, lastName: true } },
                // Файл мог прийти от контрагента по ссылке на отчёт: тогда
                // человека-автора нет вовсе, и подписать документ надо
                // организацией — иначе в списке он выглядит ничейным.
                uploadedByCounterparty: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Получение документа по ID
     */
    async findById(id: string, user?: { sub: string; role: string; companyId?: string }) {
        const doc = await this.prisma.document.findUnique({
            where: { id },
            include: {
                order: {
                    select: {
                        id: true,
                        customerCompanyId: true,
                        forwarderId: true,
                        partnerId: true,
                        driverId: true,
                        responsibleManager: { select: { companyId: true } },
                    },
                },
                uploadedBy: { select: { id: true, firstName: true, lastName: true, companyId: true } },
            },
        });

        if (!doc) {
            throw new NotFoundException('Документ не найден');
        }

        // Проверка доступа
        if (user && user.role !== 'ADMIN') {
            // Водитель — только по своим рейсам. Документа без рейса он не
            // видит вовсе: там уставные бумаги компании и прочее, что к
            // перевозке отношения не имеет.
            if (this.isDriver(user.role)) {
                if (!doc.order || doc.order.driverId !== user.sub) {
                    throw new ForbiddenException('Нет доступа к документу');
                }
                return doc;
            }

            if (doc.order) {
                // Документ привязан к заявке — проверяем участие компании
                const isParticipant = doc.order.customerCompanyId === user.companyId
                    || doc.order.forwarderId === user.companyId
                    || doc.order.partnerId === user.companyId
                    || doc.order.responsibleManager?.companyId === user.companyId;
                if (!isParticipant) {
                    throw new ForbiddenException('Нет доступа к документу');
                }
            } else {
                // Документ без заявки — проверяем, что загрузивший принадлежит
                // той же компании. У файла от контрагента человека-автора нет
                // вовсе, и тогда принадлежность решает поле компании: без
                // этого запасного пути такой документ стал бы недоступен всем.
                const owner = doc.uploadedBy?.companyId ?? doc.companyId;
                if (!owner || owner !== user.companyId) {
                    throw new ForbiddenException('Нет доступа к документу');
                }
            }
        }

        return doc;
    }

    /**
     * Удалить файл, приложенный к рейсу.
     *
     * Удаляем только приложенные файлы — накладные, сканы, фото. Печатные
     * формы (договор-заявка, доверенность) сюда не попадают: они лежат
     * отдельными версиями и остаются навсегда, потому что уже отданы
     * контрагенту и водителю.
     *
     * Кто может: тот, кто загрузил, и руководитель компании. Логист не
     * должен уметь убрать чужую накладную — по ней закрывают рейс.
     *
     * Сам файл в хранилище не трогаем: запись — это то, что видит человек,
     * а физический файл остаётся следом на случай спора. Место он занимает
     * несравнимо меньшее, чем цена потерянной накладной.
     */
    async remove(id: string, user: { sub: string; role: string; companyId?: string }) {
        const doc = await this.findById(id, user);

        const isOwner = doc.uploadedById === user.sub;
        const isChief = ['ADMIN', 'COMPANY_ADMIN', 'FORWARDER'].includes(user.role);
        if (!isOwner && !isChief) {
            throw new ForbiddenException('Удалить может тот, кто загрузил файл, или руководитель компании');
        }

        await this.prisma.document.delete({ where: { id } });
        return { id };
    }

    /**
     * Верификация документа админом
     */
    async verify(id: string) {
        return this.prisma.document.update({
            where: { id },
            data: {
                isVerified: true,
                verifiedAt: new Date(),
            },
        });
    }

    /**
     * Генерация доверенности (возвращает данные для PDF)
     */
    async generatePowerOfAttorney(orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                driver: true,
                customer: { include: { company: true } },
                routePoints: { include: { location: true }, orderBy: { sequence: 'asc' } },
            },
        });

        if (!order || !order.driver) {
            throw new NotFoundException('Заявка или водитель не найдены');
        }

        // Данные для генерации PDF
        return {
            orderNumber: order.orderNumber,
            date: new Date(),
            driver: {
                fullName: `${order.driver.lastName} ${order.driver.firstName} ${order.driver.middleName || ''}`.trim(),
                phone: order.driver.phone,
                vehiclePlate: order.driver.vehiclePlate,
                vehicleModel: order.driver.vehicleModel,
            },
            customer: order.customer,
            cargo: {
                description: order.cargoDescription,
                weight: order.cargoWeight,
                volume: order.cargoVolume,
            },
            routePoints: order.routePoints,
        };
    }
}