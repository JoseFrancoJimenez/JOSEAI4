import type { ButtonGroupElement } from '@mini/lib/widgets';
import '@mini/lib/widgets';
import { UiButtonElement } from '@mini/lib/elements';
import '@fortawesome/fontawesome-free/css/all.min.css';

/** Demo-local subclass — proves a UiButtonElement subclass under its own tag counts, selects, and emits (§7). */
class FancyButtonElement extends UiButtonElement {}
customElements.define('fancy-button', FancyButtonElement);

const programmaticDemo = document.getElementById('programmatic-demo') as ButtonGroupElement;
document.getElementById('set-medium')!.addEventListener('click', () => {
  programmaticDemo.setActive('medium');
});
document.getElementById('set-null')!.addEventListener('click', () => {
  programmaticDemo.setActive(null);
});

const loggingDemo = document.getElementById('logging-demo') as ButtonGroupElement;
const eventLog = document.getElementById('event-log')!;

function log(message: string): void {
  eventLog.textContent += `${message}\n`;
  eventLog.scrollTop = eventLog.scrollHeight;
}

loggingDemo.addEventListener('widget-button-group:change', (event) => {
  log(`widget-button-group:change → ${JSON.stringify((event as CustomEvent).detail)}`);
});
loggingDemo.addEventListener('click', () => {
  log('click (native, bubbled)');
});

console.log('widget-button-group demo booted');
