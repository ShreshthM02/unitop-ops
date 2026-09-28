import { describe, it, expect } from 'vitest';
import { mealPlanLabel } from '../lib/utils.js';

// Item 5: in vendor contracted rates, a tax-inclusive rate's meal plan
// should display as "{mealplan}AI" (e.g. "CPAI"); tax-exclusive stays
// plain ("CP"). Used by both Vendor Master's contracted-rate cards and
// the Cost Sheet's rate-picker dropdown, so they can never disagree.
describe('mealPlanLabel', () => {
  it('appends AI when the rate is tax-inclusive', () => {
    expect(mealPlanLabel('CP', true)).toBe('CPAI');
    expect(mealPlanLabel('MAP', true)).toBe('MAPAI');
  });
  it('stays plain when the rate is tax-exclusive', () => {
    expect(mealPlanLabel('CP', false)).toBe('CP');
    expect(mealPlanLabel('EP', undefined)).toBe('EP');
  });
  it('returns empty string for no meal plan, regardless of tax flag', () => {
    expect(mealPlanLabel(null, true)).toBe('');
    expect(mealPlanLabel(undefined, false)).toBe('');
    expect(mealPlanLabel('', true)).toBe('');
  });
  it('does not double-suffix a meal plan that already has AI baked in (real imported rate sheets predate this auto-suffix)', () => {
    expect(mealPlanLabel('CPAI', true)).toBe('CPAI');
    expect(mealPlanLabel('cpai', true)).toBe('cpai');
  });
});

describe('CostSheet and VendorMaster both use the shared mealPlanLabel helper (source check, not duplicated logic)', () => {
  it('CostSheet.jsx calls mealPlanLabel for the rate-picker option label', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/components/CostSheet.jsx', 'utf8');
    expect(src).toMatch(/mealPlanLabel\(r\.meal_plan,\s*r\.tax_inclusive\)/);
  });
  it('VendorMaster.jsx calls mealPlanLabel for the contracted-rate card badge', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/components/VendorMaster.jsx', 'utf8');
    expect(src).toMatch(/mealPlanLabel\(r\.meal_plan,\s*r\.tax_inclusive\)/);
  });
});
