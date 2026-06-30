import { Link } from "react-router-dom";
import LegalLayout from "./LegalLayout";
import { LEGAL } from "@/config/legal";

export default function TermosCondicoes() {
  return (
    <LegalLayout title="Termos &amp; Condições">
      <h2>1. Objeto</h2>
      <p>
        Estes Termos regulam o acesso e uso da plataforma {LEGAL.marcaComercial}, disponibilizada pela{" "}
        {LEGAL.entidadeLegal}.
      </p>

      <h2>2. Conta e elegibilidade</h2>
      <p>
        O serviço destina-se a empresas e profissionais. O utilizador é responsável pela veracidade dos
        dados e pela confidencialidade das credenciais.
      </p>

      <h2>3. Planos, trial e pagamentos</h2>
      <p>
        Oferecemos um período experimental gratuito de 14 dias. Os planos pagos (Starter, Business,
        Enterprise) são faturados via Stripe nos valores indicados na app, acrescidos de IVA quando
        aplicável. A subscrição renova-se automaticamente pelo período contratado, salvo cancelamento.
      </p>

      <h2>4. Cancelamento e reembolsos</h2>
      <p>
        O cliente pode cancelar a qualquer momento, produzindo efeitos no fim do ciclo de faturação em
        curso. Salvo disposição legal imperativa, os valores já pagos não são reembolsáveis.
      </p>

      <h2>5. Utilização aceitável</h2>
      <p>
        É proibido usar a plataforma para fins ilícitos, envio de comunicações não solicitadas em violação
        da lei, ou tratamento de dados sem base legal. O cliente é o único responsável pela legalidade dos
        dados que carrega e das comunicações que envia (incl. via WhatsApp/Email).
      </p>

      <h2>6. Integrações de terceiros</h2>
      <p>
        A plataforma permite ligar serviços de terceiros (faturação, pagamentos, mensagens, IA). O uso
        desses serviços rege-se também pelos termos dos respetivos fornecedores. O uso de APIs não oficiais
        de mensagens é da exclusiva responsabilidade e risco do cliente.
      </p>

      <h2>7. Propriedade intelectual</h2>
      <p>
        A plataforma e a marca pertencem à {LEGAL.entidadeLegal}. Os dados carregados permanecem propriedade
        do cliente.
      </p>

      <h2>8. Disponibilidade e SLA</h2>
      <p>
        O serviço é prestado "tal como está"; eventuais níveis de serviço (SLA) aplicam-se apenas quando
        expressamente contratados (plano Enterprise).
      </p>

      <h2>9. Limitação de responsabilidade</h2>
      <p>
        Na medida permitida por lei, a nossa responsabilidade total limita-se ao valor pago nos 12 meses
        anteriores ao facto. Não respondemos por lucros cessantes ou danos indiretos.
      </p>

      <h2>10. Proteção de dados</h2>
      <p>
        O tratamento de dados pessoais rege-se pela <Link to="/privacidade">Política de Privacidade</Link> e,
        quando aplicável, pelo <Link to="/dpa">Acordo de Tratamento de Dados</Link>.
      </p>

      <h2>11. Lei e foro</h2>
      <p>
        Aplica-se a lei portuguesa; o foro competente é o da comarca de {LEGAL.comarca}, sem prejuízo das
        normas imperativas de defesa do consumidor.
      </p>

      <h2>12. Alterações</h2>
      <p>
        Podemos alterar estes Termos, notificando os utilizadores com antecedência razoável.
      </p>

      <h2>Anexo — Cláusula da Carteira do Cliente</h2>
      <p>
        O saldo da "carteira" representa <strong>crédito de utilização</strong> atribuído pelo cliente aos
        seus próprios clientes finais (manual, vouchers ou campanhas). Não constitui moeda eletrónica nem
        depósito, não vence juros e, salvo indicação em contrário, <strong>não é reembolsável em dinheiro</strong>.
        O cliente define e comunica aos seus clientes finais as condições de validade e utilização do saldo,
        sendo o único responsável por essa relação.
      </p>
    </LegalLayout>
  );
}
