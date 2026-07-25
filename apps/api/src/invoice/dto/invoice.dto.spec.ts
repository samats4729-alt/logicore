import { InvoiceStatus, InvoiceType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInvoiceDto, UpdateInvoiceStatusDto } from './invoice.dto';

describe('Invoice DTO validation', () => {
    const validInvoice = {
        invoiceNumber: '619',
        type: InvoiceType.OUTGOING,
        date: '2026-07-22',
        dueDate: '2026-08-01',
        issuerId: 'company-1',
        recipientId: 'company-2',
        orderIds: ['order-1'],
    };

    it('accepts a valid invoice payload', async () => {
        const errors = await validate(plainToInstance(CreateInvoiceDto, validInvoice));

        expect(errors).toHaveLength(0);
    });

    it('rejects invalid dates and duplicate order IDs', async () => {
        const dto = plainToInstance(CreateInvoiceDto, {
            ...validInvoice,
            date: 'not-a-date',
            orderIds: ['order-1', 'order-1'],
        });

        const errors = await validate(dto);

        expect(errors.map((error) => error.property)).toEqual(
            expect.arrayContaining(['date', 'orderIds']),
        );
    });

    it('rejects an unknown invoice status', async () => {
        const dto = plainToInstance(UpdateInvoiceStatusDto, { status: 'DELETED' });

        await expect(validate(dto)).resolves.toHaveLength(1);
    });

    it('accepts a known invoice status', async () => {
        const dto = plainToInstance(UpdateInvoiceStatusDto, { status: InvoiceStatus.APPROVED });

        await expect(validate(dto)).resolves.toHaveLength(0);
    });
});
