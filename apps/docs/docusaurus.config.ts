import type { Config } from "@docusaurus/types";
import type { Preset } from "@docusaurus/preset-classic";

const config: Config = {
  title: "vFurst Docs",
  tagline: "Convention API and integration docs",
  favicon: "img/favicon.ico",
  url: "https://docs.vfurst.app",
  baseUrl: "/",
  organizationName: "vfurst",
  projectName: "vfurst",
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn"
    }
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en"]
  },
  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "/"
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css"
        }
      } satisfies Preset.Options
    ]
  ],
  themeConfig: {
    navbar: {
      title: "vFurst Docs",
      items: [
        {
          type: "docSidebar",
          sidebarId: "main",
          position: "left",
          label: "Guides"
        },
        {
          href: "https://vfurst.app/api/v1/openapi.json",
          label: "OpenAPI",
          position: "right"
        }
      ]
    },
    footer: {
      style: "dark",
      copyright: `Copyright ${new Date().getFullYear()} vFurst`
    }
  }
};

export default config;
