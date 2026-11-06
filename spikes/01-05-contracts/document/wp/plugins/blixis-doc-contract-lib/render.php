<?php
// Throwaway proof for task 01-05. Just enough rendering to test post_content strategies. It is not
// the renderer contract. Input has already passed the validator.

declare(strict_types=1);

function bdc_strategy(): string
{
    return (string) get_option('bdc_strategy', 'html-block');
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
            return "<h$level>" . esc_html($p->text ?? '') . "</h$level>";
        case 'blixis/paragraph':
            return '<p>' . esc_html($p->text ?? '') . '</p>';
        case 'blixis/button':
            return '<p><a href="' . esc_url($p->url ?? '') . '">' . esc_html($p->label ?? '') . '</a></p>';
        case 'blixis/list':
            $tag = ($p->ordered ?? false) ? 'ol' : 'ul';
            $items = '';
            foreach ($p->items ?? [] as $item) {
                $items .= '<li>' . esc_html($item) . '</li>';
            }
            return "<$tag>$items</$tag>";
        case 'blixis/quote':
            return '<blockquote><p>' . esc_html($p->quote ?? '') . '</p><cite>' . esc_html($p->attribution ?? '') . '</cite></blockquote>';
        case 'blixis/accordion':
        case 'blixis/tabs':
            $out = '';
            foreach ($p->items ?? [] as $item) {
                $out .= '<h3>' . esc_html($item->title ?? $item->label ?? '') . '</h3><p>' . esc_html($item->body ?? '') . '</p>';
            }
            return $out;
        case 'blixis/video':
            return '<p><a href="' . esc_url($p->url ?? '') . '">' . esc_html($p->title ?? '') . '</a></p>';
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
            return "<!-- wp:html -->\n$html\n<!-- /wp:html -->";
    }
    throw new InvalidArgumentException('Unknown strategy');
}
