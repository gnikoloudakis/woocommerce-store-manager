import os

from dotenv import load_dotenv


class Config:
    # load_dotenv(dotenv_path='.env')
    load_dotenv()

    @classmethod
    def get_param(cls, name, default=None) -> str | None:
        return os.getenv(name, default)
