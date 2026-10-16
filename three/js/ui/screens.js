// One screen at a time: Pregunta -> Tirada -> Lectura, with El Libro to the side.
import { $ } from './dom.js';

export function createScreens(onShow) {
  const screens = [...document.querySelectorAll('.screen')];
  const steps = [...document.querySelectorAll('#steps li')];
  const toggle = $('book-toggle');
  const state = { current: 'intro', returnTo: 'intro' };

  function show(screen) {
    if (screen !== 'book') state.returnTo = screen; // the book is a detour, not a step
    state.current = screen;
    document.body.dataset.screen = screen;
    screens.forEach((node) => node.classList.toggle('active', node.dataset.screen === screen));
    const at = steps.findIndex((step) => step.dataset.step === state.returnTo);
    steps.forEach((step, i) => {
      step.classList.toggle('on', i === at);
      step.classList.toggle('done', i < at);
    });
    toggle.textContent = screen === 'book' ? 'Volver' : 'El Libro';
    onShow(screen);
  }

  toggle.addEventListener('click', () => show(state.current === 'book' ? state.returnTo : 'book'));
  return { show, get current() { return state.current; } };
}
