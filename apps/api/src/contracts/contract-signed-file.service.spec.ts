import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ContractSignedFileService } from './contract-signed-file.service';

/** Подписанный экземпляр договора (G5). */
describe('подписанный договор файлом', () => {
    const contract = {
        id: 'k1', contractNumber: '12', customerCompanyId: 'cust', forwarderCompanyId: 'fwd',
        signedFileUrl: null as string | null, signedFileName: null, signedFileMime: null,
    };
    const pdf = { originalname: 'dogovor.pdf', buffer: Buffer.from('%PDF'), mimetype: 'application/pdf', size: 4 };

    function setup(existing: Partial<typeof contract> = {}) {
        const prisma = {
            contract: {
                findUnique: jest.fn().mockResolvedValue({ ...contract, ...existing }),
                update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'k1', ...data })),
            },
        } as any;
        const s3 = {
            isS3Enabled: jest.fn().mockReturnValue(true),
            uploadFile: jest.fn().mockResolvedValue('key'),
            deleteFile: jest.fn().mockResolvedValue(undefined),
            downloadFile: jest.fn(),
        } as any;
        return { prisma, s3, service: new ContractSignedFileService(prisma, s3) };
    }

    it('обе стороны договора могут приложить файл, чужая компания — нет', async () => {
        const { service, s3 } = setup();
        await expect(service.attach('k1', 'cust', pdf)).resolves.toEqual(expect.objectContaining({ signedFileName: 'dogovor.pdf' }));
        await expect(service.attach('k1', 'fwd', pdf)).resolves.toBeTruthy();
        await expect(service.attach('k1', 'stranger', pdf)).rejects.toBeInstanceOf(ForbiddenException);
        expect(s3.uploadFile).toHaveBeenCalledTimes(2);
        expect(s3.uploadFile.mock.calls[0][0]).toMatch(/^uploads\/contracts\/k1_\d+_dogovor\.pdf$/);
    });

    it('принимает только PDF и фото — страницу или архив не берёт', async () => {
        const { service, s3 } = setup();
        await expect(service.attach('k1', 'cust', { ...pdf, mimetype: 'text/html' })).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.attach('k1', 'cust', undefined)).rejects.toBeInstanceOf(BadRequestException);
        expect(s3.uploadFile).not.toHaveBeenCalled();
    });

    it('новый файл заменяет прежний — старый удаляется из хранилища', async () => {
        const { service, s3 } = setup({ signedFileUrl: 'uploads/contracts/k1_1_old.pdf' });
        await service.attach('k1', 'cust', pdf);
        expect(s3.deleteFile).toHaveBeenCalledWith('uploads/contracts/k1_1_old.pdf');
    });

    it('скачать нечего — понятный ответ, а не пустой файл', async () => {
        const { service } = setup();
        await expect(service.open('k1', 'cust')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('убрать файл: запись очищается, файл удаляется', async () => {
        const { service, prisma, s3 } = setup({ signedFileUrl: 'uploads/contracts/k1_1_old.pdf' });
        await expect(service.remove('k1', 'fwd')).resolves.toEqual({ removed: true });
        expect(prisma.contract.update.mock.calls[0][0].data).toEqual(expect.objectContaining({ signedFileUrl: null, signedUploadedAt: null }));
        expect(s3.deleteFile).toHaveBeenCalledWith('uploads/contracts/k1_1_old.pdf');
    });
});
