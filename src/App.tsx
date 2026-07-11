import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  open as openTauriDialog,
  save as saveTauriDialog,
  message as showDialogMessage,
} from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-components";
import type { Theme } from "@fluentui/react-theme";
import { UiErrorBoundary } from "./UiErrorBoundary";
import { InputFileEditor } from "./InputFileEditor";
import type { InputFile } from "./InputFile";
import { isWindowsPlatform, WindowsAppMenuBar } from "./WindowsAppMenuBar";
import { UpgradeNotificationBar } from "./UpgradeNotificationBar";
import { basename, errorMessage } from "./util";
import "./App.css";

export interface AppProps {
  theme: Theme;
}

type ConfirmChoice = "save" | "discard" | "cancel";

const APP_TITLE = "RASOrbit Input Editor";

function App({ theme }: AppProps) {
  const [documentPath, setDocumentPath] = useState<string | null>(null);
  const [documentContent, setDocumentContent] = useState<string>("");
  const [documentDirty, setDocumentDirty] = useState(false);
  /** Whether a document is currently being edited (new or opened). */
  const [documentOpen, setDocumentOpen] = useState(false);
  /** Bumps when a new document is opened so the editor remounts from file text. */
  const [editorKey, setEditorKey] = useState(0);
  const [recentListKey, setRecentListKey] = useState<string | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<{
    resolve: (choice: ConfirmChoice) => void;
  } | null>(null);

  // Mirror state in refs so async event handlers always see fresh values.
  const stateRef = useRef({ documentPath, documentContent, documentDirty, documentOpen });
  const documentFileRef = useRef<InputFile | null>(null);
  stateRef.current = { documentPath, documentContent, documentDirty, documentOpen };

  // Native window title reflects current document.
  useEffect(() => {
    let title: string;
    if (documentOpen) {
      const filename = documentPath != null ? basename(documentPath) : "Untitled";
      const dot = documentDirty ? "• " : "";
      title = `${dot}${filename} — ${APP_TITLE}`;
    } else {
      title = APP_TITLE;
    }
    void getCurrentWebviewWindow().setTitle(title).catch(() => {});
  }, [documentPath, documentDirty, documentOpen]);

  // Mirror enable state into Rust so native menu items light up correctly.
  useEffect(() => {
    void invoke("set_document_open", { enabled: documentOpen }).catch(() => {});
  }, [documentOpen]);
  useEffect(() => {
    void invoke("set_document_dirty", { dirty: documentDirty }).catch(() => {});
  }, [documentDirty]);

  const requestConfirm = useCallback((): Promise<ConfirmChoice> => {
    return new Promise((resolve) => setConfirmRequest({ resolve }));
  }, []);

  const finishConfirm = useCallback((choice: ConfirmChoice) => {
    setConfirmRequest((prev) => {
      prev?.resolve(choice);
      return null;
    });
  }, []);

  const saveAs = useCallback(async (): Promise<boolean> => {
    const target = await saveTauriDialog({
      defaultPath: stateRef.current.documentPath ?? undefined,
    });
    if (target == null) return false;
    const file = documentFileRef.current;
    let content = stateRef.current.documentContent;
    if (file) {
      const issues = file.validate();
      if (issues.length > 0) {
        await showDialogMessage(
          "Fix validation errors before saving.",
          { title: "Cannot save file", kind: "error" },
        );
        return false;
      }
      content = file.serialize();
    }
    try {
      await writeTextFile(target, content);
    } catch (e) {
      await showDialogMessage(errorMessage(e), { title: "Cannot save file", kind: "error" });
      return false;
    }
    setDocumentPath(target);
    setDocumentContent(content);
    setDocumentDirty(false);
    try {
      await invoke("add_recent", { path: target });
      setRecentListKey(target);
    } catch {
      /* recents are advisory; ignore failures */
    }
    return true;
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    const path = stateRef.current.documentPath;
    if (path == null) return saveAs();
    const file = documentFileRef.current;
    let content = stateRef.current.documentContent;
    if (file) {
      const issues = file.validate();
      if (issues.length > 0) {
        await showDialogMessage(
          "Fix validation errors before saving.",
          { title: "Cannot save file", kind: "error" },
        );
        return false;
      }
      content = file.serialize();
    }
    try {
      await writeTextFile(path, content);
    } catch (e) {
      await showDialogMessage(errorMessage(e), { title: "Cannot save file", kind: "error" });
      return false;
    }
    setDocumentDirty(false);
    setDocumentContent(content);
    return true;
  }, [saveAs]);

  /** Returns true to proceed with the pending destructive action, false to cancel. */
  const confirmDiscardIfDirty = useCallback(async (): Promise<boolean> => {
    if (!stateRef.current.documentDirty) return true;
    const choice = await requestConfirm();
    if (choice === "save") return save();
    return choice === "discard";
  }, [save, requestConfirm]);

  const loadFile = useCallback(async (path: string): Promise<void> => {
    let content: string;
    try {
      content = await readTextFile(path);
    } catch (e) {
      await showDialogMessage(errorMessage(e), { title: "Cannot open file", kind: "error" });
      return;
    }
    setDocumentPath(path);
    setDocumentContent(content);
    setDocumentDirty(false);
    setDocumentOpen(true);
    documentFileRef.current = null;
    setEditorKey((k) => k + 1);
    try {
      await invoke("add_recent", { path });
      setRecentListKey(path);
    } catch {
      /* recents are advisory */
    }
  }, []);

  const newDoc = useCallback(async () => {
    if (!(await confirmDiscardIfDirty())) return;
    setDocumentPath(null);
    setDocumentContent("");
    setDocumentDirty(false);
    setDocumentOpen(true);
    documentFileRef.current = null;
    setEditorKey((k) => k + 1);
  }, [confirmDiscardIfDirty]);

  const openDocumentDialog = useCallback(async () => {
    if (!(await confirmDiscardIfDirty())) return;
    const selected = await openTauriDialog({ multiple: false });
    if (selected == null) return;
    const path = typeof selected === "string" ? selected : selected[0];
    if (path) await loadFile(path);
  }, [confirmDiscardIfDirty, loadFile]);

  const openRecent = useCallback(
    async (path: string) => {
      if (!(await confirmDiscardIfDirty())) return;
      await loadFile(path);
    },
    [confirmDiscardIfDirty, loadFile],
  );

  const openFromOS = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      if (!(await confirmDiscardIfDirty())) return;
      await loadFile(paths[0]);
    },
    [confirmDiscardIfDirty, loadFile],
  );

  const closeDoc = useCallback(async () => {
    if (!(await confirmDiscardIfDirty())) return;
    setDocumentPath(null);
    setDocumentContent("");
    setDocumentDirty(false);
    setDocumentOpen(false);
    documentFileRef.current = null;
    setEditorKey((k) => k + 1);
  }, [confirmDiscardIfDirty]);

  const handleRequestClose = useCallback(async () => {
    const proceed = await confirmDiscardIfDirty();
    try {
      await invoke("confirm_close", { proceed });
    } catch {
      /* if invoke fails the window simply stays open */
    }
  }, [confirmDiscardIfDirty]);

  // Suppress the browser-style right-click menu.
  useEffect(() => {
    const preventContextMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", preventContextMenu);
    return () => window.removeEventListener("contextmenu", preventContextMenu);
  }, []);

  // Files passed via OS file association at launch.
  useEffect(() => {
    invoke<string[]>("get_pending_open_files")
      .then((paths) => {
        if (paths.length > 0) void loadFile(paths[0]);
      })
      .catch(() => {});
  }, [loadFile]);

  // Wire up all Tauri menu events.
  useLayoutEffect(() => {
    let cancelled = false;
    let unlisteners: (() => void)[] = [];
    (async () => {
      const fns = await Promise.all([
        listen("menu-new", () => {
          void newDoc();
        }),
        listen("menu-open-dialog", () => {
          void openDocumentDialog();
        }),
        listen<string>("request-recent-open", (e) => {
          void openRecent(e.payload);
        }),
        listen<string>("open-file", (e) => {
          void openFromOS([e.payload]);
        }),
        listen<string[]>("open-files", (e) => {
          void openFromOS(e.payload);
        }),
        listen<string[]>("request-open-files", (e) => {
          void openFromOS(e.payload);
        }),
        listen("menu-save", () => {
          void save();
        }),
        listen("menu-save-as", () => {
          void saveAs();
        }),
        listen("menu-close", () => {
          void closeDoc();
        }),
        listen("request-close", () => {
          void handleRequestClose();
        }),
      ]);
      if (cancelled) {
        fns.forEach((u) => u());
        return;
      }
      unlisteners = fns;
    })();
    return () => {
      cancelled = true;
      unlisteners.forEach((u) => u());
    };
  }, [
    newDoc,
    openDocumentDialog,
    openRecent,
    openFromOS,
    save,
    saveAs,
    closeDoc,
    handleRequestClose,
  ]);

  const showWindowsMenu = isWindowsPlatform();

  const shellStyle = {
    display: "flex" as const,
    flexDirection: "column" as const,
    height: "100vh",
    overflow: "hidden" as const,
    backgroundColor: theme.colorNeutralBackground1,
    color: theme.colorNeutralForeground1,
  };

  const mainFlexStyle = {
    flex: 1,
    minHeight: 0,
    overflow: "hidden" as const,
    display: "flex" as const,
    flexDirection: "column" as const,
    backgroundColor: theme.colorNeutralBackground1,
    color: theme.colorNeutralForeground1,
  };

  const menuBar = showWindowsMenu ? (
    <WindowsAppMenuBar
      theme={theme}
      documentOpen={documentOpen}
      recentListKey={recentListKey}
    />
  ) : null;

  const upgradeBar = <UpgradeNotificationBar />;

  const handleEditorChange = useCallback((file: InputFile) => {
    documentFileRef.current = file;
    setDocumentDirty(true);
  }, []);

  const editorBody = documentOpen ? (
    <InputFileEditor
      key={editorKey}
      theme={theme}
      initialText={documentContent}
      onChange={handleEditorChange}
    />
  ) : (
    <div className="empty-state-below-bar">
      <p>Use File → New or File → Open File… to begin.</p>
    </div>
  );

  const confirmDialog = (
    <Dialog
      open={confirmRequest != null}
      onOpenChange={(_, d) => {
        if (!d.open) finishConfirm("cancel");
      }}
    >
      <DialogSurface className="app-dialog-surface" style={{ maxWidth: 420 }}>
        <DialogBody>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogContent>
            Do you want to save your changes before continuing?
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={() => finishConfirm("save")}>
              Save
            </Button>
            <Button appearance="secondary" onClick={() => finishConfirm("discard")}>
              Don&rsquo;t Save
            </Button>
            <Button appearance="secondary" onClick={() => finishConfirm("cancel")}>
              Cancel
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );

  if (!showWindowsMenu) {
    return (
      <main
        className="container"
        style={{
          backgroundColor: theme.colorNeutralBackground1,
          color: theme.colorNeutralForeground1,
        }}
      >
        {upgradeBar}
        <UiErrorBoundary theme={theme}>{editorBody}</UiErrorBoundary>
        {confirmDialog}
      </main>
    );
  }

  return (
    <div style={shellStyle}>
      {menuBar}
      {upgradeBar}
      <main className="container" style={mainFlexStyle}>
        <UiErrorBoundary theme={theme}>{editorBody}</UiErrorBoundary>
      </main>
      {confirmDialog}
    </div>
  );
}

export default App;
