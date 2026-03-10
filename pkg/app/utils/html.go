package utils

import (
	"bytes"
	stdhtml "html"
	"net/url"
	"strings"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"

	baseutils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/utils"
)

var allowedDescriptionTags = map[string]struct{}{
	"a":          {},
	"b":          {},
	"blockquote": {},
	"br":         {},
	"code":       {},
	"div":        {},
	"em":         {},
	"hr":         {},
	"i":          {},
	"img":        {},
	"li":         {},
	"ol":         {},
	"p":          {},
	"pre":        {},
	"s":          {},
	"span":       {},
	"strike":     {},
	"strong":     {},
	"sub":        {},
	"sup":        {},
	"u":          {},
	"ul":         {},
}

var blockedDescriptionTags = map[string]struct{}{
	"applet":   {},
	"audio":    {},
	"base":     {},
	"embed":    {},
	"form":     {},
	"frame":    {},
	"frameset": {},
	"iframe":   {},
	"input":    {},
	"link":     {},
	"math":     {},
	"meta":     {},
	"object":   {},
	"script":   {},
	"select":   {},
	"source":   {},
	"style":    {},
	"svg":      {},
	"textarea": {},
	"title":    {},
	"video":    {},
}

func NormalizeSubmissionDescriptionHTML(markup string, sid string, isPublic bool) string {
	trimmed := strings.TrimSpace(markup)
	if trimmed == "" {
		return ""
	}

	container := &html.Node{
		Type:     html.ElementNode,
		DataAtom: atom.Div,
		Data:     "div",
	}
	nodes, err := html.ParseFragment(strings.NewReader(trimmed), container)
	if err != nil {
		return stdhtml.EscapeString(trimmed)
	}
	for _, node := range nodes {
		container.AppendChild(node)
	}

	sanitizeDescriptionHTMLTree(container, sid, isPublic)

	var buffer bytes.Buffer
	for node := container.FirstChild; node != nil; node = node.NextSibling {
		if err := html.Render(&buffer, node); err != nil {
			return stdhtml.EscapeString(trimmed)
		}
	}
	return buffer.String()
}

func sanitizeDescriptionHTMLTree(node *html.Node, sid string, isPublic bool) {
	if node == nil {
		return
	}

	for child := node.FirstChild; child != nil; {
		next := child.NextSibling

		switch child.Type {
		case html.CommentNode, html.DoctypeNode:
			removeHTMLNode(child)
		case html.ElementNode:
			tag := strings.ToLower(child.Data)
			if _, blocked := blockedDescriptionTags[tag]; blocked {
				removeHTMLNode(child)
				child = next
				continue
			}

			sanitizeDescriptionHTMLTree(child, sid, isPublic)
			if _, allowed := allowedDescriptionTags[tag]; !allowed {
				unwrapHTMLNode(child)
				child = next
				continue
			}

			sanitizeDescriptionElement(child, sid, isPublic)
			if shouldRemoveDescriptionElement(child) {
				removeHTMLNode(child)
			}
		}
		child = next
	}
}

func sanitizeDescriptionElement(node *html.Node, sid string, isPublic bool) {
	attrs := make([]html.Attribute, 0, len(node.Attr))
	for _, attr := range node.Attr {
		if attr.Namespace != "" {
			continue
		}

		key := strings.ToLower(strings.TrimSpace(attr.Key))
		if key == "" || strings.HasPrefix(key, "on") {
			continue
		}

		switch node.Data {
		case "a":
			switch key {
			case "href":
				href, ok := resolveDescriptionLinkURL(attr.Val)
				if !ok {
					continue
				}
				attr.Key = "href"
				attr.Val = href
			case "title":
				attr.Key = key
			default:
				continue
			}
		case "img":
			switch key {
			case "src":
				src, ok := resolveDescriptionAssetURL(attr.Val, sid, isPublic)
				if !ok {
					continue
				}
				attr.Key = "src"
				attr.Val = src
			case "srcset":
				srcset, ok := resolveDescriptionSrcSet(attr.Val, sid, isPublic)
				if !ok {
					continue
				}
				attr.Key = "srcset"
				attr.Val = srcset
			case "alt", "title":
				attr.Key = key
			default:
				continue
			}
		default:
			continue
		}

		attrs = append(attrs, attr)
	}

	if node.Data == "a" && !hasHTMLAttr(attrs, "href") {
		node.Attr = nil
		return
	}
	node.Attr = attrs
}

func shouldRemoveDescriptionElement(node *html.Node) bool {
	switch node.Data {
	case "img":
		return !hasHTMLAttr(node.Attr, "src")
	default:
		return false
	}
}

func removeHTMLNode(node *html.Node) {
	if node == nil || node.Parent == nil {
		return
	}
	node.Parent.RemoveChild(node)
}

func unwrapHTMLNode(node *html.Node) {
	if node == nil || node.Parent == nil {
		return
	}

	parent := node.Parent
	for child := node.FirstChild; child != nil; {
		next := child.NextSibling
		node.RemoveChild(child)
		parent.InsertBefore(child, node)
		child = next
	}
	parent.RemoveChild(node)
}

func hasHTMLAttr(attrs []html.Attribute, key string) bool {
	for _, attr := range attrs {
		if strings.EqualFold(attr.Key, key) {
			return true
		}
	}
	return false
}

func resolveDescriptionAssetURL(raw string, sid string, isPublic bool) (string, bool) {
	absolute := NormalizeInkbunnyURL(raw)
	if !isAllowedDescriptionURL(absolute, map[string]struct{}{
		"http":  {},
		"https": {},
	}) {
		return "", false
	}
	return baseutils.ResourceURL(absolute, sid, isPublic), true
}

func resolveDescriptionLinkURL(raw string) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", false
	}
	if strings.HasPrefix(trimmed, "#") {
		return trimmed, true
	}

	normalized := NormalizeInkbunnyURL(trimmed)
	if !isAllowedDescriptionURL(normalized, map[string]struct{}{
		"http":   {},
		"https":  {},
		"mailto": {},
	}) {
		return "", false
	}
	return normalized, true
}

func resolveDescriptionSrcSet(raw string, sid string, isPublic bool) (string, bool) {
	parts := strings.Split(raw, ",")
	rewritten := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}

		fields := strings.Fields(trimmed)
		if len(fields) == 0 {
			continue
		}

		src, ok := resolveDescriptionAssetURL(fields[0], sid, isPublic)
		if !ok {
			continue
		}
		fields[0] = src
		rewritten = append(rewritten, strings.Join(fields, " "))
	}
	if len(rewritten) == 0 {
		return "", false
	}
	return strings.Join(rewritten, ", "), true
}

func isAllowedDescriptionURL(raw string, allowedSchemes map[string]struct{}) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return false
	}
	if parsed.Scheme == "" {
		return false
	}
	_, allowed := allowedSchemes[strings.ToLower(parsed.Scheme)]
	return allowed
}
