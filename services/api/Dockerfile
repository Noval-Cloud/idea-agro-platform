# Built from the repository root, where the uv workspace and its lockfile live.
FROM python:3.15-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
COPY services/api ./services/api
# The image holds one workspace member, so the lockfile is used as is: make setup checks it is current.
RUN uv sync --frozen --no-dev --no-editable --package idea-agro-api
ENV PATH="/app/.venv/bin:$PATH"
USER 65534
CMD ["sh", "-c", "exec uvicorn --factory idea_agro_api.app:create_app_from_env --host 0.0.0.0 --port ${PORT:-8080}"]
