import { ago, dateTime, daysBefore, peso, reasonLabel, rideType, statusChip, todayPh } from './format';

describe('format', () => {
  it('shows pesos with two decimals and thousands separators', () => {
    expect(peso('52.2')).toBe('₱52.20');
    expect(peso(1234.5)).toBe('₱1,234.50');
    expect(peso(null)).toBe('₱0.00');
  });

  it('shows times on the Philippine clock, whatever the PC zone', () => {
    expect(dateTime('2026-10-25T17:30:00Z')).toContain('Oct 26, 2026'); // 01:30 the next day in Manila
    expect(dateTime(null)).toBe('—');
    expect(todayPh(new Date('2026-10-25T17:30:00Z'))).toBe('2026-10-26');
    expect(daysBefore('2026-10-26', 29)).toBe('2026-09-27');
  });

  it('says how long ago, never negative', () => {
    const now = Date.parse('2026-10-26T02:00:00Z');
    expect(ago('2026-10-26T01:59:20Z', now)).toBe('40 s ago');
    expect(ago('2026-10-26T01:30:00Z', now)).toBe('30 min ago');
    expect(ago('2026-10-26T02:00:05Z', now)).toBe('0 s ago');
  });

  it('gives every status a mark kind and words, unknown ones neutral as-is', () => {
    expect(statusChip('pending')).toEqual({ kind: 'wait', label: 'Waiting for review' });
    expect(statusChip('suspended').kind).toBe('bad');
    expect(statusChip('completed').kind).toBe('ok');
    expect(statusChip('something_new')).toEqual({ kind: 'neutral', label: 'something_new' });
  });

  it('turns the apps\' reason codes into words, free text as written', () => {
    expect(reasonLabel('no_driver')).toBe('no driver accepted in time');
    expect(reasonLabel('Nasiraan ng gulong')).toBe('Nasiraan ng gulong');
    expect(reasonLabel(null)).toBe('');
    expect(rideType('two_way')).toBe('Balikan');
  });
});
