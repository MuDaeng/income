import { ApiProperty } from '@nestjs/swagger';

export class PriceSearchItemDto {
  @ApiProperty({ description: '종목 id (ISIN)' })
  securityId: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '종목명 (종목 마스터에 없으면 null)',
  })
  name: string | null;

  @ApiProperty({
    description: '일별 시세를 마지막으로 확인한 날짜 (YYYY-MM-DD)',
  })
  lastSearchDate: string;

  @ApiProperty({ description: '생성 시각' })
  createdAt: Date;

  @ApiProperty({ description: '수정 시각' })
  updatedAt: Date;
}
