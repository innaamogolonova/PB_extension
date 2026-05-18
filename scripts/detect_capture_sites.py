#!/usr/bin/env python3
"""AST capture-site detector for PB Extension (Phase 3.5).

Reads a Python file path and prints JSON: [{"line": int, "kind": str}, ...]
Kinds: return, assign, if, elif, raise, loop
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from typing import Any

SITE_KINDS = frozenset({"return", "assign", "if", "elif", "raise", "loop"})


def _is_discard_target(node: ast.AST) -> bool:
    if isinstance(node, ast.Name) and node.id == "_":
        return True
    if isinstance(node, (ast.Tuple, ast.List)):
        return all(_is_discard_target(elt) for elt in node.elts)
    return False


def _assign_targets_discard_only(targets: list[ast.expr]) -> bool:
    if not targets:
        return True
    return all(_is_discard_target(t) for t in targets)


class CaptureSiteVisitor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.sites: list[dict[str, Any]] = []

    def _add(self, node: ast.AST, kind: str) -> None:
        line = getattr(node, "lineno", None)
        if line is None:
            return
        self.sites.append({"line": line, "kind": kind})

    def visit_Return(self, node: ast.Return) -> None:
        self._add(node, "return")
        self.generic_visit(node)

    def visit_Raise(self, node: ast.Raise) -> None:
        self._add(node, "raise")
        self.generic_visit(node)

    def visit_Assign(self, node: ast.Assign) -> None:
        if not _assign_targets_discard_only(node.targets):
            self._add(node, "assign")
        self.generic_visit(node)

    def visit_AnnAssign(self, node: ast.AnnAssign) -> None:
        if node.target is not None and not _is_discard_target(node.target):
            self._add(node, "assign")
        self.generic_visit(node)

    def visit_AugAssign(self, node: ast.AugAssign) -> None:
        if not _is_discard_target(node.target):
            self._add(node, "assign")
        self.generic_visit(node)

    def visit_For(self, node: ast.For) -> None:
        self._add(node, "loop")
        self.generic_visit(node)

    def visit_AsyncFor(self, node: ast.AsyncFor) -> None:
        self._add(node, "loop")
        self.generic_visit(node)

    def visit_While(self, node: ast.While) -> None:
        self._add(node, "loop")
        self.generic_visit(node)

    def visit_AsyncWhile(self, node: ast.AsyncWhile) -> None:
        self._add(node, "loop")
        self.generic_visit(node)

    def visit_If(self, node: ast.If) -> None:
        self._add(node, "if")
        for child in node.body:
            self.visit(child)
        self._visit_orelse(node.orelse)

    def _visit_orelse(self, orelse: list[ast.stmt]) -> None:
        if not orelse:
            return
        if len(orelse) == 1 and isinstance(orelse[0], ast.If):
            elif_node = orelse[0]
            self._add(elif_node, "elif")
            for child in elif_node.body:
                self.visit(child)
            self._visit_orelse(elif_node.orelse)
            return
        for child in orelse:
            self.visit(child)


def detect_sites(source: str) -> list[dict[str, Any]]:
    tree = ast.parse(source)
    visitor = CaptureSiteVisitor()
    visitor.visit(tree)
    return visitor.sites


def detect_sites_from_path(path: str) -> list[dict[str, Any]]:
    with open(path, encoding="utf-8") as f:
        return detect_sites(f.read())


def main() -> int:
    parser = argparse.ArgumentParser(description="Detect PB capture sites via AST")
    parser.add_argument("path", help="Path to a .py file")
    args = parser.parse_args()

    try:
        sites = detect_sites_from_path(args.path)
    except SyntaxError as e:
        payload = {"error": "syntax", "message": str(e), "sites": []}
        print(json.dumps(payload))
        return 2
    except OSError as e:
        payload = {"error": "io", "message": str(e), "sites": []}
        print(json.dumps(payload))
        return 1

    print(json.dumps({"sites": sites}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
