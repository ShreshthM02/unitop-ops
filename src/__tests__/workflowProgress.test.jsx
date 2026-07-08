import { describe, it, expect } from 'vitest';
import { getAutoDetectedSteps, normalizeManualWF, getWFStepStatus, toggleWFStep } from '../lib/utils.js';

describe('getAutoDetectedSteps: only steps with real, verifiable data auto-complete', () => {
  it('always marks steps 1 and 2 done (the query existing IS the acknowledgment/number)', () => {
    const auto = getAutoDetectedSteps({});
    expect(auto[1]).toBe(true);
    expect(auto[2]).toBe(true);
  });

  it('does NOT mark Vouchers Issued (10), Meal Plan (9), or Services Tracked (7) -- the exact bug reported', () => {
    const auto = getAutoDetectedSteps({ hasCostSheet: true, hasQuotation: true, hasFacilitators: true, hasPayments: true });
    expect(auto[10]).toBeFalsy();
    expect(auto[9]).toBeFalsy();
    expect(auto[7]).toBeFalsy();
  });

  it('marks Cost Sheet Prepared (4) only when a real cost sheet exists', () => {
    expect(getAutoDetectedSteps({ hasCostSheet: false })[4]).toBe(false);
    expect(getAutoDetectedSteps({ hasCostSheet: true })[4]).toBe(true);
  });

  it('marks Quotation Sent (5) only when a real quotation exists', () => {
    expect(getAutoDetectedSteps({ hasQuotation: false })[5]).toBe(false);
    expect(getAutoDetectedSteps({ hasQuotation: true })[5]).toBe(true);
  });

  it('marks Tour Facilitator Assigned (12) only when tour_execution has facilitators', () => {
    expect(getAutoDetectedSteps({ hasFacilitators: false })[12]).toBe(false);
    expect(getAutoDetectedSteps({ hasFacilitators: true })[12]).toBe(true);
  });

  it('marks Payment Status Tracked (14) only when real payment entries exist', () => {
    expect(getAutoDetectedSteps({ hasPayments: false })[14]).toBe(false);
    expect(getAutoDetectedSteps({ hasPayments: true })[14]).toBe(true);
  });

  it('never auto-detects steps with no real signal at all (3, 6, 8, 11, 13, 15, 16, 17)', () => {
    const auto = getAutoDetectedSteps({ hasCostSheet: true, hasQuotation: true, hasFacilitators: true, hasPayments: true });
    [3, 6, 8, 11, 13, 15, 16, 17].forEach(step => expect(auto[step]).toBeFalsy());
  });
});

describe('normalizeManualWF: backward compatible with the old flat-array format', () => {
  it('converts old flat numeric array entries to {step, done: true}', () => {
    expect(normalizeManualWF([3, 6])).toEqual([{ step: 3, done: true }, { step: 6, done: true }]);
  });
  it('leaves new-format {step, done} entries untouched', () => {
    expect(normalizeManualWF([{ step: 3, done: false }])).toEqual([{ step: 3, done: false }]);
  });
  it('handles mixed old and new entries in the same array', () => {
    expect(normalizeManualWF([3, { step: 6, done: false }])).toEqual([{ step: 3, done: true }, { step: 6, done: false }]);
  });
  it('handles null/undefined without throwing', () => {
    expect(normalizeManualWF(null)).toEqual([]);
    expect(normalizeManualWF(undefined)).toEqual([]);
  });
});

describe('getWFStepStatus: the actual displayed state per step', () => {
  it('a step with no signal and no manual override shows as pending, not done -- the core fix', () => {
    const auto = getAutoDetectedSteps({}); // vouchers issued (10) has no signal
    expect(getWFStepStatus(10, auto, [])).toEqual({ done: false, source: 'pending' });
  });

  it('a step with a real signal shows as auto-done', () => {
    const auto = getAutoDetectedSteps({ hasCostSheet: true });
    expect(getWFStepStatus(4, auto, [])).toEqual({ done: true, source: 'auto' });
  });

  it('a manual override to done takes precedence over no signal', () => {
    const auto = getAutoDetectedSteps({});
    expect(getWFStepStatus(10, auto, [{ step: 10, done: true }])).toEqual({ done: true, source: 'manual' });
  });

  it('a manual override to pending takes precedence over an auto-true signal -- the actual "power to mark pending" requirement', () => {
    const auto = getAutoDetectedSteps({ hasCostSheet: true });
    expect(getWFStepStatus(4, auto, [{ step: 4, done: false }])).toEqual({ done: false, source: 'manual' });
  });
});

describe('toggleWFStep: produces the new override array and an audit-ready message', () => {
  it('toggling a pending step to done produces a done override and a "Marked...done" audit message', () => {
    const auto = getAutoDetectedSteps({});
    const result = toggleWFStep([], 10, auto, 'Vouchers issued');
    expect(result.manualWF).toEqual([{ step: 10, done: true }]);
    expect(result.auditAction).toBe('Marked step "Vouchers issued" as done');
  });

  it('toggling an auto-done step produces a pending override and an "Unmarked...pending" audit message', () => {
    const auto = getAutoDetectedSteps({ hasCostSheet: true });
    const result = toggleWFStep([], 4, auto, 'Cost sheet prepared');
    expect(result.manualWF).toEqual([{ step: 4, done: false }]);
    expect(result.auditAction).toBe('Unmarked step "Cost sheet prepared" as pending');
  });

  it('toggling twice returns to the opposite state each time, replacing the prior override, not accumulating duplicates', () => {
    const auto = getAutoDetectedSteps({});
    const once = toggleWFStep([], 10, auto, 'Vouchers issued');
    const twice = toggleWFStep(once.manualWF, 10, auto, 'Vouchers issued');
    expect(twice.manualWF).toEqual([{ step: 10, done: false }]);
    expect(twice.manualWF.length).toBe(1); // no duplicate entries for the same step
  });

  it('toggling one step does not disturb existing overrides for other steps', () => {
    const auto = getAutoDetectedSteps({});
    const result = toggleWFStep([{ step: 3, done: true }], 10, auto, 'Vouchers issued');
    expect(result.manualWF).toEqual([{ step: 3, done: true }, { step: 10, done: true }]);
  });
});
