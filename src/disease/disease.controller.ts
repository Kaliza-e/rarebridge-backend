import { Controller, Get, Param, Query } from '@nestjs/common';
import { DiseaseService } from './disease.service';

@Controller('diseases')
export class DiseaseController {
  constructor(private readonly diseaseService: DiseaseService) {}

  @Get()
  findAll(@Query('search') search?: string, @Query('category') category?: string) {
    return this.diseaseService.findAll(search, category);
  }

  @Get('categories')
  getCategories() {
    return this.diseaseService.getCategories();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.diseaseService.findOne(id);
  }

  @Get('number/:diseaseNumber')
  findByDiseaseNumber(@Param('diseaseNumber') diseaseNumber: string) {
    return this.diseaseService.findByDiseaseNumber(diseaseNumber);
  }
}
