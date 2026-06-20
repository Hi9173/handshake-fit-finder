from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Handshake Fit Finder API"
    database_url: str = "mysql+pymysql://handshake:handshake@127.0.0.1:3307/handshake_fit_finder"
    cors_origins: list[str] = ["http://localhost:5173"]
    cors_origin_regex: str = r"chrome-extension://.*|http://127\.0\.0\.1:5173"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="HFF_")


@lru_cache
def get_settings() -> Settings:
    return Settings()
