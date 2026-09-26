// Where the sun is: its compass bearing and height above the horizon for a place and a
// moment, from the standard low-precision solar formulas (good to about 0.1 degree, far
// better than the drawing). Also where the plan's north is, so the sun lands on the right
// side of the house, and how leafy a deciduous tree is at a given date.

import type { Building, Site } from './types';

const RAD = Math.PI / 180;

/** London, with north straight up the plan, until the drawing says otherwise. */
export const DEFAULT_SITE: Site = { latitude: 51.5, longitude: -0.12, north: 0 };

export function siteOf(b: Building): Site {
  return { ...DEFAULT_SITE, ...b.site };
}

export interface SunPosition {
  /** Compass bearing of the sun, radians clockwise from true north. */
  azimuth: number;
  /** Height above the horizon, radians (negative at night). */
  elevation: number;
}

export function sunPosition(date: Date, latitude: number, longitude: number): SunPosition {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // days since J2000
  const L = (280.46 + 0.9856474 * n) * RAD; // mean longitude
  const g = (357.528 + 0.9856003 * n) * RAD; // mean anomaly
  const lambda = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const eps = (23.439 - 0.0000004 * n) * RAD; // tilt of the earth's axis
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = ((18.697374558 + 24.06570982441908 * n) % 24) * 15 * RAD; // sidereal time at Greenwich
  const H = gmst + longitude * RAD - ra; // hour angle
  const lat = latitude * RAD;
  const elevation = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H));
  let azimuth = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(H));
  if (azimuth < 0) azimuth += 2 * Math.PI;
  return { azimuth, elevation };
}

/**
 * Unit vector pointing towards the sun, in plan coordinates (x right, y down the screen)
 * plus z up. `north` is the compass direction the top of the plan faces, in degrees.
 */
export function sunDirection(sun: SunPosition, north: number): { x: number; y: number; z: number } {
  // A bearing on the plan: turn clockwise from "up the screen", i.e. from (0, -1).
  const a = sun.azimuth - north * RAD;
  const h = Math.cos(sun.elevation);
  return { x: Math.sin(a) * h, y: -Math.cos(a) * h, z: Math.sin(sun.elevation) };
}

/** Plan bearing of true north: the direction (radians, clockwise from up the screen). */
export function northOnPlan(site: Site): number {
  return -site.north * RAD;
}

/** Sunrise and sunset (in the given day's local clock time), found by stepping through the day. */
export function sunTimes(day: Date, latitude: number, longitude: number): { rise: Date | null; set: Date | null } {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  let rise: Date | null = null;
  let set: Date | null = null;
  let prev = sunPosition(start, latitude, longitude).elevation;
  // The sun's centre at -0.833 degrees is the usual definition (refraction plus the disc).
  const horizon = -0.833 * RAD;
  for (let m = 2; m <= 24 * 60; m += 2) {
    const t = new Date(start.getTime() + m * 60000);
    const e = sunPosition(t, latitude, longitude).elevation;
    if (prev < horizon && e >= horizon && !rise) rise = t;
    if (prev >= horizon && e < horizon) set = t;
    prev = e;
  }
  return { rise, set };
}

/** 1 in full leaf, 0 bare: broad-leaved trees leaf out in April-May and drop in November. */
export function leafiness(date: Date, latitude: number): number {
  const start = new Date(date.getFullYear(), 0, 1);
  let day = (date.getTime() - start.getTime()) / 86400000;
  if (latitude < 0) day = (day + 182.5) % 365;
  const ramp = (d: number, a: number, b: number) => Math.min(1, Math.max(0, (d - a) / (b - a)));
  // Bare until ~10 April, full by ~10 May; turning from ~20 October, bare by ~25 November.
  return Math.min(ramp(day, 100, 130), 1 - ramp(day, 293, 329));
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function compassPoint(azimuth: number): string {
  return POINTS[Math.round(azimuth / (Math.PI / 4)) % 8];
}

/** Leaf cover for broad-leaved trees, and whether the leaves are turning (after midsummer). */
export function seasonAt(date: Date, latitude: number): { leaf: number; autumn: boolean } {
  const leaf = leafiness(date, latitude);
  const month = (date.getMonth() + (latitude < 0 ? 6 : 0)) % 12;
  return { leaf, autumn: leaf < 0.95 && month >= 7 };
}
