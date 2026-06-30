import LegalLayout from "./LegalLayout";
import { LEGAL } from "@/config/legal";

export default function Acessibilidade() {
  return (
    <LegalLayout title="Declaração de Acessibilidade">
      <p>
        A {LEGAL.entidadeLegal} está empenhada em tornar a plataforma {LEGAL.marcaComercial} acessível ao
        maior número de pessoas possível, em linha com o European Accessibility Act e as Diretrizes de
        Acessibilidade para o Conteúdo Web (WCAG) 2.1, nível AA.
      </p>

      <h2>Medidas adotadas</h2>
      <ul>
        <li>Estrutura semântica com regiões de navegação e conteúdo principal, e ligação "saltar para o conteúdo".</li>
        <li>Navegação por teclado e foco visível nos elementos interativos.</li>
        <li>Formulários com etiquetas associadas aos campos.</li>
        <li>Respeito pela preferência de <i>movimento reduzido</i> do sistema.</li>
        <li>Idioma da página declarado e contraste adequado nos componentes base.</li>
      </ul>

      <h2>Estado de conformidade</h2>
      <p>
        A conformidade é avaliada de forma contínua. Algumas áreas podem ainda não cumprir integralmente o
        nível AA; trabalhamos para corrigir os bloqueios identificados.
      </p>

      <h2>Limitações conhecidas e melhoria contínua</h2>
      <p>
        Realizamos auditorias periódicas (incluindo verificação automática e testes com leitores de ecrã) e
        corrigimos os principais bloqueios de forma prioritária.
      </p>

      <h2>Contacto e mecanismo de resposta</h2>
      <p>
        Se encontrar uma barreira de acessibilidade ou precisar de conteúdo em formato alternativo,
        contacte-nos através de {LEGAL.email}. Comprometemo-nos a responder com a maior brevidade possível.
      </p>
    </LegalLayout>
  );
}
