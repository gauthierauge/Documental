# Raccourcis vers les scripts de package.json, qui restent la source de vérité.
# `make` seul liste les commandes. Chaque cible tient en une ligne : `bun run <script>`.

.DEFAULT_GOAL := help
SHELL := /bin/bash
# La version de Bun du projet (.bun-version) : majeure et mineure suffisent.
BUN_MIN := $(shell cut -d. -f1,2 .bun-version 2>/dev/null)
# Le fichier vérifié par `make env-check` : make env-check FICHIER=.env.production
FICHIER ?= .env

.PHONY: help
help: ## Liste des commandes
	@awk 'BEGIN { FS = ":.*## " } /^[a-z][a-z0-9-]*:.*## / { printf "  make %-12s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

.PHONY: install
install: ## Installe les dépendances (vérifie d'abord la version de Bun)
	@command -v bun >/dev/null || { echo "Bun $(BUN_MIN) ou plus est nécessaire : https://bun.sh"; exit 1; }
	@v="$$(bun --version)"; if [ "$$(printf '%s\n' "$(BUN_MIN)" "$$v" | sort -V | head -n 1)" != "$(BUN_MIN)" ]; then \
	  echo "Bun $(BUN_MIN) ou plus est nécessaire (installé : $$v). Lance \`bun upgrade\`."; exit 1; fi
	bun install

.env:
	bun run env:init

.PHONY: env
env: ## Crée le .env de développement, ou le complète (secrets tirés au hasard)
	bun run env:init

.PHONY: dev
dev: .env ## Lance le projet en développement
	bun run dev

.PHONY: check
check: ## Tests en miroir, types, lint, tests, build : la porte de la CI
	bun run check

.PHONY: lint
lint: ## Format, lint et types (vp check), puis les règles du projet
	bun run lint

.PHONY: fix
fix: ## Corrige le format et ce que le lint sait corriger (vp check --fix)
	bun run format

.PHONY: test
test: ## Lance les tests
	bun run test

.PHONY: build
build: ## Construit le livrable
	bun run build

.PHONY: db-generate
db-generate: ## Écrit la migration après un changement de schéma
	bun run db:generate

.PHONY: db-migrate
db-migrate: ## Applique les migrations à la base
	bun run db:migrate

.PHONY: mail-dns-check
mail-dns-check: ## Lit SPF, DKIM et DMARC du domaine d'envoi (FICHIER=…, DKIM=nom1,nom2 pour Brevo)
	bun run mail:dns-check $(FICHIER) $(if $(DKIM),--dkim=$(DKIM))

.PHONY: up
up: ## Lance l'app et sa base dans Docker, comme en production
	bun run docker:up

.PHONY: down
down: ## Arrête les conteneurs
	bun run docker:down

.PHONY: logs
logs: ## Suit les journaux des conteneurs
	bun run docker:logs

.PHONY: smoke
smoke: ## Vérifie que l'image démarre et répond
	bun run docker:smoke

.PHONY: env-check
env-check: ## Vérifie un fichier de production (FICHIER=.env.production, défaut .env)
	bun run env:check $(FICHIER)

.PHONY: audit
audit: ## Audit des dépendances
	bun run audit

.PHONY: clean
clean: ## Supprime les fichiers construits
	bun run clean
