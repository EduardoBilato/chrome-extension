const { formatTime, generateFilename } = require('./utils');

describe('formatTime', () => {
  test('formats zero seconds', () => {
    expect(formatTime(0)).toBe('00:00');
  });
  test('formats seconds under a minute', () => {
    expect(formatTime(45)).toBe('00:45');
  });
  test('formats minutes and seconds', () => {
    expect(formatTime(272)).toBe('04:32');
  });
  test('formats hours when >= 3600 seconds', () => {
    expect(formatTime(3661)).toBe('01:01:01');
  });
  test('pads all segments to 2 digits', () => {
    expect(formatTime(3600)).toBe('01:00:00');
  });
  test('stays in mm:ss format at 3599 seconds (just below hour boundary)', () => {
    expect(formatTime(3599)).toBe('59:59');
  });
  test('clamps negative input to 00:00', () => {
    expect(formatTime(-1)).toBe('00:00');
  });
});

describe('generateFilename', () => {
  test('generates correct filename with zero-padded parts', () => {
    const date = new Date(2026, 3, 13, 14, 30); // April 13 2026, 14:30
    expect(generateFilename(date)).toBe('meet-recording-2026-04-13-14-30.webm');
  });
  test('pads single-digit month, day, hour, minute', () => {
    const date = new Date(2026, 0, 5, 9, 7); // Jan 5 2026, 09:07
    expect(generateFilename(date)).toBe('meet-recording-2026-01-05-09-07.webm');
  });
  test('default argument returns a valid filename pattern', () => {
    expect(generateFilename()).toMatch(/^meet-recording-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.webm$/);
  });
});
