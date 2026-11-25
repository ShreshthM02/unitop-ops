import * as Lib from '../lib/index.js';
import { buildHistoryPdfHTML, buildHistoryWorkbook, historyFilename } from '../lib/historyExports.js';
import { XLSX_MIME } from '../lib/simpleXlsx.js';

const { ExportMenu, printHTML, buildLetterheadDocument, G } = Lib;

// One Export button (PDF + Excel) for any history / ledger tab.
//   getSpecs: () => spec | spec[]   (built from the rows exactly as shown on screen)
//   kind/name/what: used for the file name and the PDF heading
export default function HistoryExportMenu({ getSpecs, kind, name, what }) {
  const base = historyFilename(kind, name, what);
  const pdf = () => {
    const html = buildHistoryPdfHTML(buildLetterheadDocument, getSpecs(), base);
    printHTML(html);
  };
  const excel = async () => {
    try {
      const wb = await buildHistoryWorkbook(getSpecs());
      const buffer = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: XLSX_MIME }));
      const a = document.createElement('a');
      a.href = url; a.download = `${base}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      console.error('History Excel export failed', err);
      alert('The Excel file could not be created. Please try again; if it keeps happening, tell the admin.');
    }
  };
  return (
    <ExportMenu G={G} openDirection="down" actions={[
      { id: 'pdf', label: 'PDF', icon: '📕', onSelect: pdf, hint: 'Landscape A4' },
      { id: 'excel', label: 'Excel', icon: '📊', onSelect: excel, hint: 'Same rows as on screen' },
    ]} />
  );
}
