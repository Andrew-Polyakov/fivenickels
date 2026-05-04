(function () {
    "use strict";

    function isTurboPreview() {
        return document.body && document.body.getAttribute("data-turbo-preview") === "1";
    }

    function shouldSetTurboFrameOnLink(anchor) {
        if (isTurboPreview()) {
            return false;
        }
        if (anchor.getAttribute("data-turbo") === "false") {
            return false;
        }
        if (anchor.getAttribute("data-turbo-frame") === "site-nav") {
            return false;
        }
        if (anchor.target && anchor.target.toLowerCase() === "_blank") {
            return false;
        }
        if (anchor.hasAttribute("download")) {
            return false;
        }
        var hrefAttr = anchor.getAttribute("href");
        if (!hrefAttr || hrefAttr.toLowerCase().indexOf("javascript:") === 0) {
            return false;
        }
        if (hrefAttr.charAt(0) === "#" && hrefAttr.indexOf("/") === -1) {
            return false;
        }
        var u;
        try {
            u = new URL(anchor.href, window.location.href);
        } catch (e) {
            return false;
        }
        if (u.origin !== window.location.origin) {
            return false;
        }
        var p = u.pathname;
        if (p.indexOf("/admin/") === 0 || p.indexOf("/django-admin/") === 0) {
            return false;
        }
        return true;
    }

    document.addEventListener(
        "click",
        function (e) {
            var t = e.target;
            if (!t || !t.closest) {
                return;
            }
            var a = t.closest("a[href]");
            if (!a || !shouldSetTurboFrameOnLink(a)) {
                return;
            }
            if (a.getAttribute("data-turbo-frame") === "site-nav") {
                return;
            }
            a.setAttribute("data-turbo-frame", "main");
        },
        true
    );

    function normalizePath(path) {
        if (!path) {
            return "/";
        }
        if (path.length > 1 && path.charAt(path.length - 1) === "/") {
            return path.slice(0, -1);
        }
        return path;
    }

    function syncBodyAndTitleFromResponse(html) {
        if (!html || typeof html !== "string") {
            return;
        }
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, "text/html");
        if (doc.body) {
            document.body.className = doc.body.className;
        }
        var titleEl = doc.querySelector("title");
        if (titleEl && titleEl.textContent) {
            document.title = titleEl.textContent;
        }
        var desc = doc.querySelector('meta[name="description"]');
        if (desc) {
            var c = desc.getAttribute("content");
            var m = document.querySelector('meta[name="description"]');
            if (m && c) {
                m.setAttribute("content", c);
            } else if (c) {
                var ins = document.createElement("meta");
                ins.setAttribute("name", "description");
                ins.setAttribute("content", c);
                var head = document.getElementsByTagName("head")[0];
                if (head) {
                    head.appendChild(ins);
                }
            }
        }
    }

    function syncHeaderFromUrl() {
        var curPath = normalizePath(window.location.pathname);
        var navLinks = document.querySelectorAll(
            "a.site-nav__link[data-site-nav-link]"
        );
        navLinks.forEach(function (link) {
            link.classList.remove("site-nav__link--active");
            link.removeAttribute("aria-current");
        });
        navLinks.forEach(function (link) {
            try {
                var lp = normalizePath(
                    new URL(link.href, window.location.origin).pathname
                );
                if (lp === curPath) {
                    link.classList.add("site-nav__link--active");
                    link.setAttribute("aria-current", "page");
                }
            } catch (err) {
                /* ignore */
            }
        });
    }

    function initSectorScroll() {
        // Home markdown tiles are server-filtered when ?sector= is present; no
        // scroll-into-view needed (previously used on the unfiltered home stream).
    }

    function initCarousels() {
        var roots = document.querySelectorAll("[data-carousel]");
        roots.forEach(function (root) {
            if (root.getAttribute("data-carousel-bound") === "1") {
                return;
            }
            root.setAttribute("data-carousel-bound", "1");
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

    function afterMainFrameVisit(htmlDocumentOptional) {
        if (htmlDocumentOptional) {
            syncBodyAndTitleFromResponse(htmlDocumentOptional);
        }
        syncHeaderFromUrl();
        initSectorScroll();
        initCarousels();
    }

    function handleTurboFrameLoad(e) {
        if (!e.target || e.target.id !== "main") {
            return;
        }
        var fr = e.detail && e.detail.fetchResponse;
        if (fr && fr.responseHTML) {
            fr.responseHTML
                .then(function (html) {
                    afterMainFrameVisit(html);
                })
                .catch(function () {
                    afterMainFrameVisit(null);
                });
        } else {
            afterMainFrameVisit(null);
        }
    }

    document.addEventListener("DOMContentLoaded", function () {
        if (!isTurboPreview()) {
            syncHeaderFromUrl();
        }
        initSectorScroll();
        initCarousels();
    });

    document.addEventListener("turbo:load", function () {
        if (!isTurboPreview()) {
            syncHeaderFromUrl();
            initSectorScroll();
            initCarousels();
        }
    });

    document.addEventListener("turbo:frame-load", handleTurboFrameLoad);
})();
