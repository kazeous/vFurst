"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";

export type CommandMenuItem = {
  href: string;
  label: string;
  group: string;
  description?: string;
  icon?: LucideIcon;
};

export function DashboardCommandMenu({ open, onOpenChange, items }: { open: boolean; onOpenChange: (open: boolean) => void; items: CommandMenuItem[] }) {
  const router = useRouter();
  const groups = Array.from(new Set(items.map((item) => item.group)));

  function select(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="vf-command-overlay" />
        <Dialog.Content className="vf-command-dialog" aria-describedby={undefined}>
          <Dialog.Title className="vf-sr-only">Search navigation</Dialog.Title>
          <Command label="Search dashboard navigation">
            <div className="vf-command-input-wrap">
              <Search size={19} aria-hidden="true" />
              <Command.Input autoFocus placeholder="Go to a page or event…" />
            </div>
            <Command.List className="vf-command-list">
              <Command.Empty className="vf-command-empty">No matching destination.</Command.Empty>
              {groups.map((group) => (
                <Command.Group key={group} heading={group} className="vf-command-group">
                  {items.filter((item) => item.group === group).map((item) => {
                    const Icon = item.icon;

                    return (
                      <Command.Item key={`${group}-${item.href}`} value={`${item.label} ${item.description ?? ""}`} onSelect={() => select(item.href)} className="vf-command-item">
                        {Icon ? <Icon size={18} aria-hidden="true" /> : null}
                        <span>
                          <strong>{item.label}</strong>
                          {item.description ? <small>{item.description}</small> : null}
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
