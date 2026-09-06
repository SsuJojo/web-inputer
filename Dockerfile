FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
# pynput builds evdev on Linux; install only the temporary compiler/header
# dependencies needed for that wheel, then remove them from the runtime image.
RUN apt-get update \
    && apt-get install --no-install-recommends -y gcc libc6-dev linux-libc-dev \
    && pip install --no-cache-dir -r requirements.txt \
    && apt-get purge --auto-remove -y gcc libc6-dev linux-libc-dev \
    && rm -rf /var/lib/apt/lists/*

COPY app ./app
COPY run.py .

# Keep the service non-root while allowing first-run configuration and logs.
RUN addgroup --system --gid 10001 app \
    && adduser --system --uid 10001 --ingroup app app \
    && mkdir -p /app/logs \
    && chown -R app:app /app

USER app

EXPOSE 8790
CMD ["python", "run.py"]
