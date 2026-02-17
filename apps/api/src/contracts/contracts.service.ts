import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContractsService {
    constructor(private prisma: PrismaService) { }

    // ==================== CONTRACTS ====================

    /**
     * Создать договор (экспедитор создаёт)
     */
    async createContract(forwarderCompanyId: string, data: {
        customerCompanyId: string;
        contractNumber: string;
        startDate?: Date;
        endDate?: Date;
        notes?: string;
    }) {
        // Проверяем что компания-заказчик существует
        const customer = await this.prisma.company.findUnique({
            where: { id: data.customerCompanyId },
        });
        if (!customer) throw new NotFoundException('Компания-заказчик не найдена');

        // Проверяем что есть партнёрство
        const partnership = await this.prisma.partnership.findFirst({
            where: {
                OR: [
                    { requesterId: forwarderCompanyId, recipientId: data.customerCompanyId },
                    { requesterId: data.customerCompanyId, recipientId: forwarderCompanyId },
                ],
                status: 'ACCEPTED',
            },
        });
        if (!partnership) {
            throw new ForbiddenException('Нет партнёрства с этой компанией. Сначала установите партнёрские отношения.');
        }

        return this.prisma.contract.create({
            data: {
                contractNumber: data.contractNumber,
                customerCompanyId: data.customerCompanyId,
                forwarderCompanyId,
                startDate: data.startDate,
                endDate: data.endDate,
                notes: data.notes,
                status: 'ACTIVE',
            },
            include: {
                customerCompany: { select: { id: true, name: true } },
                forwarderCompany: { select: { id: true, name: true } },
            },
        });
    }

    /**
     * Получить договоры (для экспедитора или заказчика)
     */
    async getContracts(companyId: string) {
        return this.prisma.contract.findMany({
            where: {
                OR: [
                    { customerCompanyId: companyId },
                    { forwarderCompanyId: companyId },
                ],
            },
            include: {
                customerCompany: { select: { id: true, name: true, bin: true } },
                forwarderCompany: { select: { id: true, name: true, bin: true } },
                agreements: {
                    include: {
                        tariffs: {
                            include: {
                                originCity: { select: { id: true, name: true, region: { select: { name: true } }, country: { select: { name: true } } } },
                                destinationCity: { select: { id: true, name: true, region: { select: { name: true } }, country: { select: { name: true } } } },
                            },
                            orderBy: { createdAt: 'desc' as const },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    // Общий include для тарифов с городами
    private tariffInclude = {
        originCity: { select: { id: true, name: true, region: { select: { name: true } }, country: { select: { name: true } } } },
        destinationCity: { select: { id: true, name: true, region: { select: { name: true } }, country: { select: { name: true } } } },
    };

    /**
     * Получить один договор
     */
    async getContract(contractId: string, companyId: string) {
        const contract = await this.prisma.contract.findUnique({
            where: { id: contractId },
            include: {
                customerCompany: { select: { id: true, name: true, bin: true, phone: true, email: true } },
                forwarderCompany: { select: { id: true, name: true, bin: true, phone: true, email: true } },
                agreements: {
                    include: {
                        tariffs: {
                            include: this.tariffInclude,
                            orderBy: { createdAt: 'desc' },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        if (!contract) throw new NotFoundException('Договор не найден');
        if (contract.customerCompanyId !== companyId && contract.forwarderCompanyId !== companyId) {
            throw new ForbiddenException('Нет доступа к этому договору');
        }

        return contract;
    }

    // ==================== SUPPLEMENTARY AGREEMENTS ====================

    /**
     * Создать доп. соглашение (экспедитор или заказчик)
     */
    async createAgreement(companyId: string, contractId: string, data: {
        agreementNumber: string;
        validFrom?: Date;
        validTo?: Date;
        notes?: string;
        createdById?: string;
        tariffs?: { originCityId: string; destinationCityId: string; price: number; vehicleType?: string }[];
    }) {
        const contract = await this.prisma.contract.findUnique({
            where: { id: contractId },
        });
        if (!contract) throw new NotFoundException('Договор не найден');

        // Определяем кто создаёт
        let proposedBy = 'FORWARDER';
        if (contract.forwarderCompanyId === companyId) {
            proposedBy = 'FORWARDER';
        } else if (contract.customerCompanyId === companyId) {
            proposedBy = 'CUSTOMER';
        } else {
            throw new ForbiddenException('Нет доступа к этому договору');
        }

        return this.prisma.supplementaryAgreement.create({
            data: {
                agreementNumber: data.agreementNumber,
                contractId,
                proposedBy,
                validFrom: data.validFrom,
                validTo: data.validTo,
                notes: data.notes,
                createdById: data.createdById,
                status: 'DRAFT',
                tariffs: data.tariffs ? {
                    create: data.tariffs.map(t => ({
                        originCityId: t.originCityId,
                        destinationCityId: t.destinationCityId,
                        price: t.price,
                        vehicleType: t.vehicleType,
                    })),
                } : undefined,
            },
            include: {
                tariffs: { include: this.tariffInclude },
                contract: {
                    include: {
                        customerCompany: { select: { id: true, name: true } },
                        forwarderCompany: { select: { id: true, name: true } },
                    },
                },
            },
        });
    }

    /**
     * Отправить доп. соглашение на согласование
     */
    async sendAgreementForApproval(companyId: string, agreementId: string) {
        const agreement = await this.prisma.supplementaryAgreement.findUnique({
            where: { id: agreementId },
            include: { contract: true },
        });

        if (!agreement) throw new NotFoundException('Доп. соглашение не найдено');

        // Проверяем что отправляет тот, кто создал
        const isForwarder = agreement.contract.forwarderCompanyId === companyId;
        const isCustomer = agreement.contract.customerCompanyId === companyId;
        if (!isForwarder && !isCustomer) {
            throw new ForbiddenException('Нет доступа');
        }

        if (agreement.status !== 'DRAFT') {
            throw new BadRequestException('Отправить на согласование можно только черновик');
        }

        const tariffCount = await this.prisma.routeTariff.count({
            where: { agreementId },
        });
        if (tariffCount === 0) {
            throw new BadRequestException('Добавьте хотя бы один тариф перед отправкой');
        }

        return this.prisma.supplementaryAgreement.update({
            where: { id: agreementId },
            data: { status: 'PENDING' },
            include: { tariffs: { include: this.tariffInclude } },
        });
    }

    /**
     * Утвердить доп. соглашение (противоположная сторона)
     */
    async approveAgreement(companyId: string, agreementId: string, approvedById: string) {
        const agreement = await this.prisma.supplementaryAgreement.findUnique({
            where: { id: agreementId },
            include: { contract: true },
        });

        if (!agreement) throw new NotFoundException('Доп. соглашение не найдено');
        if (agreement.status !== 'PENDING') {
            throw new BadRequestException('Соглашение не на согласовании');
        }

        // Утвердить может только противоположная сторона
        if (agreement.proposedBy === 'FORWARDER' && agreement.contract.customerCompanyId !== companyId) {
            throw new ForbiddenException('Только заказчик может утвердить это ДС');
        }
        if (agreement.proposedBy === 'CUSTOMER' && agreement.contract.forwarderCompanyId !== companyId) {
            throw new ForbiddenException('Только экспедитор может утвердить это ДС');
        }

        return this.prisma.supplementaryAgreement.update({
            where: { id: agreementId },
            data: {
                status: 'APPROVED',
                approvedById,
                approvedAt: new Date(),
            },
            include: { tariffs: { include: this.tariffInclude } },
        });
    }

    /**
     * Отклонить доп. соглашение (противоположная сторона)
     */
    async rejectAgreement(companyId: string, agreementId: string, reason?: string) {
        const agreement = await this.prisma.supplementaryAgreement.findUnique({
            where: { id: agreementId },
            include: { contract: true },
        });

        if (!agreement) throw new NotFoundException('Доп. соглашение не найдено');
        if (agreement.status !== 'PENDING') {
            throw new BadRequestException('Соглашение не на согласовании');
        }

        // Отклонить может только противоположная сторона
        if (agreement.proposedBy === 'FORWARDER' && agreement.contract.customerCompanyId !== companyId) {
            throw new ForbiddenException('Нет доступа');
        }
        if (agreement.proposedBy === 'CUSTOMER' && agreement.contract.forwarderCompanyId !== companyId) {
            throw new ForbiddenException('Нет доступа');
        }

        return this.prisma.supplementaryAgreement.update({
            where: { id: agreementId },
            data: {
                status: 'REJECTED',
                rejectedAt: new Date(),
                rejectionReason: reason,
            },
            include: { tariffs: { include: this.tariffInclude } },
        });
    }

    /**
     * Получить входящие ДС на согласование (универсальный — для обеих сторон)
     */
    async getPendingAgreements(companyId: string) {
        return this.prisma.supplementaryAgreement.findMany({
            where: {
                status: 'PENDING',
                OR: [
                    // ДС от экспедитора — ждёт утверждения заказчиком
                    { proposedBy: 'FORWARDER', contract: { customerCompanyId: companyId } },
                    // ДС от заказчика — ждёт утверждения экспедитором
                    { proposedBy: 'CUSTOMER', contract: { forwarderCompanyId: companyId } },
                ],
            },
            include: {
                tariffs: { include: this.tariffInclude },
                contract: {
                    include: {
                        forwarderCompany: { select: { id: true, name: true } },
                        customerCompany: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    // ==================== TARIFFS ====================

    /**
     * Добавить тариф к доп. соглашению
     */
    async addTariff(companyId: string, agreementId: string, data: {
        originCityId: string;
        destinationCityId: string;
        price: number;
        vehicleType?: string;
    }) {
        const agreement = await this.prisma.supplementaryAgreement.findUnique({
            where: { id: agreementId },
            include: { contract: true },
        });

        if (!agreement) throw new NotFoundException('Доп. соглашение не найдено');
        // Добавлять тарифы может любая сторона договора
        if (agreement.contract.forwarderCompanyId !== companyId && agreement.contract.customerCompanyId !== companyId) {
            throw new ForbiddenException('Нет доступа');
        }
        if (agreement.status !== 'DRAFT' && agreement.status !== 'APPROVED') {
            throw new BadRequestException('Нельзя добавлять тарифы в этом статусе');
        }

        // Проверяем что города существуют
        const [origin, destination] = await Promise.all([
            this.prisma.city.findUnique({ where: { id: data.originCityId } }),
            this.prisma.city.findUnique({ where: { id: data.destinationCityId } }),
        ]);
        if (!origin) throw new NotFoundException('Город отправления не найден');
        if (!destination) throw new NotFoundException('Город назначения не найден');

        const tariff = await this.prisma.routeTariff.create({
            data: {
                agreementId,
                originCityId: data.originCityId,
                destinationCityId: data.destinationCityId,
                price: data.price,
                vehicleType: data.vehicleType,
            },
            include: this.tariffInclude,
        });

        // Если ДС было утверждено — автоматически отправляем на повторное согласование
        if (agreement.status === 'APPROVED') {
            await this.prisma.supplementaryAgreement.update({
                where: { id: agreementId },
                data: { status: 'PENDING' },
            });
        }

        return tariff;
    }

    /**
     * Удалить тариф
     */
    async removeTariff(companyId: string, tariffId: string) {
        const tariff = await this.prisma.routeTariff.findUnique({
            where: { id: tariffId },
            include: {
                agreement: {
                    include: { contract: true },
                },
            },
        });

        if (!tariff) throw new NotFoundException('Тариф не найден');
        if (tariff.agreement.contract.forwarderCompanyId !== companyId) {
            throw new ForbiddenException('Нет доступа');
        }

        const result = await this.prisma.routeTariff.delete({
            where: { id: tariffId },
        });

        // Если ДС было утверждено — отправляем на повторное согласование
        if (tariff.agreement.status === 'APPROVED') {
            await this.prisma.supplementaryAgreement.update({
                where: { id: tariff.agreementId },
                data: { status: 'PENDING' },
            });
        }

        return result;
    }

    /**
     * Обновить тариф
     */
    async updateTariff(companyId: string, tariffId: string, data: {
        price?: number;
        vehicleType?: string;
        isActive?: boolean;
    }) {
        const tariff = await this.prisma.routeTariff.findUnique({
            where: { id: tariffId },
            include: {
                agreement: {
                    include: { contract: true },
                },
            },
        });

        if (!tariff) throw new NotFoundException('Тариф не найден');
        if (tariff.agreement.contract.forwarderCompanyId !== companyId) {
            throw new ForbiddenException('Нет доступа');
        }

        const updated = await this.prisma.routeTariff.update({
            where: { id: tariffId },
            data,
            include: this.tariffInclude,
        });

        // Если ДС было утверждено — отправляем на повторное согласование
        if (tariff.agreement.status === 'APPROVED') {
            await this.prisma.supplementaryAgreement.update({
                where: { id: tariff.agreementId },
                data: { status: 'PENDING' },
            });
        }

        return updated;
    }

    // ==================== TARIFF LOOKUP ====================

    /**
     * Найти тариф по маршруту для конкретных компаний
     * Используется при создании заявки для автоподстановки цены
     */
    async lookupTariff(
        customerCompanyId: string,
        forwarderCompanyId: string,
        originCityId: string,
        destinationCityId: string,
        vehicleType?: string,
    ) {
        const now = new Date();

        const where: any = {
            originCityId,
            destinationCityId,
            isActive: true,
            agreement: {
                status: 'APPROVED',
                OR: [
                    { validTo: null },
                    { validTo: { gte: now } },
                ],
                contract: {
                    customerCompanyId,
                    forwarderCompanyId,
                    status: 'ACTIVE',
                },
            },
        };

        const tariffIncludeWithAgreement = {
            ...this.tariffInclude,
            agreement: {
                select: {
                    id: true,
                    agreementNumber: true,
                    contract: {
                        select: {
                            id: true,
                            contractNumber: true,
                        },
                    },
                },
            },
        };

        // Если указан тип кузова, ищем сначала с ним
        if (vehicleType) {
            const specificTariff = await this.prisma.routeTariff.findFirst({
                where: { ...where, vehicleType },
                include: tariffIncludeWithAgreement,
                orderBy: { createdAt: 'desc' },
            });

            if (specificTariff) return specificTariff;
        }

        // Ищем общий тариф (без типа кузова)
        return this.prisma.routeTariff.findFirst({
            where: { ...where, vehicleType: null },
            include: tariffIncludeWithAgreement,
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Поиск тарифа по маршруту (для заказчика — ищет по всем его договорам)
     * Принимает city name и ищет по нему
     */
    async lookupTariffForCustomer(
        customerCompanyId: string,
        originCityName: string,
        destinationCityName: string,
        vehicleType?: string,
    ) {
        const now = new Date();

        // Ищем города по имени (case-insensitive)
        const [originCities, destCities] = await Promise.all([
            this.prisma.city.findMany({
                where: { name: { equals: originCityName, mode: 'insensitive' } },
                select: { id: true },
            }),
            this.prisma.city.findMany({
                where: { name: { equals: destinationCityName, mode: 'insensitive' } },
                select: { id: true },
            }),
        ]);

        if (originCities.length === 0 || destCities.length === 0) {
            return null;
        }

        const originCityIds = originCities.map(c => c.id);
        const destCityIds = destCities.map(c => c.id);

        const where: any = {
            originCityId: { in: originCityIds },
            destinationCityId: { in: destCityIds },
            isActive: true,
            agreement: {
                status: 'APPROVED',
                OR: [
                    { validTo: null },
                    { validTo: { gte: now } },
                ],
                contract: {
                    customerCompanyId,
                    status: 'ACTIVE',
                },
            },
        };

        const tariffIncludeWithAgreement = {
            ...this.tariffInclude,
            agreement: {
                select: {
                    id: true,
                    agreementNumber: true,
                    contract: {
                        select: {
                            id: true,
                            contractNumber: true,
                            forwarderCompany: { select: { id: true, name: true } },
                        },
                    },
                },
            },
        };

        if (vehicleType) {
            const specificTariff = await this.prisma.routeTariff.findFirst({
                where: { ...where, vehicleType },
                include: tariffIncludeWithAgreement,
                orderBy: { createdAt: 'desc' },
            });

            if (specificTariff) return specificTariff;
        }

        return this.prisma.routeTariff.findFirst({
            where: { ...where, vehicleType: null },
            include: tariffIncludeWithAgreement,
            orderBy: { createdAt: 'desc' },
        });
    }
}
