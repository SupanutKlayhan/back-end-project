import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, Min } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ example: 1, description: 'Id of an active room' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  room_id: number;

  @ApiProperty({
    example: '2026-12-24T14:00:00.000Z',
    description: 'ISO-8601 date-time (use UTC, e.g. with a trailing Z)',
  })
  @IsISO8601({ strict: true })
  check_in: string;

  @ApiProperty({ example: '2026-12-26T11:00:00.000Z' })
  @IsISO8601({ strict: true })
  check_out: string;
}
