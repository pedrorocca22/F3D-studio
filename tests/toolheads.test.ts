import { describe, expect, it } from 'vitest';
import { createToolhead, getToolheadType, normalizeToolheads } from '../utils/toolheads';

describe('instance-based toolheads', () => {
  it('allows repeated process types in independent physical slots', () => {
    const first = createToolhead('syringe', 0);
    const second = createToolhead('syringe', 2);

    expect(first.id).not.toBe(second.id);
    expect(getToolheadType(first)).toBe('syringe');
    expect(getToolheadType(second)).toBe('syringe');
    expect([first.klipper_tool, second.klipper_tool]).toEqual(['T0', 'T2']);
  });

  it('normalizes legacy IDs without collapsing duplicate instances', () => {
    const normalized = normalizeToolheads([
      { ...createToolhead('syringe', 0, 'syringe-a'), type: undefined },
      { ...createToolhead('syringe', 1, 'syringe-b'), type: undefined },
    ]);

    expect(normalized).toHaveLength(2);
    expect(normalized.map(tool => tool.id)).toEqual(['syringe-a', 'syringe-b']);
    expect(normalized.map(getToolheadType)).toEqual(['syringe', 'syringe']);
  });
});
