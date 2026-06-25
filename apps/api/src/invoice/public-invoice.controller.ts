import { Controller, Get, Put, Body, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InvoiceService } from './invoice.service';

@ApiTags('public-invoices')
@Controller()
export class PublicInvoiceController {
    constructor(private invoiceService: InvoiceService) {}

    @Throttle({ default: { limit: 20, ttl: 60000 } })
    @Get('public/invoice/:token')
    @ApiOperation({ summary: 'Публичный просмотр счета по токену' })
    async getPublicInvoiceByToken(@Param('token') token: string) {
        return this.invoiceService.getPublicInvoiceByToken(token);
    }

    @Throttle({ default: { limit: 10, ttl: 60000 } })
    @Put('public/invoice/:token/dispute')
    @ApiOperation({ summary: 'Оспорить счет / предложить скорректированные цены' })
    async disputePublicInvoice(
        @Param('token') token: string,
        @Body() dto: {
            proposedPrices: {
                orderId: string;
                proposedCustomerPrice?: number;
                proposedDriverCost?: number;
                proposedSubForwarderPrice?: number;
            }[];
        },
    ) {
        return this.invoiceService.disputePublicInvoice(token, dto.proposedPrices);
    }
}
