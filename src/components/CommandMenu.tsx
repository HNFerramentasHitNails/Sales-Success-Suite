import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { useOrganization } from "@/contexts/OrganizationContext";
import { visibleGroups } from "@/config/nav";

type Props = { open: boolean; onOpenChange: (o: boolean) => void };

export default function CommandMenu({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { isAdmin, role } = useOrganization();
  const groups = visibleGroups({ isAdmin, role: role ?? null });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const go = (url: string) => { onOpenChange(false); navigate(url); };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Procurar páginas… (ex: campanhas, faturas, WhatsApp)" />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        {groups.map((g) => (
          <CommandGroup key={g.label} heading={g.label}>
            {g.items.map((it) => {
              const Icon = it.icon;
              return (
                <CommandItem key={it.url} value={`${g.label} ${it.title}`} onSelect={() => go(it.url)}>
                  <Icon className="mr-2 h-4 w-4" />
                  {it.title}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
