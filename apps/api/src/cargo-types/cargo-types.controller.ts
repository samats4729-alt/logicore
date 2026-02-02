import { Controller, Get, Post, Body, Delete, Param } from '@nestjs/common';
import { CargoTypesService } from './cargo-types.service';

@Controller('cargo-types')
export class CargoTypesController {
    constructor(private readonly cargoTypesService: CargoTypesService) { }

    @Get()
    findAll() {
        return this.cargoTypesService.findAll();
    }

    @Post('categories')
    createCategory(@Body('name') name: string) {
        return this.cargoTypesService.createCategory(name);
    }

    @Post('types')
    createType(@Body() body: { name: string; categoryId: string }) {
        return this.cargoTypesService.createType(body.name, body.categoryId);
    }

    @Delete('types/:id')
    removeType(@Param('id') id: string) {
        return this.cargoTypesService.removeType(id);
    }

    @Delete('categories/:id')
    removeCategory(@Param('id') id: string) {
        return this.cargoTypesService.removeCategory(id);
    }
}
