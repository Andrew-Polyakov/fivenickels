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
        if (anchor.hasAttribute("data-turbo-frame")) {
            return false;
        }
        if (anchor.classList.contains("featured-category-chip")) {
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
        if (hrefAttr.indexOf("category=") >= 0) {
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

    function getCookie(name) {
        var value = "; " + document.cookie;
        var parts = value.split("; " + name + "=");
        if (parts.length === 2) {
            return parts.pop().split(";").shift();
        }
        return "";
    }

    function getCsrfToken() {
        var fromCookie = getCookie("csrftoken");
        if (fromCookie) {
            return fromCookie;
        }
        var input = document.querySelector('input[name="csrfmiddlewaretoken"]');
        if (input && input.value) {
            return input.value;
        }
        return "";
    }

    function postJson(url, payload) {
        return fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": getCsrfToken(),
                Accept: "application/json",
            },
            body: JSON.stringify(payload || {}),
        }).then(function (res) {
            return res.json().then(function (data) {
                if (!res.ok) {
                    throw new Error((data && data.error) || "Request failed.");
                }
                return data;
            });
        });
    }

    function showMaterialAlert(message, title) {
        if (window.showMaterialAlert && typeof window.showMaterialAlert === "function") {
            return window.showMaterialAlert(message, title);
        }
        alert(message || "Request failed.");
        return Promise.resolve();
    }

    function showMaterialConfirm(message, title) {
        if (window.showMaterialConfirm && typeof window.showMaterialConfirm === "function") {
            return window.showMaterialConfirm(message, title);
        }
        return Promise.resolve(window.confirm(message || "Are you sure?"));
    }

    function refreshCurrentPage() {
        if (!window.Turbo || typeof window.Turbo.visit !== "function") {
            window.location.reload();
            return;
        }
        var mainFrame = document.querySelector("turbo-frame#main");
        if (mainFrame) {
            window.Turbo.visit(window.location.href, { action: "replace", frame: "main" });
            return;
        }
        window.Turbo.visit(window.location.href, { action: "replace" });
    }

    function initInlineChipsAdmin() {
        var roots = document.querySelectorAll("[data-inline-chips]");
        roots.forEach(function (root) {
            if (root.getAttribute("data-inline-chips-bound") === "1") {
                return;
            }
            root.setAttribute("data-inline-chips-bound", "1");
            if (root.querySelector("[data-taxonomy-chip-widget]")) {
                return;
            }
            if (root.getAttribute("data-can-edit") !== "1") {
                return;
            }
            var createUrl = root.getAttribute("data-create-url");
            var deleteUrl = root.getAttribute("data-delete-url");
            if (!createUrl || !deleteUrl) {
                return;
            }

            root.addEventListener("mouseover", function (evt) {
                var deleteBtn = evt.target.closest("[data-inline-chip-delete]");
                if (!deleteBtn) {
                    return;
                }
                var wrap = deleteBtn.closest(".featured-category-chip-wrap");
                if (wrap) {
                    wrap.classList.add("is-delete-armed");
                }
            });
            root.addEventListener("mouseout", function (evt) {
                var deleteBtn = evt.target.closest("[data-inline-chip-delete]");
                if (!deleteBtn) {
                    return;
                }
                var wrap = deleteBtn.closest(".featured-category-chip-wrap");
                if (wrap) {
                    wrap.classList.remove("is-delete-armed");
                }
            });

            function bindChipInput(input) {
                if (!input || input.getAttribute("data-inline-chip-input-bound") === "1") {
                    return;
                }
                input.setAttribute("data-inline-chip-input-bound", "1");
                input.addEventListener("keydown", function (keyEvt) {
                    if (keyEvt.key === "Escape") {
                        keyEvt.preventDefault();
                        input.value = "";
                        input.blur();
                        return;
                    }
                    if (
                        keyEvt.key !== "Enter" &&
                        keyEvt.key !== "," &&
                        keyEvt.key !== "Tab"
                    ) {
                        return;
                    }
                    var name = (input.value || "").trim();
                    if (!name) {
                        if (keyEvt.key === "Enter" || keyEvt.key === ",") {
                            keyEvt.preventDefault();
                        }
                        return;
                    }
                    keyEvt.preventDefault();
                    input.disabled = true;
                    postJson(createUrl, {
                        name: name,
                        parent_id: input.getAttribute("data-parent-id") || null,
                    })
                        .then(function () {
                            refreshCurrentPage();
                        })
                        .catch(function (err) {
                            input.disabled = false;
                            showMaterialAlert(err.message || "Could not create category.");
                            input.focus();
                        });
                });
            }

            var chipInputs = root.querySelectorAll("[data-inline-chip-input]");
            chipInputs.forEach(bindChipInput);

            root.addEventListener("click", function (evt) {
                var deleteBtn = evt.target.closest("[data-inline-chip-delete]");
                if (!deleteBtn) {
                    return;
                }
                evt.preventDefault();
                var termId = deleteBtn.getAttribute("data-inline-chip-id");
                if (!termId) {
                    return;
                }
                showMaterialConfirm("Delete this category? This cannot be undone.", "Delete category").then(function (ok) {
                    if (!ok) {
                        return;
                    }
                    postJson(deleteUrl, { term_id: termId })
                        .then(function () {
                            refreshCurrentPage();
                        })
                        .catch(function (err) {
                            showMaterialAlert(err.message || "Could not delete category.");
                        });
                });
            });
        });
    }

    function initTaxonomySiteNavAndChips() {
        if (window.mountShadcnTaxonomySiteNav && typeof window.mountShadcnTaxonomySiteNav === "function") {
            window.mountShadcnTaxonomySiteNav();
        }
        if (
            window.mountTaxonomyChipWidgets &&
            typeof window.mountTaxonomyChipWidgets === "function"
        ) {
            window.mountTaxonomyChipWidgets();
        }
    }

    function initShadcnCardLayouts() {
        if (window.mountShadcnCardLayouts && typeof window.mountShadcnCardLayouts === "function") {
            window.mountShadcnCardLayouts();
        }
        if (window.mountSimilarArticleCarousels && typeof window.mountSimilarArticleCarousels === "function") {
            window.mountSimilarArticleCarousels();
        }
        if (window.mountShadcnArticleCards && typeof window.mountShadcnArticleCards === "function") {
            window.mountShadcnArticleCards();
        }
        if (window.mountShadcnBreadcrumbs && typeof window.mountShadcnBreadcrumbs === "function") {
            window.mountShadcnBreadcrumbs();
        }
    }

    function remountShadcnWidgets() {
        if (window.mountShadcnBrokerTable && typeof window.mountShadcnBrokerTable === "function") {
            window.mountShadcnBrokerTable();
        }
        if (window.mountShadcnProfileArticlesTable && typeof window.mountShadcnProfileArticlesTable === "function") {
            window.mountShadcnProfileArticlesTable();
        }
        if (window.mountShadcnArticleEditor && typeof window.mountShadcnArticleEditor === "function") {
            window.mountShadcnArticleEditor();
        }
        if (window.mountTaxonomyEditor && typeof window.mountTaxonomyEditor === "function") {
            window.mountTaxonomyEditor();
        }
    }

    function initMarketMoversFilter() {
        var root = document.querySelector("[data-market-movers-root]");
        if (!root || root.getAttribute("data-market-movers-bound") === "1") {
            return;
        }
        root.setAttribute("data-market-movers-bound", "1");

        root.addEventListener("click", function (evt) {
            var link = evt.target && evt.target.closest
                ? evt.target.closest("a[data-market-movers-region-link]")
                : null;
            if (!link) {
                return;
            }
            evt.preventDefault();
            var href = link.getAttribute("href");
            if (!href) {
                return;
            }
            fetch(href, {
                credentials: "same-origin",
                headers: { Accept: "text/html" },
            })
                .then(function (res) {
                    if (!res.ok) {
                        throw new Error("market movers fetch failed");
                    }
                    return res.text();
                })
                .then(function (html) {
                    var parser = new DOMParser();
                    var doc = parser.parseFromString(html, "text/html");
                    var nextRoot = doc.querySelector("[data-market-movers-root]");
                    if (!nextRoot) {
                        throw new Error("market movers root missing");
                    }
                    root.replaceWith(nextRoot);
                    if (window.history && window.history.replaceState) {
                        window.history.replaceState({}, "", href);
                    }
                    initMarketMoversFilter();
                })
                .catch(function () {
                    window.location.href = href;
                });
        });
    }

    function initInlineTileTitleAdmin() {
        var titleButtons = document.querySelectorAll("[data-inline-tile-title]");
        titleButtons.forEach(function (btn) {
            if (btn.getAttribute("data-inline-title-bound") === "1") {
                return;
            }
            btn.setAttribute("data-inline-title-bound", "1");
            btn.addEventListener("click", function (evt) {
                evt.preventDefault();
                evt.stopPropagation();

                var updateUrl = btn.getAttribute("data-update-url");
                var pageId = btn.getAttribute("data-page-id");
                if (!updateUrl || !pageId) {
                    return;
                }
                var titleTargetSelector = btn.getAttribute("data-inline-title-target");
                var titleTarget = null;
                if (titleTargetSelector) {
                    titleTarget = document.querySelector(titleTargetSelector);
                }
                var startTitle = titleTarget
                    ? (titleTarget.textContent || "").trim()
                    : (btn.textContent || "").trim();
                var input = document.createElement("input");
                input.type = "text";
                input.className = "markdown-tile__title-input";
                input.value = startTitle;
                if (titleTarget) {
                    titleTarget.hidden = true;
                    titleTarget.insertAdjacentElement("afterend", input);
                } else {
                    btn.hidden = true;
                    btn.insertAdjacentElement("afterend", input);
                }
                input.focus();
                input.select();

                var done = false;
                function teardown() {
                    if (done) {
                        return;
                    }
                    done = true;
                    input.remove();
                    if (titleTarget) {
                        titleTarget.hidden = false;
                    } else {
                        btn.hidden = false;
                    }
                }

                input.addEventListener("keydown", function (keyEvt) {
                    if (keyEvt.key === "Escape") {
                        keyEvt.preventDefault();
                        teardown();
                        return;
                    }
                    if (keyEvt.key !== "Enter") {
                        return;
                    }
                    keyEvt.preventDefault();
                    var nextTitle = (input.value || "").trim();
                    if (!nextTitle || nextTitle === startTitle) {
                        teardown();
                        return;
                    }
                    input.disabled = true;
                    postJson(updateUrl, {
                        page_id: pageId,
                        title: nextTitle,
                    })
                        .then(function () {
                            done = true;
                            if (titleTarget) {
                                titleTarget.textContent = nextTitle;
                            } else {
                                btn.textContent = nextTitle;
                            }
                            input.remove();
                            if (titleTarget) {
                                titleTarget.hidden = false;
                            } else {
                                btn.hidden = false;
                            }
                            refreshCurrentPage();
                        })
                        .catch(function (err) {
                            input.disabled = false;
                            showMaterialAlert(err.message || "Could not update title.");
                            input.focus();
                        });
                });
                input.addEventListener("blur", function () {
                    window.setTimeout(function () {
                        if (!input.disabled) {
                            teardown();
                        }
                    }, 120);
                });
            });
        });
    }

    function initTileShareButtons() {
        var buttons = document.querySelectorAll("[data-share-permalink]");
        buttons.forEach(function (btn) {
            if (btn.getAttribute("data-share-bound") === "1") {
                return;
            }
            btn.setAttribute("data-share-bound", "1");
            btn.addEventListener("click", function (evt) {
                evt.preventDefault();
                evt.stopPropagation();
                var sharePath = btn.getAttribute("data-share-path") || "";
                var permalink = sharePath
                    ? new URL(sharePath, window.location.origin).toString()
                    : window.location.href;
                var writePromise =
                    navigator.clipboard && navigator.clipboard.writeText
                        ? navigator.clipboard.writeText(permalink)
                        : Promise.reject(new Error("Clipboard API unavailable"));
                writePromise
                    .then(function () {
                        showMaterialAlert("Permalink copied to clipboard.", "Share");
                    })
                    .catch(function () {
                        showMaterialAlert("Could not copy automatically. Link: " + permalink, "Share");
                    });
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
        initInlineChipsAdmin();
        initTaxonomySiteNavAndChips();
        initInlineTileTitleAdmin();
        initTileShareButtons();
        initShadcnCardLayouts();
        remountShadcnWidgets();
        initMarketMoversFilter();
    }

    function handleTurboFrameLoad(e) {
        if (!e.target || !e.target.id) {
            return;
        }
        if (e.target.id === "site-nav") {
            initInlineChipsAdmin();
            initTaxonomySiteNavAndChips();
            return;
        }
        if (e.target.id !== "main") {
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
                var searchUrl =
                    searchPageUrl +
                    (searchPageUrl.indexOf("?") >= 0 ? "&" : "?") +
                    "query=" +
                    encodeURIComponent(q);
                if (document.querySelector("turbo-frame#main")) {
                    window.Turbo.visit(searchUrl, { frame: "main" });
                } else {
                    window.Turbo.visit(searchUrl);
                }
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

    function initAuthModal() {
        if (isTurboPreview()) {
            return;
        }
        var openTargets = document.querySelectorAll("[data-auth-modal-open]");
        if (!openTargets.length) {
            return;
        }

        var hasMaterialDialog =
            window.showMaterialAuthDialog &&
            typeof window.showMaterialAuthDialog === "function";

        openTargets.forEach(function (target) {
            if (target.getAttribute("data-auth-modal-bound") === "1") {
                return;
            }
            target.setAttribute("data-auth-modal-bound", "1");
            target.addEventListener("click", function () {
                var tab = target.getAttribute("data-auth-tab") === "signup" ? "signup" : "login";
                if (hasMaterialDialog) {
                    window.showMaterialAuthDialog(tab);
                    return;
                }
            });
        });

        var params = new URLSearchParams(window.location.search);
        var openFromUrl = params.get("auth");
        if (hasMaterialDialog && (openFromUrl === "login" || openFromUrl === "signup")) {
            window.showMaterialAuthDialog(openFromUrl);
        }
    }

    document.addEventListener("DOMContentLoaded", function () {
        if (!isTurboPreview()) {
            syncHeaderFromUrl();
        }
        initSectorScroll();
        initCarousels();
        initSiteSearchLive();
        initAuthModal();
        initInlineChipsAdmin();
        initTaxonomySiteNavAndChips();
        initInlineTileTitleAdmin();
        initTileShareButtons();
        initShadcnCardLayouts();
        remountShadcnWidgets();
        initMarketMoversFilter();
    });

    document.addEventListener("turbo:load", function () {
        if (!isTurboPreview()) {
            syncHeaderFromUrl();
            initSectorScroll();
            initCarousels();
        }
        initSiteSearchLive();
        initAuthModal();
        initInlineChipsAdmin();
        initTaxonomySiteNavAndChips();
        initInlineTileTitleAdmin();
        initTileShareButtons();
        initShadcnCardLayouts();
        remountShadcnWidgets();
        initMarketMoversFilter();
    });

    document.addEventListener("turbo:frame-load", handleTurboFrameLoad);
})();
