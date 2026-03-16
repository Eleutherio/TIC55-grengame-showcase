
# projeto-grendene
GrenGame é uma plataforma gamificada para treinamentos corporativos.

O projeto foi originalmente desenvolvido durante a Residência TIC55, em um projeto acadêmico realizado em parceria com a empresa Grendene.

A solução utilizará elementos de gamificação (missões, desafios, rankings, recompensas) para transformar o aprendizado em uma experiência dinâmica, colaborativa e divertida, promovendo maior retenção de conhecimento e participação ativa dos funcionários.

Esta versão do repositório é disponibilizada apenas para fins de portfólio e estudo.

---

## Como rodar o projeto com Docker

### Pré-requisitos
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e rodando
- [Git](https://git-scm.com/) instalado
- (Opcional) VS Code ou outro editor de sua preferência

---

### Primeira vez rodando o projeto

1. **Clone o repositório ou atualize sua branch:**
	```bash
	git pull origin main
	```

2. **No terminal, na raiz do projeto (onde está o `docker-compose.yml`), rode:**
	```bash
	docker-compose up --build
	```
	O Docker irá:
	- Baixar as imagens necessárias
	- Criar os containers
	- Instalar dependências do backend automaticamente
	- Instalar dependências do frontend automaticamente
	- Rodar migrações do Django
	- Subir todos os serviços

3. **Crie um superusuário Django (cada dev deve criar o seu):**
	```bash
	docker-compose exec backend python manage.py createsuperuser
	```

4. **Acesse os serviços:**
	- Frontend: [http://localhost:5173/](http://localhost:5173/) (ou via IP da rede LAN, ex: `http://192.168.x.x:5173/`)
	- Backend (API): [http://localhost:8000/](http://localhost:8000/) (ou via IP da rede LAN, ex: `http://192.168.x.x:8000/`)

	> **Acesso via Rede Local (LAN):** O projeto suporta acesso por outros dispositivos na mesma rede Wi-Fi/LAN! Basta usar o IP do computador host no lugar de `localhost`.

---

### Rodando o projeto nas próximas vezes

1. **Suba os serviços:**
	```bash
	docker-compose up
	```
	Ou, para rodar em segundo plano:
	```bash
	docker-compose up -d
	```

2. **Para parar o projeto:**
	```bash
	docker-compose down
	```

3. **Se mudar dependências do backend (`requirements.txt`):**
	```bash
	docker-compose up --build backend
	```

4. **Se mudar models do Django:**
	```bash
	docker-compose exec backend python manage.py makemigrations
	docker-compose exec backend python manage.py migrate
	```

---

### Observações importantes
- Nunca commite o arquivo `.env` real, apenas `.env.example`.
- Cada dev deve criar seu próprio superusuário local.
- Para rodar comandos Django, sempre use `docker-compose exec backend ...`.
- Se precisar de mais comandos ou dúvidas, consulte este README ou peça ajuda no time!

---

## Estrategia de update e rollback (Compose/Portainer)

Objetivo: permitir atualizacao e rollback sem rebuild no servidor.

### Padrao de versionamento
- Nao usar `latest` para backend/frontend.
- Publicar imagens com tags imutaveis (exemplo: `1.0.0`, `1.0.1`).
- O `docker-compose.yml` aceita variaveis para imagem/tag:
  - `BACKEND_IMAGE` e `BACKEND_TAG`
  - `FRONTEND_IMAGE` e `FRONTEND_TAG`

### Atualizacao
1. Defina as tags alvo no ambiente (ou no Portainer Stack Environment).
2. Puxe as imagens novas:
   ```bash
   docker compose pull backend frontend
   ```
3. Aplique a nova versao sem rebuild:
   ```bash
   docker compose up -d --no-build backend frontend
   ```

### Rollback
1. Volte `BACKEND_TAG` e `FRONTEND_TAG` para a versao anterior.
2. Reaplique os servicos:
   ```bash
   docker compose pull backend frontend
   docker compose up -d --no-build backend frontend
   ```

### Exemplo de variaveis
```env
BACKEND_IMAGE=ghcr.io/sua-org/grengame-backend
BACKEND_TAG=1.0.3
FRONTEND_IMAGE=ghcr.io/sua-org/grengame-frontend
FRONTEND_TAG=1.0.3
```
