// The upstream flow logo has a hardcoded vendor alt label. Keep the account
// brand accessible as well as visible, without touching challenges or inputs.
const executor = document.querySelector('ak-flow-executor');
if (executor) {
  await customElements.whenDefined('ak-flow-executor');
  const brandLogo = () => {
    for (const image of executor.shadowRoot.querySelectorAll('img.branding-logo')) {
      image.alt = 'reyuuGAMES Account';
    }
  };
  const watch = () => {
    if (!executor.shadowRoot) {
      requestAnimationFrame(watch);
      return;
    }
    new MutationObserver(brandLogo).observe(executor.shadowRoot, {
      childList: true,
      subtree: true,
    });
    brandLogo();
  };
  watch();
}
