"""Core engine: hashing, duplicate detection, reporting and cleanup.

Only the Python standard library is used.

Duplicate detection is a *two-pass* algorithm:

1. **Size pass** - every candidate file is ``stat()``-ed and grouped by exact
   byte size. Files whose size is unique cannot have a duplicate, so they are
   discarded without ever being opened.
2. **Hash pass** - only files that share a size with at least one other file
   are streamed through SHA-256 (in memory-safe chunks).
"""

from __future__ import annotations

import hashlib
import os
import shutil
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Set, Tuple, Union

from .exceptions import (
    DirectoryNotFoundError,
    InvalidAlgorithmError,
    InvalidStrategyError,
)

PathLike = Union[str, Path]

#: Strategies accepted by :func:`clean_duplicates`.
STRATEGIES: Tuple[str, ...] = ("keep_oldest", "keep_newest", "keep_shortest_path")

# hash -> (size in bytes, sorted list of paths)
_HashGroups = Dict[str, Tuple[int, List[str]]]


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def human_readable_size(num_bytes: int) -> str:
    """Format a byte count as ``B``, ``KB``, ``MB``, ``GB`` or ``TB`` (base 1024).

    >>> human_readable_size(0)
    '0 B'
    >>> human_readable_size(1536)
    '1.50 KB'
    """
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(num_bytes)
    index = 0
    while size >= 1024 and index < len(units) - 1:
        size /= 1024
        index += 1
    if index == 0:
        return f"{int(size)} B"
    return f"{size:.2f} {units[index]}"


def _resolve_directory(directory: PathLike) -> Path:
    path = Path(directory).expanduser()
    if not path.is_dir():
        raise DirectoryNotFoundError(f"Directory not found: {path}")
    return path


def _normalize_extensions(extensions: Optional[List[str]]) -> Optional[Set[str]]:
    """Lower-case extensions and guarantee a leading dot (``pdf`` -> ``.pdf``)."""
    if not extensions:
        return None
    normalized = set()
    for ext in extensions:
        ext = ext.strip().lower()
        if not ext:
            continue
        normalized.add(ext if ext.startswith(".") else "." + ext)
    return normalized or None


def _iter_files(
    root: Path, recursive: bool, ignore_dirs: Optional[List[str]]
) -> Iterator[Path]:
    """Yield files below ``root`` in a deterministic order (symlinked dirs are not followed)."""
    ignored = set(ignore_dirs or [])
    for current, dirnames, filenames in os.walk(root, followlinks=False):
        if recursive:
            dirnames[:] = sorted(d for d in dirnames if d not in ignored)
        else:
            dirnames[:] = []
        for name in sorted(filenames):
            yield Path(current) / name


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def compute_file_hash(
    file_path: PathLike, algorithm: str = "sha256", chunk_size: int = 65536
) -> str:
    """Return the hex digest of a file, streaming it in fixed-size chunks.

    Args:
        file_path: Path of the file to hash.
        algorithm: Any fixed-length algorithm in :data:`hashlib.algorithms_guaranteed`
            (default ``"sha256"``). Variable-length ``shake_*`` digests are rejected.
        chunk_size: Bytes read per iteration; keeps memory usage constant.

    Raises:
        InvalidAlgorithmError: Unsupported ``algorithm``.
        ValueError: ``chunk_size`` is not positive.
        OSError: The file cannot be opened/read (e.g. ``FileNotFoundError``).
    """
    name = algorithm.lower()
    if name not in hashlib.algorithms_guaranteed or name.startswith("shake"):
        raise InvalidAlgorithmError(f"Unsupported hash algorithm: {algorithm!r}")
    if chunk_size <= 0:
        raise ValueError("chunk_size must be a positive integer")

    digest = hashlib.new(name)
    with open(file_path, "rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _scan(
    directory: PathLike,
    recursive: bool = True,
    min_size: int = 1,
    extensions: Optional[List[str]] = None,
    ignore_dirs: Optional[List[str]] = None,
) -> Tuple[Path, int, _HashGroups]:
    """Run both passes. Returns ``(root, files_scanned, hash_groups)``."""
    root = _resolve_directory(directory)
    exts = _normalize_extensions(extensions)

    # Pass 1: group by exact byte size (metadata only, no file contents read).
    by_size: Dict[int, List[Path]] = defaultdict(list)
    scanned = 0
    for path in _iter_files(root, recursive, ignore_dirs):
        if path.is_symlink():
            continue
        if exts is not None and path.suffix.lower() not in exts:
            continue
        try:
            size = path.stat().st_size
        except OSError:
            continue
        if size < min_size:
            continue
        scanned += 1
        by_size[size].append(path)

    # Pass 2: hash only files that share a size with at least one other file.
    found: _HashGroups = {}
    for size, paths in by_size.items():
        if len(paths) < 2:
            continue
        by_hash: Dict[str, List[str]] = defaultdict(list)
        for path in paths:
            try:
                digest = compute_file_hash(path, "sha256")
            except OSError:
                continue  # unreadable file: skip rather than abort the scan
            by_hash[digest].append(str(path))
        for digest, files in by_hash.items():
            if len(files) > 1:
                found[digest] = (size, sorted(files))

    ordered = dict(
        sorted(found.items(), key=lambda kv: (-kv[1][0] * (len(kv[1][1]) - 1), kv[0]))
    )
    return root, scanned, ordered


