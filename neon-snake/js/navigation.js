export function createNavigation({ pageButtons, pages }) {
  function setActivePage(pageId, skipScroll = false) {
    const target = pages.find((page) => page.dataset.page === pageId) || pages[0];
    pages.forEach((page) => {
      const active = page === target;
      page.classList.toggle('is-active', active);
      page.setAttribute('aria-hidden', String(!active));
    });
    pageButtons.forEach((button) => {
      if (!button.classList.contains('nav-btn')) return;
      button.classList.toggle('is-active', button.dataset.pageTarget === target.dataset.page);
    });
    document.body.dataset.page = target.dataset.page;
    if (!skipScroll) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function bind() {
    pageButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.dataset.pageTarget;
        if (target) {
          setActivePage(target);
        }
      });
    });
  }

  return { setActivePage, bind };
}
