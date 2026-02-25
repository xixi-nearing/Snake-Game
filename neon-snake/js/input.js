import { KEY_TO_DIR } from './config.js';

export function createInputController({ dom, state, applyDirection, togglePause, resetGame, getStoredMode, setStoredMode }) {
  let touchStart = null;

  function setInputMode(mode, skipPersist = false) {
    const resolved = mode === 'touch' ? 'touch' : 'keyboard';
    state.inputMode = resolved;
    dom.inputModeInputs.forEach((input) => {
      input.checked = input.value === resolved;
    });
    document.body.classList.toggle('touch-mode', resolved === 'touch');
    if (dom.touchControls) {
      dom.touchControls.setAttribute('aria-hidden', String(resolved !== 'touch'));
    }
    if (!skipPersist) {
      setStoredMode(resolved);
    }
  }

  function resolveInputMode() {
    const stored = getStoredMode();
    const prefersTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return stored || (prefersTouch ? 'touch' : 'keyboard');
  }

  function handleKeydown(event) {
    const key = event.key.toLowerCase();
    if (key === ' ') {
      event.preventDefault();
      togglePause();
      return;
    }
    if (key === 'escape') {
      event.preventDefault();
      togglePause();
      return;
    }
    if (key === 'r') {
      resetGame(false);
      return;
    }

    if (state.inputMode === 'touch') return;

    const dirName = KEY_TO_DIR[key];
    if (dirName) {
      applyDirection(dirName);
    }
  }

  function handleTouchPad(event) {
    if (state.inputMode !== 'touch') return;
    const button = event.target.closest('button[data-dir]');
    if (!button) return;
    event.preventDefault();
    applyDirection(button.dataset.dir);
  }

  function handleTouchStart(event) {
    if (state.inputMode !== 'touch') return;
    if (!event.changedTouches.length) return;
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
    event.preventDefault();
  }

  function handleTouchEnd(event) {
    if (state.inputMode !== 'touch' || !touchStart) return;
    if (!event.changedTouches.length) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    const threshold = 24;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      applyDirection(dx > 0 ? 'right' : 'left');
    } else {
      applyDirection(dy > 0 ? 'down' : 'up');
    }
    event.preventDefault();
  }

  function bind() {
    dom.inputModeInputs.forEach((input) => {
      input.addEventListener('change', (event) => {
        if (event.target.checked) {
          setInputMode(event.target.value);
        }
      });
    });

    document.addEventListener('keydown', handleKeydown);

    if (dom.touchControls) {
      dom.touchControls.addEventListener('pointerdown', handleTouchPad);
      dom.touchControls.addEventListener('touchstart', handleTouchPad, { passive: false });
    }

    dom.canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    dom.canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
  }

  return {
    bind,
    setInputMode,
    resolveInputMode,
  };
}
