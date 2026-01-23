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


// FOOTER YEAR UPDATE
const footerYear = document.querySelectorAll(".current-year");
for (let i = 0; i < footerYear.length; i++) {
    footerYear[i].textContent = new Date().getFullYear();
}
