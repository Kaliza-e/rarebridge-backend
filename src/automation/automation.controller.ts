import { Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { AutomationService } from './automation.service';

@Controller('automation')
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Post('import')
  importDocuments(@Headers('x-automation-key') key?: string) {
    this.authorize(key);
    return this.automation.run('manual');
  }

  @Get('status')
  status(@Headers('x-automation-key') key?: string) {
    this.authorize(key);
    return this.automation.getStatus();
  }

  private authorize(key?: string) {
    const expected = process.env.AUTOMATION_API_KEY;
    if (expected && key !== expected) throw new UnauthorizedException('Invalid automation key.');
  }
}
