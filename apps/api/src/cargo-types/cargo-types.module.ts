import { Module } from '@nestjs/common';
import { CargoTypesService } from './cargo-types.service';
import { CargoTypesController } from './cargo-types.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [CargoTypesController],
    providers: [CargoTypesService],
})
export class CargoTypesModule { }
