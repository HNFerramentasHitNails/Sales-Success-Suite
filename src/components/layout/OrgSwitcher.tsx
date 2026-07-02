import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrganization } from "@/contexts/OrganizationContext";

export default function OrgSwitcher() {
  const { memberships, activeOrg, switchOrg } = useOrganization();
  if (memberships.length <= 1) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" data-tour="header-org-switcher" className="gap-2 px-2 sm:px-3">
          <span className="hidden sm:inline truncate max-w-[160px]">{activeOrg?.name ?? "Organização"}</span>
          <ChevronsUpDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Mudar de organização</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((m) => (
          <DropdownMenuItem key={m.organization_id} onClick={() => switchOrg(m.organization_id)}>
            <span className="flex-1 truncate">{m.organizations.name}</span>
            {activeOrg?.id === m.organization_id && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}