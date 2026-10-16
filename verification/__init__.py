"""Verification package for Seoul multimodal MVP value evaluation."""

from __future__ import annotations

from typing import Any

__all__ = ["evaluate_fixture_data", "load_and_verify_fixture"]


def __getattr__(name: str) -> Any:
    if name in __all__:
        from verification import mvp_value

        return getattr(mvp_value, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
