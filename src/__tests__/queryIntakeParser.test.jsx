import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Phase 6, feature 1: Query Intake Parser -- the flagship first AI
// feature. Three iron rules apply here specifically: AI output stays
// visibly marked until a human reviews it, nothing it produces is
// ever saved without an explicit, separate human action (clicking
// Create Query, completely unchanged from before this feature
// existed), and rejecting/ignoring it costs nothing. Per direct
// instruction, no banners or upfront badges -- the "reviewed" signal
// is a quiet, single line of text, not a colored callout, and it
// fades naturally as each field gets touched.

const baseProps = { onClose: ()=>{}, onSave: vi.fn(), nextId: 'UTQ-1', agents: [], staff: [], series: [], queries: [] };

describe('NewQueryModal: Query Intake Parser', () => {
  it('the paste-from-email affordance is a quiet text link, not a prominent button, and starts closed', async () => {
    const { default: NewQueryModal } = await import('../components/NewQueryModal.jsx');
    render(<NewQueryModal {...baseProps}/>);
    expect(screen.getByText(/Paste from agent email or WhatsApp/)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Paste the agent's message/)).toBeFalsy(); // closed by default
  });

  it('clicking it opens the inline paste area, with no separate modal-on-modal', async () => {
    const { default: NewQueryModal } = await import('../components/NewQueryModal.jsx');
    render(<NewQueryModal {...baseProps}/>);
    fireEvent.click(screen.getByText(/Paste from agent email or WhatsApp/));
    expect(screen.getByPlaceholderText(/Paste the agent's message/)).toBeTruthy();
  });

  it('cancel closes it and discards the pasted text, with zero side effects', async () => {
    const { default: NewQueryModal } = await import('../components/NewQueryModal.jsx');
    render(<NewQueryModal {...baseProps}/>);
    fireEvent.click(screen.getByText(/Paste from agent email or WhatsApp/));
    fireEvent.change(screen.getByPlaceholderText(/Paste the agent's message/), { target: { value: 'some text' } });
    fireEvent.click(screen.getByText('Never mind'));
    expect(screen.queryByPlaceholderText(/Paste the agent's message/)).toBeFalsy();
    fireEvent.click(screen.getByText(/Paste from agent email or WhatsApp/));
    expect(screen.getByPlaceholderText(/Paste the agent's message/).value).toBe(''); // genuinely discarded, not just hidden
  });

  it('the extract button sends the pasted text to db.ai.parseQueryIntake', async () => {
    const db = { ai: { parseQueryIntake: vi.fn(async () => ({ success: true, extracted: {} })) } };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: NewQueryModal } = await import('../components/NewQueryModal.jsx');
    render(<NewQueryModal {...baseProps}/>);
    fireEvent.click(screen.getByText(/Paste from agent email or WhatsApp/));
    fireEvent.change(screen.getByPlaceholderText(/Paste the agent's message/), { target: { value: 'Group of 10 to Kerala, 5 nights' } });
    fireEvent.click(screen.getByText('Fill fields from this'));
    await waitFor(() => expect(db.ai.parseQueryIntake).toHaveBeenCalledWith('Group of 10 to Kerala, 5 nights'));
    vi.doUnmock('../lib/supabase.js');
  });

  it('fills genuinely empty fields from a successful extraction', async () => {
    const db = { ai: { parseQueryIntake: vi.fn(async () => ({ success: true, extracted: { groupName: 'Sharma Family', sector: 'Kerala', nights: '5' } })) } };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: NewQueryModal } = await import('../components/NewQueryModal.jsx');
    render(<NewQueryModal {...baseProps}/>);
    fireEvent.click(screen.getByText(/Paste from agent email or WhatsApp/));
    fireEvent.change(screen.getByPlaceholderText(/Paste the agent's message/), { target: { value: 'text' } });
    fireEvent.click(screen.getByText('Fill fields from this'));
    await waitFor(() => expect(screen.getByDisplayValue('Sharma Family')).toBeTruthy());
    expect(screen.getByDisplayValue('Kerala')).toBeTruthy();
    expect(screen.getByDisplayValue('5')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('never overwrites a field the person already typed themselves', async () => {
    const db = { ai: { parseQueryIntake: vi.fn(async () => ({ success: true, extracted: { groupName: 'AI Suggested Name', sector: 'Kerala' } })) } };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: NewQueryModal } = await import('../components/NewQueryModal.jsx');
    render(<NewQueryModal {...baseProps}/>);
    // the person already typed a group name themselves, before pasting anything
    fireEvent.change(screen.getByPlaceholderText('e.g. COL Group, Smith Family'), { target: { value: 'My Own Typed Name' } });
    fireEvent.click(screen.getByText(/Paste from agent email or WhatsApp/));
    fireEvent.change(screen.getByPlaceholderText(/Paste the agent's message/), { target: { value: 'text' } });
    fireEvent.click(screen.getByText('Fill fields from this'));
    await waitFor(() => expect(screen.getByDisplayValue('Kerala')).toBeTruthy()); // the genuinely empty field still fills
    expect(screen.getByDisplayValue('My Own Typed Name')).toBeTruthy(); // the field the person already filled is untouched
    expect(screen.queryByDisplayValue('AI Suggested Name')).toBeFalsy(); // AI's suggestion for that field never appears anywhere
    vi.doUnmock('../lib/supabase.js');
  });

  it('shows a real, clear error when extraction fails -- never silence', async () => {
    const db = { ai: { parseQueryIntake: vi.fn(async () => ({ success: false, error: 'Session expired, please log in again' })) } };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: NewQueryModal } = await import('../components/NewQueryModal.jsx');
    render(<NewQueryModal {...baseProps}/>);
    fireEvent.click(screen.getByText(/Paste from agent email or WhatsApp/));
    fireEvent.change(screen.getByPlaceholderText(/Paste the agent's message/), { target: { value: 'text' } });
    fireEvent.click(screen.getByText('Fill fields from this'));
    await waitFor(() => expect(screen.getByText('Session expired, please log in again')).toBeTruthy());
    vi.doUnmock('../lib/supabase.js');
  });

  it('shows a quiet, single-line note after filling fields -- not a colored banner', async () => {
    const db = { ai: { parseQueryIntake: vi.fn(async () => ({ success: true, extracted: { groupName: 'Sharma Family', sector: 'Kerala' } })) } };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: NewQueryModal } = await import('../components/NewQueryModal.jsx');
    render(<NewQueryModal {...baseProps}/>);
    fireEvent.click(screen.getByText(/Paste from agent email or WhatsApp/));
    fireEvent.change(screen.getByPlaceholderText(/Paste the agent's message/), { target: { value: 'text' } });
    fireEvent.click(screen.getByText('Fill fields from this'));
    await waitFor(() => expect(screen.getByText(/2 fields filled from your paste/)).toBeTruthy());
    vi.doUnmock('../lib/supabase.js');
  });

  it('the review note count decreases as fields are actually edited, and disappears once all are reviewed', async () => {
    const db = { ai: { parseQueryIntake: vi.fn(async () => ({ success: true, extracted: { groupName: 'Sharma Family', sector: 'Kerala' } })) } };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: NewQueryModal } = await import('../components/NewQueryModal.jsx');
    render(<NewQueryModal {...baseProps}/>);
    fireEvent.click(screen.getByText(/Paste from agent email or WhatsApp/));
    fireEvent.change(screen.getByPlaceholderText(/Paste the agent's message/), { target: { value: 'text' } });
    fireEvent.click(screen.getByText('Fill fields from this'));
    await waitFor(() => expect(screen.getByText(/2 fields filled/)).toBeTruthy());
    fireEvent.change(screen.getByDisplayValue('Sharma Family'), { target: { value: 'Sharma Family Edited' } });
    await waitFor(() => expect(screen.getByText(/1 field filled/)).toBeTruthy());
    fireEvent.change(screen.getByDisplayValue('Kerala'), { target: { value: 'Kerala Edited' } });
    await waitFor(() => expect(screen.queryByText(/field.*filled/)).toBeFalsy());
    vi.doUnmock('../lib/supabase.js');
  });

  it('extraction alone never calls onSave -- a human must still explicitly create the query', async () => {
    const onSave = vi.fn();
    const db = { ai: { parseQueryIntake: vi.fn(async () => ({ success: true, extracted: { groupName: 'Sharma Family' } })) } };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: NewQueryModal } = await import('../components/NewQueryModal.jsx');
    render(<NewQueryModal {...baseProps} onSave={onSave}/>);
    fireEvent.click(screen.getByText(/Paste from agent email or WhatsApp/));
    fireEvent.change(screen.getByPlaceholderText(/Paste the agent's message/), { target: { value: 'text' } });
    fireEvent.click(screen.getByText('Fill fields from this'));
    await waitFor(() => expect(screen.getByDisplayValue('Sharma Family')).toBeTruthy());
    expect(onSave).not.toHaveBeenCalled();
    vi.doUnmock('../lib/supabase.js');
  });
});
