// Latitude and longitude as people write them: decimal degrees (51.5072, -0.1276) or
// degrees, minutes and seconds (51° 30′ 26″ N, 0 7 39 W), including a pair copied from an
// online map (51°30'26.0"N 0°07'39.0"W).

export type Axis = 'latitude' | 'longitude';

const LIMIT: Record<Axis, number> = { latitude: 90, longitude: 180 };

/** Straight quotes for primes, degree signs and the like, and capitals for N, S, E, W. */
function normalise(text: string): string {
  return text
    .toUpperCase()
    .replace(/[º˚]/g, '°')
    .replace(/[′’‘´`]/g, "'")
    .replace(/[″“”]|''/g, '"')
    .replace(/[−–—]/g, '-')
    .trim();
}

/**
 * One coordinate: decimal degrees, or degrees with minutes and seconds (with or without
 * the ° ′ ″ marks), negative or followed (or led) by N/S or E/W. Null if it doesn't read
 * as one, or is out of range for the axis.
 */
export function parseCoordinate(text: string, axis: Axis): number | null {
  const s = normalise(text);
  if (!s) return null;
  const hemi = s.match(/[NSEW]/g) ?? [];
  if (hemi.length > 1) return null;
  const h = hemi[0];
  if (h && (axis === 'latitude' ? !'NS'.includes(h) : !'EW'.includes(h))) return null;
  // Whatever is left must be numbers and their marks.
  const rest = s.replace(/[NSEW]/, ' ');
  if (/[^0-9.\s°'"\-+,]/.test(rest)) return null;
  const nums = rest.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (!nums.length || nums.length > 3) return null;
  const [d, m = 0, sec = 0] = nums;
  if (nums.length > 1 && (m >= 60 || sec >= 60 || !Number.isInteger(d))) return null;
  if (nums.length > 2 && !Number.isInteger(m)) return null;
  let v = d + m / 60 + sec / 3600;
  if (/-/.test(rest) || h === 'S' || h === 'W') v = -v;
  if (Math.abs(v) > LIMIT[axis]) return null;
  return Math.round(v * 1e6) / 1e6;
}

/**
 * Both coordinates at once, as copied from a map: two DMS values each with its letter
 * (either order), or two decimals separated by a comma or a space ("51.5072, -0.1276").
 */
export function parsePair(text: string): { latitude: number; longitude: number } | null {
  const s = normalise(text);
  // Split after each hemisphere letter: "51°30'26"N 0°07'39"W".
  const parts = s.match(/[^NSEW]*[NSEW]/g);
  if (parts?.length === 2 && s.replace(parts.join(''), '').trim() === '') {
    const [a, b] = parts.map((p) => p.replace(/^[\s,;]+/, ''));
    const latFirst = /[NS]$/.test(a);
    const lat = parseCoordinate(latFirst ? a : b, 'latitude');
    const lon = parseCoordinate(latFirst ? b : a, 'longitude');
    return lat !== null && lon !== null ? { latitude: lat, longitude: lon } : null;
  }
  const dec = s.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (dec) {
    const lat = parseCoordinate(dec[1], 'latitude');
    const lon = parseCoordinate(dec[2], 'longitude');
    return lat !== null && lon !== null ? { latitude: lat, longitude: lon } : null;
  }
  return null;
}

/** 51.5072 -> 51° 30′ 25.9″ N (seconds to a tenth: about 3 m). */
export function formatDMS(v: number, axis: Axis): string {
  const h = axis === 'latitude' ? (v < 0 ? 'S' : 'N') : v < 0 ? 'W' : 'E';
  let tenths = Math.round(Math.abs(v) * 36000);
  const d = Math.floor(tenths / 36000);
  tenths -= d * 36000;
  const m = Math.floor(tenths / 600);
  const sec = (tenths - m * 600) / 10;
  return `${d}° ${String(m).padStart(2, '0')}′ ${sec.toFixed(1).padStart(4, '0')}″ ${h}`;
}
