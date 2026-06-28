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

// Resolve the shared workspace package to its SOURCE (it ships no dist build;
// its package.json "main" points at a non-existent ./dist). This intercept
// runs before normal resolution so the symlinked package's broken main is
// never hit.
const ALIASES = {
  "@lifexp/types": path.resolve(workspaceRoot, "packages/types/src/index.ts"),
  "@lifexp/xp-engine": path.resolve(workspaceRoot, "packages/xp-engine/src/index.ts"),
};
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (ALIASES[moduleName]) {
    return { type: "sourceFile", filePath: ALIASES[moduleName] };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
