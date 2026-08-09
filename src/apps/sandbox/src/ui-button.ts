import type { UiButtonElement } from '@mini/lib/elements';
import '@mini/lib/elements';
import '@fortawesome/fontawesome-free/css/all.min.css';

const pressedToggleDemo = document.getElementById('pressed-toggle-demo') as UiButtonElement;
pressedToggleDemo.addEventListener('click', () => {
  pressedToggleDemo.pressed = !pressedToggleDemo.pressed;
});

const labelTimerDemo = document.getElementById('label-timer-demo') as UiButtonElement;
setTimeout(() => {
  labelTimerDemo.label = 'Done';
}, 2000);

const form = document.getElementById('demo-form') as HTMLFormElement;
const formStatus = document.getElementById('form-status')!;
form.addEventListener('submit', (event) => {
  event.preventDefault();
  formStatus.textContent = 'Form submitted.';
});

console.log('ui-button demo booted');
