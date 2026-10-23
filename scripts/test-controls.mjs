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
// Obsidian adds these helpers to each window's DOM prototypes.
function installDomHelpers(window) {
  window.HTMLElement.prototype.createEl = function(tag, options = {}, callback) {
    const element = this.ownerDocument.createElement(tag);
    if (typeof options === "string") options = { cls: options };
    if (options.cls) element.className = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
    if (options.text !== undefined) element.textContent = options.text;
    if (options.title !== undefined) element.title = options.title;
    for (const [name, value] of Object.entries(options.attr ?? {})) element.setAttribute(name, String(value));
    callback?.(element);
    this.append(element);
    return element;
  };
  window.HTMLElement.prototype.createDiv = function(options, callback) {
    return this.createEl("div", options, callback);
  };
}
installDomHelpers(dom.window);
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
function pointer(target, type, { x = 0, y = 0, button = 0, buttons = 1, id = 1, pointerType = "mouse" } = {}) {
  const window = target.ownerDocument?.defaultView ?? target.defaultView;
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button, buttons });
  Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: pointerType } });
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
// Mobile interaction sequences, with a deterministic clock for tap timing.
const mobile = new JSDOM('<body><div class="markdown-source-view"><div class="mermaid"><svg id="touch"><a href="#link"><text>Link</text></a></svg></div><div class="mermaid"><svg id="other"></svg></div></div></body>', { pretendToBeVisual: true });
installDomHelpers(mobile.window);
const mobileDoc = mobile.window.document;
const mobileManager = new GraphDocument(mobileDoc);
mobileManager.load();
const touchSvg = mobileDoc.querySelector("#touch");
const touchSurface = touchSvg.parentElement;
const touchViewport = touchSvg.closest(".mgc-viewport");
const touchContainer = touchViewport.parentElement;
const otherSurface = mobileDoc.querySelector("#other").parentElement;
const realNow = Date.now;
let touchTime = realNow() + 1000;
Date.now = () => touchTime;
const touch = (target, type, options = {}) => pointer(target, type, { ...options, pointerType: "touch" });
const tap = (target = touchSvg, { x = 50, y = 50, duration = 20 } = {}) => {
  touch(target, "pointerdown", { x, y });
  touchTime += duration;
  touch(target, "pointerup", { x, y, buttons: 0 });
};
const doubleTap = (target = touchSvg) => { tap(target); touchTime += 80; tap(target); };
try {
  touch(touchSvg, "pointerdown", { x: 20, y: 20 });
  touch(mobileDoc, "pointermove", { x: 70, y: 55, buttons: 0 });
  assert.equal(touchSurface.style.transform, "translate(50px, 35px) scale(1)", "touch pan does not depend on mouse buttons");
  touch(mobileDoc, "pointerup", { x: 70, y: 55, buttons: 0 });
  const touchClick = new mobile.window.MouseEvent("click", { bubbles: true, cancelable: true });
  touchSvg.dispatchEvent(touchClick);
  assert.equal(touchClick.defaultPrevented, true, "touch pan suppresses delayed compatibility click");
  assert.equal(otherSurface.style.transform, "", "touch only changes the targeted graph");
  const savedTouchView = touchSurface.style.transform;
  touchTime += 600;
  tap();
  assert.equal(touchViewport.classList.contains("mgc-fullscreen"), false, "one tap does not expand");
  touchTime += 80;
  tap();
  await tick();
  assert.equal(touchViewport.classList.contains("mgc-window-fullscreen"), true);
  assert.equal(touchViewport.parentElement, mobileDoc.body, "fallback escapes transformed editor ancestors");
  assert.ok(touchContainer.contains(touchContainer.querySelector('[aria-hidden="true"]')), "note space is preserved");
  assert.equal(mobileDoc.querySelectorAll(".mgc-viewport").length, 2, "observer does not unload portaled graph");
  doubleTap();
  await tick();
  assert.equal(touchViewport.parentElement, touchContainer);
  assert.equal(touchSurface.style.transform, savedTouchView, "double tap restores previous zoom and pan");
  assert.equal(touchContainer.querySelector('[aria-hidden="true"]'), null);
  touchTime += 600;
  tap(); touchTime += 400; tap(); await tick();
  assert.equal(touchViewport.classList.contains("mgc-fullscreen"), false, "slow taps do not expand");
  touchTime += 600;
  tap(); touchTime += 50; tap(touchSvg, { x: 150 }); await tick();
  assert.equal(touchViewport.classList.contains("mgc-fullscreen"), false, "distant taps do not expand");
  touchTime += 600;
  tap(); tap(touchSvg, { duration: 310 }); tap(); await tick();
  assert.equal(touchViewport.classList.contains("mgc-fullscreen"), false, "long press breaks tap sequence");
  touchTime += 600;
  tap();
  touch(touchSvg, "pointerdown"); touch(mobileDoc, "pointercancel", { buttons: 0 });
  tap(); await tick();
  assert.equal(touchViewport.classList.contains("mgc-fullscreen"), false, "cancelled touch breaks tap sequence");
  touchTime += 600;
  doubleTap(touchSvg.querySelector("a")); await tick();
  assert.equal(touchViewport.classList.contains("mgc-fullscreen"), false, "link taps remain available for navigation");
  const beforeMultiTouch = touchSurface.style.transform;
  touch(touchSvg, "pointerdown", { id: 1 });
  touch(mobileDoc.body, "pointerdown", { id: 2 });
  touch(mobileDoc, "pointermove", { x: 200, id: 1 });
  assert.equal(touchSurface.style.transform, beforeMultiTouch, "second finger cancels active pan, even outside graph");
  touch(mobileDoc, "pointerup", { id: 1, buttons: 0 });
  touch(mobileDoc, "pointerup", { id: 2, buttons: 0 });
  touch(touchSvg, "pointerdown", { x: 10, y: 10 });
  touch(mobileDoc, "pointermove", { x: 30, y: 20 });
  touch(mobileDoc, "pointerup", { buttons: 0 });
  assert.notEqual(touchSurface.style.transform, beforeMultiTouch, "one finger pan resumes after all fingers lift");
  touchTime += 600;
  doubleTap(); await tick();
  touchViewport.querySelector(".mgc-exit-fullscreen").click(); await tick();
  assert.equal(touchViewport.parentElement, touchContainer, "close button restores fallback");
  touchTime += 600;
  doubleTap(); await tick();
  touchContainer.replaceChildren(); await tick();
  assert.equal(mobileDoc.contains(touchViewport), false, "rerender removes fallback overlay without resurrecting SVG");
  assert.equal(touchSvg.hasAttribute("tabindex"), false);
} finally {
  Date.now = realNow;
  mobileManager.unload();
  mobile.window.close();
}

// Helpers must create controls in the graph's own document (popout windows).
const popout = new JSDOM('<body><div class="markdown-rendered"><div class="mermaid"><svg></svg></div></div></body>', { pretendToBeVisual: true });
installDomHelpers(popout.window);
const popoutManager = new GraphDocument(popout.window.document);
popoutManager.load();
for (const control of popout.window.document.querySelectorAll(".mgc-viewport, .mgc-surface, .mgc-toolbar, button")) {
  assert.equal(control.ownerDocument, popout.window.document);
}
assert.equal(popout.window.document.querySelectorAll(".mgc-viewport").length, 1);
popoutManager.unload();
assert.equal(popout.window.document.querySelectorAll(".mgc-viewport").length, 0);
popout.window.close();
dom.window.close();
console.log("Graph controls: touch pan/double tap/multitouch cancellation, mobile fullscreen restoration, Mermaid staging isolation, reading/Live Preview DOM, zoom limits, independent views, pan, context menu, fullscreen, rerender and unload passed.");
