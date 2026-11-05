# W3 manual checks (real providers and hardware)

Run on the mini PC (or any machine with the stack). Log the results in `docs/test-log.md`.

## W3.1 Provider layer, W3.2 admin page

1. Settings, section "Anbieter" (admin): add Anthropic, OpenAI and Google with your real keys, and Ollama (leave the address empty for the Compose default).
2. "Verbindung testen" on each: a toast with "Verbindung steht. N Modelle gefunden." and the model count shows in the list.
3. The key never appears: open the browser dev tools, Network tab, reload the settings page. No response contains your key. `docker compose logs api | grep -i "<first characters of your key>"` finds nothing.
4. Edit a provider and leave the key blank: it keeps working (test again).
5. With a wrong key: the test shows "Der API-Schlüssel wurde abgelehnt oder fehlt."
6. Streaming from each provider (no UI yet, use the container):
   ```
   docker exec -i doc-assistant-api-1 python - <<'EOF'
   import asyncio
   from sqlalchemy import select
   from sqlalchemy.orm import Session
   from app.db.session import get_engine
   from app.db.models import Provider
   from app.providers.registry import build_provider
   from app.providers.base import Message
   async def main():
       with Session(get_engine()) as db:
           for p in db.scalars(select(Provider)).all():
               model = next((m for m in p.models if "embed" not in m), None)
               if not model: continue
               print(p.label, model, end=": ")
               async for d in build_provider(p).stream_chat(model, [Message("user", "Sag kurz Hallo.")], max_tokens=30):
                   print(d.text, end="", flush=True)
               print()
   asyncio.run(main())
   EOF
   ```
   Each provider prints a short answer.

## W3.3 Settings

1. Two accounts choose different models; each keeps its own after reloading.
2. Summary language switch persists. Display name and password changes work; after a password change other browsers are logged out.

## W3.4 Hardware service (mini PC)

1. `make hw-refresh` prints `{"gpu": null}` on a machine without a GPU (or the GPU name and VRAM with `nvidia-smi`).
2. Pull the models: `docker compose ... exec ollama ollama pull llama3.1:8b` and `qwen2.5:32b` (or the nearest sizes).
3. Settings, model picker: an 8B model shows the dialog "Nur CPU" with an estimate of a few words per second; a 32B model shows "Passt nicht".
4. "Geschwindigkeit testen" runs up to 20 seconds and shows a measured value. Write the measured number into `docs/test-log.md`.

## W3.5 Warning dialog

1. "Abbrechen" keeps the previous model.
2. "Trotzdem verwenden" saves the model; choosing the same model again does not show the dialog.
3. The dialog returns only when the verdict gets worse (for example after stopping other programs that use RAM and running `make hw-refresh`, or a bigger model).
4. Ollama stopped: choosing a local model shows "Ollama nicht erreichbar" and nothing is saved.
5. Storybook: "Organisms/Ollama fit dialog" shows all variants in light and dark.
