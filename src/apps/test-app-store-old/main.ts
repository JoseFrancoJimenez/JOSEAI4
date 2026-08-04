import { Application } from './application.ts';

const appContainer = document.getElementById('app')!;

const app = new Application();

appContainer.appendChild(app);