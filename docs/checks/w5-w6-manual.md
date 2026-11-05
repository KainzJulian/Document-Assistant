# W5 and W6 manual checks (browser)

Needs a real model (W3) and two ready documents (for example the two sample PDFs). Log results in `docs/test-log.md`.

## W5 Chat

1. "Neuer Chat": select 3 documents with the checkboxes, "Alle auswählen" toggles all; type a question, Enter sends (Shift+Enter makes a new line). The chat opens and the answer streams in.
2. Answers start appearing within 3 seconds with a cloud model.
3. Reload the page while an answer is streaming: both messages are still there (the answer may be marked "abgebrochen").
4. Click each citation number: the side panel (bottom sheet on a phone) shows the document title, page, section and the passage that supports the sentence. "Dokument öffnen" opens the document.
5. "Stopp" ends an answer; the text so far stays, marked "abgebrochen". "Neu generieren" (last answer only) replaces it. "Kopieren" copies it.
6. 5 follow-up questions and 5 off-topic questions from your question set: follow-ups use the earlier turns, off-topic ones get exactly "Dazu finde ich in den ausgewählten Dokumenten nichts."
7. After the first answer the chat gets a short German title; rename it in the header.
8. "Dokumente ändern" adds or removes documents during the chat; the next answer uses the new selection.
9. Delete a document that a chat used: the chat keeps its messages; opening a citation to it shows "Dokument gelöscht".
10. A local model with a poor fit shows the amber badge in the header.
11. "Chat mit diesem Dokument" on a document page opens "Neuer Chat" with it selected.
12. Screen reader: the finished answer is announced once (not every token).

## W6 Sidebar and search

1. Chats are grouped Heute, Gestern, Letzte 7 Tage, Älter, newest first; the open chat is highlighted. Hover (or on a phone: always) shows "Umbenennen" and "Löschen" (delete asks for confirmation).
2. Switch between "Neuer Chat", the library and three chats: text you typed in the question box of "Neuer Chat" is kept? (the box is per page; the plan's "without losing input" applies to the sidebar search text and the chat selection - report if you lose something you expected to keep).
3. Search field: type "Zusamenfassung" (misspelt): chats with "Zusammenfassung" appear with the word highlighted; Enter or a click opens the chat scrolled to that message.
4. 100 seeded chats: search answers in under 300 ms (script `w6-search-api.py` measures this with 500).
