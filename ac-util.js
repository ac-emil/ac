// Navigation Utility Script
window.addEventListener("DOMContentLoaded", () => {
    // ─── Config ───────────────────────────────────────────────────────────
    const MENU_CONFIGS = [
        { selector: ".mega-menu", closeTrigger: ".mega-menu-close" },
        { selector: ".dropdown-menu", closeTrigger: null },
    ];
    // ─────────────────────────────────────────────────────────────────────

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

    function closeMenu(menu, parts, config) {
        setShow([menu, parts.label, parts.content], false);
    }

    function isOpen(menu) {
        return menu.classList.contains("show");
    }

    // Closes all open menus of ANY type across the entire page, except:
    //   - the menu itself
    //   - any descendant of the menu (children)
    //   - any ancestor of the menu (parents)
    function closeOtherMenus(menu) {
        MENU_CONFIGS.forEach(config => {
            document.querySelectorAll(`${config.selector}.show`).forEach(other => {
                if (other === menu) return; // skip self
                if (menu.contains(other)) return; // skip children
                if (other.contains(menu)) return; // skip parents

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

    // ─── Init ─────────────────────────────────────────────────────────────
    MENU_CONFIGS.forEach(config => {
        document.querySelectorAll(config.selector).forEach(menu => initMenu(menu, config));
        initCloseTriggers(config);
    });


   

});



window.addEventListener('DOMContentLoaded', function () {
    const navOpenBtn = document.querySelectorAll('.mobile-menu-btn');
    const navCloseBtn = document.querySelectorAll('.nav-close');
    const navWrapper = document.querySelector('.nav-wrapper');
    navOpenBtn.forEach(btn => {
        btn.addEventListener('click', () => {
            navWrapper.classList.add('active');
        });
    });

    navCloseBtn.forEach(btn => {
        btn.addEventListener('click', () => {
            navWrapper.classList.remove('active');
        });
    });
});



// TOGGLE ELEMENTS
function toggleElementClass(e, t) { e ? e.classList.toggle(t) : console.error(`Element with selector '${e}' not found.`) } const elementsCanToggle = document.querySelectorAll(".toggle-element"); window.addEventListener("DOMContentLoaded", () => { elementsCanToggle.forEach(e => { const t = e.querySelector(".toggle-trigger"), l = e.querySelectorAll(".toggle-close-trigger"), o = e.querySelector(".toggle-content"); t.addEventListener("click", () => { elementsCanToggle.forEach(t => { if (t !== e && t.classList.contains("show")) { const e = t.querySelector(".toggle-content"); e.classList.toggle("show"), t.classList.toggle("show") } }), toggleElementClass(e, "show"), toggleElementClass(o, "show") }), l.forEach(t => { t.addEventListener("click", () => { toggleElementClass(e, "show"), toggleElementClass(o, "show") }) }) }) });


// LENIS SMOOTH SCROLL
let lenis;
if (Webflow.env("editor") === undefined) {
    lenis = new Lenis({
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
}

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



// FORM UTILITIES
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



// FOOTER YEAR UPDATE
const footerYear = document.querySelectorAll(".current-year");
for (let i = 0; i < footerYear.length; i++) {
    footerYear[i].textContent = new Date().getFullYear();
}


