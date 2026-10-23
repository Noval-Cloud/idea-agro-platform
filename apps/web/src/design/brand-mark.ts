/**
 * The brand mark: a sprout drawn with five satellite pixels on a 3 × 3 grid, in one hue
 * (the productivity ramp), lighter at the leaves and darker at the base. Shared by the
 * Wordmark component and the favicon generator so both draw the same thing.
 */
export const markViewBox = 30;
export const markCell = 9;
export const markRadius = 2;

const step = 10.5;

/** `ramp` is a 1-based step of the productivity ramp (1 = lightest on a light surface). */
export const markPixels = [
  { x: 2 * step, y: 0, ramp: 3 },
  { x: 0, y: step, ramp: 4 },
  { x: step, y: step, ramp: 6 },
  { x: 2 * step, y: step, ramp: 5 },
  { x: step, y: 2 * step, ramp: 7 },
] as const;
