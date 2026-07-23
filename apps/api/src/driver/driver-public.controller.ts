import { Controller, Get, Post, Param, Body, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { DriverService } from './driver.service';

// Публичные эндпоинты для водителя (по секретному токену, без JWT).
@Controller('public/driver')
export class DriverPublicController {
    constructor(private readonly driverService: DriverService) { }

    @Throttle({ default: { limit: 60, ttl: 60000 } })
    @Get(':token')
    async get(@Param('token') token: string) {
        return this.driverService.getByToken(token);
    }

    @Throttle({ default: { limit: 30, ttl: 60000 } })
    @Post(':token/status')
    async advance(@Param('token') token: string, @Body() body: { status?: string }) {
        return this.driverService.advanceStatus(token, body?.status);
    }

    @Throttle({ default: { limit: 30, ttl: 60000 } })
    @Post(':token/problem')
    async problem(@Param('token') token: string, @Body() body: { comment?: string }) {
        return this.driverService.reportProblem(token, body?.comment);
    }

    @Throttle({ default: { limit: 120, ttl: 60000 } })
    @Post(':token/location')
    async location(@Param('token') token: string, @Body() body: { latitude: number; longitude: number; accuracy?: number; speed?: number; heading?: number }) {
        return this.driverService.recordLocation(token, body);
    }

    @Throttle({ default: { limit: 10, ttl: 60000 } })
    @Post(':token/ttn')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
    async uploadTtn(@Param('token') token: string, @UploadedFile() file: Express.Multer.File) {
        return this.driverService.uploadTtn(token, file);
    }
}
