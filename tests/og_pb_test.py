def avg(l):
    s = 0
    for x in l:
        s = s + x
    n = len(l)
    return s / n

k = avg([1, 5, 6, 10])