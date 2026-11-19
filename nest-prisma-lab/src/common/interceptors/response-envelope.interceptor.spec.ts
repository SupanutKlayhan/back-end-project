import { wrap } from './response-envelope.interceptor';

describe('success envelope (FR-34)', () => {
  it('wraps a plain object', () => {
    expect(wrap({ id: 1 }, 'Room created')).toEqual({
      success: true,
      message: 'Room created',
      data: { id: 1 },
    });
  });

  it('keeps pagination metadata next to the data', () => {
    const meta = { total: 1, page: 1, limit: 10, totalPages: 1 };
    expect(wrap({ data: [{ id: 1 }], meta }, 'ok')).toEqual({
      success: true,
      message: 'ok',
      data: [{ id: 1 }],
      meta,
    });
  });

  it('turns an empty result into data: null', () => {
    expect(wrap(undefined, 'Logged out').data).toBeNull();
    expect(wrap(null, 'Logged out').data).toBeNull();
  });

  it('does not mistake an object that merely has a data field for a page', () => {
    expect(wrap({ data: 1, other: 2 }, 'x').data).toEqual({
      data: 1,
      other: 2,
    });
  });
});
