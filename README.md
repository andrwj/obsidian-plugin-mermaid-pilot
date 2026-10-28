# Mermaid Pilot

Zoom, pan, and view Mermaid diagrams in full screen without leaving your Obsidian note. Works in Reading view and Live Preview, with mouse and touch controls.

## Controls

### Mouse and keyboard

| Action                    | Control                                        |
| ------------------------- | ---------------------------------------------- |
| Zoom in / out             | Hold the right mouse button and drag up / down |
| Pan                       | Hold the left mouse button and drag            |
| Enter / leave full screen | Focus the diagram, then press `Enter`          |
| Leave full screen         | `Esc`                                          |
| Reset zoom and position   | `0` while focused, or the `↺` button           |

### Mobile and iPad

- Double-tap a diagram to enter or leave full screen.
- Drag with one finger to pan. Lift all fingers after a two-finger gesture before panning again.
- Tap `↺` to reset, or `×` to leave full screen.

Scroll the note from outside the diagram. Single taps on links still open them.

Click a diagram or use `Tab` to focus it. Each diagram has its own zoom and position, with a zoom range of 20–500%. Leaving full screen restores the previous view.

A right-click without dragging opens the usual context menu. Ctrl, Cmd, Alt, and Shift mouse gestures are left alone. If native full screen is unavailable, the diagram fills the Obsidian window instead.

Zoom and position reset when Obsidian replaces a diagram during rendering. They are not saved to your notes or plugin settings.

## Manual installation

1. Create a `mermaid-pilot` folder inside your vault's `.obsidian/plugins/` directory.
2. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/andrwj/obsidian-plugin-mermaid-pilot/releases/latest) and copy them into that folder.
3. Reload Obsidian and enable **Mermaid Pilot** under **Settings → Community plugins**.

The plugin ID and installation folder are both `mermaid-pilot`.

Upgrading from 1.0.2 or earlier: disable the previously installed plugin and install this version in `mermaid-pilot`. Obsidian treats the new ID as a separate plugin.

Desktop tested with Obsidian 1.14.4. Touch controls are covered by automated tests and browser touch emulation; testing on physical mobile and iPad devices is pending.

## Development

Use Node.js 22 or later.

```sh
npm install
npm run dev     # Watch source changes
npm run check   # TypeScript, metadata, and interaction tests
npm run build   # Production build
```

To build and install into a local vault:

```sh
OBSIDIAN_VAULT=/path/to/vault npm run install:local
```

The installer copies only the three plugin files. It does not enable the plugin or change vault settings.

## Releases

1.0.3 aligns the plugin ID with the package name, `mermaid-pilot`.

After committing and pushing a version update, push a matching tag without a `v` prefix (for example, `1.0.3`). GitHub Actions builds the plugin, generates provenance attestations for all three release files, and publishes the release.

Releases built by this workflow include GitHub artifact attestations. Verify downloaded files with:

```sh
gh attestation verify main.js --repo andrwj/obsidian-plugin-mermaid-pilot
gh attestation verify manifest.json --repo andrwj/obsidian-plugin-mermaid-pilot
gh attestation verify styles.css --repo andrwj/obsidian-plugin-mermaid-pilot
```

## License

[MIT](LICENSE). Project setup based on the [Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin).
