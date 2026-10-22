import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractPdfService } from './contract-pdf.service';
import { ContractSignedFileService } from './contract-signed-file.service';

@Module({
    controllers: [ContractsController],
    providers: [ContractsService, ContractPdfService, ContractSignedFileService],
    exports: [ContractsService, ContractPdfService],
})
export class ContractsModule { }
