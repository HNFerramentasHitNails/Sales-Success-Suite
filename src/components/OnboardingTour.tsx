// Tour de boas-vindas: percorre automaticamente as páginas principais na primeira entrada,
// explicando os elementos de cada uma. Não volta a aparecer sozinho depois de fechado/concluído
// (fica gravado em profiles.tour_completed_at) — pode ser revisto a partir do menu do utilizador
// através do evento "app:replay-onboarding-tour".
import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { visibleGroups } from "@/config/nav";
import { ONBOARDING_TOUR, type TourPage } from "@/config/onboardingTour";

function waitForAnySelector(selectors: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (selectors.length === 0) return resolve();
    const found = () => selectors.some((s) => document.querySelector(s));
    if (found()) return resolve();
    const observer = new MutationObserver(() => {
      if (found()) {
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeoutMs);
  });
}

export default function OnboardingTour() {
  const { user } = useAuth();
  const { activeOrg, isAdmin, role, loading: orgLoading } = useOrganization();
  const navigate = useNavigate();
  const location = useLocation();

  const driverRef = useRef<Driver | null>(null);
  const autoStartedRef = useRef(false);
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  const finishTour = useCallback(async () => {
    driverRef.current = null;
    if (!user) return;
    await supabase.from("profiles").update({ tour_completed_at: new Date().toISOString() }).eq("id", user.id);
  }, [user]);

  const goToPage = useCallback(
    async (pages: TourPage[], index: number) => {
      if (index >= pages.length) {
        await finishTour();
        return;
      }
      const page = pages[index];
      if (locationRef.current !== page.path) {
        navigate(page.path);
      }
      const selectors = page.steps.map((s) => s.selector).filter((s): s is string => !!s);
      await waitForAnySelector(selectors, 4000);

      const visibleSteps = page.steps.filter((s) => s.selector === null || document.querySelector(s.selector));
      if (visibleSteps.length === 0) {
        await goToPage(pages, index + 1);
        return;
      }

      const isLastPage = index === pages.length - 1;
      const driveSteps: DriveStep[] = visibleSteps.map((step, i): DriveStep => {
        const isLastStepOfPage = i === visibleSteps.length - 1;
        const isOverallLastStep = isLastPage && isLastStepOfPage;
        return {
          element: step.selector ?? undefined,
          popover: {
            title: step.title,
            description: step.description,
            side: step.side,
            ...(isLastStepOfPage && !isOverallLastStep
              ? {
                  doneBtnText: `${pages[index + 1].label} →`,
                  onDoneClick: (_el, _s, opts) => {
                    opts.driver.destroy();
                    goToPage(pages, index + 1);
                  },
                }
              : {}),
            ...(isOverallLastStep ? { doneBtnText: "Concluir" } : {}),
          },
        };
      });

      const instance = driver({
        allowClose: true,
        overlayOpacity: 0.6,
        stagePadding: 6,
        smoothScroll: true,
        popoverClass: "onboarding-tour-popover",
        nextBtnText: "Seguinte",
        prevBtnText: "Anterior",
        doneBtnText: "Concluir",
        steps: driveSteps,
        onDestroyStarted: (_el, _step, opts) => {
          finishTour();
          opts.driver.destroy();
        },
      });
      driverRef.current = instance;
      instance.drive();
    },
    [finishTour, navigate],
  );

  const startTour = useCallback(() => {
    if (!user) return;
    driverRef.current?.destroy();
    const visibleUrls = new Set(
      visibleGroups({ isAdmin, role: role ?? null }).flatMap((g) => g.items.map((it) => it.url)),
    );
    const pages = ONBOARDING_TOUR.filter((p) => visibleUrls.has(p.path));
    if (pages.length === 0) return;
    goToPage(pages, 0);
  }, [user, isAdmin, role, goToPage]);

  // Arranque automático na primeira entrada (uma vez por sessão de app carregada).
  useEffect(() => {
    if (autoStartedRef.current || orgLoading || !user || !activeOrg) return;
    autoStartedRef.current = true;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("profiles").select("tour_completed_at").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      if (!data?.tour_completed_at) {
        setTimeout(() => {
          if (!cancelled) startTour();
        }, 800);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, activeOrg, orgLoading, startTour]);

  // Rever o tour manualmente (item no menu do utilizador).
  useEffect(() => {
    const handler = () => startTour();
    window.addEventListener("app:replay-onboarding-tour", handler);
    return () => window.removeEventListener("app:replay-onboarding-tour", handler);
  }, [startTour]);

  // Se o componente desmontar a meio de um tour ativo, limpa o driver.
  useEffect(() => () => driverRef.current?.destroy(), []);

  return null;
}
