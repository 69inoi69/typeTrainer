package main

// The frontend in web/ is made of native ES modules. This test checks the
// import rule written at the top of web/state.js, so it cannot break
// without anyone noticing:
//
//	bottom: state.js, i18n.js and feel.js import nothing, fx.js only
//	        i18n.js, api.js only state.js
//	middle: everything else imports the bottom and each other, no cycles
//	top:    app.js and input.js; nothing imports them (app.js loads input.js)

import (
	"io/fs"
	"regexp"
	"slices"
	"strings"
	"testing"
)

// `import { a } from "./x.js";` and `import "./x.js";`
var importRe = regexp.MustCompile(`(?:from|import)\s+"\./([a-z0-9_-]+\.js)"`)

// webImports reads every module in web/ and returns file -> files it imports.
func webImports(t *testing.T) map[string][]string {
	t.Helper()
	entries, err := fs.ReadDir(files, "web")
	if err != nil {
		t.Fatal(err)
	}
	graph := map[string][]string{}
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".js") || name == "file-check.js" { // file-check.js is a plain script
			continue
		}
		src, err := fs.ReadFile(files, "web/"+name)
		if err != nil {
			t.Fatal(err)
		}
		graph[name] = []string{}
		for _, m := range importRe.FindAllStringSubmatch(string(src), -1) {
			graph[name] = append(graph[name], m[1])
		}
	}
	return graph
}

func TestWebModules_ImportsExist(t *testing.T) {
	graph := webImports(t)
	for file, imports := range graph {
		for _, imp := range imports {
			if _, ok := graph[imp]; !ok {
				t.Errorf("%s imports %s, which is not a module in web/", file, imp)
			}
		}
	}
}

func TestWebModules_BottomLayer(t *testing.T) {
	graph := webImports(t)
	allowed := map[string][]string{
		"state.js": {},
		"i18n.js":  {},
		"feel.js":  {},
		"fx.js":    {"i18n.js"},
		"api.js":   {"state.js"},
	}
	for file, ok := range allowed {
		for _, imp := range graph[file] {
			if !slices.Contains(ok, imp) {
				t.Errorf("%s is in the bottom layer and must not import %s", file, imp)
			}
		}
	}
}

func TestWebModules_TopLayer(t *testing.T) {
	graph := webImports(t)
	for file, imports := range graph {
		for _, imp := range imports {
			if imp == "app.js" || (imp == "input.js" && file != "app.js") {
				t.Errorf("%s imports %s, which is in the top layer", file, imp)
			}
		}
	}
}

func TestWebModules_NoCycles(t *testing.T) {
	graph := webImports(t)
	// depth-first search; a module met again while it is still on the path
	// closes a cycle
	const (
		unseen = iota
		onPath
		done
	)
	state := map[string]int{}
	var path []string
	var visit func(string)
	visit = func(f string) {
		state[f] = onPath
		path = append(path, f)
		for _, imp := range graph[f] {
			switch state[imp] {
			case onPath:
				start := slices.Index(path, imp)
				t.Errorf("import cycle: %s -> %s", strings.Join(path[start:], " -> "), imp)
			case unseen:
				visit(imp)
			}
		}
		path = path[:len(path)-1]
		state[f] = done
	}
	for f := range graph {
		if state[f] == unseen {
			visit(f)
		}
	}
}
