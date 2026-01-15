# LSDAMM Native Client - Makefile
# Lackadaisical Spectral Distributed AI MCP Mesh
#
# Build with MinGW64/GCC on Windows or GCC/Clang on Linux
#
# Usage:
#   make          - Build release version
#   make debug    - Build debug version
#   make clean    - Clean build artifacts
#   make test     - Run tests
#   make install  - Install to system
#
# (c) 2025 Lackadaisical Security

# Compiler and flags
CC ?= gcc
WINDRES ?= windres
NASM ?= nasm

# Directories
SRC_DIR = src
BUILD_DIR = build
OBJ_DIR = $(BUILD_DIR)/obj
BIN_DIR = $(BUILD_DIR)/bin

# Output
TARGET = lsdamm-native

# Source files
CORE_SRC = $(SRC_DIR)/core/main.c
GUI_SRC = $(SRC_DIR)/gui/main_win.c
MESH_SRC = $(SRC_DIR)/mesh/swim_gossip.c $(SRC_DIR)/mesh/node_coordinator.c $(SRC_DIR)/mesh/node_manager.c
NETWORK_SRC = $(SRC_DIR)/network/websocket.c
UTIL_SRC = $(SRC_DIR)/util/logging.c $(SRC_DIR)/util/config.c

ALL_SRC = $(CORE_SRC) $(GUI_SRC) $(MESH_SRC) $(NETWORK_SRC) $(UTIL_SRC)
ALL_OBJ = $(patsubst $(SRC_DIR)/%.c,$(OBJ_DIR)/%.o,$(ALL_SRC))

# Include paths
INCLUDES = -I$(SRC_DIR) -I$(SRC_DIR)/core -I$(SRC_DIR)/gui -I$(SRC_DIR)/mesh -I$(SRC_DIR)/network -I$(SRC_DIR)/util

# Detect OS
ifeq ($(OS),Windows_NT)
    DETECTED_OS := Windows
    TARGET := $(TARGET).exe
    CFLAGS_PLATFORM = -DWIN32 -D_WIN32_WINNT=0x0601 -mwindows
    LDFLAGS_PLATFORM = -lws2_32 -lole32 -lcomctl32 -lshell32
    RES_OBJ = $(OBJ_DIR)/resource.o
else
    DETECTED_OS := $(shell uname -s)
    CFLAGS_PLATFORM = -DLINUX
    LDFLAGS_PLATFORM = -lpthread -lm
    RES_OBJ =
endif

# Compiler flags
CFLAGS_COMMON = -Wall -Wextra -std=c11 $(INCLUDES)
CFLAGS_RELEASE = $(CFLAGS_COMMON) $(CFLAGS_PLATFORM) -O2 -DNDEBUG
CFLAGS_DEBUG = $(CFLAGS_COMMON) $(CFLAGS_PLATFORM) -g -O0 -DDEBUG

# Default to release build
CFLAGS = $(CFLAGS_RELEASE)

# Linker flags
LDFLAGS = $(LDFLAGS_PLATFORM)

# NASM flags
ifeq ($(DETECTED_OS),Windows)
    NASMFLAGS = -f win64
else ifeq ($(DETECTED_OS),Darwin)
    NASMFLAGS = -f macho64
else
    NASMFLAGS = -f elf64
endif

# Default target
.PHONY: all
all: release

# Release build
.PHONY: release
release: CFLAGS = $(CFLAGS_RELEASE)
release: dirs $(BIN_DIR)/$(TARGET)

# Debug build
.PHONY: debug
debug: CFLAGS = $(CFLAGS_DEBUG)
debug: dirs $(BIN_DIR)/$(TARGET)

# Create directories
.PHONY: dirs
dirs:
	@mkdir -p $(OBJ_DIR)/core
	@mkdir -p $(OBJ_DIR)/gui
	@mkdir -p $(OBJ_DIR)/mesh
	@mkdir -p $(OBJ_DIR)/network
	@mkdir -p $(OBJ_DIR)/util
	@mkdir -p $(OBJ_DIR)/asm
	@mkdir -p $(BIN_DIR)

# Compile C source files
$(OBJ_DIR)/%.o: $(SRC_DIR)/%.c
	@echo "  CC    $<"
	@$(CC) $(CFLAGS) -c $< -o $@

# Compile Windows resource file
ifeq ($(DETECTED_OS),Windows)
$(OBJ_DIR)/resource.o: installer/assets/resource.rc
	@echo "  RC    $<"
	@$(WINDRES) $< -o $@
endif

# Compile NASM assembly files
$(OBJ_DIR)/asm/%.o: $(SRC_DIR)/asm/%.asm
	@echo "  NASM  $<"
	@$(NASM) $(NASMFLAGS) $< -o $@

# Link
$(BIN_DIR)/$(TARGET): $(ALL_OBJ) $(RES_OBJ)
	@echo "  LD    $@"
	@$(CC) $(CFLAGS) $^ -o $@ $(LDFLAGS)
	@echo ""
	@echo "Build complete: $@"

# Clean
.PHONY: clean
clean:
	@echo "Cleaning..."
	@rm -rf $(OBJ_DIR)
	@rm -rf $(BIN_DIR)
	@echo "Done"

# Install
.PHONY: install
install: release
ifeq ($(DETECTED_OS),Windows)
	@echo "Installing to C:\\Program Files\\LSDAMM..."
	@mkdir -p "C:/Program Files/LSDAMM"
	@cp $(BIN_DIR)/$(TARGET) "C:/Program Files/LSDAMM/"
else
	@echo "Installing to /usr/local/bin..."
	@install -m 755 $(BIN_DIR)/$(TARGET) /usr/local/bin/
endif

# Uninstall
.PHONY: uninstall
uninstall:
ifeq ($(DETECTED_OS),Windows)
	@rm -f "C:/Program Files/LSDAMM/$(TARGET)"
else
	@rm -f /usr/local/bin/$(TARGET)
endif

# Run tests
.PHONY: test
test: debug
	@echo "Running tests..."
	@$(CC) $(CFLAGS_DEBUG) tests/test_swim.c $(SRC_DIR)/mesh/swim_gossip.c $(SRC_DIR)/util/logging.c -o $(BIN_DIR)/test_swim $(LDFLAGS)
	@$(BIN_DIR)/test_swim
	@echo "Tests passed"

# Format code
.PHONY: format
format:
	@find $(SRC_DIR) -name "*.c" -o -name "*.h" | xargs clang-format -i

# Print build info
.PHONY: info
info:
	@echo "LSDAMM Native Client Build"
	@echo "=========================="
	@echo "OS:        $(DETECTED_OS)"
	@echo "CC:        $(CC)"
	@echo "CFLAGS:    $(CFLAGS)"
	@echo "LDFLAGS:   $(LDFLAGS)"
	@echo "TARGET:    $(BIN_DIR)/$(TARGET)"
	@echo ""

# Help
.PHONY: help
help:
	@echo "LSDAMM Native Client - Build System"
	@echo ""
	@echo "Targets:"
	@echo "  all       - Build release version (default)"
	@echo "  release   - Build optimized release version"
	@echo "  debug     - Build debug version with symbols"
	@echo "  clean     - Remove build artifacts"
	@echo "  install   - Install to system"
	@echo "  uninstall - Remove from system"
	@echo "  test      - Run unit tests"
	@echo "  format    - Format source code with clang-format"
	@echo "  info      - Print build configuration"
	@echo "  help      - Show this help"
	@echo ""
	@echo "Variables:"
	@echo "  CC        - C compiler (default: gcc)"
	@echo "  NASM      - Assembler for .asm files (default: nasm)"
	@echo ""
