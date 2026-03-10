package utils

import (
	"bytes"
	"strings"

	baseutils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/utils"
	"golang.org/x/net/html"
)

func NormalizeSubmissionDescriptionHTML(markup string, sid string, isPublic bool) string {
	trimmed := strings.TrimSpace(markup)
	if trimmed == "" {
		return ""
	}

	container := &html.Node{
		Type: html.ElementNode,
		Data: "div",
	}
	nodes, err := html.ParseFragment(strings.NewReader(trimmed), container)
	if err != nil {
		return trimmed
	}

	for _, node := range nodes {
		rewriteHTMLNodeResourceURLs(node, sid, isPublic)
	}

	var buffer bytes.Buffer
	for _, node := range nodes {
		if err := html.Render(&buffer, node); err != nil {
			return trimmed
		}
	}
	return buffer.String()
}

func rewriteHTMLNodeResourceURLs(node *html.Node, sid string, isPublic bool) {
	if node == nil {
		return
	}

	if node.Type == html.ElementNode {
		for index := range node.Attr {
			attr := &node.Attr[index]
			switch strings.ToLower(attr.Key) {
			case "src":
				attr.Val = resolveDescriptionAssetURL(attr.Val, sid, isPublic)
			case "srcset":
				attr.Val = resolveDescriptionSrcSet(attr.Val, sid, isPublic)
			case "href":
				attr.Val = resolveDescriptionLinkURL(attr.Val)
			}
		}
	}

	for child := node.FirstChild; child != nil; child = child.NextSibling {
		rewriteHTMLNodeResourceURLs(child, sid, isPublic)
	}
}

func resolveDescriptionAssetURL(raw string, sid string, isPublic bool) string {
	absolute := NormalizeInkbunnyURL(raw)
	return baseutils.ResourceURL(absolute, sid, isPublic)
}

func resolveDescriptionLinkURL(raw string) string {
	return NormalizeInkbunnyURL(raw)
}

func resolveDescriptionSrcSet(raw string, sid string, isPublic bool) string {
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

		fields[0] = resolveDescriptionAssetURL(fields[0], sid, isPublic)
		rewritten = append(rewritten, strings.Join(fields, " "))
	}
	if len(rewritten) == 0 {
		return raw
	}
	return strings.Join(rewritten, ", ")
}
