import type { UiButtonElement } from "@mini/lib/elements";
import "@mini/lib/elements";
import "@fortawesome/fontawesome-free/css/all.min.css";

const setContentDemo = document.getElementById("set-content-demo") as UiButtonElement;
//setTimeout(() => {
  setContentDemo.setContent("default", "Loaded");
//}, 1500);

const form = document.getElementById("demo-form") as HTMLFormElement;
const formStatus = document.getElementById("form-status")!;
form.addEventListener("submit", (event) => {
  event.preventDefault();
  formStatus.textContent = "Form submitted.";
});

// Created from JS — properties set before the element is mounted.
const jsProps = document.createElement("ui-button");
jsProps.label = "Save";
jsProps.icon = "fa-solid fa-star";
jsProps.iconPosition = "end";
document.getElementById("js-props")!.append(jsProps);

// Created from JS — setContent stashes before mount and applies at first render.
const jsSetContent = document.createElement("ui-button");
jsSetContent.setAttribute("aria-label", "Favourite");
const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.setAttribute("viewBox", "0 0 24 24");
svg.setAttribute("width", "16");
svg.setAttribute("height", "16");
svg.setAttribute("fill", "currentColor");
const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
path.setAttribute("d", "M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.9-6.2 3.9 1.6-7-5.4-4.7 7.1-.6z");
svg.append(path);
jsSetContent.setContent("icon", svg);
document.getElementById("js-set-content")!.append(jsSetContent);

// Created from JS — a plain click listener, since a click on the control bubbles out of the host.
const jsClick = document.createElement("ui-button");
jsClick.label = "Click me";
const jsClickStatus = document.getElementById("js-click-status")!;
let clickCount = 0;
jsClick.addEventListener("click", () => {
  clickCount++;
  jsClickStatus.textContent = `Clicked ${clickCount} time(s).`;
});
document.getElementById("js-click")!.append(jsClick);

// Created from JS — mounted empty, then label + icon set after mount: the latest write wins.
const postMountContent = document.createElement("ui-button");
document.getElementById("js-post-mount-content")!.append(postMountContent);
//setTimeout(() => {
  postMountContent.label = "Save";
  postMountContent.icon = "fa-solid fa-star";
//}, 2000);

// Created from JS — mounted with an icon at "start", then icon-position set to "end" after mount.
const postMountPosition = document.createElement("ui-button");
postMountPosition.label = "Save";
postMountPosition.icon = "fa-solid fa-star";
document.getElementById("js-post-mount-position")!.append(postMountPosition);
//setTimeout(() => {
  postMountPosition.iconPosition = "end";
//}, 2500);

// Created from JS — mounted enabled, then disabled set after mount.
const postMountDisabled = document.createElement("ui-button");
postMountDisabled.label = "Save";
document.getElementById("js-post-mount-disabled")!.append(postMountDisabled);
//setTimeout(() => {
  postMountDisabled.disabled = true;
//}, 3000);

console.log("ui-button demo booted");
