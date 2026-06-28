import { Controller, Get, Post, Body, Delete, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CargoTypesService } from './cargo-types.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';

@ApiTags('cargo-types')
@Controller('cargo-types')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CargoTypesController {
    constructor(private readonly cargoTypesService: CargoTypesService) { }

    @Get()
    findAll() {
        return this.cargoTypesService.findAll();
    }

    @Post('categories')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
    createCategory(@Body('name') name: string) {
        return this.cargoTypesService.createCategory(name);
    }

    @Post('types')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
    createType(@Body() body: { name: string; categoryId: string }) {
        return this.cargoTypesService.createType(body.name, body.categoryId);
    }

    @Delete('types/:id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
    removeType(@Param('id') id: string) {
        return this.cargoTypesService.removeType(id);
    }

    @Delete('categories/:id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
    removeCategory(@Param('id') id: string) {
        return this.cargoTypesService.removeCategory(id);
    }
}
