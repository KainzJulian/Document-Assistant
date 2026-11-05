# Dokumenten-Assistent: Anleitung

Diese Anleitung ist für alle im Haushalt. Die wichtigsten Punkte stehen auch in der App unter **Hilfe**.

## Erste Schritte

1. Öffne im Heim-WLAN die Adresse, die dir der Admin gibt (zum Beispiel `http://192.168.1.50:8080`). Am Handy kannst du die Seite zum Startbildschirm hinzufügen.
2. Melde dich mit deinem Benutzernamen und Passwort an. Du bleibst angemeldet, auch nach dem Schließen des Browsers.
3. Unter **Einstellungen** wählst du dein **Modell**. Ohne Modell kannst du keine Fragen stellen und nichts zusammenfassen.

## Dokumente

- **Hochladen:** PDF (mit Text), TXT, Markdown, Word, PowerPoint, HTML und EPUB bis 50 MB. Du kannst mehrere Dateien gleichzeitig wählen oder auf die Seite ziehen.
- **URL importieren:** Der Haupttext einer Webseite wird gespeichert. Klappt das nicht (Seite braucht JavaScript, Anmeldung oder Bezahlschranke), fügst du den Text mit **Text einfügen** selbst ein.
- **Nicht möglich:** gescannte PDFs und Bilder (keine Texterkennung), passwortgeschützte PDFs.
- **Status:** Wartet, Wird gelesen, Wird indexiert, Bereit. Bei Fehlern steht der Grund dabei; **Erneut versuchen** startet neu.
- **Teilen:** Auf der Dokumentseite **Mit Haushalt teilen**. Andere sehen das Dokument und seine Zusammenfassungen, ändern können sie es nicht.

## Fragen stellen

1. **Neuer Chat**, Dokumente wählen, Frage eingeben, Enter drücken.
2. Die Antwort kommt Wort für Wort. Mit **Stopp** brichst du ab, mit **Neu generieren** bekommst du eine andere Antwort.
3. Zahlen wie **[1]** sind Quellen: Ein Klick zeigt die Textstelle mit Dokument und Seite. Prüfe wichtige Aussagen dort nach.
4. Steht die Antwort nicht in den Dokumenten, sagt die App das. Sie erfindet nichts.
5. Die Dokumente eines Chats kannst du später ändern (**Dokumente ändern**).
6. Alle Chats stehen in der Seitenleiste (Heute, Gestern, Letzte 7 Tage, Älter). Die Suche findet Wörter in Titeln und Nachrichten, auch mit Tippfehlern.

## Zusammenfassungen

Auf der Dokumentseite wählst du die Länge: Extra kurz (50 Wörter), Kurz (150), Mittel (300), Lang (600), Extra lang (1.200). Zusammenfassungen sind nie länger als ein Drittel des Originals. Sie werden gespeichert; **Neu erstellen** ersetzt sie. Mit **Auf Deutsch** wird übersetzt.

## Modelle und die Warnung

- **Cloud-Modelle** (Anthropic, OpenAI, Google) sind schnell, schicken aber den nötigen Text an den Anbieter.
- **Lokale Modelle** (Ollama) bleiben im Haus, sind auf dem Mini-PC aber langsam (wenige Wörter pro Sekunde).
- Wählst du ein lokales Modell, prüft die App den Speicher des Servers. **Nur CPU**: sehr langsam. **Teilweise GPU**: langsamer. **Passt nicht**: startet wahrscheinlich nicht. **Trotzdem verwenden** übernimmt das Modell; **Abbrechen** behält das alte.

## Datenschutz in Kürze

- Die App läuft auf dem Server bei euch und ist nur im Heim-WLAN erreichbar, ohne HTTPS. Nutze sie nicht im öffentlichen WLAN.
- Text geht an einen Cloud-Anbieter nur bei Fragen, Zusammenfassungen und (falls der Admin ein Cloud-Embedding-Modell gewählt hat) beim Indexieren, und nur wenn dafür ein Cloud-Modell gewählt ist.
- Chats sind privat, auch wenn sie geteilte Dokumente nutzen.

## Für den Admin

- Konten legst du unter **Benutzer** an; Passwort zurücksetzen und Deaktivieren sind dort ebenfalls.
- Unter **Einstellungen** trägst du die **Anbieter** und ihre API-Schlüssel ein (verschlüsselt gespeichert, nie wieder sichtbar) und wählst das **Embedding-Modell**. Ein Wechsel indexiert alle Dokumente im Hintergrund neu; das alte Modell arbeitet so lange weiter.
- Einrichtung, Backup, Wiederherstellung und Updates: `docs/setup.md`.
- Nach einer Hardware-Änderung am Server: `make hw-refresh`.

## Probleme

| Problem | Was hilft |
| --- | --- |
| "Ollama nicht erreichbar" | Läuft Ollama? `docker compose ... ps`; Adresse unter Anbieter prüfen |
| Dokument bleibt auf "Wird indexiert" | Ist ein Embedding-Modell aktiv und erreichbar? Danach **Erneut verarbeiten** |
| "API-Schlüssel wurde abgelehnt" | Schlüssel unter Anbieter neu eintragen, **Verbindung testen** |
| Konto gesperrt | Nach 15 Minuten wieder möglich, oder der Admin setzt das Passwort zurück |
