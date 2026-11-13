"""Test suite for dupe-hunter-kit (pytest)."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

import dupe_hunter
from dupe_hunter import (
    DirectoryNotFoundError,
    DupeHunterError,
    InvalidAlgorithmError,
    InvalidStrategyError,
    clean_duplicates,
    compute_file_hash,
    find_duplicates,
    get_storage_report,
    human_readable_size,
)
from dupe_hunter import core
from dupe_hunter.cli import main

HELLO = b"hello world"       # 11 bytes
SAME_SIZE = b"hello_world"   # 11 bytes, different content
BLOCK = b"x" * 2048


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    """Nested folders with duplicates, unique files, a same-size decoy and empty files."""
    root = tmp_path / "data"
    (root / "sub" / "deep").mkdir(parents=True)
    (root / "a.txt").write_bytes(HELLO)
    (root / "sub" / "a_copy.txt").write_bytes(HELLO)
    (root / "sub" / "deep" / "a_copy2.txt").write_bytes(HELLO)
    (root / "b.bin").write_bytes(BLOCK)
    (root / "sub" / "b_copy.bin").write_bytes(BLOCK)
    (root / "unique.txt").write_bytes(b"i am unique!!")  # 13 bytes, no size match
    (root / "same_size_diff.txt").write_bytes(SAME_SIZE)
    (root / "empty1.txt").write_bytes(b"")
    (root / "sub" / "empty2.txt").write_bytes(b"")
    return root


def _all_paths(duplicates):
    return sorted(p for files in duplicates.values() for p in files)


# --------------------------------------------------------------------------- #
# compute_file_hash
# --------------------------------------------------------------------------- #
class TestComputeFileHash:
    def test_matches_hashlib(self, tmp_path):
        f = tmp_path / "f.bin"
        f.write_bytes(HELLO)
        assert compute_file_hash(f) == hashlib.sha256(HELLO).hexdigest()

    def test_accepts_str_path(self, tmp_path):
        f = tmp_path / "f.bin"
        f.write_bytes(HELLO)
        assert compute_file_hash(str(f)) == hashlib.sha256(HELLO).hexdigest()

    def test_small_chunk_size_gives_same_result(self, tmp_path):
        f = tmp_path / "f.bin"
        f.write_bytes(BLOCK)
        assert compute_file_hash(f, chunk_size=3) == compute_file_hash(f)

    def test_other_algorithm(self, tmp_path):
        f = tmp_path / "f.bin"
        f.write_bytes(HELLO)
        assert compute_file_hash(f, algorithm="md5") == hashlib.md5(HELLO).hexdigest()

    def test_empty_file(self, tmp_path):
        f = tmp_path / "empty"
        f.write_bytes(b"")
        assert compute_file_hash(f) == hashlib.sha256(b"").hexdigest()

    def test_invalid_algorithm(self, tmp_path):
        f = tmp_path / "f"
        f.write_bytes(b"x")
        with pytest.raises(InvalidAlgorithmError):
            compute_file_hash(f, algorithm="not-a-hash")
        with pytest.raises(DupeHunterError):
            compute_file_hash(f, algorithm="shake_128")

    def test_invalid_chunk_size(self, tmp_path):
        f = tmp_path / "f"
        f.write_bytes(b"x")
        with pytest.raises(ValueError):
            compute_file_hash(f, chunk_size=0)

    def test_missing_file(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            compute_file_hash(tmp_path / "nope")


# --------------------------------------------------------------------------- #
# find_duplicates
# --------------------------------------------------------------------------- #
class TestFindDuplicates:
    def test_finds_expected_groups(self, tree):
        result = find_duplicates(tree)
        assert len(result) == 2
        groups = sorted(sorted(Path(p).name for p in files) for files in result.values())
        assert groups == [["a.txt", "a_copy.txt", "a_copy2.txt"], ["b.bin", "b_copy.bin"]]

    def test_keys_are_sha256(self, tree):
        assert hashlib.sha256(HELLO).hexdigest() in find_duplicates(tree)

    def test_unique_and_same_size_decoy_excluded(self, tree):
        names = {Path(p).name for p in _all_paths(find_duplicates(tree))}
        assert "unique.txt" not in names
        assert "same_size_diff.txt" not in names

    def test_empty_files_skipped_by_default(self, tree):
        names = {Path(p).name for p in _all_paths(find_duplicates(tree))}
        assert not any(n.startswith("empty") for n in names)

    def test_min_size_zero_includes_empty_files(self, tree):
        result = find_duplicates(tree, min_size=0)
        assert hashlib.sha256(b"").hexdigest() in result
        assert len(result[hashlib.sha256(b"").hexdigest()]) == 2

    def test_min_size_filters_small_files(self, tree):
        result = find_duplicates(tree, min_size=100)
        assert [Path(p).name for p in _all_paths(result)] == ["b.bin", "b_copy.bin"]

    @pytest.mark.parametrize("ext", [[".bin"], ["bin"], [".BIN"]])
    def test_extension_filter(self, tree, ext):
        result = find_duplicates(tree, extensions=ext)
        assert len(result) == 1
        assert {Path(p).name for p in _all_paths(result)} == {"b.bin", "b_copy.bin"}

    def test_non_recursive(self, tree):
        assert find_duplicates(tree, recursive=False) == {}

    def test_ignore_dirs(self, tree):
        result = find_duplicates(tree, ignore_dirs=["deep"])
        names = {Path(p).name for p in _all_paths(result)}
        assert "a_copy2.txt" not in names
        assert {"a.txt", "a_copy.txt"} <= names

    def test_ignore_dirs_prunes_whole_subtree(self, tree):
        result = find_duplicates(tree, ignore_dirs=["sub"])
        assert result == {}

    def test_largest_waste_first(self, tree):
        sizes = [Path(files[0]).stat().st_size * (len(files) - 1)
                 for files in find_duplicates(tree).values()]
        assert sizes == sorted(sizes, reverse=True)

    def test_empty_directory(self, tmp_path):
        assert find_duplicates(tmp_path) == {}

    def test_accepts_str_directory(self, tree):
        assert len(find_duplicates(str(tree))) == 2

    def test_missing_directory(self, tmp_path):
        with pytest.raises(DirectoryNotFoundError):
            find_duplicates(tmp_path / "missing")

    def test_file_instead_of_directory(self, tree):
        with pytest.raises(DirectoryNotFoundError):
            find_duplicates(tree / "a.txt")

    def test_symlinks_are_ignored(self, tree):
        link = tree / "link_to_a.txt"
        try:
            os.symlink(tree / "a.txt", link)
        except (OSError, NotImplementedError):
            pytest.skip("symlinks not supported here")
        names = {Path(p).name for p in _all_paths(find_duplicates(tree))}
        assert "link_to_a.txt" not in names

    def test_two_pass_only_hashes_same_size_files(self, tree, monkeypatch):
        calls = []
        original = core.compute_file_hash

        def spy(path, *args, **kwargs):
            calls.append(Path(path).name)
            return original(path, *args, **kwargs)

        monkeypatch.setattr(core, "compute_file_hash", spy)
        find_duplicates(tree)
        assert "unique.txt" not in calls            # unique size: never opened
        assert not any(c.startswith("empty") for c in calls)
        assert sorted(calls) == sorted(
            ["a.txt", "a_copy.txt", "a_copy2.txt", "same_size_diff.txt",
             "b.bin", "b_copy.bin"]
        )


# --------------------------------------------------------------------------- #
# get_storage_report
# --------------------------------------------------------------------------- #
class TestStorageReport:
    def test_report_numbers(self, tree):
        report = get_storage_report(tree)
        assert report["total_files_scanned"] == 7
        assert report["duplicate_groups"] == 2
        assert report["redundant_files"] == 3
        assert report["wasted_bytes"] == len(HELLO) * 2 + len(BLOCK)
        assert report["wasted_human"] == "2.02 KB"
        assert len(report["groups"]) == 2

    def test_report_is_json_serialisable(self, tree):
        json.dumps(get_storage_report(tree))

    def test_kwargs_forwarded(self, tree):
        report = get_storage_report(tree, extensions=[".bin"])
        assert report["total_files_scanned"] == 2
        assert report["redundant_files"] == 1
        assert report["wasted_bytes"] == len(BLOCK)

    def test_report_without_duplicates(self, tmp_path):
        (tmp_path / "one.txt").write_bytes(b"1")
        (tmp_path / "two.txt").write_bytes(b"22")
        report = get_storage_report(tmp_path)
        assert report["duplicate_groups"] == 0
        assert report["wasted_bytes"] == 0
        assert report["wasted_human"] == "0 B"

    def test_missing_directory(self, tmp_path):
        with pytest.raises(DirectoryNotFoundError):
            get_storage_report(tmp_path / "missing")

    @pytest.mark.parametrize(
        "value,expected",
        [(0, "0 B"), (1023, "1023 B"), (1024, "1.00 KB"), (1536, "1.50 KB"),
         (1024 ** 2, "1.00 MB"), (5 * 1024 ** 3, "5.00 GB")],
    )
    def test_human_readable_size(self, value, expected):
        assert human_readable_size(value) == expected


# --------------------------------------------------------------------------- #
# clean_duplicates
# --------------------------------------------------------------------------- #
@pytest.fixture
def aged(tree):
    """a.txt oldest-but-one, a_copy2 oldest overall; a_copy newest."""
    os.utime(tree / "a.txt", (2_000_000, 2_000_000))
    os.utime(tree / "sub" / "a_copy.txt", (3_000_000, 3_000_000))
    os.utime(tree / "sub" / "deep" / "a_copy2.txt", (1_000_000, 1_000_000))
    return tree


class TestCleanDuplicates:
    def test_dry_run_is_default_and_touches_nothing(self, aged):
        dupes = find_duplicates(aged)
        before = sorted(p.name for p in aged.rglob("*") if p.is_file())
        removed = clean_duplicates(dupes)
        after = sorted(p.name for p in aged.rglob("*") if p.is_file())
        assert before == after
        assert len(removed) == 3  # 2 from the "a" group, 1 from the "b" group

    def test_keep_oldest(self, aged):
        removed = clean_duplicates(find_duplicates(aged), "keep_oldest", dry_run=False)
        assert len(removed) == 3
        assert (aged / "sub" / "deep" / "a_copy2.txt").exists()
        assert not (aged / "a.txt").exists()
        assert not (aged / "sub" / "a_copy.txt").exists()

    def test_keep_newest(self, aged):
        clean_duplicates(find_duplicates(aged), "keep_newest", dry_run=False)
        assert (aged / "sub" / "a_copy.txt").exists()
        assert not (aged / "a.txt").exists()
        assert not (aged / "sub" / "deep" / "a_copy2.txt").exists()

    def test_keep_shortest_path(self, aged):
        clean_duplicates(find_duplicates(aged), "keep_shortest_path", dry_run=False)
        assert (aged / "a.txt").exists()
        assert (aged / "b.bin").exists()
        assert not (aged / "sub" / "a_copy.txt").exists()
        assert not (aged / "sub" / "b_copy.bin").exists()

    def test_always_leaves_exactly_one_per_group(self, tree):
        dupes = find_duplicates(tree)
        clean_duplicates(dupes, dry_run=False)
        for files in dupes.values():
            assert sum(os.path.exists(f) for f in files) == 1
        assert find_duplicates(tree) == {}

    def test_unique_files_untouched(self, tree):
        clean_duplicates(find_duplicates(tree), dry_run=False)
        assert (tree / "unique.txt").exists()
        assert (tree / "same_size_diff.txt").exists()

    def test_invalid_strategy(self, tree):
        with pytest.raises(InvalidStrategyError):
            clean_duplicates(find_duplicates(tree), strategy="keep_random")

    def test_invalid_strategy_is_value_error(self, tree):
        with pytest.raises(ValueError):
            clean_duplicates({}, strategy="nope")

    def test_move_to_quarantine(self, aged, tmp_path):
        quarantine = tmp_path / "quarantine"
        moved = clean_duplicates(
            find_duplicates(aged), "keep_oldest", dry_run=False, move_to=quarantine
        )
        assert len(moved) == 3
        assert sorted(p.name for p in quarantine.iterdir()) == sorted(Path(m).name for m in moved)
        assert all(not os.path.exists(m) for m in moved)

    def test_move_to_dry_run_creates_nothing(self, aged, tmp_path):
        quarantine = tmp_path / "quarantine"
        clean_duplicates(find_duplicates(aged), dry_run=True, move_to=quarantine)
        assert not quarantine.exists()

    def test_move_to_handles_name_collisions(self, tmp_path):
        root = tmp_path / "r"
        for d in ("one", "two", "three"):
            (root / d).mkdir(parents=True)
            (root / d / "same.txt").write_bytes(b"payload")
        os.utime(root / "one" / "same.txt", (1_000, 1_000))
        quarantine = tmp_path / "q"
        moved = clean_duplicates(find_duplicates(root), dry_run=False, move_to=quarantine)
        assert len(moved) == 2
        assert sorted(p.name for p in quarantine.iterdir()) == ["same.txt", "same_1.txt"]
        assert (root / "one" / "same.txt").exists()

    def test_missing_files_are_skipped_safely(self, tmp_path):
        real = tmp_path / "real.txt"
        real.write_bytes(b"data")
        dupes = {"h": [str(real), str(tmp_path / "ghost.txt")]}
        assert clean_duplicates(dupes, dry_run=False) == []
        assert real.exists()  # sole survivor is never deleted

    def test_same_file_listed_twice_is_not_deleted(self, tmp_path):
        real = tmp_path / "real.txt"
        real.write_bytes(b"data")
        dupes = {"h": [str(real), str(real)]}
        assert clean_duplicates(dupes, dry_run=False) == []
        assert real.exists()

    def test_empty_input(self):
        assert clean_duplicates({}) == []


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
class TestCLI:
    def test_scan_prints_table_and_summary(self, tree, capsys):
        assert main(["scan", str(tree)]) == 0
        out = capsys.readouterr().out
        assert "Duplicate groups  : 2" in out
        assert "Redundant files   : 3" in out
        assert "2.02 KB" in out
        assert "| Group | Copies |" in out
        assert "a_copy2.txt" in out

    def test_scan_no_duplicates(self, tmp_path, capsys):
        (tmp_path / "x.txt").write_bytes(b"x")
        assert main(["scan", str(tmp_path)]) == 0
        assert "No duplicate files found." in capsys.readouterr().out

    def test_json_output(self, tree, capsys):
        assert main(["scan", str(tree), "--json"]) == 0
        data = json.loads(capsys.readouterr().out)
        assert data["duplicate_groups"] == 2
        assert data["wasted_bytes"] == 2070
        assert "action" not in data

    def test_min_size(self, tree, capsys):
        main(["scan", str(tree), "--min-size", "100", "--json"])
        data = json.loads(capsys.readouterr().out)
        assert data["duplicate_groups"] == 1
        assert data["total_files_scanned"] == 2

    def test_min_size_zero_includes_empty(self, tree, capsys):
        main(["scan", str(tree), "--min-size", "0", "--json"])
        assert json.loads(capsys.readouterr().out)["duplicate_groups"] == 3

    def test_ext_filter(self, tree, capsys):
        main(["scan", str(tree), "--ext", ".bin,.pdf", "--json"])
        data = json.loads(capsys.readouterr().out)
        assert data["duplicate_groups"] == 1
        assert data["groups"][0]["copies"] == 2

    def test_no_recursive_and_ignore_dir(self, tree, capsys):
        main(["scan", str(tree), "--no-recursive", "--json"])
        assert json.loads(capsys.readouterr().out)["duplicate_groups"] == 0
        main(["scan", str(tree), "--ignore-dir", "deep", "--json"])
        assert json.loads(capsys.readouterr().out)["redundant_files"] == 2

    def test_delete_without_yes_is_dry_run(self, tree, capsys):
        before = sorted(p for p in tree.rglob("*") if p.is_file())
        assert main(["scan", str(tree), "--delete"]) == 0
        out = capsys.readouterr().out
        assert "[DRY RUN] Would delete 3 file(s)" in out
        assert "Re-run with --yes" in out
        assert before == sorted(p for p in tree.rglob("*") if p.is_file())

    def test_delete_yes_removes_redundant_copies(self, tree, capsys):
        assert main(["scan", str(tree), "--delete", "--yes"]) == 0
        assert "Deleted 3 file(s)" in capsys.readouterr().out
        assert find_duplicates(tree) == {}
        assert (tree / "unique.txt").exists()

    def test_delete_yes_json_reports_action(self, tree, capsys):
        main(["scan", str(tree), "--delete", "--yes", "--json",
              "--strategy", "keep_shortest_path"])
        data = json.loads(capsys.readouterr().out)
        assert data["action"]["dry_run"] is False
        assert data["action"]["type"] == "delete"
        assert len(data["action"]["files"]) == 3
        assert data["action"]["reclaimed_bytes"] == 2070
        assert (tree / "a.txt").exists()

    def test_move_to_dry_run(self, tree, tmp_path, capsys):
        q = tmp_path / "quarantine"
        assert main(["scan", str(tree), "--move-to", str(q)]) == 0
        assert "[DRY RUN]" in capsys.readouterr().out
        assert not q.exists()

    def test_move_to_yes(self, tree, tmp_path, capsys):
        q = tmp_path / "quarantine"
        assert main(["scan", str(tree), "--move-to", str(q), "--yes"]) == 0
        assert "Moved to" in capsys.readouterr().out
        assert len(list(q.iterdir())) == 3
        assert find_duplicates(tree) == {}

    def test_missing_directory_returns_error_code(self, tmp_path, capsys):
        assert main(["scan", str(tmp_path / "missing")]) == 2
        assert "error:" in capsys.readouterr().err

    def test_yes_alone_is_rejected(self, tree):
        with pytest.raises(SystemExit) as exc:
            main(["scan", str(tree), "--yes"])
        assert exc.value.code == 2

    def test_delete_and_move_to_are_mutually_exclusive(self, tree, tmp_path):
        with pytest.raises(SystemExit):
            main(["scan", str(tree), "--delete", "--move-to", str(tmp_path / "q")])

    def test_command_required(self):
        with pytest.raises(SystemExit):
            main([])

    def test_version(self, capsys):
        with pytest.raises(SystemExit) as exc:
            main(["--version"])
        assert exc.value.code == 0
        assert dupe_hunter.__version__ in capsys.readouterr().out

    def test_python_dash_m_entry_point(self, tree):
        src = Path(__file__).resolve().parents[1] / "src"
        env = dict(os.environ, PYTHONPATH=str(src))
        proc = subprocess.run(
            [sys.executable, "-m", "dupe_hunter", "scan", str(tree), "--json"],
            capture_output=True, text=True, env=env,
        )
        assert proc.returncode == 0, proc.stderr
        assert json.loads(proc.stdout)["duplicate_groups"] == 2
