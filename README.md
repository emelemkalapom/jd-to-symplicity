# JD to Symplicity

A small web page for CEU Career Services. Paste a raw job description, and it suggests values for each field of the Symplicity "New Job" form, laid out in form order, with copy buttons.

- Runs entirely in the browser. Nothing is sent to a server or stored.
- Pattern matching, not AI. It's good at deadlines, emails, links, locations, document requests, degree levels and well-structured ads. It's weaker on messy prose. Every value is a suggestion, and the yellow "Check before posting" box lists what it wasn't sure about.

## Files

| File | What it is |
|------|------------|
| `index.html` | The page |
| `parser.js` | All the extraction logic, including the Symplicity field vocabulary (`FORM` at the top) |
| `test/` | Sample JDs and a runner for checking parser changes |

## Put it online with GitHub Pages (free)

1. Sign in at github.com and create a new repository, e.g. `jd-to-symplicity`. It must be Public: free GitHub Pages only serves public repositories.
2. On the repository page, choose Add file > Upload files. Drag in `index.html`, `parser.js`, `README.md` and the `test` folder, then commit.
3. Go to Settings > Pages. Under "Build and deployment", set Source to "Deploy from a branch", Branch to `main`, folder `/ (root)`, and save.
4. After a minute or two the page is live at `https://YOUR-USERNAME.github.io/jd-to-symplicity/`. Share that link with colleagues.

Anyone with the link can open it. That's harmless, because the page contains no data, keys or login. It has a `noindex` tag, so search engines shouldn't list it.

## Updating

- Edit a file on GitHub (pencil icon) and commit. The live page updates within a few minutes.
- If Symplicity's form changes (new dropdown values, renamed options), edit the `FORM` object at the top of `parser.js`.
- The work-authorisation codes O / EU / H come straight from the form. Their exact meaning hasn't been confirmed. The parser assumes "no restriction in the ad" means all three should be ticked, and that "EU work permit required" means EU + H.

## Testing a parser change (optional, needs Node.js)

```
node test/run.js jd1 jd2 jd3 jd4
```

To add a test case, save a JD as `test/jd5.txt` and run `node test/run.js jd5`. When a colleague sends an ad that parsed badly, adding it here is the fastest way to fix and check the parser.
