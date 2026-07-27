import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StatusBadge } from '../lib/helpers.jsx';

describe('StatusBadge: Operations/Completed color clash (a third, separate color map found and fixed -- KANBAN_COLS, PIPELINE_STAGES, and this badge component each had their own independent definition)', () => {
  it('Operations and Completed badges no longer use the same or near-identical green', () => {
    const { container: opsContainer } = render(<StatusBadge status="operations"/>);
    const { container: completedContainer } = render(<StatusBadge status="completed"/>);
    const opsSpan = opsContainer.querySelector('.status-badge');
    const completedSpan = completedContainer.querySelector('.status-badge');
    expect(opsSpan.style.background).not.toBe(completedSpan.style.background);
    expect(opsSpan.style.color).not.toBe(completedSpan.style.color);
  });

  it('Completed keeps its green (conventional "done" color)', () => {
    const { container } = render(<StatusBadge status="completed"/>);
    const span = container.querySelector('.status-badge');
    expect(span.style.background).toBe('rgb(236, 253, 245)'); // #ECFDF5
    expect(span.style.color).toBe('rgb(6, 95, 70)'); // #065F46
  });

  it('Operations is now rose/magenta -- not blue (which would clash with New Query), not green (which would clash with Completed)', () => {
    const { container: opsContainer } = render(<StatusBadge status="operations"/>);
    const { container: newQueryContainer } = render(<StatusBadge status="new_query"/>);
    const { container: completedContainer } = render(<StatusBadge status="completed"/>);
    const opsSpan = opsContainer.querySelector('.status-badge');
    const newQuerySpan = newQueryContainer.querySelector('.status-badge');
    const completedSpan = completedContainer.querySelector('.status-badge');
    expect(opsSpan.style.background).toBe('rgb(252, 228, 236)'); // #FCE4EC
    expect(opsSpan.style.color).toBe('rgb(173, 20, 87)'); // #AD1457
    expect(opsSpan.style.background).not.toBe(newQuerySpan.style.background);
    expect(opsSpan.style.color).not.toBe(newQuerySpan.style.color);
    expect(opsSpan.style.background).not.toBe(completedSpan.style.background);
    expect(opsSpan.style.color).not.toBe(completedSpan.style.color);
  });
});
