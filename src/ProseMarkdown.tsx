import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import ReactMarkdown from "react-markdown";

const useStyles = makeStyles({
  prose: {
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    "& > p": {
      marginTop: 0,
      marginBottom: tokens.spacingVerticalM,
    },
    "& > p:last-child": {
      marginBottom: 0,
    },
    "& > ul": {
      marginTop: 0,
      marginBottom: tokens.spacingVerticalM,
      paddingLeft: tokens.spacingHorizontalXL,
    },
    "& > ul:last-child": {
      marginBottom: 0,
    },
    "& li": {
      marginBottom: tokens.spacingVerticalXS,
    },
    "& li:last-child": {
      marginBottom: 0,
    },
    "& strong": {
      fontWeight: tokens.fontWeightSemibold,
    },
  },
  footing: {
    marginTop: tokens.spacingVerticalL,
    color: tokens.colorNeutralForeground2,
  },
});

interface ProseMarkdownProps {
  text: string;
  variant?: "heading" | "footing";
}

/** Renders page heading/footing copy from pages.csv (light Markdown: bold, lists, paragraphs). */
export function ProseMarkdown({ text, variant = "heading" }: ProseMarkdownProps) {
  const styles = useStyles();
  if (!text.trim()) return null;

  return (
    <div
      className={mergeClasses(
        styles.prose,
        variant === "footing" ? styles.footing : undefined,
      )}
    >
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}
