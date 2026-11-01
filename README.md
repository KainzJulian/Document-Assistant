# Document Assistant

German-language household web app: a personal library of documents and web pages, summaries in five lengths, and chat over selected documents with citations. Angular + FastAPI + Postgres/pgvector.

- Plan: [PLAN.md](PLAN.md)
- Setup: [docs/setup.md](docs/setup.md)
- Versions: [docs/versions.md](docs/versions.md)

## Commands

```
make check         # lint + types + Storybook build (api and web)
make up            # build and start the Compose stack on :8080
make create-admin  # create the first admin account
make backup        # database dump + files volume
```
