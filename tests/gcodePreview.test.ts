import { describe, expect, it } from 'vitest';
import { getGCodeToolColor, isFdmPreviewTool, parseGCode } from '../components/GCodePreview/GCodePreview';

describe('G-code toolhead preview', () => {
  it('preserves physical tool changes on extrusion moves', () => {
    const parsed = parseGCode([
      'M83',
      'T0 ; perimeter tool',
      ';TYPE:Perimeter',
      'G1 X1 Y1 Z0.2 E1',
      'T1 ; solid tool',
      ';TYPE:Solid infill',
      'G1 X2 Y2 E1',
      'T2 ; infill tool',
      ';TYPE:Internal infill',
      'G1 X3 Y3 E1',
    ].join('\n'));

    expect(parsed.moves.filter(move => move.extrude).map(move => move.toolhead)).toEqual(['T0', 'T1', 'T2']);
    expect([...parsed.usedToolheads]).toEqual(['T0', 'T1', 'T2']);
  });

  it('assigns deterministic distinct colors to adjacent slots', () => {
    expect(new Set(['T0', 'T1', 'T2', 'T3'].map(getGCodeToolColor)).size).toBe(4);
    expect(getGCodeToolColor('T8')).toBe(getGCodeToolColor('T0'));
  });

  it('selects the FDM nozzle for logical and legacy tool values', () => {
    expect(isFdmPreviewTool('fdm')).toBe(true);
    expect(isFdmPreviewTool('T0')).toBe(true);
    expect(isFdmPreviewTool('syringe')).toBe(false);
    expect(isFdmPreviewTool('T1')).toBe(false);
  });

  it('expands G2/G3 arcs for an accurate interactive preview', () => {
    const parsed = parseGCode([
      'M83',
      'G1 X10 Y0 Z0.2',
      ';TYPE:External perimeter',
      'G3 X0 Y10 I-10 J0 E1',
    ].join('\n'));

    const extrusion = parsed.moves.filter(move => move.extrude);
    expect(extrusion.length).toBeGreaterThan(2);
    expect(extrusion.at(-1)).toMatchObject({ x: 0, y: 10, z: 0.2, layer: 1 });
    expect(Math.max(...extrusion.map(move => move.x))).toBeLessThanOrEqual(10.000001);
    expect(Math.min(...extrusion.map(move => move.y))).toBeGreaterThanOrEqual(-0.000001);
  });
});
