
window.translationCache = window.translationCache || {};

async function translatePage(dashboardName, lang = "en") {
  const filePath = `./locales/${dashboardName}.json`;

  try {
    let translations;

    // Cache translations so we don’t re-fetch
    if (translationCache[dashboardName]) {
      translations = translationCache[dashboardName];
    } else {
      const response = await fetch(filePath);
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      translations = await response.json();
      translationCache[dashboardName] = translations;
    }

    // Replace text content
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const key = element.getAttribute("data-i18n");
      if (translations[key]) {
        const translation =
          translations[key][lang] ||
          translations[key]["en"] ||
          element.textContent;
        element.textContent = translation;
      }
    });

    // Replace placeholders
    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      const key = element.getAttribute("data-i18n-placeholder");
      if (translations[key]) {
        const translation =
          translations[key][lang] ||
          translations[key]["en"] ||
          element.getAttribute("placeholder");
        element.setAttribute("placeholder", translation);
      }
    });

    console.log(`Translations applied for ${dashboardName} in ${lang}`);
  } catch (error) {
    console.error("Error fetching or applying translations:", error);
  }
}
