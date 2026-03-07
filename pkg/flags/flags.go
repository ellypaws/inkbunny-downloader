package flags

import (
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/ellypaws/inkbunny"
)

type Config struct {
	SearchWords     string
	StringJoinType  string
	SearchIn        string
	ArtistName      string
	FavBy           string
	TimeRange       int
	SubmissionType  string
	OrderBy         string
	MaxDownloads    string
	MaxActive       string
	DownloadCaption bool

	NoTUI      bool
	Headless   bool
	NeedsLogin bool
}

func Parse() Config {
	var c Config

	flag.Usage = func() {
		out := flag.CommandLine.Output()

		titleStyle := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#FF79C6"))
		headingStyle := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#BD93F9")).Underline(true)
		flagStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#50FA7B")).Bold(true)
		descStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#F8F8F2"))
		exampleStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#8BE9FD")).Italic(true)

		fmt.Fprintf(out, "%s\n\n", titleStyle.Render("Inkbunny Downloader"))
		fmt.Fprintf(out, "%s %s [options]\n\n", headingStyle.Render("Usage:"), os.Args[0])

		fmt.Fprintf(out, "%s\n", headingStyle.Render("OPTIONS:"))
		flag.PrintDefaults()

		fmt.Fprintf(out, "\n%s\n\n", headingStyle.Render("DETAILED USAGE & EXAMPLES:"))

		fmt.Fprintf(out, "  %s\n", flagStyle.Render("--search <words>"))
		fmt.Fprintf(out, "      %s\n", descStyle.Render("Search for specific keywords. Use '-' to exclude a keyword."))
		fmt.Fprintf(out, "      %s %s\n\n", descStyle.Render("Example:"), exampleStyle.Render("--search \"leopard -snow\" (finds leopard, excludes snow)"))

		fmt.Fprintf(out, "  %s\n", flagStyle.Render("--join <type>"))
		fmt.Fprintf(out, "      %s\n", descStyle.Render("How to combine search words. Options: and, or, exact"))
		fmt.Fprintf(out, "      %s %s\n\n", descStyle.Render("Example:"), exampleStyle.Render("--search \"red panda\" --join exact"))

		fmt.Fprintf(out, "  %s\n", flagStyle.Render("--in <fields>"))
		fmt.Fprintf(out, "      %s\n", descStyle.Render("Comma-separated fields to search in. Options: keywords, title, description, md5"))
		fmt.Fprintf(out, "      %s %s\n\n", descStyle.Render("Example:"), exampleStyle.Render("--in \"title,description\""))

		fmt.Fprintf(out, "  %s\n", flagStyle.Render("--artist <username>"))
		fmt.Fprintf(out, "      %s\n", descStyle.Render("Search only for submissions by a specific user."))
		fmt.Fprintf(out, "      %s %s\n\n", descStyle.Render("Example:"), exampleStyle.Render("--artist \"Elly\""))

		fmt.Fprintf(out, "  %s\n", flagStyle.Render("--favby <username>"))
		fmt.Fprintf(out, "      %s\n", descStyle.Render("Search only for work favorited by this user."))
		fmt.Fprintf(out, "      %s %s\n\n", descStyle.Render("Example:"), exampleStyle.Render("--favby \"Elly\""))

		fmt.Fprintf(out, "  %s\n", flagStyle.Render("--time <days>"))
		fmt.Fprintf(out, "      %s\n", descStyle.Render("Time range in days. Common values: 0 (any), 1, 3, 7, 14, 30, 90, 180, 365."))
		fmt.Fprintf(out, "      %s %s\n\n", descStyle.Render("Example:"), exampleStyle.Render("--time 30 (last month)"))

		fmt.Fprintf(out, "  %s\n", flagStyle.Render("--type <type>"))
		fmt.Fprintf(out, "      %s\n", descStyle.Render("Type of submission. Options include: any, pinup, sketch, comic, portfolio, etc."))
		fmt.Fprintf(out, "      %s %s\n\n", descStyle.Render("Example:"), exampleStyle.Render("--type comic"))

		fmt.Fprintf(out, "  %s\n", flagStyle.Render("--order <order>"))
		fmt.Fprintf(out, "      %s\n", descStyle.Render("How to order the results. Options: create_datetime, favs, views"))
		fmt.Fprintf(out, "      %s %s\n\n", descStyle.Render("Example:"), exampleStyle.Render("--order favs"))

		fmt.Fprintf(out, "  %s\n", flagStyle.Render("--limit <number>"))
		fmt.Fprintf(out, "      %s\n", descStyle.Render("Soft limit for the max number of submissions to download. 0 or blank for unlimited."))
		fmt.Fprintf(out, "      %s %s\n\n", descStyle.Render("Example:"), exampleStyle.Render("--limit 50"))

		fmt.Fprintf(out, "  %s\n", flagStyle.Render("--active <number>"))
		fmt.Fprintf(out, "      %s\n", descStyle.Render("Maximum number of concurrent downloads."))
		fmt.Fprintf(out, "      %s %s\n\n", descStyle.Render("Example:"), exampleStyle.Render("--active 5"))

		fmt.Fprintf(out, "  %s\n", flagStyle.Render("--caption"))
		fmt.Fprintf(out, "      %s\n", descStyle.Render("Whether to save keywords as a .txt file alongside the download (default false)."))
		fmt.Fprintf(out, "      %s %s\n\n", descStyle.Render("Example:"), exampleStyle.Render("--caption=false"))

		fmt.Fprintf(out, "  %s\n", flagStyle.Render("--headless"))
		fmt.Fprintf(out, "      %s\n", descStyle.Render("Forces the application to run without the Terminal UI (TUI)."))
		fmt.Fprintf(out, "      %s\n", descStyle.Render("Note: Providing any standard arguments or flags sets this to true by default,"))
		fmt.Fprintf(out, "      %s\n", descStyle.Render("but we can force it to false instead (e.g., --headless=false)."))
		fmt.Fprintf(out, "      %s %s\n\n", descStyle.Render("Example:"), exampleStyle.Render("--headless=false"))

		fmt.Fprintf(out, "%s\n", headingStyle.Render("EXAMPLES:"))
		fmt.Fprintf(out, "  1) %s\n", descStyle.Render("Download up to 10 sketches by 'artist_name', ordered by favorites:"))
		fmt.Fprintf(out, "     %s\n\n", exampleStyle.Render(fmt.Sprintf("%s --artist \"artist_name\" --type sketch --order favs --limit 10", os.Args[0])))

		fmt.Fprintf(out, "  2) %s\n", descStyle.Render("Search for 'cats' excluding 'dogs' in the last 7 days, quietly in headless form:"))
		fmt.Fprintf(out, "     %s\n", exampleStyle.Render(fmt.Sprintf("%s --search \"cats -dogs\" --time 7 --headless", os.Args[0])))
	}

	flag.StringVar(&c.SearchWords, "search", "", "Search words")
	flag.StringVar(&c.StringJoinType, "join", "and", "Join type (and, or, exact)")
	flag.StringVar(&c.SearchIn, "in", "keywords,title", "Search in (comma separated): keywords, title, description, md5")
	flag.StringVar(&c.ArtistName, "artist", "", "Search only submissions by this user")
	flag.StringVar(&c.FavBy, "favby", "", "Search Favorites by this user")
	flag.IntVar(&c.TimeRange, "time", 0, "Time Range in days (0 for any)")
	flag.StringVar(&c.SubmissionType, "type", "any", "Submission type (any, pinup, sketch, etc.)")
	flag.StringVar(&c.OrderBy, "order", inkbunny.OrderByCreateDatetime, "Order by (create_datetime, favs, views)")
	flag.StringVar(&c.MaxDownloads, "limit", "", "Max number of submissions to download")
	flag.StringVar(&c.MaxActive, "active", "", "Max active downloads")
	flag.BoolVar(&c.DownloadCaption, "caption", false, "Download keywords as .txt")
	flag.BoolVar(&c.Headless, "headless", false, "Force headless mode")

	flag.Parse()

	c.NoTUI = len(os.Args) > 1
	headlessProvided := false
	flag.Visit(func(f *flag.Flag) {
		if f.Name == "headless" {
			headlessProvided = true
		}
	})

	if headlessProvided {
		c.NoTUI = c.Headless
	} else {
		c.Headless = c.NoTUI
	}

	return c
}

