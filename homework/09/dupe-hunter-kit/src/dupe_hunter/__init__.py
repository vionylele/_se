"""dupe-hunter-kit: fast, zero-dependency duplicate file finder and storage analyzer."""

from .core import (
    STRATEGIES,
    clean_duplicates,
    compute_file_hash,
    find_duplicates,
    get_storage_report,
    human_readable_size,
)
from .exceptions import (
    DirectoryNotFoundError,
    DupeHunterError,
    InvalidAlgorithmError,
    InvalidStrategyError,
)

__version__ = "0.1.0"

__all__ = [
    "STRATEGIES",
    "DirectoryNotFoundError",
    "DupeHunterError",
    "InvalidAlgorithmError",
    "InvalidStrategyError",
    "__version__",
    "clean_duplicates",
    "compute_file_hash",
    "find_duplicates",
    "get_storage_report",
    "human_readable_size",
]
