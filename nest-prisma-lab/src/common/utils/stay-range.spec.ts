import { BadRequestException } from '@nestjs/common';
import { parseStayRange } from './stay-range';

describe('parseStayRange', () => {
  const now = new Date('2026-11-20T00:00:00.000Z');

  it('returns both dates for a valid future stay', () => {
    const { checkIn, checkOut } = parseStayRange(
      '2026-12-24T14:00:00.000Z',
      '2026-12-26T11:00:00.000Z',
      now,
    );
    expect(checkIn.toISOString()).toBe('2026-12-24T14:00:00.000Z');
    expect(checkOut.toISOString()).toBe('2026-12-26T11:00:00.000Z');
  });

  it('rejects dates that are not valid', () => {
    expect(() =>
      parseStayRange('nope', '2026-12-26T11:00:00.000Z', now),
    ).toThrow(BadRequestException);
  });

  it('rejects check_in equal to or after check_out (FR-19)', () => {
    expect(() =>
      parseStayRange(
        '2026-12-26T11:00:00.000Z',
        '2026-12-26T11:00:00.000Z',
        now,
      ),
    ).toThrow('check_in must be before check_out');
    expect(() =>
      parseStayRange(
        '2026-12-27T11:00:00.000Z',
        '2026-12-26T11:00:00.000Z',
        now,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a check_in in the past', () => {
    expect(() =>
      parseStayRange(
        '2026-11-01T11:00:00.000Z',
        '2026-11-03T11:00:00.000Z',
        now,
      ),
    ).toThrow('check_in must not be in the past');
  });
});
