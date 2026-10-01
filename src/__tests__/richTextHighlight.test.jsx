import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RichTextEditor } from '../lib/helpers.jsx';
import { RICH_TEXT_HIGHLIGHT_COLORS } from '../lib/constants.js';

// Real, direct request: every rich text editor in the app (this shared
// contentEditable one, used across Itinerary, Exchange Orders, Vendor
// Rate notes, etc.) gets a highlight option, using real marker-bright
// colors -- not the pastel/light swatches the Tiptap document Editor
// had before this. Both editors now share one palette
// (RICH_TEXT_HIGHLIGHT_COLORS) so they never look inconsistent.

describe('RichTextEditor (shared): highlight toolbar', () => {
  it('shows a Highlight button that is not present in readOnly mode', () => {
    const { rerender } = render(<RichTextEditor value="" onChange={() => {}} />);
    expect(screen.getByText(/Highlight/)).toBeTruthy();
    rerender(<RichTextEditor value="" onChange={() => {}} readOnly />);
    expect(screen.queryByText(/Highlight/)).toBeNull();
  });

  it('opens a swatch picker with every shared highlight color on click', () => {
    render(<RichTextEditor value="" onChange={() => {}} />);
    fireEvent.click(screen.getByText(/Highlight/));
    RICH_TEXT_HIGHLIGHT_COLORS.forEach(c => {
      expect(document.querySelector(`[title="${c}"]`)).toBeTruthy();
    });
  });

  it('picking a swatch calls execCommand("hiliteColor", false, <that color>) and closes the picker', () => {
    render(<RichTextEditor value="" onChange={() => {}} />);
    fireEvent.click(screen.getByText(/Highlight/));
    const originalExecCommand = document.execCommand;
    let capturedCmd = null, capturedValue = null;
    document.execCommand = (cmd, ui, value) => { capturedCmd = cmd; capturedValue = value; return true; };

    const swatch = document.querySelector(`[title="${RICH_TEXT_HIGHLIGHT_COLORS[0]}"]`);
    fireEvent.click(swatch);

    expect(capturedCmd).toBe('hiliteColor');
    expect(capturedValue).toBe(RICH_TEXT_HIGHLIGHT_COLORS[0]);
    expect(document.querySelector(`[title="${RICH_TEXT_HIGHLIGHT_COLORS[0]}"]`)).toBeNull(); // picker closed
    document.execCommand = originalExecCommand;
  });

  it('picking a swatch reports the updated HTML back via onChange', () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} />);
    fireEvent.click(screen.getByText(/Highlight/));
    const originalExecCommand = document.execCommand;
    document.execCommand = () => true;
    fireEvent.click(document.querySelector(`[title="${RICH_TEXT_HIGHLIGHT_COLORS[0]}"]`));
    expect(onChange).toHaveBeenCalled();
    document.execCommand = originalExecCommand;
  });

  it('the "remove highlight" control clears with a transparent hiliteColor', () => {
    render(<RichTextEditor value="" onChange={() => {}} />);
    fireEvent.click(screen.getByText(/Highlight/));
    const originalExecCommand = document.execCommand;
    let capturedValue = null;
    document.execCommand = (cmd, ui, value) => { capturedValue = value; return true; };
    fireEvent.click(screen.getByTitle('Remove highlight'));
    expect(capturedValue).toBe('transparent');
    document.execCommand = originalExecCommand;
  });

  it('the shared palette is genuinely bright/saturated, not a pastel tint -- the reported complaint', () => {
    // A quick, real sanity check rather than an eyeballed assertion:
    // every color's hex channels should include at least one at or near
    // full saturation (FF) and not all three channels sitting high
    // together (which is what makes a pastel look washed out).
    RICH_TEXT_HIGHLIGHT_COLORS.forEach(hex => {
      const [r, g, b] = [hex.slice(1,3), hex.slice(3,5), hex.slice(5,7)].map(h => parseInt(h, 16));
      const maxChannel = Math.max(r, g, b);
      const minChannel = Math.min(r, g, b);
      expect(maxChannel).toBeGreaterThanOrEqual(200); // genuinely bright somewhere
      expect(maxChannel - minChannel).toBeGreaterThan(60); // real saturation, not a light gray-ish tint
    });
  });
});
