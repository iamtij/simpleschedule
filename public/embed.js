(function () {
    if (window.IskedEmbed && window.IskedEmbed.scan) {
        window.IskedEmbed.scan();
        return;
    }

    var modalHost = null;
    var floatingHost = null;
    var onKey = null;

    function scriptOrigin(script) {
        try {
            return new URL(script.src, window.location.href).origin;
        } catch (err) {
            return '';
        }
    }

    function bookingUrl(origin, raw) {
        var url;
        try {
            url = new URL(raw, origin);
        } catch (err) {
            return '';
        }
        if (url.origin !== origin) return '';
        if (!/^\/booking\/[A-Za-z0-9_-]+(?:\/\d+)?\/?$/.test(url.pathname)) return '';
        url.searchParams.set('embed', '1');
        url.hash = '';
        return url.toString();
    }

    function buttonStyle() {
        return [
            'button{appearance:none;display:inline-flex;align-items:center;gap:8px;',
            'background:#2563eb;color:#fff;border:0;border-radius:999px;',
            'padding:12px 18px;font:600 14px/1.2 system-ui,-apple-system,sans-serif;',
            'cursor:pointer;box-shadow:0 8px 20px rgba(37,99,235,.35);}',
            'button:hover{background:#1d4ed8;}'
        ].join('');
    }

    function makeButton(label) {
        var host = document.createElement('span');
        host.className = 'isked-embed-button';
        var root = host.attachShadow({ mode: 'open' });
        var style = document.createElement('style');
        style.textContent = buttonStyle();
        var button = document.createElement('button');
        button.type = 'button';
        button.textContent = label || 'Book a time';
        root.appendChild(style);
        root.appendChild(button);
        return { host: host, button: button };
    }

    function closeModal() {
        if (onKey) {
            document.removeEventListener('keydown', onKey);
            onKey = null;
        }
        if (modalHost) {
            modalHost.remove();
            modalHost = null;
        }
    }

    function openModal(url) {
        closeModal();
        modalHost = document.createElement('div');
        modalHost.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
        var root = modalHost.attachShadow({ mode: 'open' });
        var style = document.createElement('style');
        style.textContent = [
            ':host{all:initial;}',
            '.overlay{position:fixed;inset:0;background:rgba(17,24,39,.55);',
            'display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;}',
            '.panel{width:min(960px,100%);height:min(760px,100%);background:#fff;border-radius:16px;',
            'overflow:hidden;display:flex;flex-direction:column;',
            'box-shadow:0 25px 50px rgba(0,0,0,.25);font-family:system-ui,-apple-system,sans-serif;}',
            '.bar{display:flex;align-items:center;justify-content:space-between;',
            'padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;font-weight:600;}',
            '.close{appearance:none;border:0;background:#f3f4f6;width:32px;height:32px;border-radius:999px;',
            'cursor:pointer;font-size:20px;line-height:32px;color:#374151;}',
            'iframe{flex:1;width:100%;border:0;background:#fff;}'
        ].join('');
        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        var panel = document.createElement('div');
        panel.className = 'panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', 'Book a time');
        var bar = document.createElement('div');
        bar.className = 'bar';
        var title = document.createElement('span');
        title.textContent = 'Book a time';
        var close = document.createElement('button');
        close.type = 'button';
        close.className = 'close';
        close.setAttribute('aria-label', 'Close');
        close.textContent = '\u00d7';
        var frame = document.createElement('iframe');
        frame.src = url;
        frame.title = 'Book a time';
        frame.setAttribute('data-isked-embed', '');
        bar.appendChild(title);
        bar.appendChild(close);
        panel.appendChild(bar);
        panel.appendChild(frame);
        overlay.appendChild(panel);
        root.appendChild(style);
        root.appendChild(overlay);
        close.addEventListener('click', closeModal);
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) closeModal();
        });
        onKey = function (event) {
            if (event.key === 'Escape') closeModal();
        };
        document.addEventListener('keydown', onKey);
        document.body.appendChild(modalHost);
        close.focus();
    }

    function mountFloating(url, label) {
        var text = label || 'Book a time';
        if (!floatingHost) {
            var made = makeButton(text);
            floatingHost = made.host;
            floatingHost.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483646;display:inline-block;';
            made.button.addEventListener('click', function () {
                var next = floatingHost.getAttribute('data-url');
                if (next) openModal(next);
            });
            document.body.appendChild(floatingHost);
        }
        floatingHost.setAttribute('data-url', url);
        var button = floatingHost.shadowRoot && floatingHost.shadowRoot.querySelector('button');
        if (button) button.textContent = text;
    }

    function removeFloating() {
        if (floatingHost) {
            floatingHost.remove();
            floatingHost = null;
        }
    }

    function initScript(script) {
        if (script.getAttribute('data-isked-ready') === '1') return;
        var origin = scriptOrigin(script);
        var url = bookingUrl(origin, script.getAttribute('data-url') || '');
        if (!url) return;
        script.setAttribute('data-isked-ready', '1');
        var type = (script.getAttribute('data-type') || 'popup').toLowerCase();
        var label = script.getAttribute('data-label') || 'Book a time';
        if (type === 'floating') {
            var place = function () { mountFloating(url, label); };
            if (document.body) place();
            else document.addEventListener('DOMContentLoaded', place);
            return;
        }
        if (type !== 'popup') return;
        var made = makeButton(label);
        made.button.addEventListener('click', function () { openModal(url); });
        if (script.parentNode) script.parentNode.insertBefore(made.host, script);
    }

    function scan() {
        var scripts = document.querySelectorAll('script[src*="embed.js"]');
        for (var i = 0; i < scripts.length; i++) {
            if (/\/embed\.js(?:\?|#|$)/.test(scripts[i].src)) initScript(scripts[i]);
        }
    }

    window.addEventListener('message', function (event) {
        var data = event.data;
        if (!data || data.source !== 'isked-embed' || !event.source) return;
        var frames = document.querySelectorAll('iframe[data-isked-embed]');
        for (var i = 0; i < frames.length; i++) {
            if (frames[i].contentWindow !== event.source) continue;
            var height = Number(data.height);
            if (!height || height < 320) return;
            frames[i].style.height = Math.min(height, 4000) + 'px';
        }
    });

    window.IskedEmbed = {
        open: function (rawUrl) {
            var origin = window.location.origin;
            var url = bookingUrl(origin, rawUrl);
            if (!url) return;
            openModal(url);
        },
        mountFloating: function (rawUrl, label) {
            var url = bookingUrl(window.location.origin, rawUrl);
            if (!url) return;
            mountFloating(url, label);
        },
        removeFloating: removeFloating,
        scan: scan
    };

    function boot() { scan(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
