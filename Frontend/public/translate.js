// A cache for translations to avoid re-fetching the same files.
window.translationCache = window.translationCache || {};

/**
 * Fetches and applies translations for a given dashboard/page.
 * @param {string} dashboardName - The name of the dashboard, corresponding to the JSON file in `/locales/`.
 * @param {string} [lang="en"] - The language code (e.g., "en", "fr", "es").
 */
async function translatePage(dashboardName, lang = "en") {
  if (!dashboardName) {
    console.error("translatePage function called without a dashboardName.");
    return;
  }

  const filePath = `./locales/${dashboardName}.json`;
  let translations;

  try {
    // Use cached translations if available
    if (window.translationCache[filePath]) {
      translations = window.translationCache[filePath];
    } else {
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`Failed to load translation file: ${filePath}`);
      }
      translations = await response.json();
      window.translationCache[filePath] = translations; // Cache the fetched data
    }

    const langTranslations = translations[lang] || translations["en"] || {};

    // --- Apply translations to text content ---
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const key = element.getAttribute("data-i18n");
      if (langTranslations[key]) {
        // Use innerHTML to allow for simple HTML tags in translations if needed
        element.innerHTML = langTranslations[key];
      }
    });

    // --- Apply translations to placeholders ---
    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      const key = element.getAttribute("data-i18n-placeholder");
      if (langTranslations[key]) {
        element.setAttribute("placeholder", langTranslations[key]);
      }
    });

    // --- Apply translations to title attributes (for tooltips) ---
     document.querySelectorAll('[data-i18n-title]').forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        if (langTranslations[key]) {
            element.setAttribute('title', langTranslations[key]);
        }
    });

  } catch (error) {
    console.error("Error fetching or applying translations:", error);
  }
}
