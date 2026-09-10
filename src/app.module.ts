import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiseaseModule } from './disease/disease.module';
import { GoogleSheetsModule } from './google-sheets/google-sheets.module';
import { ValidationModule } from './validation/validation.module';
import { AutomationModule } from './automation/automation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DiseaseModule,
    GoogleSheetsModule,
    ValidationModule,
    AutomationModule,
  ],
})
export class AppModule {}
