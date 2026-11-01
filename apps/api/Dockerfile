FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /srv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
ENV PATH="/srv/.venv/bin:$PATH" PYTHONPATH=/srv
COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app
