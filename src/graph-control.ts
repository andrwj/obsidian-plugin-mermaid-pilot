import { Component } from "obsidian";

const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const THRESHOLD = 4;
// Obsidian also creates .mermaid SVGs in a hidden body-level staging area
// while mermaid.render() is still running. Never reparent those live nodes.
const GRAPH_SELECTOR = [".markdown-reading-view", ".markdown-source-view", ".markdown-rendered"]
  .map((scope) => `${scope} .mermaid svg, ${scope} svg.mermaid`)
  .join(", ");
const clamp = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

type View = { scale: number; x: number; y: number };
type Drag = { id: number; button: number; x: number; y: number; view: View; moved: boolean };

/** One transient view per rendered Mermaid SVG. No note or settings writes. */
export class GraphControl extends Component {
  readonly viewport: HTMLDivElement;
  private readonly surface: HTMLDivElement;
  private readonly toolbar: HTMLDivElement;
  private readonly placeholder: Comment;
  private readonly oldTabindex: string | null;
  private view: View = { scale: 1, x: 0, y: 0 };
  private drag?: Drag;
  private suppressMenuUntil = 0;
  private pendingMenu?: MouseEvent;
  private suppressClickUntil = 0;
  private expanded = false;
  private savedView?: View;
  private fullscreenWidth = "";
  private disposed = false;

