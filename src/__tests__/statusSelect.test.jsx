import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StatusSelect from '../components/StatusSelect.jsx';
import DateField from '../components/DateField.jsx';

describe('StatusSelect', () => {
  it('picks a standard status from the list', () => {
    const on = vi.fn(); render(<StatusSelect value="requested" onChange={on} />);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'confirmed' } });
    expect(on).toHaveBeenCalledWith('confirmed');
  });
  it('Custom… opens a text box and commits the typed status on blur', () => {
    const on = vi.fn(); render(<StatusSelect value="requested" onChange={on} />);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: '__custom__' } });
    const box = screen.getByLabelText('Status (custom)');
    fireEvent.change(box, { target: { value: 'Waitlist, clears 60 days prior' } });
    fireEvent.blur(box);
    expect(on).toHaveBeenCalledWith('Waitlist, clears 60 days prior');
  });
  it('shows an unknown status as custom text, not lost', () => {
    render(<StatusSelect value="Reconfirmed vs 3739" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Status').value).toBe('__custom__');
    expect(screen.getByLabelText('Status (custom)').value).toBe('Reconfirmed vs 3739');
  });
});

describe('DateField', () => {
  it('shows dd/mm/yyyy and accepts typed dates', () => {
    const on = vi.fn(); render(<DateField ariaLabel="D" value="2027-01-14" onChange={on} />);
    const box = screen.getByLabelText('D'); expect(box.value).toBe('14/01/2027');
    fireEvent.change(box, { target: { value: '5/3/27' } }); fireEvent.blur(box);
    expect(on).toHaveBeenCalledWith('2027-03-05');
  });
  it('puts the old date back when the text is not a real date', () => {
    const on = vi.fn(); render(<DateField ariaLabel="D" value="2027-01-14" onChange={on} />);
    const box = screen.getByLabelText('D');
    fireEvent.change(box, { target: { value: '31/02/2027' } }); fireEvent.blur(box);
    expect(on).not.toHaveBeenCalled(); expect(box.value).toBe('14/01/2027');
  });
});
