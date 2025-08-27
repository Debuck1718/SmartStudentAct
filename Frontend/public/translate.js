
const translationCache = {};

async function translatePage(dashboardName, lang) {
    const filePath = `./locales/${dashboardName}.json`;

    try {
        let translations;
        if (translationCache[dashboardName]) {
            translations = translationCache[dashboardName];
        } else {
            const response = await fetch(filePath);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            translations = await response.json();
            translationCache[dashboardName] = translations;
        }

        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = translations[lang]?.[key] || translations['en']?.[key] || key;
            element.textContent = translation;
        });
    } catch (error) {
        console.error('Error fetching or applying translations:', error);
    }
}
