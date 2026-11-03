def calculate_variance(expected: int, counted: int) -> dict:
    """Compare the physical count with the expected stock.

    difference = counted - expected
      negative -> shortage (stock is missing)
      positive -> surplus  (more stock than the records show)
      zero     -> match
    """
    difference = counted - expected

    if difference < 0:
        kind = "shortage"
    elif difference > 0:
        kind = "surplus"
    else:
        kind = "match"

    return {
        "expected": expected,
        "counted": counted,
        "difference": difference,
        "kind": kind,
    }