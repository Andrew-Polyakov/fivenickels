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

    function initSiteSearchLive() {
        if (isTurboPreview()) {
            return;
        }
        var root = document.querySelector("[data-site-search-live]");
        if (!root || root.getAttribute("data-site-search-live-bound") === "1") {
            return;
        }
        root.setAttribute("data-site-search-live-bound", "1");

        var suggestUrl = root.getAttribute("data-search-suggest-url") || "/search/suggest/";
        var searchPageUrl = root.getAttribute("data-search-page-url") || "/search/";
        var input = document.getElementById("site-search-query");
        var panel = document.getElementById("site-search-live-panel");
        var listEl = document.getElementById("site-search-live-list");
        var moreBtn = document.getElementById("site-search-live-more");
        var emptyEl = document.getElementById("site-search-live-empty");
        var loadingEl = document.getElementById("site-search-live-loading");
        if (!input || !panel || !listEl || !moreBtn || !emptyEl || !loadingEl) {
            return;
        }

        var debounceMs = 280;
        var minChars = 2;
        var timer = null;
        var abortCtl = null;
        var lastQuery = "";

        function setExpanded(open) {
            input.setAttribute("aria-expanded", open ? "true" : "false");
        }

        function hidePanel() {
            panel.hidden = true;
            setExpanded(false);
        }

        function showPanel() {
            panel.hidden = false;
            setExpanded(true);
        }

        function renderResults(data) {
            listEl.innerHTML = "";
            var results = (data && data.results) || [];
            var total = data && typeof data.total === "number" ? data.total : 0;
            var i;
            for (i = 0; i < results.length; i++) {
                var item = results[i];
                var a = document.createElement("a");
                a.className = "search-live__tile";
                a.setAttribute("role", "option");
                a.href = item.url || "#";
                a.setAttribute("data-turbo-frame", "main");
                var titleSpan = document.createElement("span");
                titleSpan.className = "search-live__tile-title";
                titleSpan.innerHTML = item.title_html || "";
                a.appendChild(titleSpan);
                if (item.preview_html) {
                    var prevSpan = document.createElement("span");
                    prevSpan.className = "search-live__tile-preview";
                    prevSpan.innerHTML = item.preview_html;
                    a.appendChild(prevSpan);
                }
                a.addEventListener("click", function () {
                    hidePanel();
                });
                listEl.appendChild(a);
            }
            emptyEl.hidden = total > 0 || results.length > 0;
            moreBtn.hidden = total <= 3;
            loadingEl.hidden = true;
        }

        function renderLoading() {
            loadingEl.hidden = false;
            emptyEl.hidden = true;
            listEl.innerHTML = "";
            moreBtn.hidden = true;
        }

        function fetchSuggest(q) {
            if (abortCtl) {
                abortCtl.abort();
            }
            abortCtl = new AbortController();
            var url =
                suggestUrl +
                (suggestUrl.indexOf("?") >= 0 ? "&" : "?") +
                "q=" +
                encodeURIComponent(q);
            renderLoading();
            showPanel();
            fetch(url, {
                signal: abortCtl.signal,
                credentials: "same-origin",
                headers: { Accept: "application/json" },
            })
                .then(function (res) {
                    if (!res.ok) {
                        throw new Error("suggest failed");
                    }
                    return res.json();
                })
                .then(function (data) {
                    loadingEl.hidden = true;
                    renderResults(data);
                    showPanel();
                })
                .catch(function (err) {
                    if (err && err.name === "AbortError") {
                        return;
                    }
                    loadingEl.hidden = true;
                    listEl.innerHTML = "";
                    emptyEl.hidden = false;
                    moreBtn.hidden = true;
                    showPanel();
                });
        }

        function scheduleFetch() {
            var q = (input.value || "").trim();
            lastQuery = q;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            if (q.length < minChars) {
                if (abortCtl) {
                    abortCtl.abort();
                }
                listEl.innerHTML = "";
                emptyEl.hidden = true;
                loadingEl.hidden = true;
                moreBtn.hidden = true;
                hidePanel();
                return;
            }
            timer = setTimeout(function () {
                timer = null;
                fetchSuggest(q);
            }, debounceMs);
        }

        input.addEventListener("input", scheduleFetch);

        input.addEventListener("focus", function () {
            var q = (input.value || "").trim();
            if (q.length >= minChars && listEl.childNodes.length) {
                showPanel();
            }
        });

        input.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                hidePanel();
            }
        });

        moreBtn.addEventListener("click", function () {
            var q = (lastQuery || input.value || "").trim();
            if (q.length < minChars) {
                return;
            }
            hidePanel();
            if (window.Turbo && typeof window.Turbo.visit === "function") {
                window.Turbo.visit(
                    searchPageUrl +
                        (searchPageUrl.indexOf("?") >= 0 ? "&" : "?") +
                        "query=" +
                        encodeURIComponent(q)
                );
            } else {
                window.location.href =
                    searchPageUrl +
                    (searchPageUrl.indexOf("?") >= 0 ? "&" : "?") +
                    "query=" +
                    encodeURIComponent(q);
            }
        });

        document.addEventListener(
            "click",
            function (e) {
                var t = e.target;
                if (!t || !root.contains(t)) {
                    hidePanel();
                }
            },
            true
        );

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && !panel.hidden) {
                hidePanel();
            }
        });
    }

    document.addEventListener("DOMContentLoaded", function () {
        if (!isTurboPreview()) {
            syncHeaderFromUrl();
        }
        initSectorScroll();
        initCarousels();
        initSiteSearchLive();
    });

    document.addEventListener("turbo:load", function () {
        if (!isTurboPreview()) {
            syncHeaderFromUrl();
            initSectorScroll();
            initCarousels();
        }
        initSiteSearchLive();
    });

    document.addEventListener("turbo:frame-load", handleTurboFrameLoad);
})();
