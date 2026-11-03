from app.services.variance import calculate_variance


def test_shortage():
    result = calculate_variance(expected=15, counted=12)
    assert result["difference"] == -3
    assert result["kind"] == "shortage"


def test_surplus():
    result = calculate_variance(expected=15, counted=18)
    assert result["difference"] == 3
    assert result["kind"] == "surplus"


def test_exact_match():
    result = calculate_variance(expected=15, counted=15)
    assert result["difference"] == 0
    assert result["kind"] == "match"