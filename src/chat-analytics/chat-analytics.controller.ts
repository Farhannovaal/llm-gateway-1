import { Controller, Get, Param, Query,HttpStatus,HttpException } from '@nestjs/common';
import { ChatAnalyticsService } from './chat-analytics.service';

@Controller('analytics/chat')
export class ChatAnalyticsController {
  constructor(private readonly analytics: ChatAnalyticsService) {}

  @Get('daily')
  getDaily(@Query('days') days?: string) {
    const d = days ? Number(days) : 30;
    return this.analytics.getDailySummary(Number.isFinite(d) ? d : 30);
  }

  @Get('sources')
  getSources(@Query('limit') limit?: string) {
    const l = limit ? Number(limit) : 10;
    return this.analytics.getTopSources(Number.isFinite(l) ? l : 10);
  }

  @Get('history-usage')
  getHistoryUsage(@Query('days') days?: string) {
    const d = days ? Number(days) : 30;
    return this.analytics.getHistoryUsage(Number.isFinite(d) ? d : 30);
  }

  @Get('modes')
  getModeUsage(@Query('days') days?: string) {
    const d = days ? Number(days) : 30;
    return this.analytics.getModeUsage(Number.isFinite(d) ? d : 30);
  }

  @Get('session-summary/:sessionId')
  getSessionSummary(
    @Param('sessionId') sessionId: string,
    @Query('maxTurns') maxTurns?: string,
  ) {
    const n = maxTurns ? Number(maxTurns) : 20;
    return this.analytics.summarizeSession(
      sessionId,
      Number.isFinite(n) ? n : 20,
    );
  }

   @Get('summary')
  async summary(
    @Query('days') daysStr?: string,
    @Query('topSources') topSourcesStr?: string,
  ) {
    const days = daysStr ? parseInt(daysStr, 10) : 30;
    const topSources = topSourcesStr ? parseInt(topSourcesStr, 10) : 5;
    return this.analytics.getGlobalSummary(days, topSources);
  }

    @Get('sessions')
  async sessions(
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
    @Query('userId') userId?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 20;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;
    return this.analytics.listSessions(limit, offset, userId);
  }

  @Get('sessions/:id/turns')
  async sessionTurns(
    @Param('id') id: string,
    @Query('maxTurns') maxStr?: string,
  ) {
    const maxTurns = maxStr ? parseInt(maxStr, 10) : 50;
    return this.analytics.getSessionTurns(id, maxTurns);
  }

  @Get('refs')
  async getRefsBySource(
    @Query('source') source?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    if (!source) {
      throw new HttpException(
        { ok: false, error: 'source is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const limit = limitStr ? Number(limitStr) || 50 : 50;
    const offset = offsetStr ? Number(offsetStr) || 0 : 0;

    try {
      const result = await this.analytics.getRefsBySource({ source, limit, offset });
      return { ok: true, ...result };
    } catch (e: any) {
      throw new HttpException(
        { ok: false, error: e?.message || String(e) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

}
