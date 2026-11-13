"""Command-line interface: ``dupe-hunter scan <path>``."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Dict, List, Optional, Sequence

from . import __version__
from .core import STRATEGIES, clean_duplicates, get_storage_report, human_readable_size
from .exceptions import DupeHunterError


def _render_table(headers: Sequence[str], rows: Sequence[Sequence[Any]]) -> str:
    """Render a simple ASCII table."""
    widths = [max(len(str(cell)) for cell in column) for column in zip(headers, *rows)]
    separator = "+" + "+".join("-" * (w + 2) for w in widths) + "+"

    def line(cells: Sequence[Any]) -> str:
        return "| " + " | ".join(str(c).ljust(w) for c, w in zip(cells, widths)) + " |"

    return "\n".join([separator, line(headers), separator, *map(line, rows), separator])


def _parse_extensions(value: Optional[str]) -> Optional[List[str]]:
    if not value:
        return None
    parts = [p.strip() for p in value.split(",") if p.strip()]
    return parts or None


def build_parser() -> argparse.ArgumentParser:
    """Create the argument parser."""
    parser = argparse.ArgumentParser(
        prog="dupe-hunter",
        description="Find duplicate files fast: file-size pre-filter + SHA-256 hashing.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    sub = parser.add_subparsers(dest="command", metavar="<command>", required=True)

    scan = sub.add_parser("scan", help="scan a folder for duplicate files")
    scan.add_argument("path", help="directory to scan")
    scan.add_argument("--min-size", type=int, default=1, metavar="BYTES",
                      help="ignore files smaller than BYTES (default: 1, skips empty files)")
    scan.add_argument("--ext", metavar=".pdf,.jpg",
                      help="comma-separated list of extensions to include")
    scan.add_argument("--ignore-dir", action="append", metavar="NAME",
                      help="directory name to skip (repeatable), e.g. --ignore-dir .git")
    scan.add_argument("--no-recursive", action="store_true",
                      help="do not descend into sub-directories")
    scan.add_argument("--json", action="store_true", help="print a machine-readable JSON report")
    scan.add_argument("--strategy", choices=STRATEGIES, default="keep_oldest",
                      help="which copy to keep when cleaning (default: keep_oldest)")

    action = scan.add_mutually_exclusive_group()
    action.add_argument("--delete", action="store_true",
                        help="delete redundant copies (preview only unless --yes is given)")
    action.add_argument("--move-to", metavar="DIR",
                        help="move redundant copies into DIR (preview only unless --yes is given)")
    scan.add_argument("--yes", action="store_true",
                      help="actually perform --delete / --move-to (otherwise: dry-run preview)")
    return parser


def _print_report(report: Dict[str, Any]) -> None:
    print(f"Scanned directory : {report['directory']}")
    print(f"Files scanned     : {report['total_files_scanned']}")
    print(f"Duplicate groups  : {report['duplicate_groups']}")
    print(f"Redundant files   : {report['redundant_files']}")
    print(f"Reclaimable space : {report['wasted_human']} ({report['wasted_bytes']} bytes)")
    if not report["groups"]:
        print("\nNo duplicate files found.")
        return
    rows = [
        [i, g["copies"], g["size_human"], human_readable_size(g["wasted_bytes"]), g["hash"][:12]]
        for i, g in enumerate(report["groups"], start=1)
    ]
    print()
    print(_render_table(["Group", "Copies", "File size", "Reclaimable", "SHA-256"], rows))
    for i, group in enumerate(report["groups"], start=1):
        print(f"\nGroup {i}:")
        for path in group["files"]:
            print(f"  {path}")


def _cmd_scan(args: argparse.Namespace, parser: argparse.ArgumentParser) -> int:
    if args.yes and not (args.delete or args.move_to):
        parser.error("--yes requires --delete or --move-to")

    report = get_storage_report(
        args.path,
        recursive=not args.no_recursive,
        min_size=args.min_size,
        extensions=_parse_extensions(args.ext),
        ignore_dirs=args.ignore_dir,
    )

    action: Optional[Dict[str, Any]] = None
    reclaimed = 0
    if args.delete or args.move_to:
        duplicates = {g["hash"]: g["files"] for g in report["groups"]}
        size_by_path = {p: g["size"] for g in report["groups"] for p in g["files"]}
        affected = clean_duplicates(
            duplicates,
            strategy=args.strategy,
            dry_run=not args.yes,
            move_to=args.move_to,
        )
        reclaimed = sum(size_by_path.get(p, 0) for p in affected)
        action = {
            "type": "delete" if args.delete else "move",
            "destination": args.move_to,
            "strategy": args.strategy,
            "dry_run": not args.yes,
            "files": affected,
            "reclaimed_bytes": reclaimed,
        }

    if args.json:
        output = dict(report)
        if action is not None:
            output["action"] = action
        print(json.dumps(output, indent=2))
        return 0

    _print_report(report)
    if action is not None:
        verb = "delete" if args.delete else f"move to {args.move_to}"
        print()
        if action["dry_run"]:
            print(f"[DRY RUN] Would {verb} {len(action['files'])} file(s), "
                  f"freeing {human_readable_size(reclaimed)} (strategy: {args.strategy}).")
            for path in action["files"]:
                print(f"  - {path}")
            print("Re-run with --yes to apply.")
        else:
            done = "Deleted" if args.delete else f"Moved to {args.move_to}:"
            print(f"{done} {len(action['files'])} file(s), "
                  f"freed {human_readable_size(reclaimed)} (strategy: {args.strategy}).")
    return 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    """CLI entry point. Returns a process exit code."""
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return _cmd_scan(args, parser)
    except DupeHunterError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
