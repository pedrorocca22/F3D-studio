import { describe, expect, it } from 'vitest';
import { generateCylinderSTL } from '../utils';

describe('procedural basic shapes', () => {
  it('generates a smooth 128-segment cylinder by default', () => {
    const stl = generateCylinderSTL(20, 5);
    expect(stl.match(/facet normal/g)).toHaveLength(128 * 4);
  });
});