def find_duplicates(
    directory: PathLike,
    recursive: bool = True,
    min_size: int = 1,
    extensions: Optional[List[str]] = None,
    ignore_dirs: Optional[List[str]] = None,
) -> Dict[str, List[str]]:
    """Find duplicate files using a two-pass (size, then SHA-256) algorithm.

    Args:
        directory: Folder to scan.
        recursive: Descend into sub-folders.
        min_size: Ignore files smaller than this many bytes (default 1 skips empty files).
        extensions: Only consider these extensions (``[".pdf", "jpg"]``; case-insensitive).
        ignore_dirs: Directory *names* to skip anywhere in the tree (e.g. ``[".git"]``).

    Returns:
        ``{sha256_hex: [path, path, ...]}`` containing only groups with 2+ files,
        ordered by wasted space (largest first).

    Raises:
        DirectoryNotFoundError: ``directory`` is not an existing directory.
    """
    _, _, groups = _scan(directory, recursive, min_size, extensions, ignore_dirs)
    return {digest: files for digest, (_, files) in groups.items()}


def get_storage_report(directory: PathLike, **kwargs: Any) -> Dict[str, Any]:
    """Scan ``directory`` and summarise duplicate usage.

    Accepts the same keyword arguments as :func:`find_duplicates`.

    Returns a dict with:
        ``directory``, ``total_files_scanned`` (files that passed the filters),
        ``duplicate_groups``, ``redundant_files`` (copies beyond one original per group),
        ``wasted_bytes``, ``wasted_human`` and ``groups`` (per-group details).
    """
    root, scanned, found = _scan(directory, **kwargs)
    groups: List[Dict[str, Any]] = []
    redundant = 0
    wasted = 0
    for digest, (size, files) in found.items():
        extra = len(files) - 1
        redundant += extra
        wasted += size * extra
        groups.append(
            {
                "hash": digest,
                "size": size,
                "size_human": human_readable_size(size),
                "copies": len(files),
                "wasted_bytes": size * extra,
                "files": list(files),
            }
        )
    return {
        "directory": str(root.resolve()),
        "total_files_scanned": scanned,
        "duplicate_groups": len(groups),
        "redundant_files": redundant,
        "wasted_bytes": wasted,
        "wasted_human": human_readable_size(wasted),
        "groups": groups,
    }


def _choose_keeper(paths: List[Path], strategy: str) -> Path:
    if strategy == "keep_oldest":
        return min(paths, key=lambda p: (p.stat().st_mtime, str(p)))
    if strategy == "keep_newest":
        return max(paths, key=lambda p: (p.stat().st_mtime, str(p)))
    return min(paths, key=lambda p: (len(str(p)), str(p)))  # keep_shortest_path


def _move_unique(source: Path, target_dir: Path) -> Path:
    """Move ``source`` into ``target_dir``, never overwriting an existing file."""
    target_dir.mkdir(parents=True, exist_ok=True)
    destination = target_dir / source.name
    counter = 1
    while destination.exists():
        destination = target_dir / f"{source.stem}_{counter}{source.suffix}"
        counter += 1
    shutil.move(str(source), str(destination))
    return destination


def clean_duplicates(
    duplicates: Dict[str, List[str]],
    strategy: str = "keep_oldest",
    dry_run: bool = True,
    move_to: Optional[PathLike] = None,
) -> List[str]:
    """Remove or quarantine redundant copies, always keeping one file per group.

    Args:
        duplicates: Output of :func:`find_duplicates`.
        strategy: ``"keep_oldest"`` / ``"keep_newest"`` (by mtime) or
            ``"keep_shortest_path"``.
        dry_run: When ``True`` (default) nothing is touched; the files that
            *would* be removed/moved are returned.
        move_to: Move redundant copies into this directory instead of deleting
            them (name collisions get a ``_1``, ``_2`` ... suffix).

    Returns:
        Original paths of the redundant files that were (or would be) removed/moved.

    Raises:
        InvalidStrategyError: Unknown ``strategy``.
    """
    if strategy not in STRATEGIES:
        raise InvalidStrategyError(
            f"Invalid strategy {strategy!r}. Choose one of: {', '.join(STRATEGIES)}"
        )
    target = Path(move_to).expanduser() if move_to is not None else None
    affected: List[str] = []

    for paths in duplicates.values():
        # Existing regular files only, de-duplicated by real location.
        unique: Dict[str, Path] = {}
        for raw in paths:
            if os.path.isfile(raw):
                unique.setdefault(os.path.realpath(raw), Path(raw))
        existing = list(unique.values())
        if len(existing) < 2:
            continue  # never touch a group that has no remaining redundancy

        keeper = _choose_keeper(existing, strategy)
        for victim in existing:
            if victim == keeper:
                continue
            if not dry_run:
                try:
                    if target is not None:
                        _move_unique(victim, target)
                    else:
                        victim.unlink()
                except OSError:
                    continue
            affected.append(str(victim))
    return affected
