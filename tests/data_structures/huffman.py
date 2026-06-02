"""
huffman.py

Huffman encoding and decoding in a single file.
"""

from __future__ import annotations

import heapq
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


@dataclass(order=True)
class HeapNode:
    frequency: int
    char: Optional[str] = field(compare=False, default=None)
    left: Optional[HeapNode] = field(compare=False, default=None, repr=False)
    right: Optional[HeapNode] = field(compare=False, default=None, repr=False)


@dataclass
class HuffmanTree:
    root: Optional[HeapNode]
    codes: Dict[str, str]

    def encode(self, text: str) -> str:
        if not text:
            return ""
        return "".join(self.codes[char] for char in text)

    def decode(self, bitstring: str) -> str:
        if not bitstring:
            return ""
        if self.root is None:
            return ""

        result: List[str] = []
        current = self.root

        for bit in bitstring:
            if bit == "0":
                current = current.left
            else:
                current = current.right

            if current.char is not None:
                result.append(current.char)
                current = self.root

        return "".join(result)


def count_frequencies(text: str) -> Dict[str, int]:
    frequencies: Dict[str, int] = {}
    for char in text:
        frequencies[char] = frequencies.get(char, 0) + 1
    return frequencies


def build_huffman_tree(frequencies: Dict[str, int]) -> HuffmanTree:
    if not frequencies:
        return HuffmanTree(root=None, codes={})

    heap: List[HeapNode] = [
        HeapNode(frequency=freq, char=char)
        for char, freq in frequencies.items()
    ]
    heapq.heapify(heap)

    while len(heap) > 1:
        left = heapq.heappop(heap)
        right = heapq.heappop(heap)
        merged = HeapNode(
            frequency=left.frequency + right.frequency,
            left=left,
            right=right,
        )
        heapq.heappush(heap, merged)

    root = heap[0]
    codes = generate_codes(root)
    return HuffmanTree(root=root, codes=codes)


def generate_codes(node: Optional[HeapNode], prefix: str = "") -> Dict[str, str]:
    if node is None:
        return {}

    if node.char is not None:
        return {node.char: prefix or "0"}

    codes: Dict[str, str] = {}
    codes.update(generate_codes(node.left, prefix + "0"))
    codes.update(generate_codes(node.right, prefix + "1"))
    return codes


def build_from_text(text: str) -> HuffmanTree:
    return build_huffman_tree(count_frequencies(text))


def encode_text(text: str, tree: Optional[HuffmanTree] = None) -> Tuple[str, HuffmanTree]:
    huffman_tree = tree or build_from_text(text)
    return huffman_tree.encode(text), huffman_tree


def decode_text(bitstring: str, tree: HuffmanTree) -> str:
    return tree.decode(bitstring)


def compression_ratio(text: str, encoded: str) -> float:
    if not text:
        return 0.0
    original_bits = len(text) * 8
    compressed_bits = len(encoded)
    return compressed_bits / original_bits


def main() -> None:
    message = "huffman encoding demo"
    print("Original message:", message)
    print("Length (chars):", len(message))

    frequencies = count_frequencies(message)
    print("\nCharacter frequencies:")
    for char in sorted(frequencies):
        display = char if char != " " else "<space>"
        print(f"  {display!r}: {frequencies[char]}")

    tree = build_from_text(message)
    print("\nHuffman codes:")
    for char in sorted(tree.codes):
        display = char if char != " " else "<space>"
        print(f"  {display!r}: {tree.codes[char]}")

    encoded = tree.encode(message)
    print("\nEncoded bitstring:", encoded)
    print("Encoded length (bits):", len(encoded))
    print("Compression ratio (vs 8-bit ASCII):", f"{compression_ratio(message, encoded):.3f}")

    decoded = tree.decode(encoded)
    print("\nDecoded message:", decoded)
    print("Round-trip matches:", decoded == message)


if __name__ == "__main__":
    main()
