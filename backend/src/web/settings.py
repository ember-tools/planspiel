from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_DATA = Path(__file__).resolve().parent.parent.parent / "data"


class Settings(BaseSettings):
    """
    Everything the server reads from the environment. Outside a container the data directory sits
    beside the sources and is gitignored; the image points it at the mounted volume.
    """

    data_dir: Path = _DATA
    cors_origins: str = "*"
    tile_retention_days: int = 30
    tile_max_bytes: int = 2 * 1024**3
    tile_sweep_seconds: int = 3600
    board_max_bytes: int = 2_000_000
    board_creations_per_hour: int = 30

    model_config = SettingsConfigDict(env_file=".env")

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def tile_dir(self) -> Path:
        return self.data_dir / "tiles"

    @property
    def board_file(self) -> Path:
        return self.data_dir / "boards.sqlite"


settings = Settings()
