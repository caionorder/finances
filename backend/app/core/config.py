from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_JWT_SECRET_PLACEHOLDERS = {
    "change-me-to-a-long-random-string",
    "change-me-in-production-use-a-strong-random-secret",
    "changeme",
    "secret",
    "your-secret-here",
    "__GENERATE_VIA_openssl_rand_-hex_32__",
}


class Settings(BaseSettings):
    ENV: str = "dev"
    DATABASE_URL: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    UPLOAD_DIR: str = "/data/uploads"
    API_KEY_HEADER: str = "X-API-Key"
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost"]
    TZ: str = "America/Sao_Paulo"

    @field_validator("JWT_SECRET")
    @classmethod
    def _validate_jwt_secret(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("JWT_SECRET must be at least 32 chars")
        if v in _JWT_SECRET_PLACEHOLDERS:
            raise ValueError(
                "JWT_SECRET is using a placeholder value; "
                "generate via 'openssl rand -hex 32'"
            )
        return v

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
