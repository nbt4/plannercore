import { useEffect, useState } from 'react';

export interface BrandingAssets {
  markOnDark: string; markOnLight: string;
  horizontalOnDark: string; horizontalOnLight: string;
  stackedOnDark: string; stackedOnLight: string;
  favicon: string; appIcon: string; maskableIcon: string; print: string;
}

export interface BrandingConfig {
  productName: string; companyName: string; brandName: string;
  assets: BrandingAssets; companyAssets: Partial<BrandingAssets>;
}

const mounted = window.location.pathname === '/planner' || window.location.pathname.startsWith('/planner/');
const base = mounted ? '/planner' : '';
const logo = (name: string) => `${base}/logos/${name}`;
const icon = (name: string) => `${base}/app-icons/${name}`;

const defaults: BrandingConfig = {
  productName: 'PlannerCore', companyName: 'Cores', brandName: '',
  assets: {
    markOnDark: logo('plannercore_white_icon.svg'), markOnLight: logo('plannercore_black_icon.svg'),
    horizontalOnDark: logo('plannercore_white_side.svg'), horizontalOnLight: logo('plannercore_black_side.svg'),
    stackedOnDark: logo('plannercore_white_full.svg'), stackedOnLight: logo('plannercore_black_full.svg'),
    favicon: logo('plannercore_black_icon.svg'), appIcon: icon('icon-512.png'),
    maskableIcon: icon('icon-maskable-512.png'), print: logo('plannercore_black_side.svg'),
  }, companyAssets: {},
};

let cached = defaults;
let started = false;
const listeners = new Set<(value: BrandingConfig) => void>();

function applyDocumentBranding(value: BrandingConfig) {
  const setLink = (selector: string, rel: string, href?: string) => {
    if (!href) return;
    let link = document.querySelector<HTMLLinkElement>(selector);
    if (!link) { link = document.createElement('link'); link.rel = rel; document.head.appendChild(link); }
    link.href = href;
  };
  setLink("link[rel~='icon']", 'icon', value.assets.favicon);
  setLink("link[rel='apple-touch-icon']", 'apple-touch-icon', value.assets.appIcon);
}

async function refresh() {
  try {
    const response = await fetch('/api/v1/planner/branding', { cache: 'no-store' });
    if (!response.ok) return;
    const raw = await response.json();
    cached = {
      productName: raw.productName || defaults.productName,
      companyName: raw.companyName || defaults.companyName,
      brandName: raw.brandName || '',
      assets: { ...defaults.assets, ...(raw.assets || {}) },
      companyAssets: raw.companyAssets || {},
    };
    applyDocumentBranding(cached);
    listeners.forEach(listener => listener(cached));
  } catch { /* retain bundled defaults */ }
}

function start() {
  if (started) return;
  started = true;
  void refresh();
  window.setInterval(() => void refresh(), 60_000);
}

export function useBranding() {
  const [value, setValue] = useState(cached);
  useEffect(() => { listeners.add(setValue); start(); return () => { listeners.delete(setValue); }; }, []);
  return value;
}
