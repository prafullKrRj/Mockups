const COPY_KEYS = ['headline', 'highlight', 'subline', 'eyebrow', 'callouts', 'badges'];

export function projectLocales(app = {}) {
  const locales = app.locales ?? [app.locale || 'en-US'];
  if (!Array.isArray(locales) || !locales.length || locales.length > 20 || new Set(locales).size !== locales.length) {
    throw Object.assign(new Error('app.locales must contain 1–20 distinct locale tags'), { status: 422 });
  }
  for (const locale of locales) {
    try {
      if (typeof locale !== 'string' || !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(locale)) throw new Error();
      Intl.getCanonicalLocales(locale);
    } catch {
      throw Object.assign(new Error(`Invalid locale tag: ${locale}`), { status: 422 });
    }
  }
  if (new Set(locales.map((locale) => Intl.getCanonicalLocales(locale)[0])).size !== locales.length) {
    throw Object.assign(new Error('app.locales contains duplicate locale tags'), { status: 422 });
  }
  return locales;
}

export function copyFields(plan) {
  return [...plan.slides.map((slide, i) => [slide, `slides[${i}]`]), [plan.featureGraphic, 'featureGraphic']]
    .flatMap(([slide, prefix]) => COPY_KEYS.flatMap((key) => {
      if (slide[key] == null) return [];
      return Array.isArray(slide[key])
        ? slide[key].map((value, i) => ({ path: `${prefix}.${key}[${i}]`, value }))
        : [{ path: `${prefix}.${key}`, value: slide[key] }];
    }));
}

export function localizePlan(plan, locale) {
  const result = structuredClone(plan);
  const text = (value) => typeof value === 'string' ? value : value[locale] ?? '';
  for (const slide of [...result.slides, result.featureGraphic]) {
    for (const key of COPY_KEYS) {
      if (slide[key] != null) slide[key] = Array.isArray(slide[key]) ? slide[key].map(text).filter(Boolean) : text(slide[key]);
    }
  }
  return result;
}

export function localeTypography(locale) {
  const info = new Intl.Locale(locale);
  const { language, script } = info.maximize();
  const font = script === 'Deva' || ['hi', 'mr', 'ne'].includes(language) ? 'Noto Sans Devanagari'
    : script === 'Arab' || ['ar', 'fa', 'ur'].includes(language) ? 'Noto Sans Arabic'
      : language === 'he' ? 'Noto Sans Hebrew'
        : language === 'ja' ? 'Noto Sans JP'
          : language === 'ko' ? 'Noto Sans KR'
            : language === 'zh' ? (script === 'Hant' || /-(TW|HK|MO)$/i.test(locale) ? 'Noto Sans TC' : 'Noto Sans SC') : null;
  return { font, dir: info.getTextInfo?.().direction ?? (['Arab', 'Hebr', 'Thaa', 'Nkoo', 'Adlm', 'Syrc', 'Rohg'].includes(script) ? 'rtl' : 'ltr') };
}
