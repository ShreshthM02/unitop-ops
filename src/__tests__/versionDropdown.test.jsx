import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { VersionDropdown } from '../lib/VersionDropdown.jsx';

afterEach(() => cleanup());

const G = { navyMid: '#1B2838' };
const versions = [
  { version: 1, note: 'first draft' },
  { version: 2, note: '' },
  { version: 3, note: 'client requested discount' },
];

describe('VersionDropdown: shared component extracted from 7 duplicated implementations (Cost Sheet, Quotation, Tax Invoice, Pro-forma Invoice, Meal Plan, Tour Briefing Sheet, Brief Itinerary)', () => {
  it('renders nothing when there are no versions', () => {
    const { container } = render(
      <VersionDropdown versions={[]} viewingVersion={null} displayVersion={0} finalVersion={null}
        onSelectVersion={()=>{}} onMarkFinal={()=>{}} readOnly={false} G={G}/>
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows a single compact toggle button, not an expanded pill row, when versions exist', () => {
    render(
      <VersionDropdown versions={versions} viewingVersion={null} displayVersion={3} finalVersion={null}
        onSelectVersion={()=>{}} onMarkFinal={()=>{}} readOnly={false} G={G}/>
    );
    expect(screen.getByText(/▾/)).toBeTruthy();
    expect(screen.queryByText('v1')).toBeNull(); // not expanded yet
  });

  it('clicking the toggle opens the panel showing every version', () => {
    render(
      <VersionDropdown versions={versions} viewingVersion={null} displayVersion={3} finalVersion={null}
        onSelectVersion={()=>{}} onMarkFinal={()=>{}} readOnly={false} G={G}/>
    );
    fireEvent.click(screen.getByText(/▾/));
    expect(screen.getByText(/v1 — first draft/)).toBeTruthy();
    expect(screen.getByText('v2')).toBeTruthy();
    expect(screen.getByText(/v3 — client requested discount/)).toBeTruthy();
  });

  it('the star-marked (final) version is visually highlighted in the panel -- the actual fix this round', () => {
    const { container } = render(
      <VersionDropdown versions={versions} viewingVersion={null} displayVersion={3} finalVersion={2}
        onSelectVersion={()=>{}} onMarkFinal={()=>{}} readOnly={false} G={G}/>
    );
    fireEvent.click(screen.getByText(/▾/));
    const rows = container.querySelectorAll('[title="Mark as final"]');
    // rows[1] corresponds to v2 (reversed order: v3, v2, v1)
    const v2Row = rows[1].parentElement;
    expect(v2Row.style.background).not.toBe('');
    expect(v2Row.style.background).not.toBe('transparent');
    // the other, non-final rows must NOT have this highlight
    const v1Row = rows[2].parentElement;
    const v3Row = rows[0].parentElement;
    expect(v1Row.style.background).toBe('transparent');
    expect(v3Row.style.background).toBe('transparent');
  });

  it('clicking a version entry calls onSelectVersion and closes the panel', () => {
    const onSelectVersion = vi.fn();
    render(
      <VersionDropdown versions={versions} viewingVersion={null} displayVersion={3} finalVersion={null}
        onSelectVersion={onSelectVersion} onMarkFinal={()=>{}} readOnly={false} G={G}/>
    );
    fireEvent.click(screen.getByText(/▾/));
    fireEvent.click(screen.getByText('v2'));
    expect(onSelectVersion).toHaveBeenCalledWith(versions[1]);
    expect(screen.queryByText('v1')).toBeNull(); // panel closed again
  });

  it('clicking the star calls onMarkFinal with the correct version, not onSelectVersion', () => {
    const onSelectVersion = vi.fn();
    const onMarkFinal = vi.fn();
    render(
      <VersionDropdown versions={versions} viewingVersion={null} displayVersion={3} finalVersion={null}
        onSelectVersion={onSelectVersion} onMarkFinal={onMarkFinal} readOnly={false} G={G}/>
    );
    fireEvent.click(screen.getByText(/▾/));
    const stars = screen.getAllByTitle('Mark as final');
    fireEvent.click(stars[1]); // v2's star
    expect(onMarkFinal).toHaveBeenCalledWith(versions[1]);
    expect(onSelectVersion).not.toHaveBeenCalled();
  });

  it('readOnly prevents onMarkFinal from firing', () => {
    const onMarkFinal = vi.fn();
    render(
      <VersionDropdown versions={versions} viewingVersion={null} displayVersion={3} finalVersion={null}
        onSelectVersion={()=>{}} onMarkFinal={onMarkFinal} readOnly={true} G={G}/>
    );
    fireEvent.click(screen.getByText(/▾/));
    const stars = screen.getAllByTitle('Mark as final');
    fireEvent.click(stars[0]);
    expect(onMarkFinal).not.toHaveBeenCalled();
  });

  it('clicking outside the open panel closes it', () => {
    render(
      <div>
        <VersionDropdown versions={versions} viewingVersion={null} displayVersion={3} finalVersion={null}
          onSelectVersion={()=>{}} onMarkFinal={()=>{}} readOnly={false} G={G}/>
        <div data-testid="outside">outside</div>
      </div>
    );
    fireEvent.click(screen.getByText(/▾/));
    expect(screen.getByText('v2')).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('v2')).toBeNull();
  });

  it('the toggle button shows displayVersion when nothing is being actively viewed, and viewingVersion once a specific one is selected', () => {
    const { rerender } = render(
      <VersionDropdown versions={versions} viewingVersion={null} displayVersion={3} finalVersion={null}
        onSelectVersion={()=>{}} onMarkFinal={()=>{}} readOnly={false} G={G}/>
    );
    expect(screen.getByText(/v3/)).toBeTruthy();
    rerender(
      <VersionDropdown versions={versions} viewingVersion={1} displayVersion={3} finalVersion={null}
        onSelectVersion={()=>{}} onMarkFinal={()=>{}} readOnly={false} G={G}/>
    );
    expect(screen.getByText(/v1/)).toBeTruthy();
  });
});
