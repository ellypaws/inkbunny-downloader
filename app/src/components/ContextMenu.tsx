import { Menu, Portal } from "@mantine/core";
import type { ReactNode } from "react";

export type ContextMenuItem = {
  id: string;
  label: ReactNode;
  leftSection?: ReactNode;
  disabled?: boolean;
  color?: string;
  closeOnClick?: boolean;
  onClick?: () => void;
  customContent?: ReactNode;
};

export type ContextMenuSection = {
  id: string;
  label?: ReactNode;
  items: ContextMenuItem[];
};

type ContextMenuProps = {
  opened: boolean;
  position: {
    x: number;
    y: number;
  } | null;
  sections: ContextMenuSection[];
  onClose: () => void;
  width?: number;
};

export function ContextMenu(props: ContextMenuProps) {
  if (!props.position) {
    return null;
  }

  return (
    <>
      <style>{`
        .app-context-menu-item {
          background: transparent;
        }
        .app-context-menu-item-section {
          color: var(--theme-info);
        }
        .app-context-menu-item[data-hovered],
        .app-context-menu-item:hover {
          background: var(--theme-hover);
          color: var(--theme-title);
        }
        .app-context-menu-item[data-hovered] .app-context-menu-item-section,
        .app-context-menu-item:hover .app-context-menu-item-section {
          color: var(--theme-info-strong);
        }
        .app-context-menu-item[data-disabled],
        .app-context-menu-item[data-disabled]:hover {
          background: transparent;
          color: var(--theme-text-soft);
        }
        .app-context-menu-item[data-disabled] .app-context-menu-item-section,
        .app-context-menu-item[data-disabled]:hover .app-context-menu-item-section {
          color: var(--theme-text-soft);
        }
      `}</style>
      <Portal>
        <Menu
          opened={props.opened}
          onChange={(opened) => {
            if (!opened) {
              props.onClose();
            }
          }}
          closeOnItemClick={false}
          withinPortal={false}
          position="bottom-start"
          offset={8}
          shadow="xl"
          zIndex={1200}
          classNames={{
            item: "app-context-menu-item",
            itemSection: "app-context-menu-item-section",
          }}
          styles={{
            dropdown: {
              width: props.width ?? 248,
              padding: 8,
              borderRadius: 18,
              border: "1px solid var(--theme-border)",
              background:
                "color-mix(in srgb, var(--theme-surface-strong) 88%, white 12%)",
              color: "var(--theme-title)",
              backdropFilter: "blur(18px)",
              boxShadow: "0 18px 42px rgba(0, 0, 0, 0.24)",
            },
            item: {
              minHeight: 38,
              paddingInline: 12,
              paddingBlock: 8,
              borderRadius: 12,
              fontSize: "0.87rem",
              fontWeight: 700,
              color: "var(--theme-title)",
            },
            label: {
              paddingInline: 10,
              paddingBlock: 6,
              fontSize: "0.68rem",
              fontWeight: 900,
              color: "var(--theme-text-soft)",
            },
            divider: {
              borderColor: "var(--theme-border-soft)",
              marginBlock: 6,
            },
          }}
        >
          <Menu.Target>
            <span
              aria-hidden="true"
              style={{
                position: "fixed",
                left: props.position.x,
                top: props.position.y,
                width: 1,
                height: 1,
                pointerEvents: "none",
              }}
            />
          </Menu.Target>

          <Menu.Dropdown onContextMenu={(event) => event.preventDefault()}>
            {props.sections.map((section, index) => (
              <div key={section.id}>
                {section.label ? <Menu.Label>{section.label}</Menu.Label> : null}
                {section.items.map((item) => (
                  item.customContent ? (
                    <div key={item.id} className="px-1 py-1">
                      {item.customContent}
                    </div>
                  ) : (
                    <Menu.Item
                      key={item.id}
                      leftSection={item.leftSection}
                      disabled={item.disabled}
                      color={item.color}
                      closeMenuOnClick={item.closeOnClick !== false}
                      onClick={() => {
                        if (item.disabled) {
                          return;
                        }
                        item.onClick?.();
                        if (item.closeOnClick !== false) {
                          props.onClose();
                        }
                      }}
                    >
                      {item.label}
                    </Menu.Item>
                  )
                ))}
                {index < props.sections.length - 1 ? <Menu.Divider /> : null}
              </div>
            ))}
          </Menu.Dropdown>
        </Menu>
      </Portal>
    </>
  );
}
