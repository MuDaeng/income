import { ApiProperty } from '@nestjs/swagger';

/** 일회용 국내 시세 전체 적재 시작 응답. 다 쓰고 나면 API와 함께 지운다 */
export class DomesticDailyPriceImportDto {
  @ApiProperty({ description: '적재 시작일 (2020-01-01)' })
  from: string;

  @ApiProperty({ description: '적재 종료일 (한국 시간 오늘)' })
  to: string;
}
