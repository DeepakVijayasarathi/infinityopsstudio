"use client";

import * as React from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "tiptap-markdown";
import { Bold, Code, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, Redo2, Strikethrough, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type RichEditorHandle = {
  getMarkdown: () => string;
  setMarkdown: (md: string) => void;
  getSelectionText: () => string;
  replaceSelection: (md: string) => void;
  insertAtEnd: (md: string) => void;
};

type Props = {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
};

function markdownOf(editor: Editor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();
}

/** Rich text editor that reads and writes Markdown. */
export const RichEditor = React.forwardRef<RichEditorHandle, Props>(function RichEditor({ value, onChange, placeholder = "Start writing…", editable = true, className }, ref) {
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow" } } }),
      Placeholder.configure({ placeholder }),
      Markdown.configure({ html: false, tightLists: true, linkify: true, transformPastedText: true }),
    ],
    content: value,
    editorProps: { attributes: { class: "prose-ios tiptap focus:outline-none", "aria-label": "Content editor", role: "textbox", "aria-multiline": "true" } },
    onUpdate: ({ editor }) => onChangeRef.current(markdownOf(editor)),
  });

  React.useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  React.useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => (editor ? markdownOf(editor) : value),
      setMarkdown: (md) => {
        editor?.commands.setContent(md);
        if (editor) onChangeRef.current(markdownOf(editor));
      },
      getSelectionText: () => {
        if (!editor) return "";
        const { from, to } = editor.state.selection;
        return editor.state.doc.textBetween(from, to, "\n\n");
      },
      replaceSelection: (md) => {
        editor?.chain().focus().insertContent(md).run();
      },
      insertAtEnd: (md) => {
        editor?.chain().focus("end").insertContent(`\n\n${md}`).run();
      },
    }),
    [editor, value],
  );

  if (!editor) return <div className={cn("skeleton min-h-[420px] rounded-lg", className)} aria-busy />;

  const btn = (label: string, icon: React.ReactNode, action: () => void, active = false) => (
    <button
      type="button"
      onClick={action}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={!editable}
      className={cn("grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40 [&_svg]:size-4", active && "bg-muted text-foreground")}
    >
      {icon}
    </button>
  );

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (!url) editor.chain().focus().unsetLink().run();
    else if (/^(https?:|mailto:)/.test(url)) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className={cn("rounded-xl border border-border bg-card", className)}>
      <div role="toolbar" aria-label="Formatting" className="sticky top-14 z-10 flex flex-wrap items-center gap-0.5 rounded-t-xl border-b border-border bg-card/95 px-2 py-1.5 backdrop-blur">
        {btn("Heading 2", <Heading2 />, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }))}
        {btn("Heading 3", <Heading3 />, () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive("heading", { level: 3 }))}
        <span className="mx-1 h-5 w-px bg-border" />
        {btn("Bold", <Bold />, () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
        {btn("Italic", <Italic />, () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
        {btn("Strikethrough", <Strikethrough />, () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike"))}
        {btn("Code", <Code />, () => editor.chain().focus().toggleCode().run(), editor.isActive("code"))}
        {btn("Link", <Link2 />, setLink, editor.isActive("link"))}
        <span className="mx-1 h-5 w-px bg-border" />
        {btn("Bulleted list", <List />, () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
        {btn("Numbered list", <ListOrdered />, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
        {btn("Quote", <Quote />, () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"))}
        <span className="mx-1 h-5 w-px bg-border" />
        {btn("Undo", <Undo2 />, () => editor.chain().focus().undo().run())}
        {btn("Redo", <Redo2 />, () => editor.chain().focus().redo().run())}
      </div>
      <div className="px-5 py-4 sm:px-8 sm:py-6">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});
