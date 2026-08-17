import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    Get,
    Param,
    Post,
    Request,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadedFile, UseInterceptors } from '@nestjs/common';
import { CompanyType, DocumentType, UserRole } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { Response } from 'express';
import { Res } from '@nestjs/common';
import { AllowWithoutCompany, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { setAuthCookie } from '../auth/auth-cookie';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityService } from '../identity/identity.service';
import { CompanyVerificationService } from './services/company-verification.service';

class CreateMyCompanyDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    name!: string;

    @IsString()
    @IsNotEmpty()
    @Length(12, 12, { message: 'БИН должен содержать 12 цифр' })
    bin!: string;

    @IsEnum(CompanyType)
    type!: CompanyType;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    directorName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    address?: string;
}

/**
 * Своя организация: создание и прохождение проверки.
 *
 * Отдельно от `/company` (настройки уже работающей компании), потому что
 * сюда пользователь попадает ДО того, как компания у него появилась —
 * сразу после регистрации личного профиля.
 */
@ApiTags('my-company')
@ApiBearerAuth()
@Controller('my-company')
@UseGuards(JwtAuthGuard)
// Единственный раздел, ради которого человек без организации сюда и заходит.
@AllowWithoutCompany()
export class MyCompanyController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly verification: CompanyVerificationService,
        private readonly identity: IdentityService,
        private readonly audit: AuditService,
        private readonly auth: AuthService,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Своя организация и состояние её проверки' })
    async getMine(@Request() req: any) {
        if (!req.user.companyId) return { company: null, verification: null };
        return {
            company: await this.prisma.company.findUnique({
                where: { id: req.user.companyId },
                select: { id: true, name: true, bin: true, type: true, directorName: true, address: true },
            }),
            verification: await this.verification.getStatus(req.user.companyId),
            // Обязательно ли подтверждение прямо сейчас. Кабинет по этому
            // полю решает, чем грозит его отсутствие: пока не обязательно —
            // это отметка о доверии, а не запертая дверь.
            verificationRequired: await this.verification.isVerificationRequired(),
        };
    }

    @Post()
    @ApiOperation({
        summary: 'Создать свою организацию',
        description: 'Организация создаётся черновиком и работать начинает только после проверки.',
    })
    async create(
        @Request() req: any,
        @Body() dto: CreateMyCompanyDto,
        @Res({ passthrough: true }) response: Response,
    ) {
        if (req.user.companyId) {
            throw new ConflictException('У вас уже есть организация');
        }
        if (!/^\d{12}$/.test(dto.bin)) {
            throw new BadRequestException('БИН должен состоять из 12 цифр');
        }

        // БИН не проверяем на уникальность как «занят»: подтверждение всё
        // равно делает человек, а блокировка по публичному номеру позволила
        // бы занять чужой БИН и закрыть настоящему владельцу регистрацию.
        const company = await this.prisma.$transaction(async (tx) => {
            const created = await tx.company.create({
                data: {
                    name: dto.name.trim(),
                    bin: dto.bin,
                    type: dto.type,
                    directorName: dto.directorName?.trim() || null,
                    address: dto.address?.trim() || null,
                    email: req.user.email ?? null,
                    isOurCompany: false,
                    isExternal: false,
                },
            });
            await tx.user.update({
                where: { id: req.user.sub },
                data: { companyId: created.id, role: UserRole.COMPANY_ADMIN },
            });
            await tx.userCompanyRelation.create({
                data: { userId: req.user.sub, companyId: created.id, role: UserRole.COMPANY_ADMIN },
            });
            return created;
        });

        try {
            await this.identity.syncMembership(req.user.sub, company.id, UserRole.COMPANY_ADMIN as any, {
                isPrimary: true,
            });
        } catch (error) {
            // Двойная запись в новый слой идентичности не должна ронять
            // создание организации.
            console.warn('syncMembership (create-my-company) failed:', error);
        }

        await this.audit.log({
            companyId: company.id,
            user: req.user,
            action: 'CREATE',
            entity: 'company',
            entityId: company.id,
            entityLabel: `Организация «${company.name}» (БИН ${company.bin})`,
        });

        // Прежний токен выдан без companyId — без обновления пользователю
        // пришлось бы перелогиниваться, чтобы попасть в свою же организацию.
        // Сессию перевыпускаем через auth: без её записи новый токен будет
        // отвергнут как недействительный.
        setAuthCookie(response, await this.auth.issueSession(req.user.sub, {
            sub: req.user.sub,
            email: req.user.email ?? null,
            role: UserRole.COMPANY_ADMIN,
            companyId: company.id,
        }, 'web'));

        return company;
    }

    @Post('verification/documents/:type')
    @UseInterceptors(FileInterceptor('file', {
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            // Документы присылают сканом или выгрузкой с eGov.
            const allowed = /^(application\/pdf|image\/(png|jpe?g))$/.test(file.mimetype);
            cb(allowed ? null : new BadRequestException('Допустимы PDF, PNG и JPG'), allowed);
        },
    }))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Приложить документ для подтверждения организации' })
    async uploadDocument(
        @Request() req: any,
        @Param('type') type: string,
        @UploadedFile() file: Express.Multer.File,
    ) {
        if (!req.user.companyId) {
            throw new BadRequestException('Сначала создайте организацию');
        }
        if (!file) throw new BadRequestException('Файл не приложен');
        if (!(type in DocumentType)) {
            throw new BadRequestException('Неизвестный вид документа');
        }
        return this.verification.attachDocument(
            req.user.companyId,
            req.user.sub,
            type as DocumentType,
            file,
        );
    }

    @Post('verification/submit')
    @ApiOperation({ summary: 'Отправить организацию на проверку' })
    async submit(@Request() req: any) {
        if (!req.user.companyId) {
            throw new BadRequestException('Сначала создайте организацию');
        }
        const result = await this.verification.submit(req.user.companyId);
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'STATUS',
            entity: 'company',
            entityId: req.user.companyId,
            entityLabel: 'Организация отправлена на проверку',
        });
        return result;
    }
}
