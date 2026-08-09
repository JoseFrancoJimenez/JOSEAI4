import type { UiCardElement } from '@mini/lib/elements';
import '@mini/lib/elements';
import '@fortawesome/fontawesome-free/css/all.min.css';

const timerDemo = document.getElementById('timer-demo') as UiCardElement;
setTimeout(() => {
  timerDemo.setContent('default', 'Loaded.');
}, 2000);

const popupDemo = document.getElementById('popup-demo') as UiCardElement;

const header = document.createDocumentFragment();
const title = document.createElement('strong');
title.textContent = 'Parcel 12-B';
const closeButton = document.createElement('ui-button');
closeButton.setAttribute('icon', 'fa-solid fa-xmark');
closeButton.setAttribute('aria-label', 'Close');
header.append(title, closeButton);

popupDemo.setContent('header', header);
popupDemo.setContent('default', 'Built entirely in code — no markup children.');

console.log('ui-card demo booted');
