import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: ["node_modules/**", "dist-electron/**", "dist/**", "out/**", ".next/**"],
  },
];

export default eslintConfig;
