function renderEquationSvg(latex) {
  if (!window.katex) {
    return `<div>${latex}</div>`;
  }
  return window.katex.renderToString(latex, { throwOnError: false, displayMode: true, output: 'html' });
}

