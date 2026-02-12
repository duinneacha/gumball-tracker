import "./style.css";
import { createApp } from "./app/app.js";

// Entry point: bootstrap the Gumball Tracker application shell.
window.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector("#app");
  if (!root) {
    // Fail fast in dev if the container is missing.
    throw new Error("Missing #app container");
  }

  createApp(root);
});
