import { useEffect } from 'react';
import type { Property } from '../types/index';
import {
  DEFAULT_SITE_URL,
  buildPropertySeoPath,
  buildDistrictSeoPath
} from '../../../shared/seo';

export interface FaqSchemaItem {
  question: string;
  answer: string;
}

export interface SeoHeadProps {
  title: string;
  description?: string;
  canonicalPath?: string;
  image?: string;
  type?: 'website' | 'place';
  lang?: 'id' | 'en';
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | null;
}

const DEFAULT_SEO_IMAGE =
  'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80';

export function resolveFrontendSiteUrl(): string {
  const configured = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      return origin.replace(/\/+$/, '');
    }
  }
  return DEFAULT_SITE_URL;
}

function upsertMetaTag(attrName: 'name' | 'property', attrValue: string, content: string): void {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(
    `meta[${attrName}="${attrValue}"]`
  ) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonicalLink(href: string): void {
  if (typeof document === 'undefined') return;
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

export function buildLandingJsonLd(params: {
  siteUrl: string;
  properties: Property[];
  selectedProperty: Property | null;
  activeDistrict: string;
  faqs: FaqSchemaItem[];
}): Record<string, unknown> {
  const { siteUrl, properties, selectedProperty, activeDistrict, faqs } = params;
  const graph: Array<Record<string, unknown>> = [
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      name: 'KOSMO Bali',
      url: `${siteUrl}/`,
      inLanguage: ['id-ID', 'en-US'],
      potentialAction: {
        '@type': 'SearchAction',
        target: `${siteUrl}/area/{search_term_string}`,
        'query-input': 'required name=search_term_string'
      }
    },
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: 'KOSMO Bali Co-Living',
      url: `${siteUrl}/`,
      logo: `${siteUrl}/favicon.svg`
    }
  ];

  if (selectedProperty) {
    const propertyUrl = `${siteUrl}${buildPropertySeoPath(selectedProperty)}`;
    const availableRooms = Math.max(
      0,
      (Number(selectedProperty.totalRooms) || 0) - (Number(selectedProperty.occupiedRooms) || 0)
    );
    const propImage =
      selectedProperty.image && !selectedProperty.image.startsWith('data:')
        ? selectedProperty.image
        : DEFAULT_SEO_IMAGE;

    graph.push({
      '@type': 'LodgingBusiness',
      '@id': `${propertyUrl}#lodging`,
      name: selectedProperty.name,
      description: selectedProperty.description,
      url: propertyUrl,
      image: propImage,
      address: {
        '@type': 'PostalAddress',
        streetAddress: selectedProperty.address,
        addressLocality: selectedProperty.district,
        addressRegion: 'Bali',
        addressCountry: 'ID'
      },
      ...(selectedProperty.latitude && selectedProperty.longitude
        ? {
            geo: {
              '@type': 'GeoCoordinates',
              latitude: Number(selectedProperty.latitude),
              longitude: Number(selectedProperty.longitude)
            }
          }
        : {}),
      makesOffer: {
        '@type': 'Offer',
        priceCurrency: 'IDR',
        price: Number(selectedProperty.price) || 0,
        availability:
          availableRooms > 0
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
        url: propertyUrl
      },
      ...(Number(selectedProperty.rating) > 0
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: Number(selectedProperty.rating),
              bestRating: 5,
              reviewCount: 1
            }
          }
        : {})
    });

    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KOSMO Bali', item: `${siteUrl}/` },
        {
          '@type': 'ListItem',
          position: 2,
          name: `Kos di ${selectedProperty.district}`,
          item: `${siteUrl}${buildDistrictSeoPath(selectedProperty.district)}`
        },
        { '@type': 'ListItem', position: 3, name: selectedProperty.name, item: propertyUrl }
      ]
    });
  } else {
    const itemElements = properties.slice(0, 12).map((prop, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: prop.name,
      url: `${siteUrl}${buildPropertySeoPath(prop)}`
    }));

    if (itemElements.length > 0) {
      graph.push({
        '@type': 'ItemList',
        name:
          activeDistrict && activeDistrict !== 'Semua'
            ? `Kos All-Inclusive di ${activeDistrict}, Bali`
            : 'Kos & Co-Living Pilihan di Bali',
        itemListElement: itemElements
      });
    }
  }

  if (faqs.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer
        }
      }))
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph
  };
}

export default function SeoHead({
  title,
  description,
  canonicalPath = '/',
  image,
  type = 'website',
  lang = 'id',
  noindex = false,
  jsonLd = null
}: SeoHeadProps) {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const siteUrl = resolveFrontendSiteUrl();
    const normalizedPath = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`;
    const canonicalUrl = `${siteUrl}${normalizedPath}`;
    const resolvedImage =
      image && image.trim() !== '' && !image.startsWith('data:') ? image : DEFAULT_SEO_IMAGE;

    document.documentElement.lang = lang === 'en' ? 'en' : 'id';
    document.title = title;

    if (description) {
      upsertMetaTag('name', 'description', description);
      upsertMetaTag('property', 'og:description', description);
      upsertMetaTag('name', 'twitter:description', description);
    }

    upsertMetaTag(
      'name',
      'robots',
      noindex
        ? 'noindex, nofollow'
        : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
    );
    upsertCanonicalLink(canonicalUrl);
    upsertMetaTag('property', 'og:title', title);
    upsertMetaTag('property', 'og:type', type);
    upsertMetaTag('property', 'og:url', canonicalUrl);
    upsertMetaTag('property', 'og:image', resolvedImage);
    upsertMetaTag('name', 'twitter:title', title);

    const scriptId = 'kosmo-schema-jsonld';
    let scriptEl = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (jsonLd && !noindex) {
      if (!scriptEl) {
        scriptEl = document.createElement('script');
        scriptEl.id = scriptId;
        scriptEl.type = 'application/ld+json';
        document.head.appendChild(scriptEl);
      }
      scriptEl.textContent = JSON.stringify(jsonLd);
    } else if (scriptEl) {
      scriptEl.remove();
    }
  }, [title, description, canonicalPath, image, type, lang, noindex, jsonLd]);

  return null;
}
