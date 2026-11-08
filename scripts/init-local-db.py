"""Create only a missing local app role/database. Never replace passwords or data."""
import os
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit


def main():
    parsed=urlsplit(os.environ.get("DATABASE_URL", ""))
    if parsed.scheme not in {"postgresql", "postgres"} or parsed.hostname not in {"localhost", "127.0.0.1"} or parsed.port not in {None,5432}:
        raise ValueError("Bootstrap chỉ dùng PostgreSQL local cổng 5432. Với DB đã có, dùng run-local.sh theo README.")
    username=unquote(parsed.username or "")
    password=unquote(parsed.password or "")
    database=unquote(parsed.path.lstrip("/"))
    for name in (username,database):
        if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]{0,62}",name):
            raise ValueError("Tên role/database local phải gồm chữ, số hoặc dấu gạch dưới và dài tối đa 63 ký tự.")
    if not password or "\0" in password:
        raise ValueError("Cần mật khẩu PostgreSQL hợp lệ trong DATABASE_URL.")
    admin=["sudo","-u","postgres","psql","--no-psqlrc","--dbname=postgres","--tuples-only","--no-align","--set=ON_ERROR_STOP=1"]

    def query(sql):
        result=subprocess.run(admin,input=sql+"\n",text=True,capture_output=True)
        if result.returncode:
            raise RuntimeError("Không thao tác được PostgreSQL local bằng sudo -u postgres. Kiểm tra dịch vụ/quyền quản trị.")
        return result.stdout.strip()

    # Identifiers are restricted above; passwords are sent on stdin, never in argv/logs.
    role_exists=query("SELECT 1 FROM pg_roles WHERE rolname='"+username+"';")=="1"
    if not role_exists:
        quoted=password.replace("\\","\\\\").replace("'","''")
        query('CREATE ROLE "'+username+'" LOGIN PASSWORD E\''+quoted+"';")
        print("Đã tạo role local:",username)
    if query("SELECT 1 FROM pg_database WHERE datname='"+database+"';")!="1":
        query('CREATE DATABASE "'+database+'" OWNER "'+username+'";')
        print("Đã tạo database local:",database)
    environment={**os.environ,"PGPASSWORD":password,"PGCONNECT_TIMEOUT":"5"}
    result=subprocess.run(["psql","--no-psqlrc","--no-password","-h",parsed.hostname,"-p","5432","-U",username,"-d",database,"-tAc","SELECT 1"],env=environment,text=True,capture_output=True)
    if result.returncode or result.stdout.strip()!="1":
        raise RuntimeError("Không đăng nhập được PostgreSQL bằng DATABASE_URL. Role đã có được giữ nguyên; kiểm tra mật khẩu trong backend/.env.")
    print("Kết nối PostgreSQL local thành công; dữ liệu cũ được giữ nguyên.")


if __name__=="__main__":
    try:
        main()
    except (ValueError,RuntimeError,OSError) as error:
        print("LỖI:",error,file=sys.stderr)
        sys.exit(1)
