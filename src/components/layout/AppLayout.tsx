import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Search } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import AppSidebar from "@/components/layout/AppSidebar";
import OrgSwitcher from "@/components/layout/OrgSwitcher";
import UserMenu from "@/components/layout/UserMenu";
import CommandMenu from "@/components/CommandMenu";

export default function AppLayout() {
  const [cmdOpen, setCmdOpen] = useState(false);
  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Saltar para o conteúdo
      </a>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-1 sm:gap-3 border-b px-2 sm:px-3 bg-card">
            <SidebarTrigger />
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground gap-2 px-2 md:px-3"
              onClick={() => setCmdOpen(true)}
            >
              <Search className="h-4 w-4" />
              <span className="hidden md:inline">Procurar…</span>
              <kbd className="hidden md:inline pointer-events-none ml-2 rounded border bg-muted px-1.5 text-[10px] font-medium">⌘K</kbd>
            </Button>
            <div className="flex-1" />
            <OrgSwitcher />
            <UserMenu />
          </header>
          <main id="main-content" className="flex-1 overflow-auto p-3 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
    </SidebarProvider>
  );
}
