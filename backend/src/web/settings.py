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

    model_config = SettingsConfigDict(env_file=".env")

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
