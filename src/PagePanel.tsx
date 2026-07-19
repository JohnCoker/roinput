import {
  Title3,
  tokens,
} from "@fluentui/react-components";
import type { InputFile, Issue } from "./InputFile";
import type { NavLeaf } from "./navTree";
import { resolvePageCopy } from "./pages";
import { PageForm } from "./PageForm";
import { ProseMarkdown } from "./ProseMarkdown";

interface PagePanelProps {
  file: InputFile;
  selection: NavLeaf;
  issues: Issue[];
  onUpdate: (mutate: (f: InputFile) => void) => void;
}

export function PagePanel({ file, selection, issues, onUpdate }: PagePanelProps) {
  const copy = resolvePageCopy(selection.pageId, file);
  const title = copy?.title ?? selection.pageId;
  const heading = copy?.heading ?? "";
  const footing = copy?.footing ?? "";

  const pageTitle =
    selection.stage !== undefined ? `Stage ${selection.stage}: ${title}` : title;

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        overflow: "auto",
        paddingTop: tokens.spacingVerticalS,
        paddingRight: tokens.spacingHorizontalL,
        paddingBottom: tokens.spacingHorizontalL,
        paddingLeft: tokens.spacingHorizontalL,
      }}
    >
      <div style={{ marginBottom: tokens.spacingVerticalL }}>
        <Title3
          style={{
            marginBottom: heading.trim() ? tokens.spacingVerticalM : 0,
          }}
        >
          {pageTitle}
        </Title3>

        <ProseMarkdown text={heading} variant="heading" />
      </div>

      <PageForm
        file={file}
        selection={selection}
        issues={issues}
        onUpdate={onUpdate}
      />

      <ProseMarkdown text={footing} variant="footing" />
    </div>
  );
}
