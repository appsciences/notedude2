"use client";

import React from "react";

export interface NoteEditorProps {
  value: string;
  onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
  onPaste?: React.ClipboardEventHandler<HTMLTextAreaElement>;
  onSelect?: React.ReactEventHandler<HTMLTextAreaElement>;
  editorRef?: React.Ref<HTMLTextAreaElement>;
}

/**
 * The editing textarea. It inherits face, size, and leading from the content pane and draws
 * no chrome of its own, so entering and leaving edit mode does not move a single character.
 *
 * `padding: 0` is load-bearing: it overrides the browser's default 2px on a textarea, which
 * otherwise nudged text down and right on edit and back again on save (#91).
 */
export function NoteEditor({
  value,
  onChange,
  onPaste,
  onSelect,
  editorRef,
}: NoteEditorProps) {
  return (
    <textarea
      ref={editorRef}
      role="textbox"
      value={value}
      onChange={onChange}
      onPaste={onPaste}
      onSelect={onSelect}
      style={{
        width: "100%",
        height: "100%",
        padding: 0,
        border: "none",
        outline: "none",
        resize: "none",
        fontFamily: "inherit",
        fontSize: "inherit",
        lineHeight: "inherit",
        background: "transparent",
        color: "inherit",
      }}
    />
  );
}
