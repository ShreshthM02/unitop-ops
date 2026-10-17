// dd/mm/yyyy helpers. The app shows and accepts dates ONLY in this order, in every
// browser -- the browser's own <input type="date"> follows the computer's language
// setting (mm/dd/yyyy on US-English), which is why DateInput replaces it.

export function formatDMY(iso) { return /^\d{4}-\d{2}-\d{2}/.test(iso || "") ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : ""; }

// Accepts 5/3/2027, 05-03-2027, 05.03.27. Returns ISO (yyyy-mm-dd) or "" when it isn't a real date.
export function parseDMY(text) {
  const m = /^\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})\s*$/.exec(text || "");
  if (!m) return "";
  const d = +m[1], mo = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
