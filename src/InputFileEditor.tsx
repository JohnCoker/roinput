import { useCallback, useMemo, useState } from "react";
import type { Theme } from "@fluentui/react-theme";
import { applyDerivedValues, cloneInputFile, createDefaultStage } from "./fieldBinding";
import { InputFile } from "./InputFile";
import {
  buildNavTree,
  findNavNode,
  firstLeaf,
  type NavLeaf,
} from "./navTree";
import { NavTreePanel } from "./NavTreePanel";
import { PagePanel } from "./PagePanel";

function emptyDocument(): InputFile {
  const file = new InputFile();
  file.stages = [createDefaultStage()];
  return file;
}

function parseDocument(text: string): InputFile {
  if (!text.trim()) return emptyDocument();
  const { file, report } = InputFile.parse(text);
  if (!report.ok && file.stages.length === 0) return emptyDocument();
  applyDerivedValues(file);
  return file;
}

export interface InputFileEditorProps {
  theme: Theme;
  /** Raw `.dat` text when a document is opened or created. */
  initialText: string;
  /** Called when the user edits the model (not fired on initial load). */
  onChange?: (file: InputFile) => void;
}

export function InputFileEditor({
  theme,
  initialText,
  onChange,
}: InputFileEditorProps) {
  const [file, setFile] = useState(() => parseDocument(initialText));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const issues = useMemo(() => file.validate(), [file]);
  const navTree = useMemo(() => buildNavTree(file, issues), [file, issues]);

  const selection = useMemo(() => {
    if (selectedId) {
      const hit = findNavNode(navTree, selectedId);
      if (hit) return hit;
    }
    return firstLeaf(navTree);
  }, [navTree, selectedId]);

  const handleUpdate = useCallback(
    (mutate: (f: InputFile) => void) => {
      setFile((prev) => {
        const next = cloneInputFile(prev);
        mutate(next);
        applyDerivedValues(next);
        onChange?.(next);
        return next;
      });
    },
    [onChange],
  );

  const handleSelect = (leaf: NavLeaf) => {
    setSelectedId(leaf.id);
  };

  return (
    <div
      className="input-file-editor"
      style={{
        display: "flex",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        backgroundColor: theme.colorNeutralBackground1,
      }}
    >
      <NavTreePanel
        theme={theme}
        nodes={navTree}
        selectedId={selection?.id ?? null}
        onSelect={handleSelect}
      />
      {selection ? (
        <PagePanel
          file={file}
          selection={selection}
          issues={issues}
          onUpdate={handleUpdate}
        />
      ) : (
        <div style={{ flex: 1, padding: 24 }}>No pages to display.</div>
      )}
    </div>
  );
}
