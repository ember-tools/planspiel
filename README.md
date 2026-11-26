# Planspielplatte

A digital map board for fire brigade tabletop exercises. Vehicles with their crews, incident sites,
hose lines, areas and notes lie on an OpenStreetMap map as tactical symbols. The course of an
exercise is kept as a series of snapshots ordered by time, and a board is shared through a link to
edit and a link to watch.

The interface is German throughout; it is meant for German fire services.

## Running it

The image is `ghcr.io/ember-tools/planspiel`. `compose.yml` builds and starts it locally on port
8080; `compose.dev.yml` runs the backend with reload and Vite on port 5176.

```sh
./toolchain.sh verify      # backend tests, frontend type check and build
./toolchain.sh be-serve    # build the frontend and serve everything on port 8000
```

### Volume

Everything the server keeps lives under `/data`:

| Path | Content |
|---|---|
| `/data` | Shared boards and the map tile cache |

### Environment

| Variable | Default | Meaning |
|---|---|---|
| `DATA_DIR` | `/data` in the image | Where boards and tiles are kept |
| `CORS_ORIGINS` | `*` | Comma separated allowed origins; `https://planspiel.emberbox.app` in production |
| `LOG_FORMAT` | `json` in the image | `json` writes ECS JSON lines to stdout |
| `LOG_LEVEL` | `INFO` | Log level when `LOG_FORMAT=json` |

The container listens on port 8000 and expects a reverse proxy that sets `X-Forwarded-*` headers.

## License

AGPL-3.0-or-later
