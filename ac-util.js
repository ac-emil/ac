// TOGGLE ELEMENTS
function toggleElementClass(e, t) { e ? e.classList.toggle(t) : console.error(`Element with selector '${e}' not found.`) } const elementsCanToggle = document.querySelectorAll(".toggle-element"); window.addEventListener("load", () => { elementsCanToggle.forEach(e => { const t = e.querySelector(".toggle-trigger"), l = e.querySelectorAll(".toggle-close-trigger"), o = e.querySelector(".toggle-content"); t.addEventListener("click", () => { elementsCanToggle.forEach(t => { if (t !== e && t.classList.contains("show")) { const e = t.querySelector(".toggle-content"); e.classList.toggle("show"), t.classList.toggle("show") } }), toggleElementClass(e, "show"), toggleElementClass(o, "show") }), l.forEach(t => { t.addEventListener("click", () => { toggleElementClass(e, "show"), toggleElementClass(o, "show") }) }) }) });


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
