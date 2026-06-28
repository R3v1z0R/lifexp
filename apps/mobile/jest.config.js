module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  // Guard for any future VALUE import of the shared package (current imports
  // are type-only and erased at runtime, but this keeps jest correct if that
  // changes). The package ships source only, so map to its src entry.
  moduleNameMapper: {
    "^@lifexp/types$": "<rootDir>/../../packages/types/src/index.ts",
  },
};
