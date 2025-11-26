VENV_DIR := .venv

PYTHON := $(VENV_DIR)/bin/python3

.PHONY: all install run-slither clean

all: install

$(VENV_DIR):
	@echo "--- Creating Python virtual environment in $(VENV_DIR) ---"
	@python3 -m venv $(VENV_DIR)

install: $(VENV_DIR)
	@echo "--- Installing slither-analyzer ---"
	@$(PYTHON) -m pip install slither-analyzer

run-slither:
	@echo "--- Running Slither on current directory ---"
	@$(PYTHON) -m slither .

clean:
	@echo "--- Cleaning up project ---"
	@rm -rf $(VENV_DIR)
	@find . -type f -name '*.pyc' -delete
	@find . -type d -name '__pycache__' -delete