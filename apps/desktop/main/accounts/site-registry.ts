export interface SiteDefinition {
  site: string;
  label: string;
  loginUrl: string;
  verificationUrl: string;
  cookieDomains: string[];
  requiredCookieNames: string[];
}

const siteDefinitions: SiteDefinition[] = [
  {
    site: "tiktok-shop",
    label: "TikTok Shop",
    loginUrl: "https://seller.tiktok.com/",
    verificationUrl: "https://www.tiktok.com/",
    cookieDomains: ["seller.tiktok.com", ".tiktok.com", "www.tiktok.com"],
    requiredCookieNames: ["sessionid"],
  },
];

export class SiteRegistry {
  public list(): SiteDefinition[] {
    return siteDefinitions.map((site) => ({
      ...site,
      cookieDomains: [...site.cookieDomains],
      requiredCookieNames: [...site.requiredCookieNames],
    }));
  }

  public require(site: string): SiteDefinition {
    const definition = siteDefinitions.find((candidate) => candidate.site === site);

    if (!definition) {
      throw new Error(`Unknown site: ${site}`);
    }

    return {
      ...definition,
      cookieDomains: [...definition.cookieDomains],
      requiredCookieNames: [...definition.requiredCookieNames],
    };
  }
}
