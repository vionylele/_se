"""Custom exception hierarchy for dupe-hunter."""

from __future__ import annotations


class DupeHunterError(Exception):
    """Base class for every error raised intentionally by dupe-hunter."""


class DirectoryNotFoundError(DupeHunterError):
    """Raised when the directory to scan does not exist or is not a directory."""


class InvalidStrategyError(DupeHunterError, ValueError):
    """Raised when an unknown ``clean_duplicates`` strategy is requested."""


class InvalidAlgorithmError(DupeHunterError, ValueError):
    """Raised when an unsupported hash algorithm name is requested."""
