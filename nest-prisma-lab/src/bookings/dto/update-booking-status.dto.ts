import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateBookingStatusDto {
  @ApiProperty({ enum: BookingStatus, example: BookingStatus.APPROVED })
  @IsEnum(BookingStatus)
  status: BookingStatus;
}
