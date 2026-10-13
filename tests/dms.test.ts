import { describe, expect, it } from 'vitest';
import { formatDMS, parseCoordinate, parsePair } from '../src/model/dms';

describe('latitude and longitude as typed', () => {
  it('reads decimal degrees', () => {
    expect(parseCoordinate('51.5072', 'latitude')).toBeCloseTo(51.5072, 6);
    expect(parseCoordinate('-0.1276', 'longitude')).toBeCloseTo(-0.1276, 6);
  });

  it('reads degrees, minutes and seconds, with or without marks', () => {
    const v = 51 + 30 / 60 + 26 / 3600;
    for (const t of ['51° 30′ 26″ N', `51°30'26"N`, '51 30 26 N', 'N 51 30 26', '51º30’26”n', `51°30'26''N`]) {
      expect(parseCoordinate(t, 'latitude')).toBeCloseTo(v, 6);
    }
    expect(parseCoordinate('0 7 39 W', 'longitude')).toBeCloseTo(-(7 / 60 + 39 / 3600), 6);
    expect(parseCoordinate('33 52 S', 'latitude')).toBeCloseTo(-(33 + 52 / 60), 6);
    expect(parseCoordinate('-1 15 30.5', 'longitude')).toBeCloseTo(-(1 + 15 / 60 + 30.5 / 3600), 6);
  });

  it('rejects what does not make sense', () => {
    expect(parseCoordinate('51 75 0 N', 'latitude')).toBeNull(); // 75 minutes
    expect(parseCoordinate('0 7 39 W', 'latitude')).toBeNull(); // W on a latitude
    expect(parseCoordinate('95', 'latitude')).toBeNull();
    expect(parseCoordinate('London', 'latitude')).toBeNull();
    expect(parseCoordinate('', 'latitude')).toBeNull();
  });

  it('reads a pair copied from a map, either way round', () => {
    const p = parsePair(`51°30'26.0"N 0°07'39.0"W`)!;
    expect(p.latitude).toBeCloseTo(51.507222, 5);
    expect(p.longitude).toBeCloseTo(-0.1275, 5);
    const q = parsePair('0 7 39 W, 51 30 26 N')!;
    expect(q.latitude).toBeCloseTo(51.507222, 5);
    const r = parsePair('51.5072, -0.1276')!;
    expect(r).toEqual({ latitude: 51.5072, longitude: -0.1276 });
    expect(parsePair('51.5072')).toBeNull();
    expect(parsePair('51 30 26 N')).toBeNull();
  });

  it('writes degrees, minutes and seconds, and reads them back', () => {
    expect(formatDMS(51.507222, 'latitude')).toBe('51° 30′ 26.0″ N');
    expect(formatDMS(-0.1275, 'longitude')).toBe('0° 07′ 39.0″ W');
    expect(formatDMS(10.99999, 'longitude')).toBe('11° 00′ 00.0″ E');
    for (const v of [52.123456, -33.8688, 0.000123]) {
      expect(parseCoordinate(formatDMS(v, 'latitude'), 'latitude')).toBeCloseTo(v, 4);
    }
  });
});
