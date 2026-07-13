import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileTypeBadge } from '../lib/helpers.jsx';
import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';

describe('FileTypeBadge', () => {
  it('renders nothing when fileType is not set', () => {
    const { container } = render(<FileTypeBadge fileType=""/>);
    expect(container.firstChild).toBeNull();
  });

  it('renders "FIT" with a distinct yellow style', () => {
    render(<FileTypeBadge fileType="FIT"/>);
    const badge = screen.getByText('FIT');
    expect(badge).toBeTruthy();
    expect(badge.title).toContain('15 pax or less');
  });

  it('renders "GIT" with a distinct green style', () => {
    render(<FileTypeBadge fileType="GIT"/>);
    const badge = screen.getByText('GIT');
    expect(badge).toBeTruthy();
    expect(badge.title).toContain('16 pax or more');
  });

  it('FIT and GIT use different colors from each other', () => {
    const { container: fitContainer } = render(<FileTypeBadge fileType="FIT"/>);
    const { container: gitContainer } = render(<FileTypeBadge fileType="GIT"/>);
    const fitColor = fitContainer.firstChild.style.background;
    const gitColor = gitContainer.firstChild.style.background;
    expect(fitColor).not.toBe(gitColor);
  });
});

describe('Edit Tour Details: File Type field', () => {
  const query = {
    id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Test Group', status: 'operations',
    manualWF: [], audit: [], remarks: [], fileType: '',
  };
  const baseProps = {
    query, onClose:()=>{}, onConvert:()=>{}, onAdvance:()=>{}, onGenerateQuote:()=>{}, onToggleWF:()=>{},
    onCancel:()=>{}, onUpdateRemarks:()=>{}, currentUser:{id:1,name:'Priya'}, staff:[],
  };

  it('shows a File Type selector with FIT and GIT options in the edit form', () => {
    render(<QueryDrawerWithQuote {...baseProps} onUpdateQuery={()=>{}}/>);
    fireEvent.click(screen.getByText(/✏ Edit Tour Details/));
    expect(screen.getByText('File Type')).toBeTruthy();
    expect(screen.getByText('FIT — 15 pax or less')).toBeTruthy();
    expect(screen.getByText('GIT — 16 pax or more')).toBeTruthy();
  });

  it('selecting a file type and saving calls onUpdateQuery with fileType included', () => {
    const onUpdateQuery = vi.fn();
    render(<QueryDrawerWithQuote {...baseProps} onUpdateQuery={onUpdateQuery}/>);
    fireEvent.click(screen.getByText(/✏ Edit Tour Details/));
    const fileTypeSelect = screen.getByText('File Type').parentElement.querySelector('select');
    fireEvent.change(fileTypeSelect, { target: { value: 'GIT' } });
    fireEvent.click(screen.getByText('Save Changes'));
    expect(onUpdateQuery).toHaveBeenCalledTimes(1);
    expect(onUpdateQuery.mock.calls[0][1].fileType).toBe('GIT');
  });

  it('the badge shows in the drawer header once a fileType is set', () => {
    render(<QueryDrawerWithQuote {...baseProps} query={{...query, fileType:'FIT'}} onUpdateQuery={()=>{}}/>);
    expect(screen.getByText('FIT')).toBeTruthy();
  });
});
