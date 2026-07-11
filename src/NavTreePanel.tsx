import { useCallback, useState, type ReactNode } from "react";
import {
  Button,
  Text,
  tokens,
} from "@fluentui/react-components";
import type { Theme } from "@fluentui/react-theme";
import {
  ChevronDown20Regular,
  ChevronRight20Regular,
  Circle20Regular,
  CheckmarkCircle20Filled,
  ErrorCircle20Filled,
} from "@fluentui/react-icons";
import type { NavLeaf, NavNode, NodeStatus } from "./navTree";

const DEPTH_INDENT = 24;
const CHEVRON_WIDTH = 20;

function StatusIcon({
  status,
  theme,
}: {
  status: NodeStatus;
  theme: Theme;
}) {
  const color =
    status === "complete"
      ? theme.colorPaletteGreenForeground1
      : status === "error"
        ? theme.colorPaletteRedForeground1
        : theme.colorNeutralForeground3;
  const Icon =
    status === "complete"
      ? CheckmarkCircle20Filled
      : status === "error"
        ? ErrorCircle20Filled
        : Circle20Regular;
  return <Icon style={{ color, flexShrink: 0 }} aria-hidden />;
}

interface NavTreePanelProps {
  theme: Theme;
  nodes: NavNode[];
  selectedId: string | null;
  onSelect: (leaf: NavLeaf) => void;
}

function TreeRow({
  theme,
  depth,
  selected,
  semibold,
  onClick,
  chevron,
  status,
  label,
}: {
  theme: Theme;
  depth: number;
  selected?: boolean;
  semibold?: boolean;
  onClick: () => void;
  chevron: "none" | "open" | "closed";
  status: NodeStatus;
  label: string;
}) {
  const Chevron =
    chevron === "open"
      ? ChevronDown20Regular
      : chevron === "closed"
        ? ChevronRight20Regular
        : null;

  return (
    <div style={{ paddingLeft: depth * DEPTH_INDENT }}>
      <Button
        appearance={selected ? "subtle" : "transparent"}
        onClick={onClick}
        style={{
          width: "100%",
          justifyContent: "flex-start",
          paddingLeft: tokens.spacingHorizontalS,
          paddingRight: tokens.spacingHorizontalS,
          fontWeight: semibold ? tokens.fontWeightSemibold : tokens.fontWeightRegular,
          backgroundColor: selected ? theme.colorNeutralBackground1Selected : undefined,
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: tokens.spacingHorizontalXS,
            minWidth: 0,
            width: "100%",
          }}
        >
          <span
            style={{
              width: CHEVRON_WIDTH,
              display: "inline-flex",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {Chevron ? <Chevron aria-hidden /> : null}
          </span>
          <StatusIcon status={status} theme={theme} />
          <Text truncate wrap={false} style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
            {label}
          </Text>
        </span>
      </Button>
    </div>
  );
}

export function NavTreePanel({
  theme,
  nodes,
  selectedId,
  onSelect,
}: NavTreePanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    const walk = (list: NavNode[]) => {
      for (const n of list) {
        if (n.kind === "branch") {
          ids.add(n.id);
          walk(n.children);
        }
      }
    };
    walk(nodes);
    return ids;
  });

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const renderNode = (node: NavNode, depth: number): ReactNode => {
    if (node.kind === "leaf") {
      return (
        <TreeRow
          key={node.id}
          theme={theme}
          depth={depth}
          selected={node.id === selectedId}
          onClick={() => onSelect(node)}
          chevron="none"
          status={node.status}
          label={node.label}
        />
      );
    }

    const open = expanded.has(node.id);
    return (
      <div key={node.id} role="group">
        <TreeRow
          theme={theme}
          depth={depth}
          semibold
          onClick={() => toggle(node.id)}
          chevron={open ? "open" : "closed"}
          status={node.status}
          label={node.label}
        />
        {open ? node.children.map((c) => renderNode(c, depth + 1)) : null}
      </div>
    );
  };

  return (
    <nav
      aria-label="Input pages"
      style={{
        width: 280,
        flexShrink: 0,
        overflow: "auto",
        borderRight: `${tokens.strokeWidthThin} solid ${theme.colorNeutralStroke2}`,
        backgroundColor: theme.colorNeutralBackground2,
        paddingTop: tokens.spacingVerticalS,
        paddingBottom: tokens.spacingVerticalS,
      }}
    >
      {nodes.map((n) => renderNode(n, 0))}
    </nav>
  );
}
