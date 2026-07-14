import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { initSentry } from './common/sentry';
import * as bcrypt from 'bcryptjs';
import * as compression from 'compression';

// Force rebuild 2026-02-02

async function bootstrap() {
    const logger = new Logger('Bootstrap');

    initSentry();

    const app = await NestFactory.create(AppModule);

    // Включение сжатия ответов (gzip/brotli) для ускорения загрузки данных
    app.use(compression());

    // CORS - allow production domains
    const corsOrigins = process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',')
        : ['http://localhost:3000', 'http://localhost:3001'];

    app.enableCors({
        origin: corsOrigins,
        credentials: true,
    });

    // Global validation pipe
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            forbidNonWhitelisted: true,
        }),
    );

    // Global exception filter
    app.useGlobalFilters(new AllExceptionsFilter());

    // Swagger API documentation — в проде закрыт (включается только через SWAGGER_ENABLED=true)
    const swaggerEnabled = process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true';
    if (swaggerEnabled) {
        const config = new DocumentBuilder()
            .setTitle('LogiCore API')
            .setDescription('Система управления логистикой')
            .setVersion('1.0')
            .addBearerAuth()
            .addTag('auth', 'Авторизация')
            .addTag('orders', 'Заявки на перевозку')
            .addTag('users', 'Пользователи')
            .addTag('locations', 'Адреса и точки')
            .addTag('documents', 'Документы')
            .addTag('tracking', 'GPS трекинг')
            .addTag('warehouse', 'Управление складом')
            .build();

        const document = SwaggerModule.createDocument(app, config);
        SwaggerModule.setup('api/docs', app, document);
    }

    // Auto-create admin user on startup (only if credentials are explicitly set)
    const prisma = app.get(PrismaService);
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminEmail && adminPassword) {
        try {
            const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
            if (!existingAdmin) {
                const hashedPassword = await bcrypt.hash(adminPassword, 12);
                await prisma.user.create({
                    data: {
                        email: adminEmail,
                        phone: '+70000000000',
                        passwordHash: hashedPassword,
                        firstName: 'Admin',
                        lastName: 'System',
                        role: 'ADMIN',
                    },
                });
                logger.log(`✅ Admin user created: ${adminEmail}`);
            } else {
                logger.log(`ℹ️ Admin user already exists: ${adminEmail}`);
            }
        } catch (error) {
            logger.error('⚠️ Failed to create admin user:', error);
        }
    } else {
        logger.warn('⚠️ ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin user creation');
    }

    const port = process.env.PORT || 3001;
    await app.listen(port, '0.0.0.0');
    logger.log(`🚀 LogiCore API running on http://localhost:${port}`);
    if (swaggerEnabled) {
        logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
    }
}
bootstrap();
