<img width="1918" height="944" alt="image" src="https://github.com/user-attachments/assets/cef077f6-38a8-475f-85db-f4b816d40013" />

# GrenGame Showcase

Plataforma gamificada para treinamentos corporativos, publicada como demonstração de portfólio.

## Aviso institucional

Esta versão do GrenGame destina-se exclusivamente a fins de portfólio e registro acadêmico no âmbito da Residência em TIC55 - Apoio à Recuperação do Rio Grande do Sul. Não contém informações ou dados reais do cliente, tampouco representa endosso oficial por parte da Grendene. A plataforma, o código e os conteúdos aqui dispostos não correspondem ao produto final entregue para a empresa e servem apenas como showcase particular.

## Acesso online

- Plataforma: [https://tic55-grengame-showcase.pages.dev/login](https://tic55-grengame-showcase.pages.dev/login)
- API (health): [https://grengame-backend.onrender.com/health/](https://grengame-backend.onrender.com/health/)

## Serviços em produção

- Frontend: Cloudflare Pages
- Backend: Render (Web Service)
- Banco de dados: Supabase (PostgreSQL)
- E-mail transacional: Brevo
- Armazenamento de arquivos: Supabase Storage
- CI/Automação: GitHub Actions (incluindo keepalive do backend)

## Stack de desenvolvimento

- Frontend: React, TypeScript, Vite, CSS
- Backend: Django, Django REST Framework, SimpleJWT
- Banco local/dev: PostgreSQL
- Infra local: Docker e Docker Compose

## Limitações conhecidas

- O backend hospedado no Render pode apresentar _cold start_, adicionando alguns segundos de espera fora do horário de atuação do keepalive.
- O envio de e-mails está sujeito às restrições de cota e políticas do plano gratuito do provedor transacional.
- Em alguns fluxos, a plataforma pode apresentar lentidão pontual de navegação.

## Regras de negócio (resumo)

- Plataforma com trilhas gamificadas, missões, ranking e progresso por usuário.
- Usuários temporários possuem validade de 24h, com expiração automática da conta.
- Dados criados por usuário temporário têm visibilidade restrita ao próprio perfil temporário.
- Usuário temporário pode visualizar conteúdos globais da plataforma, mas sem editar conteúdos que não criou.
- Usuário temporário não pode editar/remover usuários e dados que não sejam de sua autoria.
- Limites por conta temporária:
  - até 2 usuários criados
  - até 1 game criado
  - até 10 missões criadas
  - até 3 critérios de badge no game criado

## Perfis de acesso

- Administrador:
  - Acesso total à plataforma.
- Usuário:
  - Visualização e participação nos games.
  - Personalização do perfil.
  - Acesso ao ranking.
  - Acesso à página de progresso.
- Usuário administrador temporário:
  - Acesso de teste com escopo reduzido.
  - Ações limitadas por cota.
  - Isolamento de visibilidade e edição nos próprios dados.

## Contexto e contribuição

Esta é uma versão particular do projeto para showcase público, mantida neste repositório.

O projeto preserva o histórico de contribuição dos colegas envolvidos durante o desenvolvimento acadêmico na Residência TIC55.

## Reforço institucional

As informações desta versão permanecem restritas ao contexto acadêmico e de portfólio, sem vínculo com dados reais de cliente ou com o produto final entregue à Grendene.

## Reporte de bugs e contato

- Para reportar bugs, abra uma _Issue_ neste repositório com:
  - passo a passo para reproduzir
  - resultado esperado e resultado atual
  - prints/logs, se possível
- Contato: `contato@guifer.tech` - Guilherme Eleuthério
