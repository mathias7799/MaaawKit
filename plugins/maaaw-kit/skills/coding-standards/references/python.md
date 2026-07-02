# Python Standards

Target Python 3.11+. Check first: `pyproject.toml`, lockfile (uv/poetry/pip-tools), existing tool config.

## Project & tooling
- `uv` for new projects (`uv init`, `uv add`, `uv run`); otherwise use whatever the repo uses.
- All config in `pyproject.toml` — no setup.py, no requirements.txt for new projects.
- Ruff for lint + format (replaces black/isort/flake8): `ruff check --fix . && ruff format .`
- Type-check with mypy (strict for new code) or pyright — repo's choice.

## Language
- Type hints on every public function signature. Modern syntax: `list[str]`, `str | None`, no `typing.List`/`Optional` in 3.11+ code.
- Dataclasses (`slots=True, frozen=True` when possible) or Pydantic v2 for data at I/O boundaries. Plain dicts don't cross function boundaries.
- `pathlib.Path` everywhere — no `os.path`, no string paths in signatures.
- f-strings for formatting; but lazy `%` style inside `logging` calls (`log.info("got %s", x)`).
- Specific exceptions: `except ValueError:`, never bare `except:`; `except Exception:` only at top-level entry points with logging. `raise ... from err` to preserve chains.
- Context managers for every resource (files, connections, locks). Write your own with `@contextmanager` when acquiring/releasing anything.
- Comprehensions until they exceed one condition + one transform — then a named loop or function.
- Module-level code does nothing but define things. Entry point behind `if __name__ == "__main__":` calling a `main()` function.
- Never mutate default args (`def f(x=[])` bug); default `None`, create inside.

## Async
- Only when genuinely I/O-bound with concurrency. `asyncio.TaskGroup` (3.11+) over `gather` for structured concurrency. Never call blocking I/O inside async without `asyncio.to_thread`.

## Testing (pytest)
- Plain `assert`, fixtures over setUp classes, `parametrize` for case tables.
- `tmp_path` fixture for files, `monkeypatch` for env/attrs, `capsys` for output.
- Test file mirrors module path: `src/pkg/mod.py` → `tests/pkg/test_mod.py`.
- Mock at the boundary you own (your client wrapper), not deep in third-party internals.

## Commands (run these, don't guess)
```bash
uv run ruff check . && uv run ruff format --check .
uv run mypy src/            # or pyright
uv run pytest -q
```
