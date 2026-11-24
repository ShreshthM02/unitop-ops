import { render, screen, fireEvent } from '@testing-library/react';

// The Pricing Matrix opens with every section collapsed. Tests that work
// inside a section open it first, the way a person does.
export const openMatrixSections = () => {
  for (const t of [/From days & settings/, /Transport · \d/, /Local Handler · \d/, /Extra Services · \d/, /Tour leader surcharge ·/]) {
    for (const el of screen.queryAllByText(t)) if (/▸/.test(el.textContent)) fireEvent.click(el);
  }
};
export const renderOpen = (ui, opts) => { const r = render(ui, opts); openMatrixSections(); return r; };
