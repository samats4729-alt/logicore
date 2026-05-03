const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Explicitly allow Metro to resolve modules from the workspace root (shared libs)
// Priority is given to local project modules specifically to avoid hoisting issues.
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
];

// 2. Watch the workspace root so changes in shared packages are detected
config.watchFolders = [workspaceRoot];

// 3. CRITICAL: Disable hierarchical lookup.
// Metro will NOT look in parent directories for modules unless specified in nodeModulesPaths.
// This prevents it from accidentally picking up 'react' from C:\work\logcomp\node_modules
config.resolver.disableHierarchicalLookup = true;

// 4. FORCE ALIASES: Regardless of who asks for 'react', give them OUR version.
config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    'react': path.resolve(projectRoot, 'node_modules/react'),
    'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
    'expo': path.resolve(projectRoot, 'node_modules/expo'),
};

config.resolver.assetExts.push('glb', 'gltf');

module.exports = config;
