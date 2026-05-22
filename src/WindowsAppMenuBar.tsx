import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getName, getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Button,
  Menu,
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  tokens,
} from "@fluentui/react-components";
import type { MenuOpenChangeData, MenuOpenEvent } from "@fluentui/react-components";
import type { Theme } from "@fluentui/react-theme";
import { AboutDialog } from "./AboutDialog";
import { PRODUCT_HOMEPAGE } from "./productSite";
import { basename } from "./util";
import appIcon from "./assets/app-icon.png";

type BarMenuId = "file" | "help";

/** Slightly larger than `size="small"` body (Base200); still Fluent type ramp. */
const menubarTriggerStyle = {
  fontSize: tokens.fontSizeBase300,
  lineHeight: tokens.lineHeightBase300,
  minWidth: 0,
  alignSelf: "stretch",
  borderRadius: 0,
  paddingLeft: tokens.spacingHorizontalM,
  paddingRight: tokens.spacingHorizontalM,
  paddingTop: 0,
  paddingBottom: 0,
} satisfies CSSProperties;

/** Matches `ABOUT_INTRO` in `src-tauri/src/lib.rs` (AboutMetadata.comments). */
const ABOUT_INTRO = "Desktop app for editing RASOrbit input files.";

export function isWindowsPlatform(): boolean {
  return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
}

export interface WindowsAppMenuBarProps {
  theme: Theme;
  /** A document is currently open in the editor (controls Save/Save As/Close). */
  documentOpen: boolean;
  /** Refetch Open Recent when this changes (e.g. after opening a file). */
  recentListKey: string | null;
}

export function WindowsAppMenuBar({ documentOpen, recentListKey }: WindowsAppMenuBarProps) {
  const [recents, setRecents] = useState<string[]>([]);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutTitle, setAboutTitle] = useState("");
  const [aboutVersion, setAboutVersion] = useState("");
  /** One top-level menu open at a time; hover switches like a native menu bar. */
  const [openMenu, setOpenMenu] = useState<BarMenuId | null>(null);

  const handleMenuOpenChange = useCallback((id: BarMenuId) => {
    return (_: MenuOpenEvent, data: MenuOpenChangeData) => {
      if (data.open) {
        setOpenMenu(id);
      } else {
        setOpenMenu((prev) => (prev === id ? null : prev));
      }
    };
  }, []);

  const handleBarTriggerMouseEnter = useCallback((id: BarMenuId) => {
    return () => {
      setOpenMenu((prev) => (prev !== null ? id : prev));
    };
  }, []);

  const loadRecents = useCallback(() => {
    invoke<string[]>("get_recent_files")
      .then(setRecents)
      .catch(() => setRecents([]));
  }, []);

  useEffect(() => {
    loadRecents();
  }, [loadRecents, recentListKey]);

  const openAbout = async () => {
    const [name, ver] = await Promise.all([getName(), getVersion()]);
    setAboutTitle(name);
    setAboutVersion(ver);
    setAboutOpen(true);
  };

  return (
    <>
      <div
        role="menubar"
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 0,
          minHeight: 36,
          paddingLeft: tokens.spacingHorizontalSNudge,
          paddingRight: tokens.spacingHorizontalSNudge,
          borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
          backgroundColor: tokens.colorNeutralBackground1,
        }}
      >
        <Menu open={openMenu === "file"} onOpenChange={handleMenuOpenChange("file")}>
          <MenuTrigger disableButtonEnhancement>
            <Button
              appearance="subtle"
              size="small"
              style={menubarTriggerStyle}
              onMouseEnter={handleBarTriggerMouseEnter("file")}
            >
              File
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem
                onClick={() => {
                  void emit("menu-new", undefined);
                }}
              >
                New
              </MenuItem>
              <MenuItem
                onClick={() => {
                  void emit("menu-open-dialog", undefined);
                }}
              >
                Open File…
              </MenuItem>
              {recents.length > 0 && (
                <Menu>
                  <MenuTrigger disableButtonEnhancement>
                    <MenuItem>Open Recent</MenuItem>
                  </MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      {recents.map((path) => (
                        <MenuItem
                          key={path}
                          onClick={() => {
                            void emit("request-recent-open", path);
                          }}
                        >
                          {basename(path)}
                        </MenuItem>
                      ))}
                    </MenuList>
                  </MenuPopover>
                </Menu>
              )}
              <MenuDivider />
              <MenuItem
                disabled={!documentOpen}
                onClick={() => {
                  if (documentOpen) void emit("menu-save", undefined);
                }}
              >
                Save
              </MenuItem>
              <MenuItem
                disabled={!documentOpen}
                onClick={() => {
                  if (documentOpen) void emit("menu-save-as", undefined);
                }}
              >
                Save As…
              </MenuItem>
              <MenuDivider />
              <MenuItem
                disabled={!documentOpen}
                onClick={() => {
                  if (documentOpen) void emit("menu-close", undefined);
                }}
              >
                Close
              </MenuItem>
              <MenuDivider />
              <MenuItem
                onClick={() => {
                  void emit("request-close", undefined);
                }}
              >
                Exit
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>

        <Menu open={openMenu === "help"} onOpenChange={handleMenuOpenChange("help")}>
          <MenuTrigger disableButtonEnhancement>
            <Button
              appearance="subtle"
              size="small"
              style={menubarTriggerStyle}
              onMouseEnter={handleBarTriggerMouseEnter("help")}
            >
              Help
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem
                onClick={() => {
                  void openUrl(PRODUCT_HOMEPAGE);
                }}
              >
                Product Site…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  void emit("check-for-new-version", undefined);
                }}
              >
                Check for Updates…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  void openAbout();
                }}
              >
                About…
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>

      <AboutDialog
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        title={aboutTitle}
        version={aboutVersion}
        intro={ABOUT_INTRO}
        productHomepage={PRODUCT_HOMEPAGE}
        icon={<img src={appIcon} width={32} height={32} alt="" style={{ borderRadius: 6 }} />}
        onOpenProductHomepage={() => void openUrl(PRODUCT_HOMEPAGE)}
      />
    </>
  );
}
