# Mermaid Pilot

Zoom, pan, and view Mermaid diagrams in full screen without leaving your Obsidian note. Works in Reading view and Live Preview. Desktop only.

## Controls

| Action                    | Control                                        |
| ------------------------- | ---------------------------------------------- |
| Zoom in / out             | Hold the right mouse button and drag up / down |
| Pan                       | Hold the left mouse button and drag            |
| Enter / leave full screen | Focus the diagram, then press `Enter`          |
| Leave full screen         | `Esc`                                          |
| Reset zoom and position   | `0` while focused, or the `↺` button           |

Click a diagram or use `Tab` to focus it. Each diagram has its own zoom and position, with a zoom range of 20–500%. Leaving full screen restores the previous view.

A right-click without dragging opens the usual context menu. Ctrl, Cmd, Alt, and Shift mouse gestures are left alone. If native full screen is unavailable, the diagram fills the Obsidian window instead.

Zoom and position reset when Obsidian replaces a diagram during rendering. They are not saved to your notes or plugin settings.

## Manual installation

1. Create a `mermaid-graph-control` folder inside your vault's `.obsidian/plugins/` directory.
2. Copy `main.js`, `manifest.json`, and `styles.css` from a release into that folder.
3. Reload Obsidian and enable **Mermaid Pilot** under **Settings → Community plugins**.

The folder name is the plugin ID and differs from the display name. Tested with Obsidian 1.14.4.

## Development

Use Node.js 22 or later.

```sh
npm install
npm run dev     # Watch source changes
npm run check   # TypeScript, metadata, and interaction tests
npm run build  # Production build
```

To build and install into a local vault:

```sh
OBSIDIAN_VAULT=/path/to/vault npm run install:local
```

The installer copies only the three plugin files. It does not enable the plugin or change vault settings.

## License

[MIT](LICENSE)
