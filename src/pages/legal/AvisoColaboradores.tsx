import LegalLayout from "./LegalLayout";
import { LEGAL } from "@/config/legal";

export default function AvisoColaboradores() {
  return (
    <LegalLayout title="Aviso de Privacidade para Colaboradores">
      <p>
        Este aviso explica como a {LEGAL.entidadeLegal} (e cada organização cliente, enquanto entidade
        empregadora) trata os dados pessoais dos seus colaboradores e comerciais ao usar a plataforma
        {" "}{LEGAL.marcaComercial}.
      </p>

      <h2>1. Dados tratados</h2>
      <p>
        Dados de identificação e conta, atividade comercial (chamadas, encomendas, comissões), métricas de
        desempenho, objetivos e conquistas (achievements).
      </p>

      <h2>2. Finalidades e base legal</h2>
      <p>
        Gestão da relação de trabalho, organização e avaliação da atividade comercial, cálculo de comissões
        e cumprimento de obrigações legais. A base legal é a execução do contrato, o cumprimento de
        obrigações legais e o interesse legítimo na gestão e melhoria do desempenho comercial.
      </p>

      <h2>3. Proporcionalidade da monitorização</h2>
      <p>
        A monitorização limita-se ao necessário para a gestão comercial. A visibilidade de rankings e
        métricas individuais pode ser restringida (por exemplo, ocultando nomes ou limitando o acesso a
        gestores), de modo a evitar exposição desproporcionada entre colegas.
      </p>

      <h2>4. Conservação</h2>
      <p>
        Os dados são conservados durante a relação de trabalho e pelos prazos legais aplicáveis, sendo
        depois eliminados ou anonimizados.
      </p>

      <h2>5. Direitos</h2>
      <p>
        O colaborador pode exercer os direitos de acesso, retificação, apagamento, limitação, portabilidade
        e oposição, contactando {LEGAL.emailPrivacidade}. Pode ainda reclamar junto da CNPD (www.cnpd.pt).
      </p>

      <h2>6. Agentes independentes</h2>
      <p>
        Quando os comerciais atuem como agentes independentes, aplica-se o regime do contrato de agência
        (DL 178/86) e o cálculo de comissões mantém-se auditável.
      </p>
    </LegalLayout>
  );
}
