"""
bfs.py

Graph construction and breadth-first search in a single file.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional, Set, Tuple


@dataclass
class Graph:
    adjacency: Dict[str, List[str]] = field(default_factory=dict)

    def add_vertex(self, vertex: str) -> None:
        if vertex not in self.adjacency:
            self.adjacency[vertex] = []

    def add_edge(self, source: str, target: str, directed: bool = False) -> None:
        self.add_vertex(source)
        self.add_vertex(target)
        self.adjacency[source].append(target)
        if not directed:
            self.adjacency[target].append(source)

    def neighbors(self, vertex: str) -> List[str]:
        return list(self.adjacency.get(vertex, []))

    def vertices(self) -> List[str]:
        return list(self.adjacency.keys())

    def edge_count(self) -> int:
        total = sum(len(neighbors) for neighbors in self.adjacency.values())
        return total // 2


def build_graph(edges: List[Tuple[str, str]], directed: bool = False) -> Graph:
    graph = Graph()
    for source, target in edges:
        graph.add_edge(source, target, directed=directed)
    return graph


def bfs_traversal(graph: Graph, start: str) -> List[str]:
    if start not in graph.adjacency:
        return []

    visited: Set[str] = set()
    order: List[str] = []
    queue: Deque[str] = deque([start])
    visited.add(start)

    while queue:
        vertex = queue.popleft()
        order.append(vertex)

        for neighbor in sorted(graph.neighbors(vertex)):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)

    return order


def bfs_levels(graph: Graph, start: str) -> Dict[str, int]:
    if start not in graph.adjacency:
        return {}

    levels: Dict[str, int] = {start: 0}
    queue: Deque[str] = deque([start])

    while queue:
        vertex = queue.popleft()
        for neighbor in graph.neighbors(vertex):
            if neighbor not in levels:
                levels[neighbor] = levels[vertex] + 1
                queue.append(neighbor)

    return levels


def shortest_path(graph: Graph, start: str, goal: str) -> Optional[List[str]]:
    if start not in graph.adjacency or goal not in graph.adjacency:
        return None
    if start == goal:
        return [start]

    visited: Set[str] = {start}
    queue: Deque[List[str]] = deque([[start]])

    while queue:
        path = queue.popleft()
        vertex = path[-1]

        for neighbor in sorted(graph.neighbors(vertex)):
            if neighbor in visited:
                continue
            next_path = path + [neighbor]
            if neighbor == goal:
                return next_path
            visited.add(neighbor)
            queue.append(next_path)

    return None


def reachable(graph: Graph, start: str) -> Set[str]:
    return set(bfs_traversal(graph, start))


def is_connected(graph: Graph) -> bool:
    vertices = graph.vertices()
    if not vertices:
        return True
    start = vertices[0]
    return len(reachable(graph, start)) == len(vertices)


def main() -> None:
    edges = [
        ("A", "B"),
        ("A", "C"),
        ("B", "D"),
        ("B", "E"),
        ("C", "F"),
        ("D", "G"),
        ("E", "G"),
        ("F", "H"),
        ("G", "I"),
        ("H", "I"),
    ]
    graph = build_graph(edges)

    print("Vertices:", sorted(graph.vertices()))
    print("Edge count:", graph.edge_count())
    print("Connected:", is_connected(graph))

    start = "A"
    print(f"\nBFS traversal from {start}:", bfs_traversal(graph, start))

    levels = bfs_levels(graph, start)
    print(f"\nLevels from {start}:")
    for vertex in sorted(levels, key=lambda v: (levels[v], v)):
        print(f"  {vertex}: {levels[vertex]}")

    goal = "I"
    path = shortest_path(graph, start, goal)
    print(f"\nShortest path {start} -> {goal}:", path)

    print(f"\nReachable from {start}:", sorted(reachable(graph, start)))


if __name__ == "__main__":
    main()
