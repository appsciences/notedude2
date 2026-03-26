# Free Form Spec

I would like to create a note taking app using the spec driven development process. Currently, I would like to create a specification from the following. The note taking app is a bit of a cross between Google Keep and Apple Notes. It borrows the keyboard driven nature of Google Keep. Was layout of Apple notes and some other Apple notes features like pinning. 

## The app consists of three panes. 

The top pane (Top Pane) consist contains the find search bar. Just like in Google Keep. The left pane (List Pane) contains a list of message headers including the first line of the message, just like Apple notes. And the right pane (Content Pane) contains the content of the message that can be edited like, Apple Notes. 

## The app has three states.

Idle state (IS) is the default state. Nothing is being edited. And the app is waiting for keyboard commands. The last selected message (or first one message in a new session) in the list is selected and it's contents are displayed in the contents pane.

Message Editing state (ES) - message contents are being edited

Search state (SS) - search field is being edited

There is a global message filter (Message Filter) which filters the messages displayed in List Pane

State transictions through Keyboard shortcuts:

App start -> IS

IS -> 'c' -> ES -- Just like Apple Notes A new message is created in the message list with title "new message"

IS -> 'enter' -> ES -- Just like Apple Notes selected message content is editable, cursor is at end of content

ES -> 'esc' or 'cmd/ctrl + enter' -> IS -- edits are saved

IS -> '/' -> SS

SS -> 'enter' -> IS with message filter applied

SS or IS -> 'esc' -> IS with message filter cleared

## Note list item display (Apple Notes style)

Each note in the List Pane shows three pieces of information, following the Apple Notes paradigm:
- **Line 1 (Title)**: The first line of the note content. If the note is blank (no content), display "No Text Entered".
- **Line 2 (Metadata)**: The creation timestamp followed by an abbreviated version of the first line of content. For a new/blank note this shows the timestamp and "No Content".

When a new note is created (via 'c'), it appears in the list with:
- Title: "New Note"
- Second line: creation time + "No Content"
- The editing pane (Content Pane) starts blank — the user types fresh content.

When a note has content, the title updates to reflect the first line of the actual content. If the user deletes all content, the title becomes "No Text Entered".