const (
	Keywords int = 1 << iota
	Title
	Description
	MD5
)

func (c Config) ApplyTo(
	request *inkbunny.SubmissionSearchRequest,
	searchIn *[]int,
	favBy *string,
	maxDownloads *string,
	maxActiveStr *string,
	downloadCaption *bool,
) {
	request.Text = c.SearchWords
	request.StringJoinType = inkbunny.JoinType(c.StringJoinType)
	request.Username = c.ArtistName
	*favBy = c.FavBy
	request.DaysLimit = inkbunny.IntString(c.TimeRange)
	request.OrderBy = c.OrderBy
	*maxDownloads = c.MaxDownloads
	if maxActiveStr != nil {
		*maxActiveStr = c.MaxActive
	}
	*downloadCaption = c.DownloadCaption

	*searchIn = nil
	if strings.Contains(c.SearchIn, "keywords") {
		*searchIn = append(*searchIn, Keywords)
	}
	if strings.Contains(c.SearchIn, "title") {
		*searchIn = append(*searchIn, Title)
	}
	if strings.Contains(c.SearchIn, "description") {
		*searchIn = append(*searchIn, Description)
	}
	if strings.Contains(c.SearchIn, "md5") {
		*searchIn = append(*searchIn, MD5)
	}

	request.Type = []inkbunny.SubmissionType{inkbunny.SubmissionTypeAny}
}
