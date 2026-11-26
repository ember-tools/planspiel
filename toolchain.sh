#!/usr/bin/env bash
#
# Common build and verification commands for this repository.
#
# Every command runs from the repository root's sub-directories regardless of the caller's working
# directory, and inside the project's nix environment via `direnv exec`.
#
# Usage: ./toolchain.sh <command> [args...]
#        ./toolchain.sh help

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$ROOT/frontend"
BACKEND="$ROOT/backend"
PORT_BACKEND="${PORT_BACKEND:-8000}"

run() {
    if [ -f "$ROOT/.envrc" ] && command -v direnv >/dev/null 2>&1; then
        if ! direnv exec "$ROOT" true >/dev/null 2>&1; then
            echo "The nix environment is not allowed yet. Allow it once with:" >&2
            echo "    direnv allow $ROOT" >&2
            exit 2
        fi
        direnv exec "$ROOT" "$@"
    else
        "$@"
    fi
}

usage() {
    cat <<'USAGE'
Usage: ./toolchain.sh <command> [args...]

Frontend
  fe-build              Type-check with vue-tsc, then build
  fe-typecheck          vue-tsc only
  fe-dev                Vite dev server, proxying /api and /tiles to the backend
  fe-install            npm install
  fe-test               Unit tests with vitest
  fe-deploy             Build and copy the result to backend/static, so the backend serves the
                        whole app from one port as the image does

Backend
  be-test [args]        All tests
  be-test1 <pattern>    One module or test, e.g. `be-test1 test_static`
  be-dev                uvicorn with --reload on port 8000 (PORT_BACKEND overrides)
  be-serve              fe-deploy, then serve everything

Docker
  docker-build [args]   Build the production image
  docker-app            Start it detached on port 8080
  docker-app-down       Stop it again
  docker-dev            Start the dev stack: backend with --reload, Vite on 5176

Combined
  verify                be-test, fe-test and fe-build, what CI runs
USAGE
}

fe() { cd "$FRONTEND"; }
be() { cd "$BACKEND/src"; }

cmd="${1:-help}"
shift || true

case "$cmd" in
    fe-build)      fe; run npm run build "$@" ;;
    fe-typecheck)  fe; run npx vue-tsc -b "$@" ;;
    fe-dev)        fe; run npm run dev -- "$@" ;;
    fe-install)    fe; run npm install "$@" ;;
    fe-test)       fe; run npm test -- "$@" ;;
    fe-deploy)
        fe; run npm run build
        rm -rf "$BACKEND/static"
        cp -r "$FRONTEND/dist" "$BACKEND/static"
        echo "backend/static updated"
        ;;

    be-test)       be; run python -m unittest discover -s services -t . "$@" ;;
    be-test1)
        [ $# -ge 1 ] || { echo "be-test1 needs a module or test, e.g. test_static" >&2; exit 2; }
        pattern="$1"; shift
        be; run python -m unittest "services.$pattern" -v "$@"
        ;;
    be-dev)        be; run uvicorn main:app --reload --port "$PORT_BACKEND" "$@" ;;
    be-serve)
        "$ROOT/toolchain.sh" fe-deploy
        be; run uvicorn main:app --port "$PORT_BACKEND" "$@"
        ;;

    docker-build)     cd "$ROOT"; docker build -t planspiel:dev . "$@" ;;
    docker-app)       cd "$ROOT"; docker compose up -d --build "$@" ;;
    docker-app-down)  cd "$ROOT"; docker compose down "$@" ;;
    docker-dev)       cd "$ROOT"; docker compose -f compose.dev.yml up --build "$@" ;;

    verify)
        "$ROOT/toolchain.sh" be-test
        "$ROOT/toolchain.sh" fe-test
        "$ROOT/toolchain.sh" fe-build
        ;;

    help|-h|--help) usage ;;
    *) echo "Unknown command: $cmd" >&2; echo >&2; usage >&2; exit 2 ;;
esac
