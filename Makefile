SHELL := /bin/sh

.PHONY: help status tree install typecheck lint format build \
	package vsix-package vsix-install vsix-uninstall \
	test test-unit test-integration test-integration-host test-nightly-visual test-package \
	check verify clean distclean f5-note

help:
	@echo "Available targets:"
	@echo "  make help                  - show this help"
	@echo "  make status                - show git status"
	@echo "  make tree                  - show repository files"
	@echo "  make install               - install development dependencies"
	@echo "  make typecheck             - run TypeScript type checking"
	@echo "  make lint                  - run lint checks"
	@echo "  make format                - run formatter"
	@echo "  make build                 - run build"
	@echo "  make package               - build and package the extension as a VSIX"
	@echo "  make vsix-package          - package the extension as a VSIX"
	@echo "  make vsix-install          - install the packaged VSIX into VS Code"
	@echo "  make vsix-uninstall        - uninstall the extension from VS Code"
	@echo "  make test                  - alias for test-unit"
	@echo "  make test-unit             - run unit tests"
	@echo "  make test-integration      - run integration tests"
	@echo "  make test-integration-host - run extension host integration tests"
	@echo "  make test-nightly-visual   - run opt-in nightly visual acceptance"
	@echo "  make test-package          - run VSIX packaging smoke test"
	@echo "  make check                 - run typecheck, lint, and unit tests"
	@echo "  make verify                - run build and all documented test layers"
	@echo "  make clean                 - remove build and local runtime artifacts"
	@echo "  make distclean             - remove clean targets plus installed dependencies"
	@echo "  make f5-note               - show F5 debug usage"

status:
	git status --short --branch

tree:
	find . -maxdepth 2 \
		-not -path './.git*' \
		-not -path './node_modules*' \
		-not -path './dist*' \
		-not -path './out*' \
		-not -path './coverage*' \
		-not -path './.vscode-test*' \
		| sort

install:
	pnpm install

typecheck:
	pnpm run typecheck

lint:
	pnpm run lint

format:
	pnpm run format

build:
	pnpm run build

package: build vsix-package

vsix-package:
	pnpm run package:vsix

vsix-install:
	pnpm run install:vsix

vsix-uninstall:
	pnpm run uninstall:vsix

test: test-unit

test-unit:
	pnpm run test:unit

test-integration:
	pnpm run test:integration

test-integration-host:
	pnpm run test:integration:host

test-nightly-visual:
	MERMAID_GANTT_RUN_NIGHTLY_VISUAL=1 pnpm run test:nightly:visual

test-package:
	pnpm run test:package

check: typecheck lint test-unit

verify: build test-unit test-integration test-integration-host

clean:
	rm -rf dist out coverage .tmp .vscode-test *.vsix

distclean: clean
	rm -rf node_modules

f5-note:
	@echo "F5 debug is launched from VS Code, not from make."
	@echo "Use .vscode/launch.json and the extension debug configuration."

-include Makefile.private
