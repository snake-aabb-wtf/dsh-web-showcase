import { describe, expect, it } from 'vitest';
import { hexToRgb } from '../src/render/color';

describe('hexToRgb', () => {
  it('parses 6-digit hex with #', () => {
    expect(hexToRgb('#5c80d1')).toEqual([0.3607843137254902, 0.5019607843137255, 0.8196078431372549]);
  });

  it('parses 6-digit hex without #', () => {
    expect(hexToRgb('ff0000')).toEqual([1, 0, 0]);
  });

  it('parses 3-digit shorthand', () => {
    expect(hexToRgb('#0f8')).toEqual([0, 1, 136 / 255]);
  });

  it('is case-insensitive', () => {
    expect(hexToRgb('#5C80D1')).toEqual(hexToRgb('#5c80d1'));
  });

  it('rejects invalid input', () => {
    expect(hexToRgb('not-a-color')).toBeNull();
    expect(hexToRgb('#12')).toBeNull();
    expect(hexToRgb('#1234567')).toBeNull();
    expect(hexToRgb('')).toBeNull();
  });
});
