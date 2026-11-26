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
| `/data/boards.sqlite` | Shared boards: their document, revision and the two tokens that open them. Kept until deleted through the edit link |
| `/data/tiles` | OpenStreetMap tiles fetched on demand, with `index.sqlite` recording when each was last read. Tiles unread for `TILE_RETENTION_DAYS` are deleted, and beyond `TILE_MAX_BYTES` the ones read longest ago |

### Environment

| Variable | Default | Meaning |
|---|---|---|
| `DATA_DIR` | `/data` in the image | Where boards and tiles are kept |
| `CORS_ORIGINS` | `*` | Comma separated allowed origins; `https://planspiel.emberbox.app` in production |
| `BOARD_MAX_BYTES` | `2000000` | Largest board accepted, as JSON |
| `BOARD_CREATIONS_PER_HOUR` | `30` | Boards one client address may share per hour |
| `TILE_RETENTION_DAYS` | `30` | Days after its last read until a map tile is deleted |
| `TILE_MAX_BYTES` | `2147483648` | Upper limit of the tile cache in bytes |
| `TILE_SWEEP_SECONDS` | `3600` | How often unread tiles are evicted |
| `LOG_FORMAT` | `json` in the image | `json` writes ECS JSON lines to stdout |
| `LOG_LEVEL` | `INFO` | Log level when `LOG_FORMAT=json` |

The container listens on port 8000 and expects a reverse proxy that sets `X-Forwarded-*` headers
and passes WebSocket upgrades on `/api/boards/{token}/live`, which carries the live editing.
The tokens that open a board are part of those paths, so the image runs uvicorn without an access
log, and the proxy in front should not log them either.

## License

AGPL-3.0-or-later
