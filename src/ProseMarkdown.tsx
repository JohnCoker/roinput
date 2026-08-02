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
  heading: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    "& > p": {
      marginBottom: 0,
    },
    "& > p:last-child": {
      marginBottom: 0,
    },
    "& > ul": {
      marginBottom: 0,
    },
    "& > ul:last-child": {
      marginBottom: 0,
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
        variant === "heading" ? styles.heading : undefined,
        variant === "footing" ? styles.footing : undefined,
      )}
    >
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}
