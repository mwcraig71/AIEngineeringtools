(function initStrintegShell(globalScope) {
  function text(value) {
    return typeof value === "string" ? value : "";
  }

  function mountShell(config) {
    const header = document.getElementById("si-header");
    const footer = document.getElementById("si-footer");
    const title = text(config && config.title) || "Strinteg Bridge Tool";
    const subtitle = text(config && config.subtitle);
    const badge = text(config && config.badge);
    const footerText = text(config && config.footer);

    if (header) {
      const subtitleHtml = subtitle ? `<p class="si-subtitle">${subtitle}</p>` : "";
      const badgeHtml = badge ? `<div class="si-badge">${badge}</div>` : "";
      header.innerHTML = `<h1 class="si-title">${title}</h1>${subtitleHtml}${badgeHtml}`;
    }

    if (footer) {
      footer.textContent = footerText || "Strinteg engineering shell";
    }
  }

  globalScope.StrintegShell = globalScope.StrintegShell || {};
  globalScope.StrintegShell.mountShell = mountShell;
})(typeof window !== "undefined" ? window : globalThis);
