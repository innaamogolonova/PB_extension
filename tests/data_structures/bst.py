"""
bst.py

Binary search tree construction and manipulation in a single file.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator, List, Optional


@dataclass
class Node:
    key: int
    left: Optional[Node] = None
    right: Optional[Node] = None


class BST:
    def __init__(self, keys: Optional[List[int]] = None) -> None:
        self.root: Optional[Node] = None
        if keys:
            for key in keys:
                self.insert(key)

    def insert(self, key: int) -> None:
        if self.root is None:
            self.root = Node(key)
            return

        current = self.root
        while True:
            if key < current.key:
                if current.left is None:
                    current.left = Node(key)
                    return
                current = current.left
            elif key > current.key:
                if current.right is None:
                    current.right = Node(key)
                    return
                current = current.right
            else:
                return

    def find(self, key: int) -> Optional[Node]:
        current = self.root
        while current is not None:
            if key == current.key:
                return current
            if key < current.key:
                current = current.left
            else:
                current = current.right
        return None

    def contains(self, key: int) -> bool:
        return self.find(key) is not None

    def delete(self, key: int) -> None:
        self.root = self._delete_node(self.root, key)

    def _delete_node(self, node: Optional[Node], key: int) -> Optional[Node]:
        if node is None:
            return None

        if key < node.key:
            node.left = self._delete_node(node.left, key)
        elif key > node.key:
            node.right = self._delete_node(node.right, key)
        else:
            if node.left is None:
                return node.right
            if node.right is None:
                return node.left

            successor = self._min_node(node.right)
            node.key = successor.key
            node.right = self._delete_node(node.right, successor.key)

        return node

    def _min_node(self, node: Node) -> Node:
        current = node
        while current.left is not None:
            current = current.left
        return current

    def min_key(self) -> Optional[int]:
        if self.root is None:
            return None
        return self._min_node(self.root).key

    def max_key(self) -> Optional[int]:
        if self.root is None:
            return None
        current = self.root
        while current.right is not None:
            current = current.right
        return current.key

    def size(self) -> int:
        return sum(1 for _ in self.inorder())

    def height(self) -> int:
        return self._height(self.root)

    def _height(self, node: Optional[Node]) -> int:
        if node is None:
            return 0
        return 1 + max(self._height(node.left), self._height(node.right))

    def inorder(self) -> Iterator[int]:
        yield from self._inorder(self.root)

    def _inorder(self, node: Optional[Node]) -> Iterator[int]:
        if node is None:
            return
        yield from self._inorder(node.left)
        yield node.key
        yield from self._inorder(node.right)

    def preorder(self) -> List[int]:
        result: List[int] = []
        self._preorder(self.root, result)
        return result

    def _preorder(self, node: Optional[Node], result: List[int]) -> None:
        if node is None:
            return
        result.append(node.key)
        self._preorder(node.left, result)
        self._preorder(node.right, result)

    def to_sorted_list(self) -> List[int]:
        return list(self.inorder())


def build_bst(keys: List[int]) -> BST:
    return BST(keys)


def main() -> None:
    keys = [50, 30, 70, 20, 40, 60, 80, 10, 35, 65]
    tree = build_bst(keys)

    print("Inserted keys:", keys)
    print("Inorder (sorted):", tree.to_sorted_list())
    print("Preorder:", tree.preorder())
    print("Size:", tree.size())
    print("Height:", tree.height())
    print("Min key:", tree.min_key())
    print("Max key:", tree.max_key())

    search_key = 40
    print(f"Find {search_key}:", tree.find(search_key).key if tree.contains(search_key) else None)
    print(f"Contains 99:", tree.contains(99))

    delete_key = 30
    print(f"\nDeleting {delete_key}...")
    tree.delete(delete_key)
    print("Inorder after delete:", tree.to_sorted_list())
    print("Preorder after delete:", tree.preorder())


if __name__ == "__main__":
    main()
