<?php
/**
 * Plugin Name: Keri Conference Banner Shortcode
 * Description: Provides [kc_banner] shortcode which renders a preview, the HTML snippet (escaped) and a copy-to-clipboard button. Drop into wp-content/plugins/kc-banner/kc-banner.php and activate, or paste the function contents into your theme's functions.php
 * Version: 1.0
 * Author: Example
 */

if (!defined('ABSPATH')) exit;

function kc_banner_get_snippet() {
    // small, self-contained banner snippet (use inline styles for portability)
    $snippet = '<a href="https://example.com" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:linear-gradient(90deg,#6d28d9,#4f46e5);color:white;border-radius:8px;text-decoration:none;max-width:100%;box-sizing:border-box;">\n  <img src="https://via.placeholder.com/96x96.png?text=K" alt="Conference logo" style="height:48px;width:48px;border-radius:6px;background:white;padding:3px;object-fit:cover;"/>\n  <div style="display:block">\n    <div style="font-weight:700;font-size:16px;line-height:1.1">Keri Conference — March 2026</div>\n    <div style="font-size:13px;opacity:.95">Short 1-line description / CTA</div>\n  </div>\n</a>';
    return $snippet;
}

function kc_banner_shortcode($atts = array()) {
    $snippet_html = kc_banner_get_snippet();

    // Markup shown on the page
    $out  = '<div class="kc-banner-shortcode" style="font-family:system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif; max-width:880px;">';
    $out .= '<div class="kc-preview" style="margin-bottom:8px">' . $snippet_html . '</div>';

    // escaped pre so it displays exactly for users to copy
    $out .= '<pre id="kc-banner-snippet" style="background:#0f1724;color:#fff;padding:12px;border-radius:8px;overflow:auto;white-space:pre-wrap;">' . esc_html( $snippet_html ) . '</pre>';

    // copy button: we'll use data attributes to avoid exposing unescaped HTML in attribute contexts
    $out .= '<button class="kc-copy-btn" data-snippet="' . esc_attr( $snippet_html ) . '" style="margin-top:8px;padding:8px 12px;border-radius:6px;border:0;background:#6366f1;color:#fff;cursor:pointer">Copy</button>';

    $out .= '</div>';

    // enqueue small JS and CSS via inline helper so plugin works with minimal footprint
    // Register an empty handle, then add inline script and style (pattern avoids separate file)
    if (!wp_script_is('kc-banner-copy', 'enqueued')) {
        wp_register_script('kc-banner-copy', '', array(), null, true);
        $inline_js = "document.addEventListener('click', function(e){ if(!e.target) return; var t = e.target; if(t.classList && t.classList.contains('kc-copy-btn')){ var snippet = t.getAttribute('data-snippet') || document.getElementById('kc-banner-snippet')?.textContent; if(!snippet) return; if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(snippet).then(function(){ t.textContent = 'Copied ✓'; t.style.background = '#10b981'; setTimeout(function(){ t.textContent = 'Copy'; t.style.background = '#6366f1'; }, 1400); }); } else { var ta = document.createElement('textarea'); ta.value = snippet; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); t.textContent='Copied ✓'; t.style.background = '#10b981'; } catch(err){ t.textContent='Failed'; t.style.background='#ef4444'; } ta.remove(); setTimeout(function(){ t.textContent='Copy'; t.style.background = '#6366f1'; }, 1400); } } });";
        wp_add_inline_script('kc-banner-copy', $inline_js);
        wp_enqueue_script('kc-banner-copy');
    }

    if (!wp_style_is('kc-banner-style', 'enqueued')) {
        wp_register_style('kc-banner-style', '');
        $inline_css = ".kc-banner-shortcode .kc-preview{margin-bottom:8px} .kc-copy-btn{display:inline-block;}";
        wp_add_inline_style('kc-banner-style', $inline_css);
        wp_enqueue_style('kc-banner-style');
    }

    return $out;
}
add_shortcode('kc_banner', 'kc_banner_shortcode');
