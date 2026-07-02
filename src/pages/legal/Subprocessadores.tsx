import LegalLayout from "./LegalLayout";

const ROWS = [
  { sub: "Supabase", fim: "Base de dados e autenticação", loc: "UE (eu-west-3, França)", gar: "EEE" },
  { sub: "Vercel", fim: "Alojamento e CDN", loc: "UE (servidores europeus)", gar: "SCC / DPF" },
  { sub: "Stripe", fim: "Pagamentos e faturação", loc: "UE (contrato) / EUA (processamento)", gar: "DPF, com SCC como salvaguarda adicional" },
  { sub: "Resend", fim: "Envio de email", loc: "Portugal (servidores de email)", gar: "SCC / DPF" },
  { sub: "[Fornecedor de IA: DeepSeek / OpenAI / Anthropic]", fim: "Funcionalidades de IA", loc: "[China / EUA — conforme selecionado]", gar: "[SCC / DPF / declaração do cliente]" },
  { sub: "Evolution API / WhatsApp (Meta)", fim: "Mensagens", loc: "Portugal", gar: "N/A (dentro do EEE)" },
  { sub: "Outscraper", fim: "Captação de leads", loc: "EUA", gar: "[SCC — a confirmar]" },
];

export default function Subprocessadores() {
  return (
    <LegalLayout title="Lista de Subprocessadores">
      <p>
        Recorremos aos subprocessadores abaixo para prestar o serviço. A lista é atualizada sempre que há
        alterações relevantes; notificamos os clientes conforme previsto no{" "}
        <a href="/dpa">Acordo de Tratamento de Dados</a>.
      </p>

      <div className="not-prose overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4 font-semibold">Subprocessador</th>
              <th className="py-2 pr-4 font-semibold">Finalidade</th>
              <th className="py-2 pr-4 font-semibold">Localização</th>
              <th className="py-2 font-semibold">Garantia de transferência</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.sub} className="border-b align-top">
                <td className="py-2 pr-4">{r.sub}</td>
                <td className="py-2 pr-4">{r.fim}</td>
                <td className="py-2 pr-4">{r.loc}</td>
                <td className="py-2">{r.gar}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-muted-foreground">
        Atualizar conforme os fornecedores efetivamente ativos. Indicar a data da última atualização.
      </p>
    </LegalLayout>
  );
}
