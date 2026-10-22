from pydantic_settings import BaseSettings, SettingsConfigDict


class ReaderSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="READER_", extra="ignore")

    service_token: str = ""
    git_sha: str = "dev"
    max_pages_default: int = 500
    http_timeout_seconds: float = 120.0

    libreoffice_binary: str = ""
    libreoffice_version_pin: str = ""
    libreoffice_render_timeout_seconds: float = 120.0

    supabase_url: str = ""
    supabase_service_role_key: str = ""


settings = ReaderSettings()
