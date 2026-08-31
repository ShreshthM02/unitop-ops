import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NewQueryModal from '../components/NewQueryModal.jsx';

describe('Nationality / Market: a canonical dropdown, not free text, so "Taiwan" and "TAIWAN" can\u2019t become two different markets', () => {
  it('starts on the placeholder and does not show a free-text field yet', () => {
    render(<NewQueryModal onClose={()=>{}} onSave={()=>{}} nextId="UTQ-1" agents={[]} staff={[]}/>);
    const select = screen.getByText('Select nationality...').closest('select');
    expect(select.value).toBe('');
    expect(screen.queryByPlaceholderText('Specify nationality...')).toBeFalsy();
  });

  it('picking a canonical option sets it directly, no free-text field shown', () => {
    render(<NewQueryModal onClose={()=>{}} onSave={()=>{}} nextId="UTQ-1" agents={[]} staff={[]}/>);
    const select = screen.getByText('Select nationality...').closest('select');
    fireEvent.change(select, { target: { value: 'Taiwanese' } });
    expect(select.value).toBe('Taiwanese');
    expect(screen.queryByPlaceholderText('Specify nationality...')).toBeFalsy();
  });

  it('picking "Other" reveals a free-text field, and typing into it is what actually gets saved', () => {
    render(<NewQueryModal onClose={()=>{}} onSave={()=>{}} nextId="UTQ-1" agents={[]} staff={[]}/>);
    const select = screen.getByText('Select nationality...').closest('select');
    fireEvent.change(select, { target: { value: 'Other' } });
    expect(select.value).toBe('Other');
    const other = screen.getByPlaceholderText('Specify nationality...');
    fireEvent.change(other, { target: { value: 'Some Unlisted Market' } });
    expect(other.value).toBe('Some Unlisted Market');
  });

  it('switching back from Other to a canonical option hides the free-text field again', () => {
    render(<NewQueryModal onClose={()=>{}} onSave={()=>{}} nextId="UTQ-1" agents={[]} staff={[]}/>);
    const select = screen.getByText('Select nationality...').closest('select');
    fireEvent.change(select, { target: { value: 'Other' } });
    fireEvent.change(screen.getByPlaceholderText('Specify nationality...'), { target: { value: 'Some Unlisted Market' } });
    fireEvent.change(select, { target: { value: 'German' } });
    expect(select.value).toBe('German');
    expect(screen.queryByPlaceholderText('Specify nationality...')).toBeFalsy();
  });
});
