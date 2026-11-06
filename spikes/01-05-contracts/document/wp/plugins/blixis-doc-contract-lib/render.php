<?php
// Throwaway proof for task 01-05. Just enough rendering to test post_content strategies. It is not
// the renderer contract. Input has already passed the validator.

declare(strict_types=1);

function bdc_strategy(): string
{
    return (string) get_option('bdc_strategy', 'html-block');
}

// Plain text, as in the renderer contract: encode & first, or esc_html keeps existing entities.
function bdc_esc_text($text): string
{
    return esc_html(str_replace('&', '&amp;', (string) $text));
}

function bdc_render_node(stdClass $doc, string $id, int $depth = 0): string
{
    $node = $doc->nodes->{$id} ?? null;
    if (!$node instanceof stdClass || $depth > 32) {
        return '';
    }
    $version_ok = ($node->version ?? 0) === 1;
    if (!$version_ok || !isset(bdc_registry()[$node->type])) {
        // Preserved in storage, deliberately absent from output.
        return '<!-- blixis:preserved -->';
    }
    $p = $node->props;
    if (($p->visibility ?? true) === false) {
        return '';
    }
    $kids = '';
    foreach ($node->children as $child) {
        $kids .= bdc_render_node($doc, $child, $depth + 1);
    }
    switch ($node->type) {
        case 'blixis/section':
            $tag = in_array($p->tag ?? '', ['section', 'div', 'header', 'footer', 'main', 'article', 'aside'], true) ? $p->tag : 'section';
            return "<$tag>$kids</$tag>";
        case 'blixis/container':
        case 'blixis/columns':
        case 'blixis/column':
        case 'blixis/card':
        case 'blixis/cta':
            return "<div>$kids</div>";
        case 'blixis/heading':
            $level = (int) ($p->level ?? 2);
            return "<h$level>" . bdc_esc_text($p->text ?? '') . "</h$level>";
        case 'blixis/paragraph':
            return '<p>' . bdc_esc_text($p->text ?? '') . '</p>';
        case 'blixis/button':
            return '<p><a href="' . esc_url($p->url ?? '') . '">' . bdc_esc_text($p->label ?? '') . '</a></p>';
        case 'blixis/list':
            $tag = ($p->ordered ?? false) ? 'ol' : 'ul';
            $items = '';
            foreach ($p->items ?? [] as $item) {
                $items .= '<li>' . bdc_esc_text($item) . '</li>';
            }
            return "<$tag>$items</$tag>";
        case 'blixis/quote':
            return '<blockquote><p>' . bdc_esc_text($p->quote ?? '') . '</p><cite>' . bdc_esc_text($p->attribution ?? '') . '</cite></blockquote>';
        case 'blixis/accordion':
        case 'blixis/tabs':
            $out = '';
            foreach ($p->items ?? [] as $item) {
                $out .= '<h3>' . bdc_esc_text($item->title ?? $item->label ?? '') . '</h3><p>' . bdc_esc_text($item->body ?? '') . '</p>';
            }
            return $out;
        case 'blixis/video':
            return '<p><a href="' . esc_url($p->url ?? '') . '">' . bdc_esc_text($p->title ?? '') . '</a></p>';
        case 'blixis/divider':
            return '<hr>';
        default:
            return '';
    }
}

function bdc_render(stdClass $doc): string
{
    $out = '';
    foreach ($doc->root as $id) {
        $out .= bdc_render_node($doc, $id);
    }
    return $out;
}

/** The candidate post_content strategies from the 01-05 review. */
function bdc_project_content(stdClass $doc, string $strategy): string
{
    $html = bdc_render($doc);
    switch ($strategy) {
        case 'empty':
            return '';
        case 'text':
            return trim(wp_strip_all_tags(str_replace('</', "\n</", $html)));
        case 'html':
            return $html;
        case 'custom-block':
            return "<!-- wp:blixis/document -->\n$html\n<!-- /wp:blixis/document -->";
        case 'html-block':
            // Core runs do_shortcode over post_content before any later filter, even when that
            // filter discards the result. Numeric entities keep the text and stop the shortcode.
            $html = str_replace(['[', ']'], ['&#91;', '&#93;'], $html);
            return "<!-- wp:html -->\n$html\n<!-- /wp:html -->";
    }
    throw new InvalidArgumentException('Unknown strategy');
}
