/*
 * Lightweight vanilla JavaScript cookie consent manager
 * Designed for the HTML classes and data-consent attributes in main-v3.html.
 * No framework or external dependency is required.
 */
(function () {
    "use strict";

    var STORAGE_KEY = "site-cookie-consent";
    var CONSENT_VERSION = 1;
    var CONSENT_DAYS = 180;

    var root;
    var banner;
    var modal;
    var settingsOptions;
    var consentInputs;
    var bannerGpcNote;
    var modalGpcNote;
    var gpcActive = false;
    var currentConsent = createDefaultConsent();
    var previousFocus = null;
    var originalBodyOverflow = "";
    var hasStoredChoice = false;

    function createDefaultConsent() {
        return {
            functional: true,
            analytics: false,
            marketing: false
        };
    }

    function normalizeCategory(category) {
        var value = String(category || "").trim().toLowerCase();

        if (value === "functional" || value === "necessary" || value === "essential") {
            return "functional";
        }

        if (value === "analytics" || value === "statistics" || value === "performance") {
            return "analytics";
        }

        if (
            value === "marketing" ||
            value === "advertising" ||
            value === "targeting" ||
            value === "personalization" ||
            value === "personalisation"
        ) {
            return "marketing";
        }

        // Unknown categories are denied unless they are explicitly mapped above.
        return "unknown";
    }

    function getConsentFromStorage() {
        try {
            var savedValue = window.localStorage.getItem(STORAGE_KEY);

            if (!savedValue) {
                return null;
            }

            var saved = JSON.parse(savedValue);

            if (
                !saved ||
                saved.version !== CONSENT_VERSION ||
                typeof saved.expiresAt !== "number" ||
                Date.now() >= saved.expiresAt
            ) {
                window.localStorage.removeItem(STORAGE_KEY);
                return null;
            }

            return {
                functional: true,
                analytics: saved.analytics === true,
                marketing: saved.marketing === true,
                updatedAt: saved.updatedAt,
                expiresAt: saved.expiresAt,
                source: typeof saved.source === "string" ? saved.source : "saved-preferences"
            };
        } catch (error) {
            // Storage may be unavailable in some privacy modes. The banner still works
            // for the current page, but the choice may not persist across visits.
            return null;
        }
    }

    function storeConsent(consent, source) {
        var now = Date.now();
        var record = {
            version: CONSENT_VERSION,
            functional: true,
            analytics: consent.analytics === true,
            marketing: gpcActive ? false : consent.marketing === true,
            updatedAt: now,
            expiresAt: now + CONSENT_DAYS * 24 * 60 * 60 * 1000,
            source: source || "preferences"
        };

        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
        } catch (error) {
            // Do not crash the page if browser storage is unavailable.
        }

        return {
            functional: true,
            analytics: record.analytics,
            marketing: record.marketing,
            updatedAt: record.updatedAt,
            expiresAt: record.expiresAt,
            source: record.source
        };
    }

    function addVisibilityStyles() {
        if (document.getElementById("site-cookie-consent-styles")) {
            return;
        }

        var style = document.createElement("style");
        style.id = "site-cookie-consent-styles";
        style.textContent = [
            ".cookie-consent .cookie-banner[hidden],",
            ".cookie-consent .cookie-settings-modal[hidden] { display: none !important; }",
            ".cookie-consent .cookie-banner { z-index: 9998; }",
            ".cookie-consent .cookie-settings-modal { z-index: 9999; }",
            ".cookie-consent .cookie-sttings-close,",
            ".cookie-consent .cookie-settings-close { border: 0; padding: 0; background: transparent; color: inherit; }"
        ].join("\n");

        document.head.appendChild(style);
    }

    function setVisible(element, visible) {
        if (!element) {
            return;
        }

        element.hidden = !visible;
        element.setAttribute("aria-hidden", visible ? "false" : "true");

        if (visible) {
            element.classList.remove("is-hidden");
        } else {
            element.classList.add("is-hidden");
        }

        if ("inert" in element) {
            element.inert = !visible;
        }
    }

    function isModalOpen() {
        return Boolean(modal && !modal.hidden);
    }

    function getFocusableElements() {
        if (!modal) {
            return [];
        }

        return Array.prototype.slice.call(
            modal.querySelectorAll(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
            )
        ).filter(function (element) {
            return !element.hidden && element.getAttribute("aria-hidden") !== "true";
        });
    }

    function openSettings(trigger) {
        if (!modal) {
            return;
        }

        previousFocus = trigger || document.activeElement;
        syncPreferenceInputs();
        setVisible(modal, true);
        root.classList.add("cookie-modal-open");

        if (document.body) {
            originalBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = "hidden";
        }

        var focusable = getFocusableElements();
        if (focusable.length) {
            focusable[0].focus();
        } else {
            var content = modal.querySelector(".cookie-settings-content");
            if (content) {
                content.setAttribute("tabindex", "-1");
                content.focus();
            }
        }
    }

    function closeSettings(restoreFocus) {
        if (!modal) {
            return;
        }

        var wasOpen = isModalOpen();
        setVisible(modal, false);
        root.classList.remove("cookie-modal-open");

        // Do not overwrite the page's inline overflow style when the modal was not open.
        if (wasOpen && document.body) {
            document.body.style.overflow = originalBodyOverflow;
        }

        if (restoreFocus !== false && previousFocus && typeof previousFocus.focus === "function") {
            previousFocus.focus();
        }

        previousFocus = null;
    }

    function syncPreferenceInputs() {
        if (!consentInputs) {
            return;
        }

        consentInputs.forEach(function (input) {
            var category = normalizeCategory(input.getAttribute("data-consent"));

            if (category === "functional") {
                input.checked = true;
                input.disabled = true;
                return;
            }

            if (category === "analytics") {
                input.checked = currentConsent.analytics === true;
                return;
            }

            if (category === "marketing") {
                input.checked = !gpcActive && currentConsent.marketing === true;
                input.disabled = gpcActive || input.dataset.originalDisabled === "true";
                if (gpcActive) {
                    input.title = "Advertising and personalization are disabled while your browser's Global Privacy Control signal is active.";
                } else {
                    input.removeAttribute("title");
                }
            }
        });
    }

    function consentAllows(category, consent) {
        var normalized = normalizeCategory(category);

        if (normalized === "functional") {
            return true;
        }

        if (normalized === "analytics") {
            return consent.analytics === true;
        }

        if (normalized === "marketing") {
            return !gpcActive && consent.marketing === true;
        }

        return false;
    }

    function activatePermittedScripts() {
        var blockedScripts = document.querySelectorAll('script[type="text/plain"][data-consent]');

        Array.prototype.forEach.call(blockedScripts, function (blockedScript) {
            if (blockedScript.dataset.consentActivated === "true") {
                return;
            }

            var category = blockedScript.getAttribute("data-consent");
            if (!consentAllows(category, currentConsent)) {
                return;
            }

            var liveScript = document.createElement("script");

            Array.prototype.forEach.call(blockedScript.attributes, function (attribute) {
                if (
                    attribute.name === "type" ||
                    attribute.name === "data-consent" ||
                    attribute.name === "data-consent-activated"
                ) {
                    return;
                }

                liveScript.setAttribute(attribute.name, attribute.value);
            });

            if (!blockedScript.hasAttribute("src")) {
                liveScript.textContent = blockedScript.textContent;
            }

            liveScript.dataset.consentCategory = normalizeCategory(category);
            blockedScript.dataset.consentActivated = "true";

            if (blockedScript.parentNode) {
                blockedScript.parentNode.insertBefore(liveScript, blockedScript.nextSibling);
            }
        });
    }

    function applyConsent(nextConsent, source) {
        var previousConsentState = {
            analytics: currentConsent.analytics === true,
            marketing: currentConsent.marketing === true
        };

        var next = {
            functional: true,
            analytics: nextConsent.analytics === true,
            marketing: gpcActive ? false : nextConsent.marketing === true
        };

        var isRevokingConsent =
            (previousConsentState.analytics && !next.analytics) ||
            (previousConsentState.marketing && !next.marketing);

        currentConsent = storeConsent(next, source);
        hasStoredChoice = true;
        syncPreferenceInputs();
        setVisible(banner, false);
        closeSettings(false);

        if (isRevokingConsent) {
            // Reload so scripts that were already executed stop running on the page.
            // On reload, only scripts permitted by the saved preferences will activate.
            window.location.reload();
            return;
        }

        activatePermittedScripts();
    }

    function readInputPreferences() {
        var preferences = createDefaultConsent();

        if (consentInputs) {
            consentInputs.forEach(function (input) {
                var category = normalizeCategory(input.getAttribute("data-consent"));

                if (category === "analytics") {
                    preferences.analytics = input.checked;
                } else if (category === "marketing") {
                    preferences.marketing = input.checked;
                }
            });
        }

        if (gpcActive) {
            preferences.marketing = false;
        }

        return preferences;
    }

    function setUpGpcUI() {
        gpcActive = Boolean(navigator && navigator.globalPrivacyControl === true);

        if (bannerGpcNote) {
            bannerGpcNote.hidden = !gpcActive;
        }

        if (settingsOptions && gpcActive) {
            modalGpcNote = document.createElement("p");
            modalGpcNote.className = "cookie-gpc-note cookie-gpc-note-modal";
            modalGpcNote.textContent = "Your browser's Global Privacy Control signal is active, so advertising and personalization remains disabled.";
            settingsOptions.parentNode.insertBefore(modalGpcNote, settingsOptions);
        }

        if (consentInputs) {
            consentInputs.forEach(function (input) {
                input.dataset.originalDisabled = input.disabled ? "true" : "false";
            });
        }
    }

    function bindCloseControl() {
        var closeControl = root.querySelector(".cookie-sttings-close, .cookie-settings-close");

        if (!closeControl) {
            return;
        }

        closeControl.setAttribute("role", "button");
        closeControl.setAttribute("tabindex", "0");
        closeControl.setAttribute("aria-label", "Close cookie preferences");

        var svg = closeControl.querySelector("svg");
        if (svg) {
            svg.setAttribute("aria-hidden", "true");
            svg.setAttribute("focusable", "false");
        }

        closeControl.addEventListener("click", function () {
            closeSettings(true);
        });

        closeControl.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                closeSettings(true);
            }
        });
    }

    function bindEvents() {
        var acceptAllButton = root.querySelector(".cookie-accept-all");
        var rejectAllButton = root.querySelector(".cookie-reject-all");
        var managePreferencesButton = root.querySelector(".cookie-manage-preferences");
        var openSettingsButton = root.querySelector(".open-cookie-settings");
        var doNotSellButton = root.querySelector(".do-not-sell-share");
        var savePreferencesButton = root.querySelector(".save-cookie-preferences");
        var cancelPreferencesButton = root.querySelector(".cancel-cookie-preferences");
        var overlay = root.querySelector(".cookie-setting-overlay");

        if (acceptAllButton) {
            acceptAllButton.addEventListener("click", function () {
                applyConsent({ analytics: true, marketing: !gpcActive }, "accept-all");
            });
        }

        if (rejectAllButton) {
            rejectAllButton.addEventListener("click", function () {
                applyConsent({ analytics: false, marketing: false }, "reject-all");
            });
        }

        if (managePreferencesButton) {
            managePreferencesButton.addEventListener("click", function () {
                openSettings(managePreferencesButton);
            });
        }

        if (openSettingsButton) {
            openSettingsButton.addEventListener("click", function () {
                openSettings(openSettingsButton);
            });
        }

        if (doNotSellButton) {
            doNotSellButton.addEventListener("click", function () {
                applyConsent(
                    {
                        analytics: currentConsent.analytics,
                        marketing: false
                    },
                    "do-not-sell-or-share-opt-out"
                );
            });
        }

        if (savePreferencesButton) {
            savePreferencesButton.addEventListener("click", function () {
                applyConsent(readInputPreferences(), "saved-preferences");
            });
        }

        if (cancelPreferencesButton) {
            cancelPreferencesButton.addEventListener("click", function () {
                closeSettings(true);
            });
        }

        if (overlay) {
            overlay.addEventListener("click", function () {
                closeSettings(true);
            });
        }

        document.addEventListener("keydown", function (event) {
            if (!isModalOpen()) {
                return;
            }

            if (event.key === "Escape") {
                event.preventDefault();
                closeSettings(true);
                return;
            }

            if (event.key === "Tab") {
                var focusable = getFocusableElements();

                if (!focusable.length) {
                    event.preventDefault();
                    return;
                }

                var first = focusable[0];
                var last = focusable[focusable.length - 1];

                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        });
    }

    function initialize() {
        root = document.querySelector(".cookie-consent");

        // The script can safely be installed on pages that do not contain the banner.
        if (!root) {
            return;
        }

        banner = root.querySelector(".cookie-banner");
        modal = root.querySelector(".cookie-settings-modal");
        settingsOptions = root.querySelector(".cookie-settings-options");
        consentInputs = Array.prototype.slice.call(root.querySelectorAll(".cookie-setting[data-consent]"));
        bannerGpcNote = root.querySelector(".cookie-banner .cookie-gpc-note");

        addVisibilityStyles();
        setUpGpcUI();

        if (modal) {
            modal.setAttribute("role", "dialog");
            modal.setAttribute("aria-modal", "true");

            var modalTitle = modal.querySelector(".cookie-settings-title");
            if (modalTitle) {
                if (!modalTitle.id) {
                    modalTitle.id = "cookie-settings-title";
                }
                modal.setAttribute("aria-labelledby", modalTitle.id);
            }
        }

        if (banner) {
            banner.setAttribute("aria-label", "Cookie consent");
        }

        bindCloseControl();
        bindEvents();

        var savedConsent = getConsentFromStorage();
        hasStoredChoice = Boolean(savedConsent);

        if (savedConsent) {
            currentConsent = savedConsent;

            // Global Privacy Control takes priority over a previously saved marketing choice.
            if (gpcActive && currentConsent.marketing) {
                currentConsent.marketing = false;
                currentConsent.source = "global-privacy-control";
                currentConsent = storeConsent(currentConsent, "global-privacy-control");
            }

            setVisible(banner, false);
            setVisible(modal, false);
        } else {
            currentConsent = createDefaultConsent();
            setVisible(banner, true);
            setVisible(modal, false);
        }

        syncPreferenceInputs();
        activatePermittedScripts();
    }

    // Small public API for custom Webflow buttons or debugging.
    window.SiteCookieConsent = {
        openPreferences: function () {
            if (root) {
                openSettings(document.activeElement);
            }
        },
        getConsent: function () {
            return {
                functional: true,
                analytics: currentConsent.analytics === true,
                marketing: !gpcActive && currentConsent.marketing === true
            };
        },
        reset: function () {
            try {
                window.localStorage.removeItem(STORAGE_KEY);
            } catch (error) {
                // Ignore storage errors; reload will show the banner for this page load.
            }
            window.location.reload();
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
