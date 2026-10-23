# Built from the repository root, where the uv workspace and its lockfile live.
FROM python:3.15-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
COPY services/jobs ./services/jobs
# The website's map palettes, which color the thumbnails.
COPY apps/web/src/design/generated/map-theme.json ./map-theme.json
# The image holds one workspace member, so the lockfile is used as is: make setup checks it is current.
RUN uv sync --frozen --no-dev --no-editable --package idea-agro-jobs
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 MAP_THEME=/app/map-theme.json
USER 65534
ENTRYPOINT ["idea-agro-jobs"]
