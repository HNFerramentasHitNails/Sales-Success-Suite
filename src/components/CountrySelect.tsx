import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

// Países fora da UE relevantes para clientes lusófonos / mercados frequentes.
// Lista curta e estática — para mais países pode-se estender no futuro.
const NON_EU: { code: string; name: string; flag: string }[] = [
  { code: "GB", name: "Reino Unido", flag: "🇬🇧" },
  { code: "CH", name: "Suíça", flag: "🇨🇭" },
  { code: "US", name: "Estados Unidos", flag: "🇺🇸" },
  { code: "BR", name: "Brasil", flag: "🇧🇷" },
  { code: "AO", name: "Angola", flag: "🇦🇴" },
  { code: "CV", name: "Cabo Verde", flag: "🇨🇻" },
  { code: "MZ", name: "Moçambique", flag: "🇲🇿" },
  { code: "CA", name: "Canadá", flag: "🇨🇦" },
  { code: "CN", name: "China", flag: "🇨🇳" },
  { code: "AE", name: "Emirados Árabes Unidos", flag: "🇦🇪" },
];

// Converte ISO-2 em emoji bandeira (offset Unicode A=0x1F1E6).
function flagOf(code: string): string {
  if (!code || code.length !== 2) return "🏳️";
  const cc = code.toUpperCase();
  return String.fromCodePoint(
    0x1f1e6 + (cc.charCodeAt(0) - 65),
    0x1f1e6 + (cc.charCodeAt(1) - 65),
  );
}

type EuRow = { country_code: string; country_name: string };
let euCache: EuRow[] | null = null;

type Props = {
  value: string | null | undefined;
  onChange: (code: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
};

export default function CountrySelect({ value, onChange, placeholder = "Selecionar país…", disabled, id }: Props) {
  const [eu, setEu] = useState<EuRow[]>(euCache ?? []);

  useEffect(() => {
    if (euCache) return;
    (async () => {
      const { data } = await supabase
        .from("eu_vat_rates")
        .select("country_code, country_name")
        .order("country_name", { ascending: true });
      if (data) {
        euCache = data as EuRow[];
        setEu(euCache);
      }
    })();
  }, []);

  const v = value ?? "";

  return (
    <Select value={v || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>União Europeia</SelectLabel>
          {eu.map((c) => (
            <SelectItem key={c.country_code} value={c.country_code}>
              {flagOf(c.country_code)} {c.country_name} ({c.country_code})
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Fora da UE</SelectLabel>
          {NON_EU.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.flag} {c.name} ({c.code})
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}