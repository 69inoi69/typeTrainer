//go:build js && wasm

package main

// accountsOn: on GitHub Pages the Go code answers requests inside the page
// (main_wasm.go), with no cookies at all, so accounts cannot work there.
// /api/v1/auth/me says so and the page shows no login form.
const accountsOn = false
