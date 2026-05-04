(function () {
    "use strict";

    function initSectorScroll() {
        var params = new URLSearchParams(window.location.search);
        var sector = params.get("sector");
        if (!sector || !/^[a-z0-9-]+$/.test(sector)) {
            return;
        }
        var selector = '.markdown-tile[data-taxonomy="' + sector + '"]';
        var el = document.querySelector(selector);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    function initCarousels() {
        var roots = document.querySelectorAll("[data-carousel]");
        roots.forEach(function (root) {
            var viewport = root.querySelector("[data-carousel-viewport]");
            var prev = root.querySelector("[data-carousel-prev]");
            var next = root.querySelector("[data-carousel-next]");
            var scroller =
                viewport || root.querySelector("[data-carousel-track]");
            if (!scroller || !prev || !next) {
                return;
            }
            function scrollByDir(dir) {
                var w = scroller.clientWidth;
                var delta = Math.max(200, w * 0.92) * dir;
                scroller.scrollBy({ left: delta, behavior: "smooth" });
            }
            prev.addEventListener("click", function () {
                scrollByDir(-1);
            });
            next.addEventListener("click", function () {
                scrollByDir(1);
            });
        });
    }

    document.addEventListener("DOMContentLoaded", function () {
        initSectorScroll();
        initCarousels();
    });
})();
