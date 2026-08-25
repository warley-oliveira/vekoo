# syntax=docker/dockerfile:1
# Imagem de produção da API Vekoo. Construída pelo Kamal (`kamal deploy`), nunca
# usada em desenvolvimento — no WSL2 o Rails roda nativo (ver docker-compose.yml).
ARG RUBY_VERSION=3.4.10
FROM docker.io/library/ruby:${RUBY_VERSION}-slim AS base

WORKDIR /rails

# Só dependências de runtime:
#   libpq5            -> gem pg
#   libvips           -> image_processing / variantes do Active Storage
#   libyaml-0-2       -> psych
#   libjemalloc2      -> RSS menor sob carga de Puma + Sidekiq
#   postgresql-client -> pg_isready/psql no entrypoint e em `kamal shell`
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      curl libjemalloc2 libpq5 libvips libyaml-0-2 postgresql-client && \
    rm -rf /var/lib/apt/lists/*

ENV RAILS_ENV=production \
    BUNDLE_DEPLOYMENT=1 \
    BUNDLE_PATH=/usr/local/bundle \
    BUNDLE_WITHOUT=development:test

# --- build -----------------------------------------------------------------
FROM base AS build

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      build-essential git libpq-dev libyaml-dev pkg-config && \
    rm -rf /var/lib/apt/lists/*

COPY Gemfile Gemfile.lock ./
RUN bundle install && \
    rm -rf ~/.bundle "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git && \
    bundle exec bootsnap precompile --gemfile

COPY . .
RUN bundle exec bootsnap precompile app/ lib/

# API-only: sem propshaft/sprockets/importmap não existe `assets:precompile`.
# A linha do Dockerfile stock do Rails 8 quebraria o build aqui.

# --- runtime ---------------------------------------------------------------
FROM base

COPY --from=build "${BUNDLE_PATH}" "${BUNDLE_PATH}"
COPY --from=build /rails /rails

# uid/gid 1000 tem que bater com o dono do volume nomeado vekoo_storage —
# um volume novo nasce com o dono do diretório da imagem.
RUN groupadd --system --gid 1000 rails && \
    useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash && \
    mkdir -p db log storage tmp && \
    chown -R rails:rails db log storage tmp
USER 1000:1000

ENTRYPOINT ["/rails/bin/docker-entrypoint"]

# Thruster escuta na 80 e repassa ao Puma (bind privilegiado funciona porque o
# Docker seta net.ipv4.ip_unprivileged_port_start=0).
EXPOSE 80
CMD ["./bin/thrust", "./bin/rails", "server"]
