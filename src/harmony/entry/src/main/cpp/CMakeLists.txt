cmake_minimum_required(VERSION 3.11)
project(rnapp)

set(RNOH_APP_DIR "${CMAKE_CURRENT_SOURCE_DIR}")
set(NODE_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../node_modules")
set(RNOH_CPP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../../oh_modules/@rnoh/react-native-openharmony/src/main/cpp")
set(RNOH_GENERATED_DIR "${CMAKE_CURRENT_SOURCE_DIR}/generated")
set(LOG_VERBOSITY_LEVEL 1)
set(CMAKE_ASM_FLAGS "-Wno-error=unused-command-line-argument -Qunused-arguments")
set(CMAKE_CXX_FLAGS "-fstack-protector-strong -Wl,-z,relro,-z,now,-z,noexecstack -s -fPIE -pie")
set(WITH_HITRACE_SYSTRACE ON)
set(WITH_HITRACE_REACT_MARKER ON)
set(OH_MODULES_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../../oh_modules") # required by 'autolink_libraries'

# ffrt::ffrt_cpp shim (created here because hvigor does not pass the
# per-arch ffrt package for every ABI; guarded so hvigor wins if it does)
if(NOT TARGET ffrt::ffrt_cpp)
  add_library(ffrt::ffrt_cpp SHARED IMPORTED)
  set_target_properties(ffrt::ffrt_cpp PROPERTIES
    INTERFACE_INCLUDE_DIRECTORIES "${OH_MODULES_DIR}/.ohpm/@ppd+ffrt@1.1.10/oh_modules/@ppd/ffrt/include"
    IMPORTED_LOCATION "${OH_MODULES_DIR}/.ohpm/@ppd+ffrt@1.1.10/oh_modules/@ppd/ffrt/libs/${OHOS_ARCH}/libffrt_cpp.so")
endif()

add_subdirectory("${RNOH_CPP_DIR}" ./rn)

include("${CMAKE_CURRENT_SOURCE_DIR}/autolinking.cmake")

file(GLOB GENERATED_CPP_FILES "${CMAKE_CURRENT_SOURCE_DIR}/generated/*.cpp") # this line is needed by codegen v1
add_library(rnoh_app SHARED
    ${GENERATED_CPP_FILES}
    "./PackageProvider.cpp"
    "${RNOH_CPP_DIR}/RNOHAppNapiBridge.cpp"
)
target_link_libraries(rnoh_app PUBLIC rnoh)

autolink_libraries(rnoh_app)
