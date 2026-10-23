# The tools `make setup` and `make check` need, at the versions the repository pins (passed by image.cloudbuild.yaml).
ARG NODE_VERSION
FROM node:${NODE_VERSION}-bookworm-slim

ARG PNPM_VERSION
ARG UV_VERSION
ARG PYTHON_VERSION
ARG TERRAFORM_VERSION

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates curl git make perl unzip \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global "pnpm@${PNPM_VERSION}"

ENV UV_PYTHON_INSTALL_DIR=/opt/uv/python
RUN curl -fsSL "https://astral.sh/uv/${UV_VERSION}/install.sh" | env UV_INSTALL_DIR=/usr/local/bin sh \
  && uv python install "${PYTHON_VERSION}"

RUN curl -fsSLo /tmp/terraform.zip \
    "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" \
  && unzip /tmp/terraform.zip terraform -d /usr/local/bin \
  && rm /tmp/terraform.zip
