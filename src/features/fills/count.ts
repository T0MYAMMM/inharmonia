/** How to count a beat position: "3", "&", "e", "a", or triplet "trip", "let". */
export function countLabel(beat: number): string {
  const inBar = ((beat % 4) + 4) % 4;
  const whole = Math.floor(inBar + 1e-6);
  const frac = inBar - whole;
  const near = (x: number) => Math.abs(frac - x) < 1e-3;
  if (near(0)) return String(whole + 1);
  if (near(0.5)) return '&';
  if (near(0.25)) return 'e';
  if (near(0.75)) return 'a';
  if (near(1 / 3)) return 'trip';
  if (near(2 / 3)) return 'let';
  return '·';
}
