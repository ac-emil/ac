// ============================================================================
// NAVIGATION UTILITY SCRIPT
// ============================================================================

window.addEventListener("DOMContentLoaded", () => {
    
    // ─── MEGA MENU & DROPDOWN MENU SYSTEM ────────────────────────────────
    const MENU_CONFIGS = [
        { selector: ".mega-menu", closeTrigger: ".mega-menu-close" },
        { selector: ".dropdown-menu", closeTrigger: null },
    ];

    function getMenuParts(menu, selector) {
        const base = selector.replace(".", "");
        return {
            label: menu.querySelector(`.${base}-label`),
            content: menu.querySelector(`.${base}-content`),
        };
    }

    function setShow(elements, visible) {
        elements.forEach(el => el?.classList.toggle("show", visible));
    }

    function openMenu(menu, parts) {
        setShow([menu, parts.label, parts.content], true);
    }

    function closeMenu(menu, parts) {
        setShow([menu, parts.label, parts.content], false);
    }

    function isOpen(menu) {
        return menu.classList.contains("show");
    }

    function closeOtherMenus(menu) {
        MENU_CONFIGS.forEach(config => {
            document.querySelectorAll(`${config.selector}.show`).forEach(other => {
                if (other === menu) return;
                if (menu.contains(other)) return;
                if (other.contains(menu)) return;
                const parts = getMenuParts(other, config.selector);
                closeMenu(other, parts);
            });
        });
    }

    function initMenu(menu, config) {
        const parts = getMenuParts(menu, config.selector);
        if (!parts.label || !parts.content) return;

        if (menu.classList.contains("show_on_hover")) {
            menu.addEventListener("mouseenter", () => {
                closeOtherMenus(menu);
                openMenu(menu, parts);
            });
            menu.addEventListener("mouseleave", () => closeMenu(menu, parts));
        } else {
            parts.label.addEventListener("click", () => {
                if (isOpen(menu)) {
                    closeMenu(menu, parts);
                } else {
                    closeOtherMenus(menu);
                    openMenu(menu, parts);
                }
            });
        }
    }

    function initCloseTriggers(config) {
        if (!config.closeTrigger) return;
        document.querySelectorAll(config.closeTrigger).forEach(trigger => {
            const parentMenu = trigger.closest(config.selector);
            if (!parentMenu) return;
            trigger.addEventListener("click", () => {
                const parts = getMenuParts(parentMenu, config.selector);
                closeMenu(parentMenu, parts);
            });
        });
    }

    MENU_CONFIGS.forEach(config => {
        document.querySelectorAll(config.selector).forEach(menu => initMenu(menu, config));
        initCloseTriggers(config);
    });

    // ─── MOBILE NAVIGATION ────────────────────────────────────────────────
    const navOpenBtn = document.querySelectorAll('.mobile-menu-btn');
    const navCloseBtn = document.querySelectorAll('.nav-close');
    const navWrapper = document.querySelector('.nav-wrapper');

    navOpenBtn.forEach(btn => {
        btn.addEventListener('click', () => {
            navWrapper?.classList.add('active');
        });
    });

    navCloseBtn.forEach(btn => {
        btn.addEventListener('click', () => {
            navWrapper?.classList.remove('active');
        });
    });

    // ─── TOGGLE ELEMENTS ──────────────────────────────────────────────────
    function toggleElementClass(element, className) {
        element?.classList.toggle(className);
    }

    const elementsCanToggle = document.querySelectorAll(".toggle-element");
    elementsCanToggle.forEach(element => {
        const trigger = element.querySelector(".toggle-trigger");
        const closeTriggers = element.querySelectorAll(".toggle-close-trigger");
        const content = element.querySelector(".toggle-content");

        if (!trigger || !content) return;

        trigger.addEventListener("click", () => {
            // Close other open toggles
            elementsCanToggle.forEach(other => {
                if (other !== element && other.classList.contains("show")) {
                    const otherContent = other.querySelector(".toggle-content");
                    otherContent?.classList.remove("show");
                    other.classList.remove("show");
                }
            });
            // Toggle current element
            toggleElementClass(element, "show");
            toggleElementClass(content, "show");
        });

        closeTriggers.forEach(closeTrigger => {
            closeTrigger.addEventListener("click", () => {
                toggleElementClass(element, "show");
                toggleElementClass(content, "show");
            });
        });
    });

    // ─── FORM UTILITIES ───────────────────────────────────────────────────
    const dateInput = document.querySelectorAll('.form-date');
    const phoneInput = document.querySelectorAll('.form-phone');

    dateInput.forEach(input => {
        input.addEventListener('focus', () => {
            input.type = 'date';
        });
    });

    phoneInput.forEach(input => {
        input.setAttribute('pattern', '[0-9]{3}-[0-9]{3}-[0-9]{4}');
        input.addEventListener('input', () => {
            const value = input.value.replace(/\D/g, '');
            let formattedValue = '';

            if (value.length > 0) {
                formattedValue += value.substring(0, 3);
            }
            if (value.length > 3) {
                formattedValue += '-' + value.substring(3, 6);
            }
            if (value.length > 6) {
                formattedValue += '-' + value.substring(6, 10);
            }

            input.value = formattedValue;
        });
    });

    // ─── FOOTER YEAR UPDATE ───────────────────────────────────────────────
    const footerYear = document.querySelectorAll(".current-year");
    footerYear.forEach(element => {
        element.textContent = new Date().getFullYear();
    });
});


// ============================================================================
// LENIS SMOOTH SCROLL (Load Event)
// ============================================================================

window.addEventListener("load", () => {
    if (typeof Webflow !== 'undefined' && Webflow.env("editor") === undefined) {
        const lenis = new Lenis({
            lerp: 0.1,
            wheelMultiplier: 0.7,
            gestureOrientation: "vertical",
            normalizeWheel: false,
            smoothTouch: false,
        });

        function raf(time) {
            lenis.raf(time);
            requestAnimationFrame(raf);
        }
        requestAnimationFrame(raf);

        // jQuery handlers - only after lenis is initialized
        if (typeof $ !== 'undefined') {
            $("[data-lenis-start]").on("click", function () {
                lenis.start();
            });

            $("[data-lenis-stop]").on("click", function () {
                lenis.stop();
            });

            $("[data-lenis-toggle]").on("click", function () {
                $(this).toggleClass("stop-scroll");
                if ($(this).hasClass("stop-scroll")) {
                    lenis.stop();
                } else {
                    lenis.start();
                }
            });
        }
    }
});
