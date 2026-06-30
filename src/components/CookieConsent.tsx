import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

const CONSENT_KEY = "cookie_consent_v1";
const CONSENT_VERSION = "1";

export type CookieConsentValue = {
  version: string;
  date: string;
  analytics: boolean;
  marketing: boolean;
};

/** Lê a escolha guardada (ou null se ainda não houver). Use para condicionar scripts. */
export function getCookieConsent(): CookieConsentValue | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as CookieConsentValue;
    if (v.version !== CONSENT_VERSION) return null;
    return v;
  } catch {
    return null;
  }
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    // Mostra o banner apenas se ainda não houver decisão (opt-in por defeito).
    if (!getCookieConsent()) setVisible(true);
    const reopen = () => {
      const cur = getCookieConsent();
      setAnalytics(cur?.analytics ?? false);
      setMarketing(cur?.marketing ?? false);
      setSettingsOpen(true);
    };
    window.addEventListener("app:open-cookie-settings", reopen);
    return () => window.removeEventListener("app:open-cookie-settings", reopen);
  }, []);

  const persist = (value: { analytics: boolean; marketing: boolean }) => {
    const payload: CookieConsentValue = {
      version: CONSENT_VERSION,
      date: new Date().toISOString(),
      analytics: value.analytics,
      marketing: value.marketing,
    };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(payload));
    setVisible(false);
    setSettingsOpen(false);
    // Notifica a app (scripts não essenciais podem reagir a esta escolha).
    window.dispatchEvent(new CustomEvent("app:cookie-consent-updated", { detail: payload }));
  };

  const acceptAll = () => persist({ analytics: true, marketing: true });
  const rejectAll = () => persist({ analytics: false, marketing: false });
  const saveCustom = () => persist({ analytics, marketing });

  return (
    <>
      {visible && (
        <div className="fixed inset-x-0 bottom-0 z-[60] border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="container-app py-4 flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex items-start gap-3 flex-1">
              <Cookie className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">
                Usamos cookies essenciais para o funcionamento do serviço e, com o seu consentimento,
                cookies analíticos e de marketing. Pode aceitar, rejeitar ou escolher.{" "}
                <Link to="/cookies" className="underline hover:text-foreground">Saber mais</Link>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const cur = getCookieConsent();
                  setAnalytics(cur?.analytics ?? false);
                  setMarketing(cur?.marketing ?? false);
                  setSettingsOpen(true);
                }}
              >
                Definições
              </Button>
              <Button variant="outline" size="sm" onClick={rejectAll}>Rejeitar</Button>
              <Button size="sm" onClick={acceptAll}>Aceitar</Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Definições de cookies</DialogTitle>
            <DialogDescription>
              Os cookies essenciais são sempre ativos. Ative apenas as categorias que autoriza.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Essenciais</div>
                <p className="text-xs text-muted-foreground">Necessários ao funcionamento (sessão, segurança).</p>
              </div>
              <Switch checked disabled />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Analíticos</div>
                <p className="text-xs text-muted-foreground">Ajudam a medir e melhorar a utilização.</p>
              </div>
              <Switch checked={analytics} onCheckedChange={setAnalytics} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Marketing</div>
                <p className="text-xs text-muted-foreground">Personalização e medição de campanhas.</p>
              </div>
              <Switch checked={marketing} onCheckedChange={setMarketing} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={rejectAll}>Rejeitar tudo</Button>
            <Button variant="outline" onClick={acceptAll}>Aceitar tudo</Button>
            <Button onClick={saveCustom}>Guardar escolha</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
