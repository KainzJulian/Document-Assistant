"""Command line tools. Usage: ``python -m app.cli create-admin``."""

import argparse
import getpass
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import User
from app.db.session import get_engine
from app.security import hash_password


def create_admin(username: str, display_name: str, password: str) -> None:
    """Create an admin account.

    Args:
        username: Login name.
        display_name: Name shown in the UI.
        password: Clear-text password (at least 8 characters).

    Raises:
        SystemExit: If the user exists or the password is too short.
    """
    if len(password) < 8:
        raise SystemExit("Das Passwort muss mindestens 8 Zeichen lang sein.")
    with Session(get_engine()) as db:
        if db.scalar(select(User.id).where(User.username == username)) is not None:
            raise SystemExit(f"Benutzer '{username}' existiert schon.")
        db.add(
            User(
                username=username,
                display_name=display_name,
                password_hash=hash_password(password),
                role="admin",
            )
        )
        db.commit()
    print(f"Admin '{username}' angelegt.")


def main() -> None:
    """Parse arguments and run the chosen command."""
    parser = argparse.ArgumentParser(prog="app.cli")
    parser.add_subparsers(dest="command", required=True).add_parser(
        "create-admin", help="Create the first admin account (prompts for values)."
    )
    parser.parse_args()
    username = input("Benutzername: ").strip()
    display_name = input(f"Anzeigename [{username}]: ").strip() or username
    password = getpass.getpass("Passwort: ")
    if password != getpass.getpass("Passwort wiederholen: "):
        sys.exit("Die Passwörter stimmen nicht überein.")
    create_admin(username, display_name, password)


if __name__ == "__main__":
    main()
