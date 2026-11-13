# dupe-hunter-kit

[![PyPI version](https://img.shields.io/pypi/v/dupe-hunter-kit.svg)](https://pypi.org/project/dupe-hunter-kit/)
[![Python versions](https://img.shields.io/pypi/pyversions/dupe-hunter-kit.svg)](https://pypi.org/project/dupe-hunter-kit/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)](pyproject.toml)

**A fast, zero-dependency duplicate file finder and storage analyzer** for Python and the command line.

`dupe-hunter-kit` finds byte-for-byte identical files using a **two-stage algorithm** (file-size pre-filtering, then SHA-256 hashing), tells you how much disk space you can reclaim, and can safely delete or quarantine the redundant copies. It is written 100% in the Python standard library (`hashlib`, `pathlib`, `os`, `shutil`, `argparse`, `json`), so `pip install` works cleanly everywhere.

- Python API: `import dupe_hunter`
- CLI: `dupe-hunter scan <path>`
- Safe by default: cleanup is a **dry run** unless you explicitly opt in
- Always keeps **at least one original** per duplicate group
- Fully type-hinted (PEP 561 `py.typed`), Python 3.9+

> **Attribution:** this library and its documentation were architected and developed with assistance from **Claude (Anthropic)**. This project is made by Claude.

---

## How the Two-Pass Algorithm Works

Hashing is the expensive part of duplicate detection, because it requires reading every byte of a file from disk. But two files can only be identical if they have the **exact same size in bytes**, and a file's size comes from filesystem metadata that costs almost nothing to read.

1. **Pass 1 - group by size.** Every file is `stat()`-ed and bucketed by byte size. Any file whose size is unique cannot have a duplicate, so it is discarded **without its contents ever being read**.
2. **Pass 2 - hash only the candidates.** Only files that share a size with at least one other file are streamed through SHA-256 in memory-safe chunks (64 KiB by default).

In typical real-world folders most files have unique sizes, so pass 1 eliminates the vast majority of disk reads. Depending on your data this is often around an order of magnitude (about 10x) faster than hashing everything, and it can be much more on large trees with mostly distinct file sizes. The worst case, where every file has the same size, degrades gracefully to hashing everything, which is no slower than the naive approach. SHA-256 then guarantees that matching files are identical for all practical purposes.

---

## Installation

```bash
pip install dupe-hunter-kit
```

Local editable install for development:

```bash
git clone https://github.com/yourusername/dupe-hunter-kit.git
cd dupe-hunter-kit
pip install -e ".[dev]"      # or: pip install -e .
pytest
```

---

## Quickstart

### Python API

```python
from dupe_hunter import find_duplicates, get_storage_report, clean_duplicates

# 1. Find duplicates: {sha256: [paths...]}
dupes = find_duplicates("~/Downloads", min_size=1024, extensions=[".pdf", ".jpg"])
for digest, paths in dupes.items():
    print(digest[:12], paths)

# 2. How much space is wasted?
report = get_storage_report("~/Downloads", ignore_dirs=[".git", "node_modules"])
print(report["duplicate_groups"], "groups,", report["wasted_human"], "reclaimable")

# 3. Preview what would be removed (dry_run=True is the default)
would_remove = clean_duplicates(dupes, strategy="keep_oldest")
print(would_remove)

# 4. Actually clean up: move copies to a quarantine folder instead of deleting
clean_duplicates(dupes, strategy="keep_shortest_path",
                 dry_run=False, move_to="~/quarantine")
```

Hashing a single file:

```python
from dupe_hunter import compute_file_hash
compute_file_hash("photo.jpg")                      # sha256 hex digest
compute_file_hash("photo.jpg", algorithm="md5")     # any fixed-length hashlib algorithm
```

### Command line

```bash
dupe-hunter scan ~/demo --ext .pdf,.jpg,.docx
```

```text
Scanned directory : ~/demo
Files scanned     : 7
Duplicate groups  : 3
Redundant files   : 4
Reclaimable space : 7.87 MB (8252000 bytes)

+-------+--------+-----------+-------------+--------------+
| Group | Copies | File size | Reclaimable | SHA-256      |
+-------+--------+-----------+-------------+--------------+
| 1     | 3      | 3.34 MB   | 6.68 MB     | f24f103e13ec |
| 2     | 2      | 1.14 MB   | 1.14 MB     | 9b4a3ab03e1d |
| 3     | 2      | 50.78 KB  | 50.78 KB    | 6b0f197d4924 |
+-------+--------+-----------+-------------+--------------+

Group 1:
  ~/demo/Backup/vacation_copy.jpg
  ~/demo/Photos/2023/vacation.jpg
  ~/demo/Photos/vacation.jpg

Group 2:
  ~/demo/Backup/report_final.pdf
  ~/demo/Docs/report.pdf

Group 3:
  ~/demo/Backup/notes_old.docx
  ~/demo/Docs/notes.docx
```

Preview a cleanup (**dry run by default**; nothing is touched):

```bash
dupe-hunter scan ~/demo --delete --strategy keep_shortest_path
```

```text
[DRY RUN] Would delete 4 file(s), freeing 7.87 MB (strategy: keep_shortest_path).
  - ~/demo/Backup/vacation_copy.jpg
  - ~/demo/Photos/2023/vacation.jpg
  - ~/demo/Backup/report_final.pdf
  - ~/demo/Backup/notes_old.docx
Re-run with --yes to apply.
```

Apply it:

```bash
dupe-hunter scan ~/demo --delete --yes                    # permanently delete redundant copies
dupe-hunter scan ~/demo --move-to ~/quarantine --yes      # or quarantine them instead
dupe-hunter scan ~/demo --json > report.json              # machine-readable report
dupe-hunter scan ~/demo --min-size 1024 --ignore-dir .git # skip tiny files and .git folders
```

### CLI options

| Flag | Description |
|------|-------------|
| `--min-size BYTES` | Ignore files smaller than `BYTES` (default `1`, which skips empty files) |
| `--ext .pdf,.jpg,.docx` | Only include these extensions (case-insensitive, leading dot optional) |
| `--ignore-dir NAME` | Skip directories with this name (repeatable) |
| `--no-recursive` | Do not descend into sub-directories |
| `--json` | Print the report (and any action) as JSON |
| `--strategy` | `keep_oldest` (default), `keep_newest`, `keep_shortest_path` |
| `--delete` | Delete redundant copies. **Preview only** unless `--yes` is given |
| `--move-to DIR` | Move redundant copies into `DIR`. **Preview only** unless `--yes` is given |
| `--yes` | Actually perform `--delete` / `--move-to` |
| `--version` | Show the version |

`--delete` and `--move-to` are mutually exclusive. Exit codes: `0` success, `2` error (for example, directory not found).

---

## API Reference

| Function | Parameters | Returns |
|----------|-----------|---------|
| `compute_file_hash` | `file_path: str \| Path`, `algorithm: str = "sha256"`, `chunk_size: int = 65536` | `str` (hex digest) |
| `find_duplicates` | `directory: str \| Path`, `recursive: bool = True`, `min_size: int = 1`, `extensions: list[str] \| None = None`, `ignore_dirs: list[str] \| None = None` | `dict[str, list[str]]` (`sha256 -> [paths]`, groups of 2+ only, largest waste first) |
| `get_storage_report` | `directory: str \| Path`, `**kwargs` (same filters as `find_duplicates`) | `dict` with `directory`, `total_files_scanned`, `duplicate_groups`, `redundant_files`, `wasted_bytes`, `wasted_human`, `groups` |
| `clean_duplicates` | `duplicates: dict[str, list[str]]`, `strategy: str = "keep_oldest"`, `dry_run: bool = True`, `move_to: str \| Path \| None = None` | `list[str]` (paths removed or moved, or that would be in a dry run) |
| `human_readable_size` | `num_bytes: int` | `str` (`"1.50 KB"`, `"2.00 GB"`, ...) |

**Cleanup strategies:** `keep_oldest` / `keep_newest` (by modification time) and `keep_shortest_path`.

**Safety guarantees:** `dry_run=True` by default; exactly one file per group is always kept; missing files are skipped; a group with fewer than two surviving files is never touched; symlinks are never scanned or removed; `move_to` never overwrites (collisions become `name_1.ext`, `name_2.ext`, ...).

**Exceptions** (all derive from `DupeHunterError`):

| Exception | Raised when |
|-----------|-------------|
| `DirectoryNotFoundError` | The scan target does not exist or is not a directory |
| `InvalidStrategyError` | Unknown `strategy` (also a `ValueError`) |
| `InvalidAlgorithmError` | Unsupported hash algorithm (also a `ValueError`) |

---

## Project Directory Structure

```text
dupe-hunter-kit/
├── .gitignore
├── LICENSE
├── README.md
├── pyproject.toml
├── src/
│   └── dupe_hunter/
│       ├── __init__.py        # public API + __version__
│       ├── __main__.py        # python -m dupe_hunter
│       ├── cli.py             # argparse CLI (dupe-hunter scan ...)
│       ├── core.py            # hashing, scanning, reporting, cleanup
│       ├── exceptions.py      # DupeHunterError and subclasses
│       └── py.typed           # PEP 561 typing marker
└── tests/
    └── test_dupe_hunter.py    # pytest suite
```

---

## Step-by-Step PyPI Publishing Guide

1. **Check the name and edit metadata.** Confirm `dupe-hunter-kit` is free at <https://pypi.org/project/dupe-hunter-kit/>. Then update `authors` and the `[project.urls]` placeholders in `pyproject.toml`, and the copyright holder in `LICENSE`.

2. **Create accounts and API tokens** at <https://pypi.org> and <https://test.pypi.org>, with 2FA enabled. Create an API token for each (Account settings -> API tokens).

3. **Run the tests.**
   ```bash
   pip install -e ".[dev]"
   pytest
   ```

4. **Build the sdist and wheel.**
   ```bash
   python -m pip install --upgrade build twine
   python -m build
   ```
   This creates `dist/dupe_hunter_kit-0.1.0.tar.gz` and `dist/dupe_hunter_kit-0.1.0-py3-none-any.whl`.

5. **Validate the package metadata and README rendering.**
   ```bash
   twine check dist/*
   ```

6. **(Recommended) Dry-run on TestPyPI.**
   ```bash
   twine upload --repository testpypi dist/*
   python -m venv /tmp/t && /tmp/t/bin/pip install -i https://test.pypi.org/simple/ dupe-hunter-kit
   /tmp/t/bin/dupe-hunter --version
   ```

7. **Upload to PyPI.** Use username `__token__` and your API token (`pypi-...`) as the password.
   ```bash
   twine upload dist/*
   ```

8. **Verify.**
   ```bash
   pip install dupe-hunter-kit
   dupe-hunter --version
   ```

**Releasing a new version:** bump `__version__` in `src/dupe_hunter/__init__.py` (hatchling reads the version from there), delete the old `dist/` folder, then repeat steps 4, 5 and 7. PyPI never allows re-uploading the same version.

---

## License

[MIT](LICENSE). Built with assistance from Claude (Anthropic).
