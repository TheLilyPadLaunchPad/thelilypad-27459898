import { useEffect } from "react";

interface StructuredData {
  "@context": string;
  "@type": string;
  [key: string]: unknown;
}

interface SEOProps {
  title: string;
  description: string;
  structuredData?: StructuredData;
  /** OG image URL — defaults to '/og-image.png' */
  ogImage?: string;
  /** Canonical URL — defaults to current page URL */
  canonicalUrl?: string;
  /** OG type — defaults to 'website' */
  ogType?: string;
}

const SITE_URL = 'https://thelilypad.lovable.app';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

/** Set or create a meta tag. Returns cleanup function. */
function setMeta(property: string, content: string, attr: 'name' | 'property' = 'property'): void {
  let el = document.querySelector(`meta[${attr}="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export const useSEO = ({ title, description, structuredData, ogImage, canonicalUrl, ogType }: SEOProps) => {
  useEffect(() => {
    // Set document title
    document.title = title;

    // Meta description
    setMeta('description', description, 'name');

    // Open Graph tags
    setMeta('og:title', title);
    setMeta('og:description', description);
    setMeta('og:image', ogImage || DEFAULT_OG_IMAGE);
    setMeta('og:url', canonicalUrl || window.location.href);
    setMeta('og:type', ogType || 'website');

    // Twitter card
    setMeta('twitter:card', 'summary_large_image', 'name');
    setMeta('twitter:title', title, 'name');
    setMeta('twitter:description', description, 'name');
    setMeta('twitter:image', ogImage || DEFAULT_OG_IMAGE, 'name');

    // Canonical link
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl || window.location.href);

    // Handle JSON-LD structured data
    if (structuredData) {
      const existingScript = document.querySelector('script[data-seo-jsonld]');
      if (existingScript) {
        existingScript.remove();
      }

      const script = document.createElement("script");
      script.setAttribute("type", "application/ld+json");
      script.setAttribute("data-seo-jsonld", "true");
      script.textContent = JSON.stringify(structuredData);
      document.head.appendChild(script);
    }

    return () => {
      const existingScript = document.querySelector('script[data-seo-jsonld]');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, [title, description, structuredData, ogImage, canonicalUrl, ogType]);
};

