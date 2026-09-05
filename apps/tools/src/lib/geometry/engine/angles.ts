import type { Angle } from "./types";

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function toAngle(radians: number): Angle {
  return { radians, degrees: radToDeg(radians) };
}

/** Ramène un angle en radians dans [0, 2π). */
export function normalizeAngle(radians: number): number {
  const twoPi = Math.PI * 2;
  const normalized = radians % twoPi;
  return normalized < 0 ? normalized + twoPi : normalized;
}

/** Balayage angulaire signé de `start` vers `end`, dans le sens demandé, toujours positif ou nul. */
export function angularSweep(startAngle: number, endAngle: number, counterClockwise = true): number {
  let delta = normalizeAngle(endAngle) - normalizeAngle(startAngle);
  if (!counterClockwise) delta = -delta;
  const twoPi = Math.PI * 2;
  delta = delta % twoPi;
  return delta < 0 ? delta + twoPi : delta;
}
