export type Point = [number, number];
export function humanPath(from: Point, to: Point, random: () => number = Math.random): Point[] {
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.max(12, Math.min(40, Math.round(distance / 22)));
  const bend = (random() - .5) * Math.min(100, distance * .2);
  const cx = (from[0] + to[0]) / 2 + bend;
  const cy = (from[1] + to[1]) / 2 - bend;
  const points: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, eased = t * t * (3 - 2 * t);
    const x = (1-eased)**2*from[0] + 2*(1-eased)*eased*cx + eased**2*to[0];
    const y = (1-eased)**2*from[1] + 2*(1-eased)*eased*cy + eased**2*to[1];
    points.push([Math.round(x + (random()-.5)*4), Math.round(y + (random()-.5)*4)]);
  }
  if (distance > 60) {
    const dx = (to[0]-from[0])/distance, dy = (to[1]-from[1])/distance;
    points.push([Math.round(to[0]+dx*(2+random()*4)), Math.round(to[1]+dy*(2+random()*4))]);
  }
  points.push(to);
  return points;
}
