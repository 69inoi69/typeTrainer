package main

// Checks the import layers of the web/ modules.

import (
	"io/fs"
	"regexp"
	"slices"
	"strings"
	"testing"
)

var importRe = regexp.MustCompile(`(?:from|import)\s+"\./([a-z0-9_-]+\.js)"`)

func webImports(t *testing.T) map[string][]string {
	t.Helper()
	entries, err := fs.ReadDir(files, "web")
	if err != nil {
		t.Fatal(err)
	}
	graph := map[string][]string{}
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".js") || name == "file-check.js" {
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
