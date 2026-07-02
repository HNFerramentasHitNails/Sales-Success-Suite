import { useId } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// A cor primária é guardada como tripleto HSL "H S% L%" (sem hsl(), sem vírgulas),
// para poder ser injetada diretamente na variável CSS --primary (ver OrganizationContext.tsx).

const PRESETS: { name: string; value: string }[] = [
  { name: "Azul-marinho", value: "220 50% 23%" },
  { name: "Azul", value: "217 91% 60%" },
  { name: "Ciano", value: "189 94% 43%" },
  { name: "Esmeralda", value: "160 84% 30%" },
  { name: "Verde", value: "142 71% 35%" },
  { name: "Âmbar", value: "38 92% 50%" },
  { name: "Laranja", value: "24 95% 53%" },
  { name: "Vermelho", value: "0 72% 51%" },
  { name: "Rosa", value: "330 81% 55%" },
  { name: "Roxo", value: "262 83% 58%" },
  { name: "Ardósia", value: "215 25% 27%" },
];

function hslTripletToHex(triplet: string): string | null {
  const m = triplet.trim().match(/^(\d{1,3}(?:\.\d+)?)\s+(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%$/);
  if (!m) return null;
  const h = Number(m[1]);
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const base = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + base) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHslTriplet(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function ColorPickerField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const hex = hslTripletToHex(value) ?? "#1e3a5f";
  const valid = hslTripletToHex(value) !== null;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <label
          className={cn(
            "relative h-10 w-10 shrink-0 rounded-md border overflow-hidden",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          )}
          style={{ background: valid ? `hsl(${value})` : undefined }}
          title="Escolher cor com o seletor"
        >
          <input
            type="color"
            value={hex}
            onChange={(e) => onChange(hexToHslTriplet(e.target.value))}
            disabled={disabled}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            aria-label="Escolher cor primária"
          />
        </label>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="220 50% 23%"
          className="font-mono text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            title={p.name}
            disabled={disabled}
            onClick={() => onChange(p.value)}
            className={cn(
              "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:hover:scale-100",
              value === p.value ? "border-foreground" : "border-transparent",
            )}
            style={{ background: `hsl(${p.value})` }}
          />
        ))}
      </div>
      {!valid && (
        <p className="text-xs text-destructive">Formato inválido — usa "matiz saturação% luminosidade%", ex.: 220 50% 23%.</p>
      )}
    </div>
  );
}

export default ColorPickerField;
