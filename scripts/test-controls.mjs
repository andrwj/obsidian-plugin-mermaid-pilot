import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

// Model only the public lifecycle/event contract; exercise actual controller code.
const result = await build({
  entryPoints: ["src/graph-control.ts"], bundle: true, write: false, format: "cjs", platform: "node",
  plugins: [{ name: "obsidian-test-component", setup(builder) {
    builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: `
      export class Component {
        children = []; cleanups = []; loaded = false;
        load() { this.loaded = true; this.onload?.(); for (const c of this.children) c.load(); }
        unload() { this.onunload?.(); for (const c of this.children) c.unload(); for (const f of this.cleanups.splice(0)) f(); this.loaded = false; }
        addChild(c) { this.children.push(c); if (this.loaded) c.load(); return c; }
        removeChild(c) { this.children = this.children.filter(x => x !== c); }
        register(f) { this.cleanups.push(f); }
        registerDomEvent(el, type, fn, options) { el.addEventListener(type, fn, options); this.register(() => el.removeEventListener(type, fn, options)); }
      }` }));
  } }],
});
const module = { exports: {} };
new Function("module", "exports", result.outputFiles[0].text)(module, module.exports);
const { GraphDocument } = module.exports;
const dom = new JSDOM(`<body>
  <div class="markdown-reading-view"><div class="mermaid"><svg id="a" tabindex="3"><a href="#target"><text>Graph A</text></a></svg></div></div>
  <div class="markdown-source-view mod-cm6"><div class="mermaid"><svg id="b"></svg></div></div>
  <svg id="ordinary"></svg>
</body>`, { pretendToBeVisual: true });
const { document: doc } = dom.window;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const a = doc.querySelector("#a");
const b = doc.querySelector("#b");
const manager = new GraphDocument(doc);
manager.load();
assert.equal(doc.querySelectorAll(".mgc-viewport").length, 2);
assert.equal(doc.querySelector("#ordinary").parentElement, doc.body);
// Obsidian renders Mermaid asynchronously in a hidden, body-level .mermaid
// container before copying the completed SVG into the markdown view. Both
// an initial plugin scan and later observer scans must leave staging alone.
const staging = doc.createElement("div");
staging.className = "mermaid";
staging.style.visibility = "hidden";
staging.innerHTML = '<svg id="render-in-progress"><g></g></svg>';
doc.body.append(staging);
const stagingSvg = staging.querySelector("svg");
manager.scan();
assert.equal(stagingSvg.parentElement, staging, "initial scan preserves Mermaid rendering tree");
stagingSvg.querySelector("g").append(doc.createElementNS("http://www.w3.org/2000/svg", "text"));
await tick();
assert.equal(stagingSvg.parentElement, staging, "observer preserves Mermaid rendering tree across async steps");
assert.equal(stagingSvg.hasAttribute("tabindex"), false);
assert.equal(staging.querySelector(".mgc-viewport"), null);
const rendered = doc.createElement("div");
rendered.className = "markdown-rendered";
rendered.innerHTML = '<div class="mermaid"></div>';
// Model Obsidian's completed markup insertion, rather than moving staging SVG.
rendered.firstElementChild.innerHTML = staging.innerHTML;
doc.body.append(rendered);
staging.remove();
await tick();
assert.equal(rendered.querySelectorAll(".mgc-viewport").length, 1, "completed markdown graph is enhanced");
rendered.remove();
await tick();
assert.equal(doc.querySelectorAll(".mgc-viewport").length, 2);
const viewport = a.closest(".mgc-viewport");
const surface = a.parentElement;
function pointer(target, type, { x = 0, y = 0, button = 0, buttons = 1, id = 1 } = {}) {
  const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button, buttons });
  Object.defineProperty(event, "pointerId", { value: id });
  target.dispatchEvent(event);
  return event;
}
function menu() {
  const event = new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  a.dispatchEvent(event); return event;
}
function key(key) { a.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); }
// Menus emitted on press must wait until click versus drag is known.
let menusShown = 0;
viewport.addEventListener("contextmenu", () => { menusShown++; });
pointer(a, "pointerdown", { button: 2, buttons: 2 });
assert.equal(menu().defaultPrevented, true);
assert.equal(menusShown, 0);
pointer(doc, "pointerup", { button: 2, buttons: 0 });
assert.equal(menusShown, 1, "early Obsidian context menu is replayed on simple right release");
pointer(a, "pointerdown", { button: 2, buttons: 2 });
menu();
pointer(doc, "pointermove", { y: -50, button: 2, buttons: 2 });
pointer(doc, "pointerup", { button: 2, buttons: 0 });
assert.equal(menusShown, 1, "early context menu is discarded after zoom drag");
key("0");
pointer(a, "pointerdown", { button: 2, buttons: 2 });
pointer(doc, "pointermove", { y: 2, button: 2, buttons: 2 });
pointer(doc, "pointerup", { button: 2, buttons: 0 });
assert.equal(menu().defaultPrevented, false, "small movement preserves context menu");
pointer(a, "pointerdown", { button: 2, buttons: 2 });
pointer(doc, "pointermove", { y: -200, button: 2, buttons: 2 });
pointer(doc, "pointerup", { button: 2, buttons: 0 });
assert.match(surface.style.transform, /scale\(2\.718/);
assert.equal(menu().defaultPrevented, true, "zoom drag suppresses context menu");
assert.equal(b.parentElement.style.transform, "", "graphs have independent zoom");
pointer(a, "pointerdown", { button: 2, buttons: 2 });
pointer(doc, "pointerup", { button: 2, buttons: 0 });
assert.equal(menu().defaultPrevented, false, "subsequent regular right click works immediately");
pointer(a, "pointerdown", { button: 2, buttons: 2 });
pointer(doc, "pointermove", { y: -10000, button: 2, buttons: 2 });
assert.match(surface.style.transform, /scale\(5\)/);
pointer(doc, "pointermove", { y: 10000, button: 2, buttons: 2 });
assert.match(surface.style.transform, /scale\(0\.2\)/);
pointer(doc, "pointercancel");
assert.equal(viewport.classList.contains("mgc-dragging"), false);
key("0");
pointer(a, "pointerdown");
pointer(doc, "pointermove", { x: 50, y: 30 });
pointer(doc, "pointerup", { buttons: 0 });
assert.equal(surface.style.transform, "translate(50px, 30px) scale(1)");
const click = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
a.querySelector("a").dispatchEvent(click);
assert.equal(click.defaultPrevented, true, "pan does not accidentally open links");
const beforeFullscreen = surface.style.transform;
key("Enter"); await tick();
assert.equal(viewport.classList.contains("mgc-window-fullscreen"), true, "fallback when native fullscreen unavailable");
key("Escape");
assert.equal(viewport.classList.contains("mgc-fullscreen"), false);
assert.equal(surface.style.transform, beforeFullscreen);
// Exercise the native fullscreen success/change branch too.
Object.defineProperty(doc, "fullscreenElement", { configurable: true, writable: true, value: null });
viewport.requestFullscreen = async () => { doc.fullscreenElement = viewport; doc.dispatchEvent(new dom.window.Event("fullscreenchange")); };
doc.exitFullscreen = async () => { doc.fullscreenElement = null; doc.dispatchEvent(new dom.window.Event("fullscreenchange")); };
key("Enter"); await tick();
assert.equal(doc.fullscreenElement, viewport);
assert.equal(viewport.classList.contains("mgc-window-fullscreen"), false);
await doc.exitFullscreen();
assert.equal(surface.style.transform, beforeFullscreen, "native Escape restores previous view");
key("Enter"); await tick(); key("Enter"); await tick();
assert.equal(doc.fullscreenElement, null, "Enter toggles native fullscreen");
viewport.querySelector("button").click();
assert.equal(surface.style.transform, "translate(0px, 0px) scale(1)");
// Async Mermaid render and replacement, including removal during a drag.
const container = b.closest(".mermaid");
pointer(b, "pointerdown");
pointer(doc, "pointermove", { x: 25 });
container.innerHTML = '<svg id="replacement"></svg>';
await tick();
assert.equal(b.hasAttribute("tabindex"), false);
assert.equal(container.querySelectorAll(".mgc-viewport").length, 1);
assert.equal(doc.contains(b), false, "removed SVG is not resurrected");
const replacement = container.querySelector("svg");
pointer(replacement, "pointerdown");
pointer(doc, "pointermove", { x: 40 });
manager.unload();
assert.equal(doc.querySelectorAll(".mgc-viewport").length, 0);
assert.equal(a.getAttribute("tabindex"), "3");
assert.equal(replacement.hasAttribute("tabindex"), false);
pointer(doc, "pointermove", { x: 100 });
container.innerHTML = '<svg id="after-disable"></svg>';
await tick();
assert.equal(doc.querySelectorAll(".mgc-viewport").length, 0, "observer is disconnected on disable");
dom.window.close();
console.log("Graph controls: Mermaid staging isolation, reading/Live Preview DOM, zoom limits, independent views, pan, context menu, fullscreen, rerender and unload passed.");
