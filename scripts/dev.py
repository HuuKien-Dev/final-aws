"""Start both local services and stop their process groups together on exit."""
import os
import json
import urllib.request
import urllib.error
import webbrowser
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
children = []
stopping = False


def stop(signum=None, frame=None):
    global stopping
    stopping = True


def services_ready(read_json=None):
    if read_json is None:
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        def read_json(url):
            with opener.open(url,timeout=1) as response:
                if response.status!=200:
                    raise ValueError("Service not ready")
                return json.load(response)
    try:
        frontend=read_json("http://127.0.0.1:3000/health")
        backend=read_json("http://127.0.0.1:8000/health")
        topics=read_json("http://127.0.0.1:3000/api/topics")
        return (frontend.get("status")=="ok" and backend.get("status")=="ok"
                and isinstance(topics,list) and any(t.get("count",0)>0 for t in topics))
    except (OSError,ValueError,TypeError,AttributeError,urllib.error.URLError):
        return False


def main():
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    exit_code = 0
    try:
        for role in ("backend", "frontend"):
            child = subprocess.Popen(
                ["bash", str(ROOT / "scripts/run-local.sh"), role],
                cwd=ROOT, start_new_session=True,
            )
            children.append(child)
        print("Đang khởi động. Chờ xác nhận HTTP của frontend, backend và dữ liệu bài học…", flush=True)
        print("Ctrl+C để dừng cả hai dịch vụ. Lỗi của một dịch vụ cũng dừng dịch vụ còn lại.", flush=True)
        announced=False
        warned=False
        started=time.monotonic()
        next_probe=started+1
        while not stopping:
            for child in children:
                code = child.poll()
                if code is not None:
                    # Long-running services should never exit on their own.
                    exit_code = code if code else 1
                    return exit_code
            now=time.monotonic()
            if not announced and now>=next_probe:
                if services_ready():
                    announced=True
                    print("\nĐÃ SẴN SÀNG: http://localhost:3000",flush=True)
                    print("Đã xác nhận frontend, backend và API dữ liệu phản hồi thành công.",flush=True)
                    if os.getenv("ENGLISH_OPEN_BROWSER")=="1" and (os.getenv("DISPLAY") or os.getenv("WAYLAND_DISPLAY")):
                        try:
                            webbrowser.open("http://localhost:3000",new=2)
                        except (webbrowser.Error,OSError):
                            print("Không tự mở được trình duyệt. Dịch vụ đã sẵn sàng; mở địa chỉ ở trên bằng tay.",flush=True)
                elif not warned and now-started>60:
                    warned=True
                    print("Chưa xác nhận được dịch vụ sau 60 giây. Xem lỗi ở Terminal; chưa mở link như một app đang hoạt động.",flush=True)
                next_probe=time.monotonic()+3
            time.sleep(0.2)
    finally:
        for child in children:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        deadline = time.monotonic() + 5
        for child in children:
            try:
                child.wait(timeout=max(0.01, deadline-time.monotonic()))
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                child.wait()
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
