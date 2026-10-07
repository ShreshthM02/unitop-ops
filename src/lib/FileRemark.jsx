import { useState } from 'react';
import { RichTextEditor } from './helpers.jsx';
import { sanitizeRichHtml, richHtmlHasContent } from './tourInfo.js';

// A small, optional rich-text remark attached to one uploaded file.
// Shared by every place files are uploaded (tour-file uploads, vehicle
// documents) so they behave identically.
//
// Collapsed: shows the saved remark (sanitised) with an Edit link, or a
// quiet "+ Add remark" link when there is none. Expanded: the rich editor
// with Save / Cancel. Saving an emptied editor clears the remark.
// onSave(html) -> Promise<{ success, error? }>
export function FileRemark({ doc, onSave, canEdit = true, G }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const has = richHtmlHasContent(doc.remarks);

  const start = () => { setDraft(doc.remarks || ''); setError(''); setEditing(true); };
  const save = async () => {
    setSaving(true); setError('');
    const value = richHtmlHasContent(draft) ? sanitizeRichHtml(draft) : '';
    const res = await onSave(value);
    setSaving(false);
    if (!res || !res.success) { setError((res && res.error) || 'Could not save this remark'); return; }
    setEditing(false);
  };

  if (editing) {
    return (
      <div data-testid="file-remark-editor" style={{ marginTop: 6 }}>
        <RichTextEditor value={draft} onChange={setDraft} minHeight={60} placeholder="Optional remark about this file" />
        {error && <div style={{ fontSize: 11, color: '#991B1B', marginTop: 4 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button className="btn btn-primary" style={{ fontSize: 10.5, padding: '3px 10px' }} disabled={saving} onClick={save}>{saving ? '…' : 'Save remark'}</button>
          <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: '3px 10px' }} disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 4 }}>
      {has && (
        <div data-testid="file-remark" className="rich-content"
          style={{ fontSize: 11.5, color: G.gray600, borderLeft: `3px solid ${G.gray200}`, paddingLeft: 8, marginBottom: 2 }}
          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(doc.remarks) }} />
      )}
      {canEdit && (
        <span role="button" aria-label={`${has ? 'Edit' : 'Add'} remark for ${doc.file_name}`} onClick={start}
          style={{ fontSize: 10.5, color: G.accent, cursor: 'pointer', fontWeight: 600 }}>
          {has ? '✎ Edit remark' : '+ Add remark'}
        </span>
      )}
    </div>
  );
}
