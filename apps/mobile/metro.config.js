const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// NOTE: hierarchical lookup is intentionally left ENABLED (Metro default).
// Under pnpm's isolated node_modules, a package's dependencies live as
// siblings inside the .pnpm store; disabling hierarchical lookup would stop
// Metro from finding e.g. expo-router's own deps (@expo/metro-runtime).

module.exports = config;
