import { describe, it, expect } from 'vitest';
import { mergeBriefDaysIntoDetailed } from '../lib/utils.js';

const item = (type, text, id) => ({ id: id || `${type}-${text}`, type, text, distance:'', time:'' });

describe('1.12 Detailed pulls from Brief: merge keeps description blocks', () => {
  it('takes Brief content wholesale when Detailed has no descriptions', () => {
    const brief = [{ dayLabel:'DAY-1', meals:['B'], items:[item('route','A - B'), item('stay','Hotel X')] }];
    const { days, preserved } = mergeBriefDaysIntoDetailed(brief, [{ dayLabel:'DAY-1', items:[item('route','stale')] }]);
    expect(days[0].items.map(i => [i.type, i.text])).toEqual([['route','A - B'], ['stay','Hotel X']]);
    expect(preserved).toBe(0);
  });

  it('preserves description blocks -- the whole point, since they are all this document adds', () => {
    const brief = [{ dayLabel:'DAY-1', items:[item('route','A - B'), item('stay','Hotel X')] }];
    const detailed = [{ dayLabel:'DAY-1', items:[item('route','old'), item('description','A page of prose')] }];
    const { days, preserved } = mergeBriefDaysIntoDetailed(brief, detailed);
    expect(preserved).toBe(1);
    expect(days[0].items.map(i => i.type)).toContain('description');
    expect(days[0].items.find(i => i.type === 'description').text).toBe('A page of prose');
  });

  it('keeps an intro description at the top of the day', () => {
    const brief = [{ items:[item('route','A - B'), item('stay','Hotel')] }];
    const detailed = [{ items:[item('description','Intro'), item('route','old')] }];
    const { days } = mergeBriefDaysIntoDetailed(brief, detailed);
    expect(days[0].items[0].type).toBe('description');
    expect(days[0].items[0].text).toBe('Intro');
  });

  it('keeps a closing description at the end even when Brief grew', () => {
    const brief = [{ items:[item('route','A'), item('sightseeing','S'), item('stay','H')] }];
    const detailed = [{ items:[item('route','old'), item('description','Closing note')] }];
    const { days } = mergeBriefDaysIntoDetailed(brief, detailed);
    const types = days[0].items.map(i => i.type);
    expect(types[types.length - 1]).toBe('description');
  });

  it('preserves several descriptions across several days', () => {
    const brief = [{ items:[item('route','A')] }, { items:[item('route','B')] }];
    const detailed = [
      { items:[item('description','d1'), item('route','x')] },
      { items:[item('route','y'), item('description','d2'), item('description','d3')] },
    ];
    const { days, preserved } = mergeBriefDaysIntoDetailed(brief, detailed);
    expect(preserved).toBe(3);
    expect(days[0].items.filter(i=>i.type==='description')).toHaveLength(1);
    expect(days[1].items.filter(i=>i.type==='description')).toHaveLength(2);
  });

  it('day count follows Brief, and reports descriptions lost on days Brief no longer has', () => {
    const brief = [{ items:[item('route','A')] }];
    const detailed = [
      { items:[item('route','x')] },
      { items:[item('description','orphaned prose')] },
    ];
    const { days, droppedDescriptions, droppedDays } = mergeBriefDaysIntoDetailed(brief, detailed);
    expect(days).toHaveLength(1);
    // Reported rather than lost quietly, so the UI can say so.
    expect(droppedDescriptions).toBe(1);
    expect(droppedDays).toBe(1);
  });

  it('brings in days Brief added that Detailed never had', () => {
    const brief = [{ items:[item('route','A')] }, { items:[item('route','B')] }];
    const { days } = mergeBriefDaysIntoDetailed(brief, [{ items:[item('route','x')] }]);
    expect(days).toHaveLength(2);
    expect(days[1].items[0].text).toBe('B');
  });

  it('carries Brief day-level fields (label, meals) since Brief owns the itinerary shape', () => {
    const brief = [{ dayLabel:'DAY-1', title:'Arrival', meals:['B','D'], items:[] }];
    const { days } = mergeBriefDaysIntoDetailed(brief, [{ dayLabel:'OLD', title:'Stale', meals:['L'], items:[] }]);
    expect(days[0]).toMatchObject({ dayLabel:'DAY-1', title:'Arrival', meals:['B','D'] });
  });

  it('does not mutate either input', () => {
    const brief = [{ items:[item('route','A')] }];
    const detailed = [{ items:[item('description','keep')] }];
    mergeBriefDaysIntoDetailed(brief, detailed);
    expect(brief[0].items).toHaveLength(1);
    expect(detailed[0].items).toHaveLength(1);
  });

  it('tolerates empty and undefined input', () => {
    expect(mergeBriefDaysIntoDetailed(undefined, undefined).days).toEqual([]);
    expect(mergeBriefDaysIntoDetailed([], [{ items:[item('description','x')] }]).droppedDescriptions).toBe(1);
  });
});
