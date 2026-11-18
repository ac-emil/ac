/*
 * ============================================================================
 * Unified Cookie Consent & Geo-IP Tracking Blocker
 * Designed for Aesthetic Conversion
 *
 * Integrates:
 * 1. Geo-IP Country Detection & Blocking (GeoJS + 12h cookie cache + retries)
 * 2. Vanilla JavaScript Cookie Consent Manager (Banner, Modal, Preferences, GPC)
 * 3. Google Consent Mode v2 & dataLayer Integration
 * 4. Dual Script Selector Support:
 *    - <script type="text/plain" data-consent="marketing|analytics">
 *    - <script type="ac-code"> (legacy Aesthetic Conversion tracking tag)
 * ============================================================================
 */
(function () {
    "use strict";

    console.log("[Cookie Consent + GeoBlock] Script execution started");

    // ========================================================================
    // 1. CONFIGURATION: Customize Blocked Countries & Settings Here
    // ========================================================================
    var CONFIG = {
        // List of 2-letter ISO country codes where tracking is completely disabled.
        // Add or remove country codes as needed (e.g. "US", "GB", "DE", etc.)
        // blockedCountries: ["CN", "RU", "IN", "PK", "BD", "BR", "SG"],
        blockedCountries: ["CN", "RU", "SG"],

        // GeoJS endpoint for IP-to-country lookup
        geoApiUrl: "https://get.geojs.io/v1/ip/country.json",

        // Cookie caching settings for detected country
        geoCookieName: "userCountry",
        geoCacheHours: 12,

        // Geo API retry and timeout settings
        geoMaxRetries: 3,
        geoRetryDelayMs: 1000,
        geoTimeoutMs: 3500,

        // If the Geo API fails completely:
        // false = allow tracking (fail-open), true = block tracking (fail-closed)
        blockOnGeoError: false,

        // Cookie consent storage settings
        storageKey: "site-cookie-consent",
        consentVersion: 1,
        consentDays: 180,

        // Default category for <script type="ac-code"> tags without explicit data-consent
        defaultAcCategory: "marketing",

        // Set to true if you want to completely hide the banner in blocked countries
        hideBannerForBlockedCountries: false
    };

    // ========================================================================
    // 2. STATE VARIABLES
    // ========================================================================
    var root;
    var banner;
    var modal;
    var settingsOptions;
    var consentInputs;
    var bannerGpcNote;
    var modalGpcNote;
    var gpcActive = Boolean(typeof navigator !== "undefined" && navigator.globalPrivacyControl === true);
    var currentConsent = createDefaultConsent();
    var previousFocus = null;
    var originalBodyOverflow = "";
    var hasStoredChoice = false;

    // Geo-IP State
    var detectedCountry = null;
    var isGeoBlocked = false;
    var resolveGeoPromise;
    var geoResolvedPromise = new Promise(function (resolve) {
        resolveGeoPromise = resolve;
    });

    // ========================================================================
    // 3. COOKIE & STORAGE HELPERS
    // ========================================================================
    function setCookie(name, value, hours) {
        var expires = new Date(Date.now() + hours * 3600000).toUTCString();
        document.cookie = encodeURIComponent(name) + "=" + encodeURIComponent(value) +
            "; expires=" + expires + "; path=/; SameSite=Lax";
    }

    function getCookie(name) {
        var pattern = "(?:^|; )" + encodeURIComponent(name).replace(/[-.+*]/g, "\\$&") + "=([^;]*)";
        var match = document.cookie.match(new RegExp(pattern));
        return match ? decodeURIComponent(match[1]) : null;
    }

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
        return "unknown";
    }

    function getConsentFromStorage() {
        try {
            var savedValue = window.localStorage.getItem(CONFIG.storageKey);
            if (!savedValue) return null;

            var saved = JSON.parse(savedValue);
            if (
                !saved ||
                saved.version !== CONFIG.consentVersion ||
                typeof saved.expiresAt !== "number" ||
                Date.now() >= saved.expiresAt
            ) {
                window.localStorage.removeItem(CONFIG.storageKey);
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
            return null;
        }
    }

    function storeConsent(consent, source) {
        var now = Date.now();
        var record = {
            version: CONFIG.consentVersion,
            functional: true,
            analytics: consent.analytics === true,
            marketing: gpcActive ? false : consent.marketing === true,
            updatedAt: now,
            expiresAt: now + CONFIG.consentDays * 24 * 60 * 60 * 1000,
            source: source || "preferences"
        };

        try {
            window.localStorage.setItem(CONFIG.storageKey, JSON.stringify(record));
        } catch (error) {
            // Storage quota exceeded or disabled
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

    // ========================================================================
    // 4. GEO-IP & COUNTRY LOOKUP
    // ========================================================================
    function checkIsCountryBlocked(countryCode) {
        if (!countryCode || countryCode === "UNKNOWN") {
            return CONFIG.blockOnGeoError;
        }
        return CONFIG.blockedCountries.indexOf(countryCode.toUpperCase()) !== -1;
    }

    function fetchWithTimeout(url, timeoutMs) {
        return new Promise(function (resolve, reject) {
            var didTimeout = false;
            var timer = setTimeout(function () {
                didTimeout = true;
                reject(new Error("Geo API request timed out after " + timeoutMs + "ms"));
            }, timeoutMs);

            fetch(url, { headers: { Accept: "application/json" } })
                .then(function (response) {
                    clearTimeout(timer);
                    if (!didTimeout) resolve(response);
                })
                .catch(function (error) {
                    clearTimeout(timer);
                    if (!didTimeout) reject(error);
                });
        });
    }

    async function fetchCountryWithRetry() {
        var cached = getCookie(CONFIG.geoCookieName);
        if (cached) {
            console.info("[Geo] Using cached country from cookie:", cached);
            return cached.toUpperCase();
        }

        var attempt = 0;
        while (attempt < CONFIG.geoMaxRetries) {
            try {
                var response = await fetchWithTimeout(CONFIG.geoApiUrl, CONFIG.geoTimeoutMs);
                if (response.ok) {
                    var data = await response.json();
                    var country = (data.country || "UNKNOWN").toUpperCase();
                    setCookie(CONFIG.geoCookieName, country, CONFIG.geoCacheHours);
                    console.info("[Geo] Fetched country from GeoJS:", country);
                    return country;
                }
            } catch (err) {
                console.warn("[Geo] Geo API attempt " + (attempt + 1) + " failed:", err.message || err);
            }

            attempt++;
            if (attempt < CONFIG.geoMaxRetries) {
                await new Promise(function (res) {
                    setTimeout(res, CONFIG.geoRetryDelayMs * attempt);
                });
            }
        }

        console.warn("[Geo] Geo API unavailable after " + CONFIG.geoMaxRetries + " attempts. Fallback to UNKNOWN.");
        return "UNKNOWN";
    }

    async function initializeGeo() {
        // Fast-path: Check cookie immediately
        var fastCached = getCookie(CONFIG.geoCookieName);
        if (fastCached) {
            detectedCountry = fastCached.toUpperCase();
            isGeoBlocked = checkIsCountryBlocked(detectedCountry);
            console.info("[Geo] Immediate fast-path: Country=" + detectedCountry + ", Blocked=" + isGeoBlocked);
            resolveGeoPromise({ country: detectedCountry, blocked: isGeoBlocked });
            return;
        }

        // Asynchronous lookup
        try {
            var country = await fetchCountryWithRetry();
            detectedCountry = country;
            isGeoBlocked = checkIsCountryBlocked(detectedCountry);
        } catch (e) {
            detectedCountry = "UNKNOWN";
            isGeoBlocked = CONFIG.blockOnGeoError;
        }

        console.info("[Geo] Country resolved: Country=" + detectedCountry + ", Blocked=" + isGeoBlocked);
        resolveGeoPromise({ country: detectedCountry, blocked: isGeoBlocked });
    }

    // ========================================================================
    // 5. GOOGLE CONSENT MODE v2
    // ========================================================================
    function updateGtagConsent(consent) {
        window.dataLayer = window.dataLayer || [];
        if (typeof window.gtag !== "function") {
            window.gtag = function () {
                window.dataLayer.push(arguments);
            };
        }

        // If user is from a blocked country, force all tracking states to denied
        var allowMarketing = !isGeoBlocked && !gpcActive && consent && consent.marketing === true;
        var allowAnalytics = !isGeoBlocked && consent && consent.analytics === true;

        var marketingState = allowMarketing ? "granted" : "denied";
        var analyticsState = allowAnalytics ? "granted" : "denied";

        window.gtag("consent", "update", {
            ad_storage: marketingState,
            ad_user_data: marketingState,
            ad_personalization: marketingState,
            analytics_storage: analyticsState
        });

        window.dataLayer.push({
            event: "cookie_consent_update",
            consent_functional: true,
            consent_analytics: allowAnalytics,
            consent_marketing: allowMarketing,
            user_country: detectedCountry || "UNKNOWN",
            geo_blocked: isGeoBlocked
        });
    }

    // ========================================================================
    // 6. SCRIPT ACTIVATION (GEO & CONSENT GATED)
    // ========================================================================
    function consentAllows(category, consent) {
        var normalized = normalizeCategory(category);
        if (normalized === "functional") return true;
        if (normalized === "analytics") return consent.analytics === true;
        if (normalized === "marketing") return !gpcActive && consent.marketing === true;
        return false;
    }

    function activateScript(blockedScript) {
        return new Promise(function (resolve) {
            if (blockedScript.getAttribute("data-consent-activated") === "true") {
                return resolve();
            }

            var liveScript = document.createElement("script");
            var hasSrc = blockedScript.hasAttribute("src");

            Array.prototype.forEach.call(blockedScript.attributes, function (attr) {
                if (
                    attr.name === "type" ||
                    attr.name === "data-consent" ||
                    attr.name === "data-consent-activated" ||
                    attr.name === "data-blocked-countries"
                ) {
                    return;
                }
                liveScript.setAttribute(attr.name, attr.value);
            });

            // Preserve execution order for non-async dynamic scripts
            if (!blockedScript.hasAttribute("async")) {
                liveScript.async = false;
            }

            var category = blockedScript.getAttribute("data-consent") || CONFIG.defaultAcCategory;
            liveScript.setAttribute("data-consent-category", normalizeCategory(category));
            blockedScript.setAttribute("data-consent-activated", "true");

            if (hasSrc) {
                liveScript.onload = function () {
                    console.info("[Tracking] Loaded script:", liveScript.src);
                    resolve();
                };
                liveScript.onerror = function (err) {
                    console.error("[Tracking] Failed to load script:", liveScript.src, err);
                    resolve(); // Resolve anyway so subsequent scripts in queue are not held back
                };
            }

            if (!hasSrc) {
                liveScript.textContent = blockedScript.textContent;
            }

            if (blockedScript.parentNode) {
                blockedScript.parentNode.insertBefore(liveScript, blockedScript.nextSibling);
            }

            if (!hasSrc) {
                resolve();
            }
        });
    }

    async function activatePermittedScripts() {
        // Wait until Geo-IP check resolves before triggering tracking scripts
        await geoResolvedPromise;

        if (isGeoBlocked) {
            console.warn(
                "[Tracking] Blocked: User country (" + detectedCountry +
                ") is restricted. Tracking scripts will not load."
            );
            return;
        }

        // Support both standard data-consent scripts and AC custom code scripts
        var selector = 'script[type="text/plain"][data-consent], script[type="ac-code"]';
        var blockedScripts = Array.prototype.slice.call(document.querySelectorAll(selector));

        // Load scripts sequentially to respect script dependencies
        for (var i = 0; i < blockedScripts.length; i++) {
            var script = blockedScripts[i];
            if (script.getAttribute("data-consent-activated") === "true") {
                continue;
            }

            // Optional per-script country block override: data-blocked-countries="CN,RU"
            var scriptSpecificBlocks = script.getAttribute("data-blocked-countries");
            if (scriptSpecificBlocks) {
                var blockedList = scriptSpecificBlocks.split(",").map(function (c) { return c.trim().toUpperCase(); });
                if (detectedCountry && blockedList.indexOf(detectedCountry) !== -1) {
                    console.info("[Tracking] Tag blocked specifically for country " + detectedCountry + ":", script);
                    continue;
                }
            }

            var category = script.getAttribute("data-consent") || CONFIG.defaultAcCategory;
            if (consentAllows(category, currentConsent)) {
                await activateScript(script);
            }
        }
    }

    // ========================================================================
    // 7. BANNER & MODAL UI LOGIC
    // ========================================================================
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

        (document.head || document.documentElement).appendChild(style);
    }

    function setVisible(element, visible) {
        if (!element) return;

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
        if (!modal) return [];
        return Array.prototype.slice.call(
            modal.querySelectorAll(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
            )
        ).filter(function (element) {
            return !element.hidden && element.getAttribute("aria-hidden") !== "true";
        });
    }

    function openSettings(trigger) {
        if (!modal) return;

        previousFocus = trigger || document.activeElement;
        syncPreferenceInputs();
        setVisible(modal, true);
        if (root) {
            root.classList.add("cookie-modal-open");
        }

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
        if (!modal) return;

        var wasOpen = isModalOpen();
        setVisible(modal, false);
        if (root) {
            root.classList.remove("cookie-modal-open");
        }

        if (wasOpen && document.body) {
            document.body.style.overflow = originalBodyOverflow;
        }

        if (restoreFocus !== false && previousFocus && typeof previousFocus.focus === "function") {
            previousFocus.focus();
        }

        previousFocus = null;
    }

    function syncPreferenceInputs() {
        if (!consentInputs) return;

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

        // Update Consent Mode
        updateGtagConsent(currentConsent);

        // Fire allowed scripts if not geo-blocked
        activatePermittedScripts();

        // If user revoked consent, reload to cleanly stop active tracking
        if (isRevokingConsent) {
            window.location.reload();
        }
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
        if (bannerGpcNote) {
            bannerGpcNote.hidden = !gpcActive;
        }

        if (settingsOptions && gpcActive && !modalGpcNote) {
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
        if (!root) return;
        var closeControl = root.querySelector(".cookie-sttings-close, .cookie-settings-close");
        if (!closeControl) return;

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
        var openSettingsButtons = document.querySelectorAll(".open-cookie-settings, .cookie-manage-preferences");
        Array.prototype.forEach.call(openSettingsButtons, function (btn) {
            btn.addEventListener("click", function (e) {
                e.preventDefault();
                openSettings(btn);
            });
        });

        var doNotSellButtons = document.querySelectorAll(".do-not-sell-share");
        Array.prototype.forEach.call(doNotSellButtons, function (btn) {
            btn.addEventListener("click", function (e) {
                e.preventDefault();
                applyConsent(
                    {
                        analytics: currentConsent.analytics,
                        marketing: false
                    },
                    "do-not-sell-or-share-opt-out"
                );
            });
        });

        if (!root) return;

        var acceptAllButton = root.querySelector(".cookie-accept-all");
        var rejectAllButton = root.querySelector(".cookie-reject-all");
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
            if (!isModalOpen()) return;

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

    // ========================================================================
    // 8. INITIALIZATION & LIFECYCLE
    // ========================================================================
    function initialize() {
        var savedConsent = getConsentFromStorage();
        hasStoredChoice = Boolean(savedConsent);

        if (savedConsent) {
            currentConsent = savedConsent;
            if (gpcActive && currentConsent.marketing) {
                currentConsent.marketing = false;
                currentConsent.source = "global-privacy-control";
                currentConsent = storeConsent(currentConsent, "global-privacy-control");
            }
        } else {
            currentConsent = createDefaultConsent();
        }

        // Apply consent immediately to Google Consent Mode & trigger permitted scripts
        updateGtagConsent(currentConsent);
        activatePermittedScripts();

        // UI Initialization (if banner markup exists on this page)
        root = document.querySelector(".cookie-consent");
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

        // Determine banner visibility once geo check resolves
        geoResolvedPromise.then(function (geoResult) {
            if (CONFIG.hideBannerForBlockedCountries && geoResult.blocked) {
                setVisible(banner, false);
                setVisible(modal, false);
                return;
            }

            if (hasStoredChoice) {
                setVisible(banner, false);
                setVisible(modal, false);
            } else {
                setVisible(banner, true);
                setVisible(modal, false);
            }
        });

        syncPreferenceInputs();
    }

    // ========================================================================
    // 9. EARLY RESOLUTION & PUBLIC API
    // ========================================================================
    // Start Geo-IP lookup immediately in parallel with HTML parsing
    initializeGeo();

    // Early Google Consent Mode v2 sync if cached preferences exist
    var earlySavedConsent = getConsentFromStorage();
    if (earlySavedConsent) {
        currentConsent = earlySavedConsent;
        if (gpcActive && currentConsent.marketing) {
            currentConsent.marketing = false;
        }
        updateGtagConsent(currentConsent);
    }

    // Public API for custom buttons and browser console debugging
    window.SiteCookieConsent = {
        openPreferences: function () {
            if (modal) {
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
        setConsent: function (preferences) {
            applyConsent(preferences, "api");
        },
        getCountry: function () {
            return detectedCountry;
        },
        isCountryBlocked: function () {
            return isGeoBlocked;
        },
        getBlockedCountries: function () {
            return CONFIG.blockedCountries.slice();
        },
        setBlockedCountries: function (countries) {
            if (Array.isArray(countries)) {
                CONFIG.blockedCountries = countries.map(function (c) {
                    return String(c).trim().toUpperCase();
                });
                if (detectedCountry) {
                    isGeoBlocked = checkIsCountryBlocked(detectedCountry);
                    updateGtagConsent(currentConsent);
                }
            }
        },
        reset: function () {
            try {
                window.localStorage.removeItem(CONFIG.storageKey);
                // Also remove country cookie so it re-detects
                document.cookie = CONFIG.geoCookieName + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            } catch (error) {
                // Ignore storage errors
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
