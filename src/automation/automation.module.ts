import { Module } from '@nestjs/common';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { GoogleSheetsModule } from '../google-sheets/google-sheets.module';
import { ValidationModule } from '../validation/validation.module';

@Module({
  imports: [GoogleSheetsModule, ValidationModule],
  controllers: [AutomationController],
  providers: [AutomationService],
})
export class AutomationModule {}
