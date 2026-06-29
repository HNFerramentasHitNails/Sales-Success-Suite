import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

type Option = { id: string; label: string };

interface Props {
  customerId: string | null;
  orderId: string | null;
  onChange: (next: { customer_id: string | null; order_id: string | null }) => void;
}

export default function EntityPicker({ customerId, orderId, onChange }: Props) {
  const { activeOrg } = useOrganization();
  const [tab, setTab] = useState<"customer" | "order">(orderId ? "order" : "customer");
  const [search, setSearch] = useState("");
  const [opts, setOpts] = useState<Option[]>([]);

  useEffect(() => {
    if (!activeOrg) return;
    const t = setTimeout(async () => {
      if (tab === "customer") {
        let q = supabase
          .from("customers")
          .select("id, name, company_name")
          .eq("organization_id", activeOrg.id)
          .order("name")
          .limit(20);
        if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
        const { data } = await q;
        setOpts(
          (data ?? []).map((r: any) => ({
            id: r.id,
            label: r.company_name ? `${r.name} · ${r.company_name}` : r.name,
          })),
        );
      } else {
        let q = supabase
          .from("orders")
          .select("id, order_number, total, order_date, customers(name)")
          .eq("organization_id", activeOrg.id)
          .order("order_date", { ascending: false })
          .limit(20);
        if (search.trim()) q = q.ilike("order_number", `%${search.trim()}%`);
        const { data } = await q;
        setOpts(
          (data ?? []).map((r: any) => ({
            id: r.id,
            label: `${r.order_number} · ${r.customers?.name ?? "—"} · ${Number(r.total ?? 0).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}`,
          })),
        );
      }
    }, 200);
    return () => clearTimeout(t);
  }, [search, tab, activeOrg?.id]);

  const selected = tab === "customer" ? customerId : orderId;
  const selectedLabel = opts.find((o) => o.id === selected)?.label;

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => {
        setTab(v as any);
        setSearch("");
        onChange({ customer_id: null, order_id: null });
      }}
    >
      <TabsList className="grid grid-cols-2 w-full">
        <TabsTrigger value="customer">Cliente</TabsTrigger>
        <TabsTrigger value="order">Encomenda</TabsTrigger>
      </TabsList>
      <TabsContent value={tab} className="mt-3 space-y-2">
        <Label>{tab === "customer" ? "Pesquisar cliente" : "Pesquisar nº de encomenda"}</Label>
        <Input
          placeholder={tab === "customer" ? "Nome..." : "ENC-..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-40 overflow-y-auto rounded border">
          {opts.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">Sem resultados</div>
          ) : (
            opts.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() =>
                  onChange(
                    tab === "customer"
                      ? { customer_id: o.id, order_id: null }
                      : { customer_id: null, order_id: o.id },
                  )
                }
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${
                  selected === o.id ? "bg-muted font-medium" : ""
                }`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
        {selectedLabel && (
          <div className="text-xs text-muted-foreground">Selecionado: {selectedLabel}</div>
        )}
      </TabsContent>
    </Tabs>
  );
}