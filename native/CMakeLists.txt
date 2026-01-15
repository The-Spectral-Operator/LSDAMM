# LSDAMM Native Client - CMake Build Configuration
# Lackadaisical Spectral Distributed AI MCP Mesh
#
# Build requirements:
# - MinGW64/GCC or MSVC on Windows
# - GCC or Clang on Linux/macOS
# - NASM for assembly optimizations (optional)
#
# (c) 2025 Lackadaisical Security

cmake_minimum_required(VERSION 3.16)

project(lsdamm-native
    VERSION 1.0.0
    DESCRIPTION "LSDAMM Native Client - Distributed AI Mesh"
    LANGUAGES C)

# Options
option(LSDAMM_USE_ASM "Enable NASM assembly optimizations" OFF)
option(LSDAMM_USE_SSL "Enable OpenSSL for secure connections" ON)
option(LSDAMM_BUILD_TESTS "Build test executables" ON)
option(LSDAMM_BUILD_INSTALLER "Build WiX installer (Windows only)" OFF)

# Set C standard
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Compiler flags
if(MSVC)
    add_compile_options(/W4 /WX- /O2)
    add_definitions(-D_CRT_SECURE_NO_WARNINGS -D_WINSOCK_DEPRECATED_NO_WARNINGS)
else()
    add_compile_options(-Wall -Wextra -O2)
    if(WIN32)
        add_compile_options(-mwindows)
    endif()
endif()

# Windows-specific settings
if(WIN32)
    add_definitions(-DWIN32_LEAN_AND_MEAN -D_WIN32_WINNT=0x0601)
    set(PLATFORM_LIBS ws2_32 ole32 comctl32 shell32)
else()
    set(PLATFORM_LIBS pthread m)
endif()

# Source files
set(CORE_SOURCES
    src/core/main.c
)

set(GUI_SOURCES
    src/gui/main_win.c
)

set(MESH_SOURCES
    src/mesh/swim_gossip.c
    src/mesh/node_coordinator.c
    src/mesh/node_manager.c
)

set(NETWORK_SOURCES
    src/network/websocket.c
)

set(UTIL_SOURCES
    src/util/logging.c
    src/util/config.c
)

# Assembly sources (optional)
if(LSDAMM_USE_ASM AND EXISTS "${CMAKE_SOURCE_DIR}/src/asm")
    enable_language(ASM_NASM)
    set(ASM_SOURCES
        src/asm/aes_ni_x64.asm
        src/asm/chacha_avx2.asm
    )
endif()

# Combine all sources
set(ALL_SOURCES
    ${CORE_SOURCES}
    ${GUI_SOURCES}
    ${MESH_SOURCES}
    ${NETWORK_SOURCES}
    ${UTIL_SOURCES}
    ${ASM_SOURCES}
)

# Include directories
include_directories(
    ${CMAKE_SOURCE_DIR}/src
    ${CMAKE_SOURCE_DIR}/src/core
    ${CMAKE_SOURCE_DIR}/src/gui
    ${CMAKE_SOURCE_DIR}/src/mesh
    ${CMAKE_SOURCE_DIR}/src/network
    ${CMAKE_SOURCE_DIR}/src/util
    ${CMAKE_SOURCE_DIR}/src/crypto
)

# Main executable
if(WIN32)
    add_executable(lsdamm-native WIN32 ${ALL_SOURCES})
else()
    add_executable(lsdamm-native ${ALL_SOURCES})
endif()

target_link_libraries(lsdamm-native ${PLATFORM_LIBS})

# OpenSSL (optional but recommended)
if(LSDAMM_USE_SSL)
    find_package(OpenSSL QUIET)
    if(OpenSSL_FOUND)
        target_link_libraries(lsdamm-native OpenSSL::SSL OpenSSL::Crypto)
        target_compile_definitions(lsdamm-native PRIVATE LSDAMM_USE_SSL)
        message(STATUS "OpenSSL found: ${OPENSSL_VERSION}")
    else()
        message(WARNING "OpenSSL not found, building without SSL support")
    endif()
endif()

# Windows resources
if(WIN32)
    # Generate resource file
    configure_file(
        ${CMAKE_SOURCE_DIR}/installer/assets/resource.rc.in
        ${CMAKE_BINARY_DIR}/resource.rc
        @ONLY
    )
    target_sources(lsdamm-native PRIVATE ${CMAKE_BINARY_DIR}/resource.rc)
endif()

# Tests
if(LSDAMM_BUILD_TESTS)
    enable_testing()
    
    # Test executables
    add_executable(test_swim tests/test_swim.c 
                   src/mesh/swim_gossip.c 
                   src/util/logging.c)
    target_link_libraries(test_swim ${PLATFORM_LIBS})
    add_test(NAME swim_test COMMAND test_swim)
    
    add_executable(test_websocket tests/test_websocket.c
                   src/network/websocket.c
                   src/util/logging.c)
    target_link_libraries(test_websocket ${PLATFORM_LIBS})
    add_test(NAME websocket_test COMMAND test_websocket)
endif()

# Installation
install(TARGETS lsdamm-native
    RUNTIME DESTINATION bin
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
)

install(FILES 
    ${CMAKE_SOURCE_DIR}/../LSDAMM-icon512x512.png
    DESTINATION share/lsdamm
    RENAME icon.png
)

# CPack configuration for packaging
set(CPACK_PACKAGE_NAME "LSDAMM")
set(CPACK_PACKAGE_VENDOR "Lackadaisical Security")
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "Lackadaisical Spectral Distributed AI MCP Mesh")
set(CPACK_PACKAGE_VERSION_MAJOR ${PROJECT_VERSION_MAJOR})
set(CPACK_PACKAGE_VERSION_MINOR ${PROJECT_VERSION_MINOR})
set(CPACK_PACKAGE_VERSION_PATCH ${PROJECT_VERSION_PATCH})
set(CPACK_PACKAGE_INSTALL_DIRECTORY "LSDAMM")

if(WIN32)
    set(CPACK_GENERATOR "WIX")
    set(CPACK_WIX_UPGRADE_GUID "E9F4C5A2-8B7D-4C3E-9F6A-1D2E3F4A5B6C")
    set(CPACK_WIX_PRODUCT_ICON "${CMAKE_SOURCE_DIR}/installer/assets/icon.ico")
    set(CPACK_WIX_UI_BANNER "${CMAKE_SOURCE_DIR}/installer/assets/banner.bmp")
    set(CPACK_WIX_UI_DIALOG "${CMAKE_SOURCE_DIR}/installer/assets/dialog.bmp")
else()
    set(CPACK_GENERATOR "TGZ")
endif()

include(CPack)

# Print build summary
message(STATUS "")
message(STATUS "LSDAMM Native Client Build Configuration")
message(STATUS "========================================")
message(STATUS "Version: ${PROJECT_VERSION}")
message(STATUS "Platform: ${CMAKE_SYSTEM_NAME}")
message(STATUS "Compiler: ${CMAKE_C_COMPILER_ID} ${CMAKE_C_COMPILER_VERSION}")
message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "ASM optimizations: ${LSDAMM_USE_ASM}")
message(STATUS "SSL support: ${LSDAMM_USE_SSL}")
message(STATUS "Build tests: ${LSDAMM_BUILD_TESTS}")
message(STATUS "")
