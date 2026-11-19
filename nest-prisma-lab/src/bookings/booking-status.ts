import { BookingStatus, Role } from '@prisma/client';

const ADMIN_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING: ['APPROVED', 'CANCELLED'],
  APPROVED: ['PAID', 'CANCELLED'],
  PAID: [],
  CANCELLED: [],
};

export function canTransition(
  from: BookingStatus,
  to: BookingStatus,
  role: Role,
): boolean {
  if (!ADMIN_TRANSITIONS[from].includes(to)) {
    return false;
  }
  return role === Role.ADMIN || to === BookingStatus.CANCELLED;
}
