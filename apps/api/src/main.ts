import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { execSync } from 'child_process';
import * as compression from 'compression';

// Force rebuild 2026-02-02

async function bootstrap() {
    // Run database migrations/db push programmatically on startup
    try {
        console.log('🔄 Running database schema migration (prisma db push)...');
        
        let migrated = false;
        const commands = [
            'npx prisma db push --accept-data-loss',
            'node node_modules/prisma/build/index.js db push --accept-data-loss',
            'node ../node_modules/prisma/build/index.js db push --accept-data-loss',
            'node ../../node_modules/prisma/build/index.js db push --accept-data-loss',
            'node ../../../node_modules/prisma/build/index.js db push --accept-data-loss'
        ];

        for (const cmd of commands) {
            try {
                console.log(`Executing migration: ${cmd}`);
                const output = execSync(cmd, { encoding: 'utf-8' });
                console.log(`✅ Success output for [${cmd}]:`, output);
                migrated = true;
                break;
            } catch (err: any) {
                console.warn(`⚠️ Command [${cmd}] failed:`, err.message || err);
            }
        }

        if (!migrated) {
            console.error('❌ All programmatic migration attempts failed. Please run prisma db push manually.');
        }
    } catch (error: any) {
        console.error('⚠️ Programmatic database migration failed:', error.message || error);
    }

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

    // Swagger API documentation
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

    // Auto-create admin user on startup
    const prisma = app.get(PrismaService);
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    try {
        const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
        if (!existingAdmin) {
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
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
            console.log(`✅ Admin user created: ${adminEmail}`);
        } else {
            console.log(`ℹ️ Admin user already exists: ${adminEmail}`);
        }
    } catch (error) {
        console.error('⚠️ Failed to create admin user:', error);
    }

    const port = process.env.PORT || 3001;
    await app.listen(port, '0.0.0.0');
    console.log(`🚀 LogiCore API running on http://localhost:${port}`);
    console.log(`🚀 LogiCore API accessible on LAN: http://192.168.2.103:${port}`);
    console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
