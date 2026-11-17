FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app/database
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --requirement requirements.txt

COPY . .

RUN addgroup --system --gid 10001 app && \
    adduser --system --uid 10001 --ingroup app app && \
    chown -R app:app /app

USER app
# Chạy một lệnh rồi thoát: migrate (mặc định), seed hoặc inspect.
ENTRYPOINT ["python", "/app/database/manage.py"]
CMD ["migrate"]
