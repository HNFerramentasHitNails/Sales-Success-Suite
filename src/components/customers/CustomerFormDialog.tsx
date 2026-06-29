import { FormEvent, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import CountrySelect from "@/components/CountrySelect";

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type TagDef = Database["public"]["Tables"]["customer_tag_definitions"]["Row"];

export type MemberOption = { id: string; label: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: Customer | null;
  tagDefs: TagDef[];
  members: MemberOption[];
  onSaved: () => void;
  onTagsChanged: () => void;
};

export default function CustomerFormDialog({ open, onOpenChange, customer, tagDefs, members, onSaved, onTagsChanged }: Props) {
  const { activeOrg } = useOrganization();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [customerClasses, setCustomerClasses] = useState<{ id: string; name: string }[]>([]);
  const [segmentColors, setSegmentColors] = useState<Record<string, string>>({});
  const [vatBusy, setVatBusy] = useState(false);
  const [vatResult, setVatResult] = useState<
    | null
    | {
        checksum_valid: boolean | null;
        vies_valid: boolean | null;
        name: string | null;
        service_available: boolean;
      }
  >(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company_name: "",
    vat_number: "",
    country: "",
    customer_type: "",
    segment: "",
    assigned_member_id: "",
    address: "",
    city: "",
    postal_code: "",
    notes_short: "",
    is_active: true,
    tags: [] as string[],
    // Morada de entrega (Fase 2 IVA intracomunitário)
    shipping_same_as_billing: true,
    shipping_address: "",
    shipping_city: "",
    shipping_postal_code: "",
    shipping_country: "",
    customer_class_id: "",
  });
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#64748b");

  useEffect(() => {
    if (open) {
      setVatResult(null);
      if (activeOrg) {
        supabase.from("customer_classes").select("id, name").eq("organization_id", activeOrg.id).order("sort_order").order("name")
          .then(({ data }) => setCustomerClasses((data ?? []) as { id: string; name: string }[]));
        supabase.from("rfm_segments" as any).select("name, color").eq("organization_id", activeOrg.id)
          .then(({ data }) => {
            const map: Record<string, string> = {};
            (((data ?? []) as unknown) as Array<{ name: string; color: string | null }>).forEach((s) => {
              if (s.name) map[s.name] = s.color || "#64748b";
            });
            setSegmentColors(map);
          });
      }
      if (customer) {
        setForm({
          name: customer.name ?? "",
          email: customer.email ?? "",
          phone: customer.phone ?? "",
          company_name: customer.company_name ?? "",
          vat_number: customer.vat_number ?? "",
          country: customer.country ?? activeOrg?.country ?? "PT",
          customer_type: customer.customer_type ?? "",
          segment: customer.segment ?? "",
          assigned_member_id: customer.assigned_member_id ?? "",
          address: customer.address ?? "",
          city: customer.city ?? "",
          postal_code: customer.postal_code ?? "",
          notes_short: customer.notes_short ?? "",
          is_active: customer.is_active,
          tags: customer.tags ?? [],
          shipping_same_as_billing: (customer as any).shipping_same_as_billing ?? true,
          shipping_address: (customer as any).shipping_address ?? "",
          shipping_city: (customer as any).shipping_city ?? "",
          shipping_postal_code: (customer as any).shipping_postal_code ?? "",
          shipping_country: (customer as any).shipping_country ?? "",
          customer_class_id: (customer as any).customer_class_id ?? "",
        });
      } else {
        setForm((f) => ({ ...f, name: "", email: "", phone: "", company_name: "", vat_number: "",
          country: activeOrg?.country ?? "PT", customer_type: "", segment: "", assigned_member_id: "",
          address: "", city: "", postal_code: "", notes_short: "", is_active: true, tags: [],
          shipping_same_as_billing: true, shipping_address: "", shipping_city: "",
          shipping_postal_code: "", shipping_country: "", customer_class_id: "" }));
      }
    }
  }, [open, customer, activeOrg]);

  const toggleTag = (name: string) => {
    setForm((f) => ({ ...f, tags: f.tags.includes(name) ? f.tags.filter((t) => t !== name) : [...f.tags, name] }));
  };

  const createTag = async () => {
    if (!activeOrg || !newTagName.trim()) return;
    const { error } = await supabase.from("customer_tag_definitions").insert({
      organization_id: activeOrg.id,
      name: newTagName.trim(),
      color: newTagColor,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setForm((f) => ({ ...f, tags: [...f.tags, newTagName.trim()] }));
    setNewTagName("");
    onTagsChanged();
  };

  const validateVat = async () => {
    if (!form.vat_number.trim()) {
      toast({ title: "Indique um NIF para validar", variant: "destructive" });
      return;
    }
    setVatBusy(true);
    setVatResult(null);
    const country_code = (form.country?.trim() || "PT").toUpperCase();
    const { data, error } = await supabase.functions.invoke("validate-vat", {
      body: { country_code, vat_number: form.vat_number.trim() },
    });
    if (error) {
      setVatBusy(false);
      toast({ title: "Erro ao validar", description: error.message, variant: "destructive" });
      return;
    }
    const res = data as {
      checksum_valid: boolean | null;
      vies_valid: boolean | null;
      name: string | null;
      service_available: boolean;
    };
    setVatResult(res);
    // Persist on the customer (if editing existing record)
    const isValid = res.vies_valid === true || (res.service_available === false && res.checksum_valid === true);
    if (customer) {
      const { error: upErr } = await supabase
        .from("customers")
        .update({
          vat_valid: res.vies_valid,
          vat_validated_at: new Date().toISOString(),
          vat_validated_name: res.name,
        })
        .eq("id", customer.id);
      if (upErr) {
        toast({ title: "Erro a guardar validação", description: upErr.message, variant: "destructive" });
      } else {
        onSaved();
      }
    }
    setVatBusy(false);
    if (!res.service_available) {
      toast({
        title: "Serviço VIES indisponível",
        description: res.checksum_valid === true ? "O dígito de controlo local está OK." : undefined,
      });
    } else {
      toast({
        title: res.vies_valid ? "NIF válido (VIES)" : "NIF inválido",
        description: res.name ?? undefined,
        variant: res.vies_valid ? "default" : "destructive",
      });
    }
    void isValid;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeOrg || !user) return;
    if (!form.name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setBusy(true);
    const payload = {
      organization_id: activeOrg.id,
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      company_name: form.company_name.trim() || null,
      vat_number: form.vat_number.trim() || null,
      country: form.country.trim() || null,
      customer_type: form.customer_type.trim() || null,
      assigned_member_id: form.assigned_member_id || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      postal_code: form.postal_code.trim() || null,
      notes_short: form.notes_short.trim() || null,
      is_active: form.is_active,
      tags: form.tags,
      // Morada de entrega: quando "igual à faturação", limpamos shipping_*
      shipping_same_as_billing: form.shipping_same_as_billing,
      shipping_address: form.shipping_same_as_billing ? null : (form.shipping_address.trim() || null),
      shipping_city: form.shipping_same_as_billing ? null : (form.shipping_city.trim() || null),
      shipping_postal_code: form.shipping_same_as_billing ? null : (form.shipping_postal_code.trim() || null),
      shipping_country: form.shipping_same_as_billing ? null : (form.shipping_country.trim() || null),
      customer_class_id: form.customer_class_id || null,
    };
    const { error } = customer
      ? await supabase.from("customers").update(payload).eq("id", customer.id)
      : await supabase.from("customers").insert({ ...payload, created_by: user.id });
    setBusy(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: customer ? "Cliente atualizado" : "Cliente criado" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer ? "Editar cliente" : "Novo cliente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={200} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={200} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={50} />
            </div>
            <div>
              <Label>Empresa</Label>
              <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} maxLength={200} />
            </div>
            <div>
              <Label>NIF</Label>
              <div className="flex gap-2">
                <Input
                  value={form.vat_number}
                  onChange={(e) => {
                    setForm({ ...form, vat_number: e.target.value });
                    setVatResult(null);
                  }}
                  maxLength={50}
                />
                <Button type="button" variant="outline" onClick={validateVat} disabled={vatBusy || !form.vat_number.trim()}>
                  {vatBusy ? "A validar…" : "Validar NIF/VIES"}
                </Button>
              </div>
              {vatResult && (
                <div className="mt-1 text-xs">
                  {!vatResult.service_available ? (
                    <span className="text-muted-foreground">
                      ⚠ Serviço VIES indisponível
                      {vatResult.checksum_valid === true ? " · checksum local OK" : vatResult.checksum_valid === false ? " · checksum local inválido" : ""}
                    </span>
                  ) : vatResult.vies_valid ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ✓ NIF válido{vatResult.name ? ` · ${vatResult.name}` : ""}
                    </span>
                  ) : (
                    <span className="text-destructive">✗ NIF inválido</span>
                  )}
                </div>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                NIF válido no VIES permite isenção por autoliquidação em vendas intra-UE.
              </p>
            </div>
            <div>
              <Label>Tipo de cliente</Label>
              <Input value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })} placeholder="ex.: particular, empresa" maxLength={50} />
            </div>
            <div>
              <Label>Segmento</Label>
              {form.segment ? (
                <div>
                  <Badge style={{ backgroundColor: segmentColors[form.segment] || "#64748b", color: "#fff" }}>
                    {form.segment}
                  </Badge>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">—</div>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">Calculado automaticamente (RFM)</p>
            </div>
            <div>
              <Label>Classe de cliente</Label>
              <Select value={form.customer_class_id || "__none__"} onValueChange={(v) => setForm({ ...form, customer_class_id: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="— Nenhuma —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhuma —</SelectItem>
                  {customerClasses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Comercial atribuído</Label>
              <Select value={form.assigned_member_id || "__none__"} onValueChange={(v) => setForm({ ...form, assigned_member_id: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhum —</SelectItem>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>País</Label>
              <CountrySelect value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
            </div>
            <div className="md:col-span-2">
              <Label>Morada</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={300} />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} maxLength={100} />
            </div>
            <div>
              <Label>Código Postal</Label>
              <Input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} maxLength={20} />
            </div>
            <div className="md:col-span-2">
              <Label>Notas curtas</Label>
              <Textarea value={form.notes_short} onChange={(e) => setForm({ ...form, notes_short: e.target.value })} maxLength={500} rows={2} />
            </div>
          </div>

          {/* Morada de entrega — usada como destino fiscal (OSS / regras intra-UE). */}
          <div className="space-y-3 border rounded p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">Morada de entrega</Label>
                <p className="text-xs text-muted-foreground">
                  O destino da entrega pode determinar o regime de IVA aplicável.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Igual à de faturação</span>
                <Switch
                  checked={form.shipping_same_as_billing}
                  onCheckedChange={(v) => setForm({ ...form, shipping_same_as_billing: v })}
                />
              </div>
            </div>
            {!form.shipping_same_as_billing && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <Label>Morada</Label>
                  <Input value={form.shipping_address} onChange={(e) => setForm({ ...form, shipping_address: e.target.value })} maxLength={300} />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={form.shipping_city} onChange={(e) => setForm({ ...form, shipping_city: e.target.value })} maxLength={100} />
                </div>
                <div>
                  <Label>Código Postal</Label>
                  <Input value={form.shipping_postal_code} onChange={(e) => setForm({ ...form, shipping_postal_code: e.target.value })} maxLength={20} />
                </div>
                <div className="md:col-span-2">
                  <Label>País</Label>
                  <CountrySelect value={form.shipping_country} onChange={(v) => setForm({ ...form, shipping_country: v })} />
                </div>
              </div>
            )}
          </div>

          <div>
            <Label>Etiquetas</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {tagDefs.map((t) => {
                const on = form.tags.includes(t.name);
                return (
                  <button type="button" key={t.id} onClick={() => toggleTag(t.name)}
                    className={`px-2 py-1 rounded-full text-xs border transition ${on ? "border-transparent text-white" : "border-border text-foreground"}`}
                    style={on ? { backgroundColor: t.color } : { backgroundColor: "transparent" }}>
                    {t.name}
                  </button>
                );
              })}
              {form.tags.filter((t) => !tagDefs.find((d) => d.name === t)).map((t) => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t} <X className="h-3 w-3 cursor-pointer" onClick={() => toggleTag(t)} />
                </Badge>
              ))}
            </div>
            <div className="flex gap-2 mt-2 items-center">
              <Input placeholder="Nova etiqueta" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} maxLength={40} className="max-w-xs" />
              <input type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)} className="h-9 w-12 rounded border" />
              <Button type="button" variant="outline" size="sm" onClick={createTag} disabled={!newTagName.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Criar
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{customer ? "Guardar" : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}