"""
array_utils.py

Simple examples of array (list) manipulation in Python.
"""

def create_array(n):
    """Create an array with values from 0 to n-1."""
    return list(range(n))


def reverse_array(arr):
    """Return a reversed copy of the array."""
    return arr[::-1]


def square_elements(arr):
    """Square each element in the array."""
    return [x * x for x in arr]


def filter_even(arr):
    """Return only even numbers."""
    return [x for x in arr if x % 2 == 0]


def sum_array(arr):
    """Sum all elements in the array."""
    total = 0
    for value in arr:
        total += value
    return total


def max_element(arr):
    """Return the maximum element."""
    if not arr:
        return None
    max_val = arr[0]
    for value in arr:
        if value > max_val:
            max_val = value
    return max_val


def min_element(arr):
    """Return the minimum element."""
    if not arr:
        return None
    min_val = arr[0]
    for value in arr:
        if value < min_val:
            min_val = value
    return min_val


def remove_duplicates(arr):
    """Remove duplicates while preserving order."""
    seen = set()
    result = []
    for value in arr:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def rotate_left(arr, k):
    """Rotate array left by k positions."""
    if not arr:
        return arr
    k = k % len(arr)
    return arr[k:] + arr[:k]


def main():
    arr = create_array(10)
    print("Original:", arr)

    reversed_arr = reverse_array(arr)
    print("Reversed:", reversed_arr)

    squared = square_elements(arr)
    print("Squared:", squared)

    evens = filter_even(arr)
    print("Even numbers:", evens)

    total = sum_array(arr)
    print("Sum:", total)

    print("Max:", max_element(arr))
    print("Min:", min_element(arr))

    dup_arr = [1, 2, 2, 3, 4, 4, 5]
    print("With duplicates:", dup_arr)
    print("Without duplicates:", remove_duplicates(dup_arr))

    rotated = rotate_left(arr, 3)
    print("Rotated left by 3:", rotated)


if __name__ == "__main__":
    main()
