import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BlocklistController } from './blocklist.controller';
import { BlocklistService } from './blocklist.service';

@Module({
    imports: [AuditModule],
    controllers: [BlocklistController],
    providers: [BlocklistService],
})
export class BlocklistModule { }
