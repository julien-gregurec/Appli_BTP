export type Point = { x: number; y: number };

export type CircleGeometry = {
  kind: "circle";
  centre: Point;
  radius: number;
  diameter: number;
  circumference: number;
  area: number;
};

export type SegmentalArchGeometry = {
  kind: "segmental-arch";
  width: number;
  rise: number;
  radius: number;
  centreBelowSpring: number;
  angleRadians: number;
  angleDegrees: number;
  arcLength: number;
  springLeft: Point;
  springRight: Point;
  apex: Point;
  centre: Point;
};

export function createCircleGeometry(radius: number): CircleGeometry {
  return { kind: "circle", centre: { x: 0, y: 0 }, radius, diameter: radius * 2, circumference: 2 * Math.PI * radius, area: Math.PI * radius ** 2 };
}

export function createSegmentalArchGeometry(width: number, rise: number): SegmentalArchGeometry {
  const halfChord = width / 2;
  const radius = (halfChord ** 2 + rise ** 2) / (2 * rise);
  const centreBelowSpring = radius - rise;
  const minorAngle = 2 * Math.asin(halfChord / radius);
  const angleRadians = rise <= halfChord ? minorAngle : 2 * Math.PI - minorAngle;
  return {
    kind: "segmental-arch", width, rise, radius, centreBelowSpring, angleRadians,
    angleDegrees: angleRadians * 180 / Math.PI, arcLength: radius * angleRadians,
    springLeft: { x: 0, y: 0 }, springRight: { x: width, y: 0 },
    apex: { x: halfChord, y: -rise }, centre: { x: halfChord, y: centreBelowSpring },
  };
}
