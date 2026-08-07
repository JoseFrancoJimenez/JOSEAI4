import type { UiButtonElement } from "@mini/lib/elements";
import "@mini/lib/elements";

const setContentDemo = document.getElementById("set-content-demo") as UiButtonElement;
setTimeout(() => {
  setContentDemo.setContent("default", "Loaded");
}, 1500);

const form = document.getElementById("demo-form") as HTMLFormElement;
const formStatus = document.getElementById("form-status")!;
form.addEventListener("submit", (event) => {
  event.preventDefault();
  formStatus.textContent = "Form submitted.";
});

console.log("ui-button demo booted");
