import { Plugin } from "obsidian";
import { GraphDocument } from "./mermaid-pilot-control";

export default class MermaidPilotPlugin extends Plugin {
  override onload(): void {
    const documents = new Map<Document, GraphDocument>();
    const attach = (doc: Document) => {
      if (documents.has(doc)) return;
      const controls = this.addChild(new GraphDocument(doc));
      documents.set(doc, controls);
      if (doc.defaultView) this.registerDomEvent(doc.defaultView, "unload", () => {
        controls.unload();
        this.removeChild(controls);
        documents.delete(doc);
      });
    };
    this.active = true;
    this.app.workspace.onLayoutReady(() => {
      // Layout readiness can arrive after the plugin was disabled.
      if (!this.active) return;
      attach(document);
      this.app.workspace.iterateAllLeaves((leaf) => attach(leaf.view.containerEl.ownerDocument));
    });
    this.registerEvent(this.app.workspace.on("window-open", (_window, win) => attach(win.document)));
    this.registerMarkdownPostProcessor((element) => attach(element.ownerDocument));
    this.register(() => { this.active = false; documents.clear(); });
  }

  private active = false;
}
