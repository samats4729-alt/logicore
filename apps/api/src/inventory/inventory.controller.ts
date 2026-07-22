import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards, BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole, StockMoveType } from '@prisma/client';

const VIEW_ROLES = [UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT, UserRole.LOGISTICIAN, UserRole.FORWARDER];
const EDIT_ROLES = [UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT];

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
    constructor(private readonly inventory: InventoryService) { }

    // ===== Номенклатура =====
    @Get('nomenclature')
    @Roles(...VIEW_ROLES)
    getNomenclature(@Request() req: any) {
        return this.inventory.getNomenclature(req.user.companyId);
    }

    @Post('nomenclature')
    @Roles(...EDIT_ROLES)
    createNomenclature(@Request() req: any, @Body() body: { name: string; unit?: string; sku?: string }) {
        return this.inventory.createNomenclature(req.user.companyId, body);
    }

    @Put('nomenclature/:id')
    @Roles(...EDIT_ROLES)
    updateNomenclature(@Request() req: any, @Param('id') id: string, @Body() body: { name?: string; unit?: string; sku?: string; isActive?: boolean }) {
        return this.inventory.updateNomenclature(req.user.companyId, id, body);
    }

    // ===== Склады =====
    @Get('warehouses')
    @Roles(...VIEW_ROLES)
    getWarehouses(@Request() req: any) {
        return this.inventory.getWarehouses(req.user.companyId);
    }

    @Post('warehouses')
    @Roles(...EDIT_ROLES)
    createWarehouse(@Request() req: any, @Body() body: { name: string }) {
        return this.inventory.createWarehouse(req.user.companyId, body);
    }

    @Put('warehouses/:id')
    @Roles(...EDIT_ROLES)
    updateWarehouse(@Request() req: any, @Param('id') id: string, @Body() body: { name?: string; isActive?: boolean }) {
        return this.inventory.updateWarehouse(req.user.companyId, id, body);
    }

    // ===== Ведомость по остаткам =====
    @Get('balances')
    @Roles(...VIEW_ROLES)
    getBalances(@Request() req: any, @Query('warehouseId') warehouseId?: string) {
        return this.inventory.getStockBalances(req.user.companyId, warehouseId);
    }

    // ===== Документы движения (по виду) =====
    @Get('moves/:type')
    @Roles(...VIEW_ROLES)
    getMoves(@Request() req: any, @Param('type') type: string) {
        return this.inventory.getMoves(req.user.companyId, this.parseType(type));
    }

    @Post('moves/:type')
    @Roles(...EDIT_ROLES)
    createMove(@Request() req: any, @Param('type') type: string, @Body() body: any) {
        return this.inventory.createMove(req.user.companyId, req.user.sub || req.user.id, { ...body, type: this.parseType(type) });
    }

    @Put('moves/:id')
    @Roles(...EDIT_ROLES)
    updateMove(@Request() req: any, @Param('id') id: string, @Body() body: any) {
        return this.inventory.updateMove(req.user.companyId, id, body);
    }

    @Delete('moves/:id')
    @Roles(...EDIT_ROLES)
    deleteMove(@Request() req: any, @Param('id') id: string) {
        return this.inventory.deleteMove(req.user.companyId, id);
    }

    private parseType(type: string): StockMoveType {
        const map: Record<string, StockMoveType> = {
            receipt: StockMoveType.RECEIPT,
            transfer: StockMoveType.TRANSFER,
            writeoff: StockMoveType.WRITEOFF,
        };
        const resolved = map[type] || (StockMoveType as any)[type];
        if (!resolved) throw new BadRequestException('Неизвестный вид документа');
        return resolved;
    }
}
