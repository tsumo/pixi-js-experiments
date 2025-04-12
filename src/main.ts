import { Pane } from "tweakpane";
import { initDust } from "./dust/dust";
import "./style.css";

const appElement = document.querySelector<HTMLDivElement>("#app");

if (appElement) {
  const canvas = document.createElement("canvas");
  appElement.appendChild(canvas);

  const dust = await initDust(canvas);

  const pane = new Pane();
  const params = {
    text: "asdasd",
  };

  pane.addBinding(params, "text");
  pane
    .addButton({ title: "Redraw" })
    .on("click", () => dust.redrawByText(params.text, "red"));
  pane
    .addButton({ title: "Start" })
    .on("click", () => dust.startAnimationByText(params.text));
  pane
    .addButton({ title: "Stop" })
    .on("click", () => dust.stopAnimationByText(params.text));
  pane
    .addButton({ title: "Hover over" })
    .on("click", () => dust.hoverOver(params.text));
  pane
    .addButton({ title: "Hover out" })
    .on("click", () => dust.hoverOut(params.text));
  pane
    .addButton({ title: "Fade out all" })
    .on("click", () => dust.fadeOutAll());
}
