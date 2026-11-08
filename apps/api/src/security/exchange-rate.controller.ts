import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type ImportExchangeRatesResult,
  ExchangeRateService,
} from './exchange-rate.service.js';
import {
  type ImportExchangeRatesRequest,
  importExchangeRatesSchema,
} from './import-exchange-rates.schema.js';

@ApiTags('exchange-rate')
@Controller('exchange-rates')
export class ExchangeRateController {
  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  @Post('import')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '환율 가져오기: Massive API로 USD/KRW 일봉을 daily_exchange_rate에 저장 (기간 생략 시 최근 2년)',
  })
  import(
    @Body({ schema: importExchangeRatesSchema })
    body: ImportExchangeRatesRequest,
  ): Promise<ImportExchangeRatesResult> {
    return this.exchangeRateService.importFromMassive(body);
  }
}
