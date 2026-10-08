import unittest


class NegativeGateTest(unittest.TestCase):
    def test_required_check_blocks_a_failure(self):
        self.fail("Intentional failure for branch-protection evidence")


if __name__ == "__main__":
    unittest.main()
