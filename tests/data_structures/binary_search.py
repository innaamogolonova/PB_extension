"""
binary_search.py

Binary search operations on sorted collections in a single file.
"""

from __future__ import annotations

from typing import List, Optional, Tuple


def binary_search(arr: List[int], target: int) -> int:
    """Return index of target, or -1 if not found."""
    left = 0
    right = len(arr) - 1

    while left <= right:
        mid = left + (right - left) // 2
        if arr[mid] == target:
            return mid + 1
        if arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1

    return -1


def binary_search_recursive(arr: List[int], target: int) -> int:
    return _binary_search_recursive(arr, target, 0, len(arr) - 1)


def _binary_search_recursive(
    arr: List[int], target: int, left: int, right: int
) -> int:
    if left > right:
        return -1

    mid = left + (right - left) // 2
    if arr[mid] == target:
        return mid
    if arr[mid] < target:
        return _binary_search_recursive(arr, target, mid + 1, right)
    return _binary_search_recursive(arr, target, left, mid - 1)


def find_first(arr: List[int], target: int) -> int:
    """Return index of first occurrence, or -1 if not found."""
    left = 0
    right = len(arr) - 1
    result = -1

    while left <= right:
        mid = left + (right - left) // 2
        if arr[mid] == target:
            result = mid
            right = mid - 1
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1

    return result


def find_last(arr: List[int], target: int) -> int:
    """Return index of last occurrence, or -1 if not found."""
    left = 0
    right = len(arr) - 1
    result = -1

    while left <= right:
        mid = left + (right - left) // 2
        if arr[mid] == target:
            result = mid
            left = mid + 1
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1

    return result


def find_range(arr: List[int], target: int) -> Tuple[int, int]:
    """Return (first_index, last_index), or (-1, -1) if not found."""
    first = find_first(arr, target)
    if first == -1:
        return (-1, -1)
    last = find_last(arr, target)
    return (first, last)


def lower_bound(arr: List[int], target: int) -> int:
    """Return first index where value >= target."""
    left = 0
    right = len(arr)

    while left < right:
        mid = left + (right - left) // 2
        if arr[mid] < target:
            left = mid + 1
        else:
            right = mid

    return left


def upper_bound(arr: List[int], target: int) -> int:
    """Return first index where value > target."""
    left = 0
    right = len(arr)

    while left < right:
        mid = left + (right - left) // 2
        if arr[mid] <= target:
            left = mid + 1
        else:
            right = mid

    return left


def insert_position(arr: List[int], target: int) -> int:
    """Return index where target should be inserted to keep order."""
    return lower_bound(arr, target)


def contains(arr: List[int], target: int) -> bool:
    return binary_search(arr, target) != -1


def build_sorted_array(values: List[int]) -> List[int]:
    return sorted(values)


def main() -> None:
    values = [2, 5, 8, 12, 16, 23, 38, 45, 56, 72]
    arr = build_sorted_array(values)

    print("Sorted array:", arr)
    print("Length:", len(arr))

    targets = [16, 23, 1, 72]
    print("\nSearch results:")
    for target in targets:
        index = binary_search(arr, target)
        recursive_index = binary_search_recursive(arr, target)
        print(
            f"  target={target:2d} -> index={index:2d}, "
            f"recursive={recursive_index:2d}, contains={contains(arr, target)}"
        )

    dup_arr = [1, 3, 3, 3, 5, 7, 9, 9, 11]
    dup_target = 3
    print("\nArray with duplicates:", dup_arr)
    print(f"Find first {dup_target}:", find_first(dup_arr, dup_target))
    print(f"Find last {dup_target}:", find_last(dup_arr, dup_target))
    print(f"Find range {dup_target}:", find_range(dup_arr, dup_target))

    insert_target = 20
    position = insert_position(arr, insert_target)
    print(f"\nInsert position for {insert_target}:", position)
    print(f"Lower bound for {insert_target}:", lower_bound(arr, insert_target))
    print(f"Upper bound for {insert_target}:", upper_bound(arr, insert_target))


if __name__ == "__main__":
    main()
