// Settled, flat-cell port of Daily Akari's PuzzleShader color pipeline.
// Animation masks, hover flashes, lamp rings and 3D face lighting are omitted.
import {visible} from './model.mjs?v=754b0258aff5fda6';

const BASE_ALBEDO = [0.26, 0.332333, 0.4];
const LIT_RGB = [0.0736, 0.66608, 0.92];
const CHECKER_MOD = 0.07;
const CHECKER_STRENGTH = 0.45;
const ATTENUATION = 0.2;
const CELL_DISTANCE_SCALE = 0.1;
const OVERLAP_MULT = 1;
const OVERLAP_DIMMER = 0.02;
const LIGHT_BLEND = 0.88;
const BACKGROUND_BLACK_REDUCTION = 0.4;
const lightness = rgb => (Math.max(...rgb) + Math.min(...rgb)) / 2;
const normalizeLightness = rgb => {
  const value = lightness(rgb);
  return value === 0 ? [...rgb] : rgb.map(channel => channel / value);
};
const mix = (from, to, alpha) => from.map((channel, i) => channel * (1 - alpha) + to[i] * alpha);
const hex = rgb => '#' + rgb.map(value => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, '0')).join('');
const position = cell => cell.slice(1, -1).split(',').map(Number);

export function illuminationStrengths(grid, marks) {
  const strengths = new Map();
  for (const [lamp, value] of Object.entries(marks)) {
    if (value !== 'Lamp') continue;
    const [lr, lc] = position(lamp);
    for (const target of visible(grid, lamp)) {
      const [r, c] = position(target);
      const cellDistance = Math.abs(r - lr) + Math.abs(c - lc);
      // The light mask keeps the lamp and its first adjacent cell at full
      // intensity. Past that mask, PuzzleTheme.Attenuation applies in the
      // original grid's 0.1-unit cell scale.
      const distance = cellDistance <= 1 ? 0 : cellDistance * CELL_DISTANCE_SCALE;
      const strength = Math.max(0, 1 - distance * ATTENUATION);
      if (!strengths.has(target)) strengths.set(target, []);
      strengths.get(target).push(strength);
    }
  }
  return strengths;
}

export function illuminationCounts(grid, marks) {
  return new Map([...illuminationStrengths(grid, marks)].map(([cell, strengths]) => [cell, strengths.length]));
}

// The shader gives alternating cells CheckerMod 0 or 0.07. That modulation
// remains after lighting, while every visible lamp contributes its own
// distance-attenuated LitColor before overlap compression toward white.
export function puzzleCellColor(contributions = [], checker = false) {
  if (Number.isInteger(contributions)) {
    if (contributions < 0) throw new Error('Light count must be non-negative.');
    contributions = Array(contributions).fill(1);
  }
  if (!Array.isArray(contributions) || contributions.some(value => typeof value !== 'number' || value < 0 || value > 1)) {
    throw new Error('Light contributions must be strengths from 0 to 1.');
  }
  const checkerMod = checker ? CHECKER_MOD : 0;
  const baseUnit = normalizeLightness(BASE_ALBEDO);
  const base = BASE_ALBEDO.map((value, i) => value + baseUnit[i] * checkerMod);
  if (contributions.length === 0) return hex(base);

  const totalStrength = contributions.reduce((sum, strength) => sum + strength, 0);
  let litArea = LIT_RGB.map(value => value * totalStrength);
  const litUnit = normalizeLightness(litArea);
  litArea = litArea.map((value, i) => value + litUnit[i] * checkerMod * CHECKER_STRENGTH);
  const maxColor = Math.max(1, ...litArea);
  if (maxColor > 1) {
    const normalized = litArea.map(value => value / maxColor);
    const totalLightness = lightness(litArea);
    const normalizedLightness = totalLightness / maxColor;
    const whiteMix = Math.max(0, Math.min(1, (totalLightness - normalizedLightness) * OVERLAP_MULT - OVERLAP_DIMMER));
    litArea = mix(normalized, [1, 1, 1], whiteMix);
  }
  const softenedBase = mix(base, [1, 1, 1], BACKGROUND_BLACK_REDUCTION);
  return hex(mix(softenedBase, litArea, LIGHT_BLEND));
}

export function litColor(contributions, checker = false) {
  if (Number.isInteger(contributions)) {
    if (contributions < 1) throw new Error('Light count must be positive.');
  } else if (!Array.isArray(contributions) || contributions.length === 0) {
    throw new Error('At least one light contribution is required.');
  }
  return puzzleCellColor(contributions, checker);
}
