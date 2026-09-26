# Third-party notices

## Aural (aural-oss)

- Source: https://github.com/1146345502/aural-oss
- Commit copied from: `ff366fbf52f2adb15d288bd2ce659e925cbbaafc`
- License: MIT

Adapted files:

| Upstream | Local |
|---|---|
| `src/components/code-editor/code-editor-canvas.tsx` | `src/components/code-editor/code-editor-canvas.tsx` |
| `src/components/whiteboard/whiteboard-canvas.tsx` | `src/components/whiteboard/whiteboard-canvas.tsx` |
| `src/components/whiteboard/whiteboard-overrides.css` | `src/components/whiteboard/whiteboard-overrides.css` |

Local changes:

- **Both wrappers**
  - Snapshots are typed objects (`CodeSnapshot`, `SafeScene`) instead of JSON strings.
  - `getSnapshot()` reads the live editor/canvas synchronously, so Submit captures the latest edit without waiting for the debounce.
  - Empty or cleared content is returned and autosaved instead of being skipped, so a cleared draft stays cleared.
  - Lazy import now has a timeout, a visible load error and a Retry button instead of an endless spinner.
  - Formatted and linted with Biome to match this repo.
- **Code editor**
  - Adds a plain-text fallback so an answer can still be written and submitted if Monaco fails to load.
  - A read-only view falls back to `<pre>`.
  - Language is fixed by the question unless `allowLanguageChange` is set.
  - `readOnly` also sets `domReadOnly`.
  - No run or execute control (as upstream).
- **Whiteboard**
  - Scene serialization moved to `scene.ts` and keeps only an allowlist: elements that are not deleted and not images, plus `viewBackgroundColor` and `gridSize`. No binary files and no collaborators.
  - Pasting files and the image tool are disabled.
  - Removed SVG export helpers, the theme toggle, and Clear Canvas in read-only mode.
- **CSS**
  - Additionally hides the collaboration, image-tool and library entry points.

Not reused: Aural's voice relays, tRPC, auth, database schema/migrations, paste blocking and automatic artifact grading.

```
MIT License

Copyright (c) 2025 Aural

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
