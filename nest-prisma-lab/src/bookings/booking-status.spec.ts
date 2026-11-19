import { BookingStatus, Role } from '@prisma/client';
import { canTransition } from './booking-status';

describe('canTransition', () => {
  const ALL: BookingStatus[] = ['PENDING', 'APPROVED', 'PAID', 'CANCELLED'];

  it('lets an admin walk PENDING -> APPROVED -> PAID', () => {
    expect(canTransition('PENDING', 'APPROVED', Role.ADMIN)).toBe(true);
    expect(canTransition('APPROVED', 'PAID', Role.ADMIN)).toBe(true);
  });

  it('lets PENDING and APPROVED bookings be cancelled', () => {
    expect(canTransition('PENDING', 'CANCELLED', Role.ADMIN)).toBe(true);
    expect(canTransition('APPROVED', 'CANCELLED', Role.USER)).toBe(true);
    expect(canTransition('PENDING', 'CANCELLED', Role.USER)).toBe(true);
  });

  it('never leaves PAID or CANCELLED', () => {
    for (const to of ALL) {
      expect(canTransition('PAID', to, Role.ADMIN)).toBe(false);
      expect(canTransition('CANCELLED', to, Role.ADMIN)).toBe(false);
    }
  });

  it('does not allow skipping steps', () => {
    expect(canTransition('PENDING', 'PAID', Role.ADMIN)).toBe(false);
  });

  it('only lets regular users cancel', () => {
    expect(canTransition('PENDING', 'APPROVED', Role.USER)).toBe(false);
    expect(canTransition('APPROVED', 'PAID', Role.USER)).toBe(false);
  });
});
