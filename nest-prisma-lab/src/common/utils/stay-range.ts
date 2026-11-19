import { BadRequestException } from '@nestjs/common';

export function parseStayRange(
  checkInIso: string,
  checkOutIso: string,
  now: Date = new Date(),
): { checkIn: Date; checkOut: Date } {
  const checkIn = new Date(checkInIso);
  const checkOut = new Date(checkOutIso);

  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
    throw new BadRequestException(
      'check_in and check_out must be valid ISO-8601 date-times',
    );
  }
  if (checkIn.getTime() >= checkOut.getTime()) {
    throw new BadRequestException('check_in must be before check_out');
  }
  if (checkIn.getTime() < now.getTime()) {
    throw new BadRequestException('check_in must not be in the past');
  }
  return { checkIn, checkOut };
}
