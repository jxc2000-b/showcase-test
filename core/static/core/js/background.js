// Ambient "mirage" page: each button slowly fades its full-viewport 3-image
// grid in and the others out. Clicking the active button again dismisses it,
// leaving the bare page. The long CSS transition does the dreaminess; JS only
// toggles which grid is active.
(() => {
  const buttons = [...document.querySelectorAll('.mirage-btn')];
  const grids = new Map(
    [...document.querySelectorAll('.mirage-grid')].map((el) => [el.dataset.key, el])
  );
  const reduceMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let activeKey = null;

  // only the visible grid's video cells decode: play them, pause the rest
  // (reduced-motion leaves every video paused on its first frame)
  function setGridPlaying(el, playing) {
    for (const v of el.querySelectorAll('video.mirage-cell')) {
      if (playing && !reduceMotion) {
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
      } else {
        v.pause();
      }
    }
  }

  function show(key) {
    activeKey = key === activeKey ? null : key;
    for (const [k, el] of grids) {
      const on = k === activeKey;
      el.classList.toggle('active', on);
      setGridPlaying(el, on);
    }
    for (const btn of buttons) {
      btn.classList.toggle('active', btn.dataset.key === activeKey);
      btn.setAttribute('aria-pressed', String(btn.dataset.key === activeKey));
    }
  }

  for (const btn of buttons) {
    btn.addEventListener('click', () => show(btn.dataset.key));
  }
})();
