/** A section of the in-app help ("Hilfe"). */
export interface HelpSection {
  id: string;
  title: string;
  paragraphs: string[];
}

/** German help text: supported files, limits, citations, the Ollama warning and privacy. */
export const help: { title: string; intro: string; sections: HelpSection[] } = {
  title: 'Hilfe',
  intro: 'Kurz erklärt, was die App kann und was dabei mit deinen Dokumenten passiert.',
  sections: [
    {
      id: 'dokumente',
      title: 'Dokumente hinzufügen',
      paragraphs: [
        'Du kannst PDF (mit Text), TXT, Markdown, Word (DOCX), PowerPoint (PPTX), HTML und EPUB hochladen, jeweils bis 50 MB. Mehrere Dateien gleichzeitig sind möglich, auch per Ziehen und Ablegen.',
        'Mit "URL importieren" holt der Server den Haupttext einer Webseite. Seiten, die JavaScript oder eine Anmeldung brauchen, und Seiten hinter einer Bezahlschranke gehen nicht. Dann kannst du den Text stattdessen einfügen.',
        'Gescannte PDFs und Bilder werden nicht gelesen (keine Texterkennung). Passwortgeschützte PDFs gehen ebenfalls nicht.',
        'Jedes Dokument durchläuft die Schritte Wartet, Wird gelesen, Wird indexiert, Bereit. Erst bereite Dokumente kannst du in Chats und Zusammenfassungen nutzen. Bei einem Fehler steht der Grund dabei, und "Erneut versuchen" startet noch einmal.',
      ],
    },
    {
      id: 'bibliothek',
      title: 'Bibliothek und Teilen',
      paragraphs: [
        'Jede Person hat ihre eigene Bibliothek. Dieselbe Datei kannst du nicht zweimal hinzufügen: Die App sagt "Bereits in deiner Bibliothek".',
        'Mit "Mit Haushalt teilen" sehen andere das Dokument und seine Zusammenfassungen. Sie können es lesen, zusammenfassen und in Chats nutzen, aber nicht umbenennen oder löschen. Chats bleiben immer privat.',
        'Beim Löschen eines Dokuments verschwinden Datei, Text, Suchindex und Zusammenfassungen. Chats behalten ihre Nachrichten; Quellen darin zeigen dann "Dokument gelöscht".',
      ],
    },
    {
      id: 'fragen',
      title: 'Fragen stellen',
      paragraphs: [
        'Wähle bei "Neuer Chat" ein oder mehrere Dokumente und stelle deine Frage. Die Antwort nutzt nur diese Dokumente.',
        'Die Zahlen in der Antwort, zum Beispiel [1], sind Quellen. Ein Klick öffnet die Textstelle mit Dokument und Seite. So kannst du jede Aussage selbst nachprüfen.',
        'Steht die Antwort nicht in den Dokumenten, sagt die App "Dazu finde ich in den ausgewählten Dokumenten nichts." und erfindet nichts. Nachfragen werden im Zusammenhang des Gesprächs verstanden.',
        'Mit "Stopp" brichst du eine Antwort ab, mit "Neu generieren" bekommst du eine neue. Alle Chats werden automatisch gespeichert; oben links in der Seitenleiste kannst du sie durchsuchen, auch mit Tippfehlern.',
      ],
    },
    {
      id: 'zusammenfassungen',
      title: 'Zusammenfassungen',
      paragraphs: [
        'Es gibt fünf Längen: Extra kurz (etwa 50 Wörter), Kurz (150), Mittel (300), Lang (600) und Extra lang (1.200). Eine Zusammenfassung ist nie länger als ein Drittel des Originals.',
        'Lange Dokumente werden in Teilen zusammengefasst und dann zusammengeführt; der Fortschritt zeigt "Teil 3 von 7". Gespeichert wird pro Dokument und Länge, mit dem Namen des Modells und dem Datum. "Neu erstellen" ersetzt die gespeicherte Fassung.',
      ],
    },
    {
      id: 'modell',
      title: 'Das Modell und die Ollama-Warnung',
      paragraphs: [
        'Unter "Einstellungen" wählt jede Person ihr Modell: ein lokales (Ollama) oder eines von Anthropic, OpenAI oder Google, je nachdem, was der Admin eingerichtet hat.',
        'Bei lokalen Modellen prüft die App, ob der Server genug Speicher hat. "Nur CPU" heißt: Antworten sind sehr langsam, weil keine Grafikkarte genutzt wird. "Teilweise GPU" ist langsamer als ganz auf der Grafikkarte. "Passt nicht" heißt, dass das Modell wahrscheinlich gar nicht startet. Mit "Trotzdem verwenden" nimmst du das Modell trotzdem; die Warnung erscheint erst wieder, wenn es schlechter wird.',
      ],
    },
    {
      id: 'datenschutz',
      title: 'Datenschutz: wohin geht dein Text?',
      paragraphs: [
        'Alles läuft auf dem Server bei euch zu Hause. Die App ist nur im Heim-WLAN erreichbar und nutzt kein HTTPS: Passwörter und Texte sind im selben WLAN für andere lesbar, die den Netzwerkverkehr mitschneiden.',
        'Text verlässt den Server nur in diesen Schritten, und nur wenn dafür ein Cloud-Anbieter gewählt ist: bei Fragen (die gefundenen Textstellen und die Frage), bei Zusammenfassungen (der Text des Dokuments) und beim Indexieren, wenn der Admin ein Cloud-Embedding-Modell gewählt hat (alle Texte). Mit lokalen Modellen bleibt alles auf dem Server.',
        'Beim URL-Import ruft der Server die Webseite ab, nicht dein Gerät. API-Schlüssel liegen verschlüsselt auf dem Server und sind nie wieder sichtbar.',
      ],
    },
    {
      id: 'konto',
      title: 'Konto',
      paragraphs: [
        'Unter "Einstellungen" änderst du Anzeigenamen und Passwort. Nach einer Passwortänderung werden andere Geräte abgemeldet. Mit "Dunkel" und "Hell" unten in der Seitenleiste wechselst du das Design. Fünf falsche Anmeldungen sperren das Konto für 15 Minuten.',
      ],
    },
  ],
};
