import { Controller, Get, Headers, HttpException, HttpStatus, Post, UnauthorizedException } from '@nestjs/common';
import { AutomationService } from './automation.service';

@Controller('automation')
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Post('import')
  async importDocuments(@Headers('x-automation-key') key?: string) {
    this.authorize(key);
    try {
      return await this.automation.run('manual');
    } catch (error: any) {
      throw new HttpException(
        { message: 'Automation import failed.', report: this.automation.getStatus().latestReport },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Get('status')
  status(@Headers('x-automation-key') key?: string) {
    this.authorize(key);
    return this.automation.getStatus();
  }

  @Get('logs')
  logs(@Headers('x-automation-key') key?: string) {
    this.authorize(key);
    return { logs: this.automation.getLogs() };
  }

  private authorize(key?: string) {
    const expected = process.env.AUTOMATION_API_KEY;
    if (expected && key !== expected) throw new UnauthorizedException('Invalid automation key.');
  }
}
