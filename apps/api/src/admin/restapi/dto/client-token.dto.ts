import { ApiProperty } from '@nestjs/swagger';
import { ClientType } from '@app/common';

/** 외부 API 토큰 정보. 토큰 값 자체는 내보내지 않는다 */
export class ClientTokenItemDto {
  @ApiProperty({ enum: ClientType, description: '외부 API 종류' })
  clientType: ClientType;

  @ApiProperty({
    description: '토큰을 마지막으로 발급(저장)한 시각',
  })
  updatedAt: Date;
}
