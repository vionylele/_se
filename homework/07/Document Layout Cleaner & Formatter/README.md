# DocuTidy – Browser-Based Word & PowerPoint Layout Normalizer

![client-side](https://img.shields.io/badge/runs-100%25%20client--side-34d399)
![formats](https://img.shields.io/badge/formats-.docx%20%7C%20.pptx-38bdf8)
![stack](https://img.shields.io/badge/stack-HTML%20%C2%B7%20Tailwind%20%C2%B7%20JSZip-6366f1)
![hosting](https://img.shields.io/badge/hosting-GitHub%20Pages-181717)
![privacy](https://img.shields.io/badge/uploads-none-success)

Homework 07 of *Modern Software Engineering*: **Document Layout Cleaner & Formatter**.
DocuTidy audits a Word or PowerPoint file for broken layout, repairs it, and gives you a `_tidy` copy.
Everything happens in the browser tab. The document is never sent to a server.

> **Designed and Architected with assistance from Claude (Anthropic).**

**Live demo:** `./index.html` (on GitHub Pages: `/homework/07/Document%20Layout%20Cleaner%20%26%20Formatter/`).
Use the *Try a broken sample* buttons if you have no file at hand.

---

## The problem

| Symptom | Where it shows up |
|---|---|
| Tables wider than the page, text clipped in cells, rows split across pages | Word |
| Typed lists numbered "1. 2. 4. 3." | Word |
| Piles of blank paragraphs, stray spaces, irregular line spacing, jagged font sizes | Word |
| Text spilling out of boxes, stacked on other boxes, double line breaks, titles that drift between slides | PowerPoint |

## Use value

- **Fast.** Drop a file, see an audit, press one button.
- **Private.** Contracts, student records and unreleased decks stay on the device. No upload, no account, no retention policy to read.
- **Transparent.** The audit lists exactly what is wrong, and each rule can be switched off.
- **Non-destructive.** The original is never touched; the output is a separate `name_tidy.docx/.pptx`.
- **Verifiable.** After repair the output is re-opened and re-scanned. The result panel reports how many issues remain.

## Commercial value

- **B2B add-on.** Document-heavy teams (legal, consulting, HR, education) waste time on formatting cleanup. The engine can ship as a "tidy before send" step inside a DMS, an email gateway or an intranet.
- **Micro-SaaS.** A privacy-first positioning ("your file never leaves the device") is a selling point in regulated industries and needs almost no infrastructure.
- **Freemium API / SDK.** The engine is plain JavaScript over `DOMParser`, so it can be wrapped as an npm package or a headless Node service. Free tier: audit and a few rules. Paid: batch processing, custom rule sets, corporate style profiles, more formats.
- **Low cost to serve.** Static hosting, and the user's CPU does the work.

## System architecture

```
 .docx / .pptx  ──►  JSZip (unzip in memory)
                         │
                         ├─ word/document.xml          ┐
                         └─ ppt/slides/slide*.xml      ├─► DOMParser ─► rule functions ─► XMLSerializer
                            (+ ppt/presentation.xml)   ┘        (mutate DOM, count changes)
                                                                              │
                                    Blob download  ◄──  JSZip (re-zip, other parts untouched)
```

1. **Open.** `JSZip.loadAsync` unpacks the OOXML package. The file type is detected from the parts present (`word/document.xml` or `ppt/presentation.xml`), not from the extension.
2. **Parse.** The relevant XML parts are parsed with `DOMParser`; namespaces (`w:`, `a:`, `p:`) are handled with the `*NS` DOM methods.
3. **Audit = dry run.** Every rule runs on a throw-away DOM and *counts what it changes*. Because the audit and the repair share the same code, the audit numbers always match what repair does.
4. **Repair.** The selected rules run on a fresh DOM. Elements are inserted in schema order (for example `w:tblW` inside `w:tblPr`), so Word and PowerPoint open the result without a repair prompt.
5. **Package.** `XMLSerializer` writes the XML back, JSZip re-zips the package (media, styles, themes and every other part are copied as they are), and a `Blob` is offered for download.
6. **Verify.** The output is re-opened and re-audited in the same session.

No network request is made with document data. The only external requests are the CDN scripts and fonts.

## Supported rules

### Word (`.docx`, `word/document.xml`)

| Rule (toggle) | What it detects | What it does |
|---|---|---|
| **Fix Tables** | Tables whose width or grid exceeds the page text width (computed from `pgSz`/`pgMar`); `noWrap` cells; rows that may split across pages; rows with `hRule="exact"` | Sets `tblW` to 100% (`pct`/5000), scales `gridCol` and `tcW` proportionally, drops positive table indent, switches fixed layout to autofit, removes `noWrap`, adds `cantSplit`, changes `exact` row height to `atLeast` |
| **Re-sequence Lists** | Typed numbers `1.` `1)` `1、` that are out of order, matched by `^\d+[.)]`; decimals like `3.5` are ignored | Renumbers the run as continuous ascending numbers. The first number is kept as the start, `1` starts a new list, and a gap of more than two non-list paragraphs ends a list. Numbers split across several runs are handled. |
| **Strip Empty Spacing** | Consecutive empty paragraphs; trailing spaces; repeated inner spaces | Collapses blank paragraphs to one (paragraphs with page breaks, fields, drawings, bookmarks, section breaks or auto-numbering are never treated as blank), trims trailing spaces, collapses repeated spaces |
| **Normalize Typography** | Line spacing outside 200–480 (auto); `exact` line spacing shorter than the font; before/after spacing above 36 pt; font sizes within ±1 pt of the dominant body size | Resets outliers to the document's dominant line spacing, relaxes `exact` to `atLeast`, caps oversized spacing at 12 pt, snaps near-miss sizes to the body size (headings are skipped) |

### PowerPoint (`.pptx`, `ppt/slides/slide*.xml`)

| Rule (toggle) | What it detects | What it does |
|---|---|---|
| **Text Box Auto-fit** | Text frames with no auto-fit or `noAutofit`; text estimated to overflow its box (needs a known font size and box size) | Sets `normAutofit` and pre-computes `fontScale` / `lnSpcReduction` for overflowing text, or, in "grow the box" mode, `spAutoFit` and a taller shape (limited to the slide bottom). Fixes `wrap="none"` text wider than its box. |
| **Clean Line Breaks** | Duplicate `<a:br/>` (even with empty runs between), trailing breaks, consecutive or trailing empty paragraphs, trailing spaces | Removes them, always keeping at least one paragraph |
| **Center Titles & Align Boxes** | Title placeholders not centered; title/body boxes slightly off the position used by most slides | Sets `algn="ctr"` on titles; snaps `x`, `y`, `cx` to the deck's most common value when within 4% of the slide size |

## Limitations

- Only the main body is processed: Word headers, footers, footnotes and text boxes in separate parts, and PowerPoint masters, layouts and notes are not. Legacy `.doc`/`.ppt` and password-protected files are rejected with a clear message.
- Typed-list detection is heuristic. Review the result if your document uses numbers in running text.
- PowerPoint overflow is an *estimate* (average glyph width, no font metrics). It only runs when font sizes and box sizes are explicit in the slide; text inheriting its size from a layout just gets auto-fit switched on, and PowerPoint recalculates the scale when the text is edited.
- Always keep the original. DocuTidy never overwrites it, but formatting repair is automated.

## Deployment

**GitHub Pages (this repository).** The page is a single static `index.html` that uses relative paths only.
The existing workflow in `.github/workflows/deploy.yml` publishes everything under `homework/`, so pushing to `main` is enough.
The folder name contains spaces and `&`, so links must be URL-encoded:
`/homework/07/Document%20Layout%20Cleaner%20%26%20Formatter/`.

**Standalone.** Copy `index.html` into any folder of a Pages site (for example `homework/08/`). No build step is needed.

**Local development.**

```bash
cd "homework/07/Document Layout Cleaner & Formatter"
python3 -m http.server 8000        # then open http://localhost:8000
```

Opening the file directly with `file://` also works. An internet connection is needed to load Tailwind (CDN), JSZip (cdnjs) and the web fonts.

## Testing

During development the engine was exercised in headless Chromium against the in-app sample files and against files generated with `python-docx` / `python-pptx`. Each repaired file was re-scanned (0 issues remaining), opened with the same libraries, and rendered with LibreOffice to compare before and after.

## Files

| File | Purpose |
|---|---|
| `index.html` | Whole app: UI, Tailwind styling, cleaner engine, sample-file generators |
| `README.md` | This document |

## Credits

- Designed and Architected with assistance from Claude (Anthropic).
- [JSZip](https://stuk.github.io/jszip/), [Tailwind CSS](https://tailwindcss.com/), Fraunces and Instrument Sans fonts.
