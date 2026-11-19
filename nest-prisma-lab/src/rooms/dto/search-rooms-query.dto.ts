import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class SearchRoomsQueryDto extends PaginationQueryDto {
  @ApiProperty({ example: '2026-12-24T14:00:00.000Z' })
  @IsISO8601({ strict: true })
  check_in: string;

  @ApiProperty({ example: '2026-12-26T11:00:00.000Z' })
  @IsISO8601({ strict: true })
  check_out: string;

  @ApiPropertyOptional({
    example: 2,
    description: 'Minimum number of guests the room must fit',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;
}