  constructor(readonly svg: SVGSVGElement) {
    super();
    const doc = svg.ownerDocument;
    this.placeholder = doc.createComment("mermaid-graph-control");
    this.viewport = doc.createElement("div");
    this.viewport.className = "mgc-viewport";
    this.viewport.setAttribute("role", "group");
    this.viewport.setAttribute("aria-label", "Mermaid graph controls");
    this.viewport.setAttribute("aria-description", "Right drag: zoom. Left drag: pan. Enter: fullscreen. Escape: exit fullscreen. 0: reset.");
    this.surface = doc.createElement("div");
    this.surface.className = "mgc-surface";
    this.toolbar = doc.createElement("div");
    this.toolbar.className = "mgc-toolbar";
    const reset = doc.createElement("button");
    reset.type = "button";
    reset.textContent = "↺";
    reset.setAttribute("aria-label", "Reset graph zoom and pan (0)");
    reset.title = "Reset zoom and pan (0)";
    this.toolbar.append(reset);
    this.oldTabindex = svg.getAttribute("tabindex");
    svg.setAttribute("tabindex", "0");
    svg.before(this.placeholder, this.viewport);
    this.viewport.append(this.surface, this.toolbar);
    this.surface.append(svg);
    this.registerDomEvent(reset, "click", () => {
      this.reset();
      this.svg.focus({ preventScroll: true });
    });
    this.registerDomEvent(this.viewport, "pointerdown", (event) => this.pointerDown(event));
    this.registerDomEvent(doc, "pointermove", (event) => this.pointerMove(event), true);
    this.registerDomEvent(doc, "pointerup", (event) => this.endDrag(event.pointerId, true), true);
    this.registerDomEvent(doc, "pointercancel", (event) => this.endDrag(event.pointerId), true);
    this.registerDomEvent(this.viewport, "lostpointercapture", (event) => this.endDrag(event.pointerId));
    this.registerDomEvent(doc, "contextmenu", (event) => {
      if (!this.viewport.contains(event.target as Node)) return;
      // Some platforms emit contextmenu on press instead of release. Defer
      // Obsidian's menu until release, when click versus zoom is known.
      if (this.drag?.button === 2) {
        this.pendingMenu = event;
        event.preventDefault();
        event.stopPropagation();
      } else if (Date.now() < this.suppressMenuUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
    this.registerDomEvent(this.viewport, "click", (event) => {
      if (Date.now() < this.suppressClickUntil && !this.toolbar.contains(event.target as Node)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
    this.registerDomEvent(this.viewport, "keydown", (event) => this.keyDown(event));
    this.registerDomEvent(doc, "fullscreenchange", () => {
      if (this.expanded && !this.viewport.classList.contains("mgc-window-fullscreen") && doc.fullscreenElement !== this.viewport) this.restore();
    });
    if (doc.defaultView) this.registerDomEvent(doc.defaultView, "blur", () => this.endDrag());
  }

  private pointerDown(event: PointerEvent): void {
    if (this.drag || (event.button !== 0 && event.button !== 2) || !this.surface.contains(event.target as Node)) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    event.stopPropagation();
    this.svg.focus({ preventScroll: true });
    this.drag = { id: event.pointerId, button: event.button, x: event.clientX, y: event.clientY, view: { ...this.view }, moved: false };
    // Preserve link clicks and native right-click until a real drag is detected.
  }

  private pointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    if (!(event.buttons & (drag.button === 2 ? 2 : 1))) { this.endDrag(); return; }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && (drag.button === 2 ? Math.abs(dy) : Math.hypot(dx, dy)) < THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      try { this.viewport.setPointerCapture(event.pointerId); } catch { /* Detached or synthetic pointer. */ }
    }
    event.preventDefault();
    event.stopPropagation();
    this.viewport.classList.add("mgc-dragging");
    if (drag.button === 2) {
      this.view = { ...drag.view, scale: clamp(drag.view.scale * Math.exp(-dy / 200)) };
      this.suppressMenuUntil = Date.now() + 800;
    } else {
      this.view = { ...drag.view, x: drag.view.x + dx, y: drag.view.y + dy };
    }
    this.applyView();
  }

  private endDrag(pointerId?: number, showMenu = false): void {
    const drag = this.drag;
    if (!drag || (pointerId !== undefined && drag.id !== pointerId)) return;
    this.drag = undefined;
    const pendingMenu = this.pendingMenu;
    this.pendingMenu = undefined;
    this.viewport.classList.remove("mgc-dragging");
    if (drag.moved) {
      if (drag.button === 2) this.suppressMenuUntil = Date.now() + 800;
      else this.suppressClickUntil = Date.now() + 100;
    } else if (drag.button === 2) this.suppressMenuUntil = 0;
    if (this.viewport.hasPointerCapture?.(drag.id)) this.viewport.releasePointerCapture(drag.id);
    if (showMenu && !drag.moved && pendingMenu && !this.disposed) {
      const MouseEventClass = this.svg.ownerDocument.defaultView?.MouseEvent;
      if (MouseEventClass) pendingMenu.target?.dispatchEvent(new MouseEventClass("contextmenu", {
        bubbles: true, cancelable: true, composed: true,
        clientX: pendingMenu.clientX, clientY: pendingMenu.clientY,
        screenX: pendingMenu.screenX, screenY: pendingMenu.screenY,
        button: 2, buttons: 0,
        ctrlKey: pendingMenu.ctrlKey, shiftKey: pendingMenu.shiftKey,
        altKey: pendingMenu.altKey, metaKey: pendingMenu.metaKey,
      }));
    }
  }

  private applyView(): void {
    const { scale, x, y } = this.view;
    this.surface.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    this.viewport.setAttribute("aria-description", `Zoom ${Math.round(scale * 100)}%. Right drag: zoom. Left drag: pan. Enter: fullscreen. 0: reset.`);
  }

  private reset(): void {
    this.endDrag();
    this.view = { scale: 1, x: 0, y: 0 };
    this.applyView();
  }

  private keyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && this.expanded) {
      event.preventDefault(); event.stopPropagation(); this.exitFullscreen(); return;
    }
    if (event.target !== this.svg || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    if (event.key === "Enter") {
      event.preventDefault(); event.stopPropagation();
      if (this.expanded) this.exitFullscreen(); else void this.enterFullscreen();
    } else if (event.key === "0") {
      event.preventDefault(); event.stopPropagation(); this.reset();
    }
  }

  private async enterFullscreen(): Promise<void> {
    this.endDrag();
    this.savedView = { ...this.view };
    this.fullscreenWidth = `${this.surface.getBoundingClientRect().width / this.view.scale}px`;
    this.expanded = true;
    this.viewport.classList.add("mgc-fullscreen");
    this.surface.style.width = this.fullscreenWidth;
    this.view = { scale: 1, x: 0, y: 0 };
    this.applyView();
    try {
      if (!this.viewport.requestFullscreen) throw new Error("Fullscreen unavailable");
      await this.viewport.requestFullscreen();
      if (this.disposed || !this.expanded) {
        if (this.svg.ownerDocument.fullscreenElement === this.viewport) void this.svg.ownerDocument.exitFullscreen();
        return;
      }
    } catch {
      if (this.disposed || !this.expanded) return;
      this.viewport.classList.add("mgc-window-fullscreen");
    }
    const bounds = this.viewport.getBoundingClientRect();
    const graph = this.surface.getBoundingClientRect();
    if (bounds.width > 0 && bounds.height > 0 && graph.width > 0 && graph.height > 0) {
      this.view.scale = clamp(Math.min(bounds.width / graph.width, bounds.height / graph.height) * 0.95);
      this.applyView();
    }
    this.svg.focus({ preventScroll: true });
  }

  private exitFullscreen(): void {
    const doc = this.svg.ownerDocument;
    if (doc.fullscreenElement === this.viewport) void doc.exitFullscreen().catch(() => {});
    this.restore();
  }

  private restore(): void {
    if (!this.expanded) return;
    this.expanded = false;
    this.viewport.classList.remove("mgc-fullscreen", "mgc-window-fullscreen");
    this.surface.style.removeProperty("width");
    this.view = this.savedView ?? { scale: 1, x: 0, y: 0 };
    this.savedView = undefined;
    this.applyView();
    if (this.svg.isConnected) this.svg.focus({ preventScroll: true });
  }

  override onunload(): void {
    this.disposed = true;
    this.endDrag();
    this.exitFullscreen();
    if (this.oldTabindex === null) this.svg.removeAttribute("tabindex");
    else this.svg.setAttribute("tabindex", this.oldTabindex);
    // Do not resurrect a graph removed by Mermaid or a view switch.
    if (this.placeholder.parentNode && this.viewport.contains(this.svg)) this.placeholder.replaceWith(this.svg);
    else this.placeholder.remove();
    this.viewport.remove();
  }
}

/** Observe asynchronous Mermaid rendering in reading view and Live Preview. */
export class GraphDocument extends Component {
  private readonly graphs = new Map<SVGSVGElement, GraphControl>();
  constructor(private readonly doc: Document) { super(); }

  override onload(): void {
    const Observer = this.doc.defaultView?.MutationObserver;
    if (!Observer) return;
    const observer = new Observer(() => this.scan());
    observer.observe(this.doc.body, { childList: true, subtree: true });
    this.register(() => observer.disconnect());
    this.scan();
  }

  scan(): void {
    for (const [svg, graph] of this.graphs) {
      if (!svg.isConnected || !graph.viewport.contains(svg) || !svg.matches(GRAPH_SELECTOR)) {
        graph.unload(); this.removeChild(graph); this.graphs.delete(svg);
      }
    }
    for (const svg of Array.from(this.doc.querySelectorAll<SVGSVGElement>(GRAPH_SELECTOR))) {
      if (!this.graphs.has(svg) && !svg.closest(".mgc-viewport") && !svg.parentElement?.closest("svg")) {
        const graph = new GraphControl(svg);
        this.graphs.set(svg, graph);
        this.addChild(graph);
      }
    }
  }

  override onunload(): void { this.graphs.clear(); }
}
