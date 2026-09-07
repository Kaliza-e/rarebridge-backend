import { Module } from '@nestjs/common';
import { DiseaseController } from './disease.controller';
import { DiseaseService } from './disease.service';
import { GoogleSheetsModule } from '../google-sheets/google-sheets.module';
import { ValidationModule } from '../validation/validation.module';

@Module({
  imports: [GoogleSheetsModule, ValidationModule],
  controllers: [DiseaseController],
  providers: [DiseaseService],
})
export class DiseaseModule {}