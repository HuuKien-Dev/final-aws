import importlib.util
import unittest
from pathlib import Path

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("dev",root/"scripts/dev.py")
dev=importlib.util.module_from_spec(spec)
spec.loader.exec_module(dev)

class ReadinessTests(unittest.TestCase):
    def test_requires_both_services_and_seeded_data(self):
        def read(url):
            return [{"count":6}] if url.endswith("/api/topics") else {"status":"ok"}
        self.assertTrue(dev.services_ready(read))

    def test_frontend_alone_is_not_success(self):
        def read(url):
            if ":8000/" in url: raise OSError("not running")
            return {"status":"ok"}
        self.assertFalse(dev.services_ready(read))

    def test_missing_seed_is_not_success(self):
        self.assertFalse(dev.services_ready(lambda url: [] if url.endswith("/api/topics") else {"status":"ok"}))

    def test_proxy_failure_is_not_success(self):
        self.assertFalse(dev.services_ready(lambda url: {"detail":"unavailable"} if url.endswith("/api/topics") else {"status":"ok"}))

if __name__=="__main__":unittest.main()
